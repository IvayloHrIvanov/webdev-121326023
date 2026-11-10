import { describe, it } from 'node:test';
import request from 'supertest';
import { expect } from 'chai';
import app from '../src/app.js';

describe('Health and Error Handling Tests', () => {
  it('GET /health returns 200 and ok status when DB is up', async () => {
    const res = await request(app).get('/health');
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ status: 'ok', db: 'ok' });
  });

  it('GET /unknown-path returns 404', async () => {
    const res = await request(app).get('/non-existent-endpoint-12345');
    expect(res.status).to.equal(404);
    expect(res.body).to.have.property('error');
  });

  it('POST with broken JSON returns 400 and one sentence message without stack trace', async () => {
    const res = await request(app)
      .post('/api/groups')
      .set('Content-Type', 'application/json')
      .send('{"name": broken json}');

    expect(res.status).to.equal(400);
    expect(res.body).to.have.property('error');
    expect(res.text).to.not.include('at ');
  });
});
