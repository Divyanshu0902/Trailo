import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createIndexStore } from '../src/indexer/index.js';
import {
  createGeminiAdapter,
  GeminiAdapterError,
  normalizeGeminiError,
} from '../src/ask/index.js';

/**
 * Safely closes an HTTP test server immediately by destroying open keep-alive connections.
 *
 * @param {import('node:http').Server} server
 */
async function closeServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

/**
 * Helper to build an SSE stream parser from a fetch Response.
 *
 * @param {Response} response
 * @returns {Promise<Array<{ event: string, data: object }>>}
 */
async function parseSseStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const lines = rawEvent.split('\n');
      let eventName = 'message';
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventName = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          data += line.slice(6);
        }
      }

      if (data) {
        events.push({ event: eventName, data: JSON.parse(data) });
      }
    }
  }

  return events;
}

/**
 * Creates a synthetic index snapshot for test fixtures.
 */
function createSyntheticSnapshot(id = 'snapshot_ask_1') {
  const file1 = {
    path: 'src/scanner.js',
    lineCount: 40,
    content: 'export function scanRepository(rootPath) {\n  const results = [];\n  return results;\n}\n',
  };
  const file2 = {
    path: 'src/indexer.js',
    lineCount: 50,
    content: "import { scanRepository } from './scanner.js';\nexport function indexRepository(rootPath) {\n  return scanRepository(rootPath);\n}\n",
  };

  const chunk1 = {
    chunkId: 'src/scanner.js:L1-L40',
    filePath: 'src/scanner.js',
    startLine: 1,
    endLine: 40,
    text: file1.content,
    lineCount: 40,
  };
  const chunk2 = {
    chunkId: 'src/indexer.js:L1-L50',
    filePath: 'src/indexer.js',
    startLine: 1,
    endLine: 50,
    text: file2.content,
    lineCount: 50,
  };

  const filesMap = new Map();
  filesMap.set(file1.path, file1);
  filesMap.set(file2.path, file2);

  const chunksByFile = new Map();
  chunksByFile.set(file1.path, [chunk1]);
  chunksByFile.set(file2.path, [chunk2]);

  const outbound = new Map();
  outbound.set('src/indexer.js', [
    { sourcePath: 'src/indexer.js', targetPath: 'src/scanner.js', lineRange: { start: 1, end: 1 } },
  ]);

  const inbound = new Map();
  inbound.set('src/scanner.js', [
    { sourcePath: 'src/indexer.js', targetPath: 'src/scanner.js', lineRange: { start: 1, end: 1 } },
  ]);

  return {
    id,
    rootPath: '/virtual/repo',
    createdAt: new Date().toISOString(),
    files: [file1, file2],
    filesMap,
    chunks: [chunk1, chunk2],
    chunksByFile,
    dependencies: [],
    inboundDependencies: inbound,
    outboundDependencies: outbound,
  };
}

