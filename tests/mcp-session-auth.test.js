import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';
import { expect } from 'chai';
import { projectTools, resolveMcpUser } from '../mcp-server/project-tools.js';

describe('MCP session authentication', () => {
  it('resolves the user from the configured application session cookie', async () => {
    let requestUrl;
    let requestOptions;
    const userId = await resolveMcpUser({
      token: 'signed-session-cookie',
      baseUrl: 'https://study-groups.example',
      fetchImpl: async (url, options) => {
        requestUrl = url;
        requestOptions = options;
        return { ok: true, json: async () => ({ id: 42, role: 'student' }) };
      }
    });

    expect(userId).to.equal(42);
    expect(requestUrl.toString()).to.equal('https://study-groups.example/api/auth/me');
    expect(requestOptions.headers.Cookie).to.equal('connect.sid=signed-session-cookie');
    expect(requestOptions.signal).to.exist;
  });

  it('rejects expired or invalid application sessions', async () => {
    try {
      await resolveMcpUser({
        token: 'expired-session-cookie',
        baseUrl: 'https://study-groups.example',
        fetchImpl: async () => ({ ok: false, status: 401 })
      });
      expect.fail('expired session should be rejected');
    } catch (error) {
      expect(error.message).to.equal('MCP_TOKEN is not an active application session.');
    }
  });

  it('rejects project tools until a new Google user completes password setup', async () => {
    try {
      await resolveMcpUser({
        token: 'signed-session-cookie',
        baseUrl: 'https://study-groups.example',
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ id: 42, passwordSetupRequired: true })
        })
      });
      expect.fail('project tools should be blocked until password setup is complete');
    } catch (error) {
      expect(error.message).to.equal('Set an app password before using project tools.');
    }
  });

  it('does not expose user identity as an argument to project tools', () => {
    for (const tool of projectTools) {
      expect(tool.inputSchema.properties).not.to.have.property('userId');
      expect(tool.inputSchema.required || []).not.to.include('userId');
    }
  });

  it('does not log request content while rejecting an unauthenticated tool call', async () => {
    const privateNotes = 'notes-that-must-not-appear-in-server-logs';
    const server = spawn(process.execPath, ['mcp-server/server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, MCP_TOKEN: '', PUBLIC_BASE_URL: '' }
    });
    let standardOutput = '';
    let standardError = '';
    server.stdout.setEncoding('utf8');
    server.stderr.setEncoding('utf8');
    server.stdout.on('data', chunk => { standardOutput += chunk; });
    server.stderr.on('data', chunk => { standardError += chunk; });
    const closed = new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('close', code => resolve(code));
    });

    server.stdin.end(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'summarise_notes', arguments: { notes: privateNotes } }
    })}\n`);

    const exitCode = await closed;
    expect(exitCode).to.equal(0);
    expect(standardError).not.to.include(privateNotes);
    const response = JSON.parse(standardOutput);
    expect(response.result.isError).to.equal(true);
    expect(response.result.content[0].text).to.include('MCP_TOKEN');
  });
});
