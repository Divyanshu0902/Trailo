import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../src/app.js';
import { createIndexStore } from '../src/indexer/index.js';
import { ScannerError } from '../src/scanner/index.js';

describe('Repository Scan & Index API Endpoints (Phase 4C Step 1)', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trailo-scan-api-test-'));
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true });

    await fs.writeFile(
      path.join(tmpDir, 'src', 'index.js'),
      'import { helper } from "./helper.js";\nexport const value = helper();\n'
    );
    await fs.writeFile(
      path.join(tmpDir, 'src', 'helper.ts'),
      'export function helper(): string { return "ok"; }\n'
    );
    await fs.writeFile(
      path.join(tmpDir, 'node_modules', 'pkg', 'index.js'),
      'module.exports = {};'
    );
  });

  after(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('scans and indexes a valid repository root via POST /api/scan, returning HTTP 200 and updating store', async () => {
    const store = createIndexStore();
    const app = createApp({ store });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: tmpDir }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(data.repositoryId);
      assert.ok(data.repositoryId.startsWith('snapshot_'));
      assert.ok(data.rootPath);
      assert.ok(data.indexedAt);
      assert.ok(data.summary);
      assert.equal(data.summary.stats.totalFiles, 2);
      assert.equal(data.summary.stats.totalChunks, 2);
      assert.equal(data.summary.stats.resolvedDependencies, 1);
      assert.deepEqual(data.warnings, []);

      // Verify in-memory store was updated
      assert.ok(store.currentSnapshot);
      assert.equal(store.currentSnapshot.id, data.repositoryId);
      assert.equal(store.getAllFiles().length, 2);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('accepts POST /api/repositories as an alias and supports body.path', async () => {
    const store = createIndexStore();
    const app = createApp({ store });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tmpDir }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.repositoryId);
      assert.equal(data.summary.stats.totalFiles, 2);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns HTTP 400 with INVALID_ROOT when body is missing or not a JSON object', async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();

    try {
      // Missing body / wrong content-type
      const res1 = await fetch(`http://127.0.0.1:${port}/api/scan`, {
        method: 'POST',
      });
      assert.equal(res1.status, 400);
      const data1 = await res1.json();
      assert.equal(data1.error.code, 'INVALID_ROOT');

      // Array body
      const res2 = await fetch(`http://127.0.0.1:${port}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      });
      assert.equal(res2.status, 400);
      const data2 = await res2.json();
      assert.equal(data2.error.code, 'INVALID_ROOT');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns HTTP 400 with INVALID_ROOT when rootPath is empty, whitespace, or non-string', async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();

    try {
      for (const invalidRoot of ['', '   ', null, 12345]) {
        const res = await fetch(`http://127.0.0.1:${port}/api/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rootPath: invalidRoot }),
        });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.error.code, 'INVALID_ROOT');
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns HTTP 404 with ROOT_NOT_FOUND when root directory does not exist', async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const nonExistentPath = path.join(tmpDir, 'does-not-exist-directory');
      const res = await fetch(`http://127.0.0.1:${port}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: nonExistentPath }),
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error.code, 'ROOT_NOT_FOUND');
      assert.ok(data.error.message.includes('does not exist'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns HTTP 400 with NOT_A_DIRECTORY when target path is a regular file', async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const filePath = path.join(tmpDir, 'src', 'index.js');
      const res = await fetch(`http://127.0.0.1:${port}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: filePath }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error.code, 'NOT_A_DIRECTORY');
      assert.ok(data.error.message.includes('not a directory'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns HTTP 403 with ROOT_ACCESS_ERROR when scanner throws ROOT_ACCESS_ERROR', async () => {
    const mockIndexer = async () => {
      throw new ScannerError('Cannot access directory due to permissions', 'ROOT_ACCESS_ERROR');
    };

    const app = createApp({ indexRepository: mockIndexer });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: tmpDir }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error.code, 'ROOT_ACCESS_ERROR');
      assert.ok(data.error.message.includes('permissions'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns HTTP 500 with generic INDEXING_ERROR on unexpected internal error and logs details server-side', async () => {
    let loggedErrorArgs = null;
    const mockLogger = {
      ...console,
      error: (...args) => {
        loggedErrorArgs = args;
      },
    };

    const mockIndexer = async () => {
      throw new Error('Unexpected database/disk error with sensitive internal details');
    };

    const app = createApp({ indexRepository: mockIndexer, logger: mockLogger });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: tmpDir }),
      });

      assert.equal(res.status, 500);
      const data = await res.json();
      assert.equal(data.error.code, 'INDEXING_ERROR');
      assert.equal(data.error.message, 'An unexpected internal error occurred while indexing repository');
      // Verify raw internal error was not leaked to the client
      assert.equal(data.error.message.includes('sensitive internal details'), false);

      // Verify detailed error was logged server-side
      assert.ok(loggedErrorArgs);
      assert.ok(loggedErrorArgs[0].includes('[ScanRoutes]'));
      assert.ok(loggedErrorArgs[1] instanceof Error);
      assert.ok(loggedErrorArgs[1].message.includes('sensitive internal details'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('integrates scan endpoint with graph and file retrieval endpoints', async () => {
    const store = createIndexStore();
    const app = createApp({ store });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      // 1. Before scan: graph returns 404
      const graphBefore = await fetch(`http://127.0.0.1:${port}/api/graph`);
      assert.equal(graphBefore.status, 404);

      // 2. Perform scan
      const scanRes = await fetch(`http://127.0.0.1:${port}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: tmpDir }),
      });
      assert.equal(scanRes.status, 200);
      const scanData = await scanRes.json();
      const repoId = scanData.repositoryId;

      // 3. After scan: graph returns 200
      const graphAfter = await fetch(`http://127.0.0.1:${port}/api/repositories/${repoId}/graph`);
      assert.equal(graphAfter.status, 200);
      const graphData = await graphAfter.json();
      assert.equal(graphData.nodes.length, 2);
      assert.equal(graphData.edges.length, 1);

      // 4. After scan: file content retrieval returns 200
      const fileRes = await fetch(`http://127.0.0.1:${port}/api/repositories/${repoId}/files?path=src/index.js`);
      assert.equal(fileRes.status, 200);
      const fileData = await fileRes.json();
      assert.equal(fileData.path, 'src/index.js');
      assert.ok(fileData.content.includes('import { helper }'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