describe('Ask Trailo — Gemini Adapter (Unit)', () => {
  it('reports isConfigured correctly based on API key or injected client', () => {
    const unconfigured = createGeminiAdapter({ apiKey: '' });
    assert.equal(unconfigured.isConfigured(), false);

    const configured = createGeminiAdapter({ apiKey: 'fake-test-key' });
    assert.equal(configured.isConfigured(), true);

    const clientConfigured = createGeminiAdapter({ apiKey: '', client: {} });
    assert.equal(clientConfigured.isConfigured(), true);
  });

  it('throws AI_NOT_CONFIGURED if streamAnswer called when unconfigured', async () => {
    const adapter = createGeminiAdapter({ apiKey: '' });
    await assert.rejects(
      async () => {
        // eslint-disable-next-line no-unused-vars
        for await (const _ of adapter.streamAnswer({ promptPayload: { contents: [] } })) {
          // should not yield
        }
      },
      (err) => {
        assert.equal(err.code, 'AI_NOT_CONFIGURED');
        assert.equal(err.status, 503);
        return true;
      }
    );
  });

  it('normalizes various upstream errors safely without leaking sensitive information', () => {
    // Rate limit
    const err429 = normalizeGeminiError({ status: 429, message: 'Resource exhausted quota exceeded' });
    assert.equal(err429.code, 'AI_RATE_LIMITED');
    assert.equal(err429.status, 429);
    assert.ok(!err429.message.includes('Resource exhausted'));

    // Auth error
    const errAuth = normalizeGeminiError({ status: 401, message: 'API_KEY_INVALID secret-key-xyz' });
    assert.equal(errAuth.code, 'AI_AUTH_ERROR');
    assert.equal(errAuth.status, 502);
    assert.ok(!errAuth.message.includes('secret-key-xyz'));

    // Model unavailable
    const errNotFound = normalizeGeminiError({ status: 404, message: 'models/gemini-3.8-flash is not found' });
    assert.equal(errNotFound.code, 'AI_MODEL_UNAVAILABLE');
    assert.equal(errNotFound.status, 503);

    // Timeout
    const abortSignal = { aborted: true, reason: 'AI_TIMEOUT' };
    const errTimeout = normalizeGeminiError(new Error('Operation aborted'), abortSignal);
    assert.equal(errTimeout.code, 'AI_TIMEOUT');
    assert.equal(errTimeout.status, 504);

    // Generic provider error
    const generic = normalizeGeminiError(new Error('Socket reset by peer'));
    assert.equal(generic.code, 'AI_PROVIDER_ERROR');
    assert.equal(generic.status, 502);
  });

  it('streams answer chunks from injected mock SDK client', async () => {
    const mockSdkClient = {
      models: {
        async generateContentStream({ model, contents, config }) {
          assert.equal(model, 'gemini-3.8-flash');
          assert.ok(contents.length > 0);
          assert.equal(config.thinkingConfig.thinkingLevel, 'MEDIUM');
          return (async function* () {
            yield { text: 'The ' };
            yield { text: 'scanner ' };
            yield { text: 'walks [E1].' };
          })();
        },
      },
    };

    const adapter = createGeminiAdapter({ client: mockSdkClient });
    const chunks = [];
    for await (const chunk of adapter.streamAnswer({
      promptPayload: {
        systemInstruction: 'System instruction text',
        contents: [{ role: 'user', text: 'Where is scanner?' }],
      },
    })) {
      chunks.push(chunk.text);
    }

    assert.deepEqual(chunks, ['The ', 'scanner ', 'walks [E1].']);
  });

  it('drops empty strings, non-string properties, and metadata chunks from SDK stream', async () => {
    const mockSdkClient = {
      models: {
        async generateContentStream() {
          return (async function* () {
            yield {}; // No text property (metadata or thought)
            yield { text: '' }; // Empty string
            yield { text: null }; // Non-string
            yield { text: 'Valid chunk 1 ' };
            yield { text: '' }; // Intermediary empty chunk
            yield { text: 'Valid chunk 2' };
          })();
        },
      },
    };

    const adapter = createGeminiAdapter({ client: mockSdkClient });
    const chunks = [];
    for await (const chunk of adapter.streamAnswer({ promptPayload: { contents: [] } })) {
      chunks.push(chunk);
    }

    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks, [{ text: 'Valid chunk 1 ' }, { text: 'Valid chunk 2' }]);
  });
});

