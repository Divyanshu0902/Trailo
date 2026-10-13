import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('returns HTTP 200 with ok status and service information', async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(res.status, 200);

      const contentType = res.headers.get('content-type');
      assert.ok(contentType && contentType.includes('application/json'));

      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.equal(data.service, 'trailo-api');
      assert.ok(data.timestamp);
      assert.equal(Number.isNaN(Date.parse(data.timestamp)), false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
