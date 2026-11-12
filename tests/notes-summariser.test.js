import { afterEach, describe, it } from 'node:test';
import { expect } from 'chai';
import { summariseNotes } from '../src/services/sessionService.js';

const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;
const validTags = ['Databases', 'Testing', 'JavaScript'];

function responseWithText(text) {
  return {
    candidates: [{
      content: {
        parts: [{ text }]
      }
    }]
  };
}

function validSummaryResponse(summary = 'First summary line.\nSecond summary line.', tags = validTags) {
  return responseWithText(JSON.stringify({ summary, tags }));
}

function setGeminiResponse(payload, status = 200) {
  global.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  });
}

function expectFallback(result) {
  expect(result.source).to.equal('fallback');
  expect(result.summary.split('\n')).to.have.length(2);
  expect(result.tags).to.have.length(3);
}

afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = originalApiKey;
  }
});

describe('Study session notes summariser', () => {
  describe('fallback behavior', () => {
    it('returns a topic-based fallback when the API key is missing', async () => {
      process.env.GEMINI_API_KEY = '';
      const notes = 'We discussed AI and Security.';

      const result = await summariseNotes(notes);

      expectFallback(result);
      expect(result.message).to.include('GEMINI_API_KEY');
      expect(result.tags).to.include.members(['AI', 'Security']);
      expect(result.summary).not.to.include(notes);
    });

    it('returns a generic fallback when notes contain no recognized topic', async () => {
      process.env.GEMINI_API_KEY = '';

      const result = await summariseNotes('Questions to review before next week.');

      expectFallback(result);
      expect(result.summary).to.include('The notes describe a study-session topic.');
    });

    it('returns a generic fallback when notes are omitted', async () => {
      process.env.GEMINI_API_KEY = '';

      const result = await summariseNotes();

      expectFallback(result);
      expect(result.summary).to.include('The notes describe a study-session topic.');
    });

    it('returns a fallback when an injected client rejects', async () => {
      const result = await summariseNotes('AI notes', {
        client: async () => {
          throw new Error('test failure');
        }
      });

      expectFallback(result);
      expect(result.message).to.include('Gemini could not be reached');
    });

    it('returns a fallback when the network request fails', async () => {
      global.fetch = async () => {
        throw new Error('test network failure');
      };

      const result = await summariseNotes('AI notes', { apiKey: 'test-key' });

      expectFallback(result);
      expect(result.message).to.include('Gemini could not be reached');
    });

    it('includes the HTTP status when Gemini rejects the request', async () => {
      setGeminiResponse({}, 403);

      const result = await summariseNotes('AI notes', { apiKey: 'test-key' });

      expectFallback(result);
      expect(result.message).to.include('HTTP 403');
      expect(result.message).not.to.include('test-key');
    });

    it('returns a fallback when the provider request times out', async () => {
      global.fetch = async (_url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true });
      });

      const result = await summariseNotes('AI notes', { apiKey: 'test-key' });

      expectFallback(result);
    });
  });

  describe('Gemini response validation', () => {
    it('sends the configured model request and accepts valid JSON output', async () => {
      let request;
      const responseText = `Generated summary: ${JSON.stringify({
        summary: 'First summary line.\nSecond summary line.',
        tags: ['Databases', 42, 'Testing', 'JavaScript']
      })}`;
      global.fetch = async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          status: 200,
          json: async () => responseWithText(responseText)
        };
      };

      const result = await summariseNotes('Notes to summarise.', { apiKey: 'test-key' });

      expect(result.source).to.equal('ai');
      expect(result.summary).to.equal('First summary line.\nSecond summary line.');
      expect(result.tags).to.deep.equal(validTags);
      expect(request.url).to.include('models/gemini-3.5-flash-lite:generateContent');
      expect(request.url).not.to.include('test-key');
      expect(request.options.headers['x-goog-api-key']).to.equal('test-key');
      const body = JSON.parse(request.options.body);
      expect(body.generationConfig.responseMimeType).to.equal('application/json');
      expect(body.contents[0].parts[0].text).to.include('Notes to summarise.');
    });

    it('uses the fallback when an injected client returns invalid output', async () => {
      const result = await summariseNotes('AI notes', {
        client: async () => ({
          summary: 'Only one line.',
          tags: validTags
        })
      });

      expectFallback(result);
      expect(result.message).to.include('invalid summary');
    });

    const invalidResponses = [
      { name: 'a missing response body', payload: null },
      { name: 'a missing candidate', payload: { candidates: [] } },
      { name: 'a candidate without content', payload: { candidates: [{}] } },
      { name: 'an empty parts array', payload: { candidates: [{ content: { parts: [] } }] } },
      { name: 'a part without text', payload: { candidates: [{ content: { parts: [{}] } }] } },
      { name: 'plain text instead of JSON', payload: responseWithText('No structured response.') },
      { name: 'malformed JSON', payload: responseWithText('{ broken JSON }') },
      { name: 'a one-line summary', payload: validSummaryResponse('Only one line.') },
      {
        name: 'fewer than three allowed tags',
        payload: validSummaryResponse(undefined, ['Databases', 'Unknown', 'Testing'])
      },
      { name: 'a non-string summary', payload: validSummaryResponse(42) },
      {
        name: 'tags in a non-array value',
        payload: responseWithText(JSON.stringify({ summary: 'First line.\nSecond line.', tags: 'Databases' }))
      }
    ];

    for (const { name, payload } of invalidResponses) {
      it(`falls back for ${name}`, async () => {
        setGeminiResponse(payload);

        const result = await summariseNotes('AI notes', { apiKey: 'test-key' });

        expectFallback(result);
      });
    }
  });
});