describe('Ask Trailo — SSE Streaming Route (Integration)', () => {
  it('rejects non-JSON requests with HTTP 400 INVALID_REQUEST', async () => {
    const store = createIndexStore();
    const app = createApp({ store });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'invalid body',
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'INVALID_REQUEST');
    } finally {
      await closeServer(server);
    }
  });

  it('rejects missing repositoryId with HTTP 400 INVALID_REQUEST', async () => {
    const store = createIndexStore();
    const app = createApp({ store });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'How does it work?' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'INVALID_REQUEST');
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 404 REPOSITORY_NOT_FOUND when no snapshot exists in store', async () => {
    const store = createIndexStore();
    const app = createApp({ store });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId: 'snap_missing', question: 'How does scanning work?' }),
      });
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error.code, 'REPOSITORY_NOT_FOUND');
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 409 REPOSITORY_CHANGED when repositoryId does not match current snapshot', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_current');

    const app = createApp({ store });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId: 'snapshot_old_stale', question: 'How does scanning work?' }),
      });
      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.error.code, 'REPOSITORY_CHANGED');
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 400 INVALID_QUESTION when question is empty or exceeds character limits', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const app = createApp({ store });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      // Empty question
      const res1 = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId: 'snapshot_valid', question: '   ' }),
      });
      assert.equal(res1.status, 400);
      const data1 = await res1.json();
      assert.equal(data1.error.code, 'INVALID_QUESTION');

      // Oversized question (> 4000 characters)
      const res2 = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId: 'snapshot_valid', question: 'x'.repeat(4001) }),
      });
      assert.equal(res2.status, 400);
      const data2 = await res2.json();
      assert.equal(data2.error.code, 'INVALID_QUESTION');
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 400 INVALID_REQUEST when history is not an array', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const app = createApp({ store });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanner?',
          history: 'not-an-array',
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'INVALID_REQUEST');
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 503 AI_NOT_CONFIGURED when Gemini API key is missing on the server', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockUnconfiguredAdapter = createGeminiAdapter({ apiKey: '' });
    const app = createApp({ store, geminiAdapter: mockUnconfiguredAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanner?',
        }),
      });
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.error.code, 'AI_NOT_CONFIGURED');
    } finally {
      await closeServer(server);
    }
  });

  it('streams helpful guidance without calling Gemini when retrieval yields no evidence', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    let geminiCalled = false;
    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer() {
        geminiCalled = true;
        yield { text: 'Should not be called' };
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'zzq_completely_unrelated_concept_xyz_99999',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
      assert.equal(res.headers.get('x-accel-buffering'), 'no');

      const events = await parseSseStream(res);
      assert.equal(geminiCalled, false);

      const eventNames = events.map((e) => e.event);
      assert.deepEqual(eventNames, ['start', 'delta', 'complete']);

      const completeEvent = events.find((e) => e.event === 'complete');
      assert.equal(completeEvent.data.citations.length, 0);
      assert.equal(completeEvent.data.metadata.insufficientEvidence, true);
      assert.ok(completeEvent.data.answer.includes("couldn't find relevant code"));
    } finally {
      await closeServer(server);
    }
  });

  it('streams answer deltas and emits validated citations upon completion', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer() {
        yield { text: 'The scanRepository function ' };
        yield { text: 'walks files [E1]. ' };
        yield { text: 'It is imported by [E2].' };
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository defined?',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-accel-buffering'), 'no');
      const events = await parseSseStream(res);

      const startEvent = events.find((e) => e.event === 'start');
      assert.ok(startEvent);
      assert.equal(startEvent.data.repositoryId, 'snapshot_valid');
      assert.equal(startEvent.data.model, 'gemini-3.8-flash');
      assert.ok(startEvent.data.requestId);

      const deltas = events.filter((e) => e.event === 'delta');
      assert.equal(deltas.length, 3);
      assert.equal(deltas[0].data.text, 'The scanRepository function ');

      const completeEvent = events.find((e) => e.event === 'complete');
      assert.ok(completeEvent);
      assert.equal(completeEvent.data.answer, 'The scanRepository function walks files [E1]. It is imported by [E2].');
      assert.ok(completeEvent.data.citations.length > 0);

      const citation1 = completeEvent.data.citations.find((c) => c.evidenceId === 'E1');
      assert.ok(citation1);
      assert.equal(citation1.filePath, 'src/scanner.js');
      assert.equal(citation1.startLine, 1);
      assert.equal(citation1.endLine, 40);
    } finally {
      await closeServer(server);
    }
  });

  it('sanitizes fabricated citations so they never become clickable links', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer() {
        yield { text: 'Valid defined in [E1], ' };
        yield { text: 'fabricated reference in [E99].' };
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      const events = await parseSseStream(res);
      const completeEvent = events.find((e) => e.event === 'complete');
      assert.ok(completeEvent);

      assert.ok(completeEvent.data.answer.includes('[E1]'));
      assert.ok(!completeEvent.data.answer.includes('[E99]'));

      assert.ok(completeEvent.data.citations.some((c) => c.evidenceId === 'E1'));
      assert.ok(!completeEvent.data.citations.some((c) => c.evidenceId === 'E99'));
    } finally {
      await closeServer(server);
    }
  });

  it('emits REPOSITORY_CHANGED error event if active snapshot changes mid-stream', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_initial');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer() {
        yield { text: 'First chunk... ' };
        store.currentSnapshot = createSyntheticSnapshot('snapshot_new_reindexed');
        yield { text: 'Second chunk... ' };
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_initial',
          question: 'Where is scanRepository?',
        }),
      });

      const events = await parseSseStream(res);
      const eventNames = events.map((e) => e.event);

      assert.ok(eventNames.includes('start'));
      assert.ok(eventNames.includes('delta'));
      assert.ok(eventNames.includes('error'));
      assert.ok(!eventNames.includes('complete'));

      const errorEvent = events.find((e) => e.event === 'error');
      assert.equal(errorEvent.data.error.code, 'REPOSITORY_CHANGED');
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 429 JSON before streaming begins if provider rate limits during initial handshake', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      // eslint-disable-next-line require-yield
      async *streamAnswer() {
        const rateLimitErr = new GeminiAdapterError('AI_RATE_LIMITED', 'Rate limit exceeded', null, 429);
        throw rateLimitErr;
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      assert.equal(res.status, 429);
      assert.ok(res.headers.get('content-type')?.includes('application/json'));
      const data = await res.json();
      assert.equal(data.error.code, 'AI_RATE_LIMITED');
    } finally {
      await closeServer(server);
    }
  });

  it('emits AI_RATE_LIMITED error event when upstream provider rate limits mid-stream after initial chunks', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer() {
        yield { text: 'Partial start... ' };
        const rateLimitErr = new GeminiAdapterError('AI_RATE_LIMITED', 'Rate limit exceeded', null, 429);
        throw rateLimitErr;
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
      assert.equal(res.headers.get('x-accel-buffering'), 'no');

      const events = await parseSseStream(res);
      const errorEvent = events.find((e) => e.event === 'error');
      assert.ok(errorEvent);
      assert.equal(errorEvent.data.error.code, 'AI_RATE_LIMITED');
      assert.ok(!events.some((e) => e.event === 'complete'));
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 502 JSON before streaming begins if adapter completes immediately with no text chunks', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      // eslint-disable-next-line require-yield
      async *streamAnswer() {
        return;
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      assert.equal(res.status, 502);
      assert.ok(res.headers.get('content-type')?.includes('application/json'));
      const data = await res.json();
      assert.equal(data.error.code, 'AI_PROVIDER_ERROR');
      assert.ok(data.error.message.includes('empty'));
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 504 JSON before streaming begins if adapter times out before yielding the first chunk', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      // eslint-disable-next-line require-yield
      async *streamAnswer() {
        await new Promise((resolve) => setTimeout(resolve, 150));
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter, timeoutMs: 30 });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      assert.equal(res.status, 504);
      assert.ok(res.headers.get('content-type')?.includes('application/json'));
      const data = await res.json();
      assert.equal(data.error.code, 'AI_TIMEOUT');
    } finally {
      await closeServer(server);
    }
  });

  it('emits AI_TIMEOUT error event when stream exceeds timeout duration mid-stream after initial chunks', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer({ signal }) {
        yield { text: 'Initial chunk ' };
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (signal?.aborted) {
          throw new GeminiAdapterError('AI_TIMEOUT', 'The AI request timed out.', null, 504);
        }
        yield { text: 'Late chunk' };
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter, timeoutMs: 30 });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      const events = await parseSseStream(res);
      const errorEvent = events.find((e) => e.event === 'error');
      assert.ok(errorEvent);
      assert.equal(errorEvent.data.error.code, 'AI_TIMEOUT');
      assert.ok(!events.some((e) => e.event === 'complete'));
    } finally {
      await closeServer(server);
    }
  });

  it('aborts upstream generator when client aborts / closes connection mid-stream', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    let generatorCancelled = false;
    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer({ signal }) {
        try {
          yield { text: 'Chunk 1 ' };
          for (let i = 0; i < 20; i++) {
            if (signal?.aborted) {
              generatorCancelled = true;
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        } finally {
          if (signal?.aborted) {
            generatorCancelled = true;
          }
        }
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const abortController = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
        signal: abortController.signal,
      });

      const reader = res.body.getReader();
      await reader.read();
      abortController.abort();
      try {
        await reader.cancel();
      } catch {
        // ignore
      }

      for (let i = 0; i < 20; i++) {
        if (generatorCancelled) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(generatorCancelled, true);
    } finally {
      await closeServer(server);
    }
  });

  it('streams answer when initial chunk is non-text or empty, emitting first non-empty text chunk exactly once', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer() {
        yield {}; // Non-text chunk
        yield { text: '' }; // Empty text chunk
        yield { text: 'First valid chunk [E1]. ' };
        yield { text: 'Second valid chunk.' };
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
      assert.equal(res.headers.get('x-accel-buffering'), 'no');

      const events = await parseSseStream(res);
      const deltas = events.filter((e) => e.event === 'delta');

      // Only 2 delta events should be emitted (empty/non-text ignored)
      assert.equal(deltas.length, 2);
      assert.equal(deltas[0].data.text, 'First valid chunk [E1]. ');
      assert.equal(deltas[1].data.text, 'Second valid chunk.');

      const completeEvent = events.find((e) => e.event === 'complete');
      assert.ok(completeEvent);
      assert.equal(completeEvent.data.answer, 'First valid chunk [E1]. Second valid chunk.');
      assert.equal(completeEvent.data.citations.length, 1);
      assert.equal(completeEvent.data.citations[0].evidenceId, 'E1');
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 502 JSON before streaming begins if adapter yields empty chunks and finishes without producing text', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer() {
        yield {};
        yield { text: '' };
        yield { text: '' };
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      assert.equal(res.status, 502);
      assert.ok(res.headers.get('content-type')?.includes('application/json'));
      const data = await res.json();
      assert.equal(data.error.code, 'AI_PROVIDER_ERROR');
      assert.ok(data.error.message.includes('empty'));
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 504 JSON before streaming begins if adapter yields empty chunks then times out before yielding text', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer({ signal }) {
        yield { text: '' };
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (signal?.aborted) {
          throw new GeminiAdapterError('AI_TIMEOUT', 'The AI request timed out.', null, 504);
        }
        yield { text: 'Late text' };
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter, timeoutMs: 30 });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      assert.equal(res.status, 504);
      assert.ok(res.headers.get('content-type')?.includes('application/json'));
      const data = await res.json();
      assert.equal(data.error.code, 'AI_TIMEOUT');
    } finally {
      await closeServer(server);
    }
  });

  it('returns HTTP 429 JSON before streaming begins if provider throws error after an initial empty chunk', async () => {
    const store = createIndexStore();
    store.currentSnapshot = createSyntheticSnapshot('snapshot_valid');

    const mockAdapter = {
      modelName: 'gemini-3.8-flash',
      isConfigured: () => true,
      async *streamAnswer() {
        yield { text: '' };
        throw new GeminiAdapterError('AI_RATE_LIMITED', 'Rate limit exceeded', null, 429);
      },
    };

    const app = createApp({ store, geminiAdapter: mockAdapter });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: 'snapshot_valid',
          question: 'Where is scanRepository?',
        }),
      });

      assert.equal(res.status, 429);
      assert.ok(res.headers.get('content-type')?.includes('application/json'));
      const data = await res.json();
      assert.equal(data.error.code, 'AI_RATE_LIMITED');
    } finally {
      await closeServer(server);
    }
  });
});
