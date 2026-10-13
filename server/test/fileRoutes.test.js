import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createIndexStore, validateRelativeFilePath } from '../src/indexer/index.js';

describe('Secure Source File Content API (Phase 4C Step 1)', () => {
  describe('validateRelativeFilePath (Unit)', () => {
    it('accepts valid POSIX repository-relative paths', () => {
      const validCases = [
        'src/app.js',
        'package.json',
        'src/utils/math.ts',
        'deeply/nested/component/Button.tsx',
        'README.md',
      ];

      for (const p of validCases) {
        const res = validateRelativeFilePath(p);
        assert.equal(res.valid, true);
        assert.equal(res.path, p);
      }
    });

    it('normalizes Windows backslashes to forward slashes in relative paths', () => {
      const res = validateRelativeFilePath('src\\utils\\math.ts');
      assert.equal(res.valid, true);
      assert.equal(res.path, 'src/utils/math.ts');
    });

    it('rejects missing, empty, whitespace-only, and non-string inputs', () => {
      for (const invalid of ['', '   ', null, undefined, 1234, {}]) {
        const res = validateRelativeFilePath(invalid);
        assert.equal(res.valid, false);
        assert.equal(res.code, 'INVALID_FILE_PATH');
      }
    });

    it('rejects path traversal sequences (..)', () => {
      const traversalCases = [
        '../file.js',
        '../../etc/passwd',
        'src/../file.js',
        'src/utils/../../secret.js',
        '..',
      ];

      for (const p of traversalCases) {
        const res = validateRelativeFilePath(p);
        assert.equal(res.valid, false);
        assert.equal(res.code, 'INVALID_FILE_PATH');
      }
    });

    it('rejects URL-encoded and double-encoded path traversal', () => {
      const encodedCases = [
        '%2e%2e/file.js',
        '%2e%2e%2ffile.js',
        'src/%2e%2e/file.js',
        '%252e%252e/file.js',
        '%252e%252e%252ffile.js',
      ];

      for (const p of encodedCases) {
        const res = validateRelativeFilePath(p);
        assert.equal(res.valid, false);
        assert.equal(res.code, 'INVALID_FILE_PATH');
      }
    });

    it('rejects path navigation tokens (.) and empty segments', () => {
      const dotCases = [
        './file.js',
        'src/./file.js',
        'src//file.js',
        'src/',
        '/src',
      ];

      for (const p of dotCases) {
        const res = validateRelativeFilePath(p);
        assert.equal(res.valid, false);
        assert.equal(res.code, 'INVALID_FILE_PATH');
      }
    });

    it('rejects absolute paths and Windows drive prefixes', () => {
      const absoluteCases = [
        '/etc/passwd',
        '/src/app.js',
        '\\Windows\\System32',
        'C:/Users/file.js',
        'D:\\projects\\app.js',
        'c:file.js',
        'E:/test.txt',
      ];

      for (const p of absoluteCases) {
        const res = validateRelativeFilePath(p);
        assert.equal(res.valid, false);
        assert.equal(res.code, 'INVALID_FILE_PATH');
      }
    });

    it('rejects null bytes', () => {
      const res = validateRelativeFilePath('src/app\0.js');
      assert.equal(res.valid, false);
      assert.equal(res.code, 'INVALID_FILE_PATH');
    });
  });

  describe('Source Content Endpoints (Integration)', () => {
    it('returns HTTP 404 with REPOSITORY_NOT_FOUND when no active snapshot exists', async () => {
      const store = createIndexStore();
      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        const res1 = await fetch(`http://127.0.0.1:${port}/api/repositories/some-id/files?path=src/app.js`);
        assert.equal(res1.status, 404);
        const data1 = await res1.json();
        assert.equal(data1.error.code, 'REPOSITORY_NOT_FOUND');

        const res2 = await fetch(`http://127.0.0.1:${port}/api/files?path=src/app.js`);
        assert.equal(res2.status, 404);
        const data2 = await res2.json();
        assert.equal(data2.error.code, 'REPOSITORY_NOT_FOUND');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('returns HTTP 404 when requested repository ID does not match active snapshot', async () => {
      const store = createIndexStore();
      store.setSnapshot({
        id: 'snapshot_live_1',
        rootPath: '/repo',
        files: [{ path: 'src/a.js', content: 'const a = 1;', lineCount: 1 }],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/repositories/mismatched-id/files?path=src/a.js`);
        assert.equal(res.status, 404);
        const data = await res.json();
        assert.equal(data.error.code, 'REPOSITORY_NOT_FOUND');
        assert.ok(data.error.message.includes('mismatched-id'));
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('returns HTTP 400 with INVALID_FILE_PATH when path query parameter is missing or empty', async () => {
      const store = createIndexStore();
      store.setSnapshot({
        id: 'snapshot_live_1',
        rootPath: '/repo',
        files: [{ path: 'src/a.js', content: 'const a = 1;', lineCount: 1 }],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        const res1 = await fetch(`http://127.0.0.1:${port}/api/files`);
        assert.equal(res1.status, 400);
        const data1 = await res1.json();
        assert.equal(data1.error.code, 'INVALID_FILE_PATH');

        const res2 = await fetch(`http://127.0.0.1:${port}/api/files?path=`);
        assert.equal(res2.status, 400);
        const data2 = await res2.json();
        assert.equal(data2.error.code, 'INVALID_FILE_PATH');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('returns HTTP 400 with INVALID_FILE_PATH when path contains traversal, absolute, or drive prefixes', async () => {
      const store = createIndexStore();
      store.setSnapshot({
        id: 'snapshot_live_1',
        rootPath: '/repo',
        files: [{ path: 'src/a.js', content: 'const a = 1;', lineCount: 1 }],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        const badPaths = [
          '../secret.txt',
          '../../etc/passwd',
          '%2e%2e/secret.txt',
          '/etc/passwd',
          'C:/secret.txt',
        ];

        for (const badPath of badPaths) {
          const res = await fetch(`http://127.0.0.1:${port}/api/files?path=${encodeURIComponent(badPath)}`);
          assert.equal(res.status, 400);
          const data = await res.json();
          assert.equal(data.error.code, 'INVALID_FILE_PATH');
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('returns HTTP 404 with FILE_NOT_FOUND when file path is valid syntax but absent from indexed snapshot', async () => {
      const store = createIndexStore();
      store.setSnapshot({
        id: 'snapshot_live_1',
        rootPath: '/repo',
        files: [{ path: 'src/a.js', content: 'const a = 1;', lineCount: 1 }],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/files?path=src/nonexistent.js`);
        assert.equal(res.status, 404);
        const data = await res.json();
        assert.equal(data.error.code, 'FILE_NOT_FOUND');
        assert.ok(data.error.message.includes('src/nonexistent.js'));
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('returns HTTP 200 with content and file metadata for an indexed file via GET /api/repositories/:id/files?path=...', async () => {
      const store = createIndexStore();
      const snapshotId = 'snapshot_files_test';
      store.setSnapshot({
        id: snapshotId,
        rootPath: '/repo',
        files: [
          {
            path: 'src/server.js',
            content: 'import express from "express";\nconst app = express();\n',
            lineCount: 2,
            language: 'javascript',
            size: 55,
            extension: '.js',
          },
        ],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        // Query by snapshotId
        const res1 = await fetch(`http://127.0.0.1:${port}/api/repositories/${snapshotId}/files?path=src/server.js`);
        assert.equal(res1.status, 200);
        const data1 = await res1.json();
        assert.equal(data1.path, 'src/server.js');
        assert.equal(data1.content, 'import express from "express";\nconst app = express();\n');
        assert.equal(data1.lineCount, 2);
        assert.equal(data1.language, 'javascript');
        assert.equal(data1.size, 55);
        assert.equal(data1.extension, '.js');

        // Query with :id='current'
        const res2 = await fetch(`http://127.0.0.1:${port}/api/repositories/current/files?path=src/server.js`);
        assert.equal(res2.status, 200);
        const data2 = await res2.json();
        assert.equal(data2.path, 'src/server.js');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('returns HTTP 200 via direct active route GET /api/files?path=... and path-based route /api/files/*', async () => {
      const store = createIndexStore();
      store.setSnapshot({
        id: 'snapshot_direct_1',
        rootPath: '/repo',
        files: [
          {
            path: 'src/utils/math.ts',
            content: 'export const add = (a: number, b: number) => a + b;\n',
            lineCount: 1,
            language: 'typescript',
            size: 51,
            extension: '.ts',
          },
        ],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        // Direct query route
        const res1 = await fetch(`http://127.0.0.1:${port}/api/files?path=src/utils/math.ts`);
        assert.equal(res1.status, 200);
        const data1 = await res1.json();
        assert.equal(data1.path, 'src/utils/math.ts');
        assert.equal(data1.language, 'typescript');

        // Direct path wildcard route
        const res2 = await fetch(`http://127.0.0.1:${port}/api/files/src/utils/math.ts`);
        assert.equal(res2.status, 200);
        const data2 = await res2.json();
        assert.equal(data2.path, 'src/utils/math.ts');

        // Canonical path wildcard route
        const res3 = await fetch(`http://127.0.0.1:${port}/api/repositories/current/files/src/utils/math.ts`);
        assert.equal(res3.status, 200);
        const data3 = await res3.json();
        assert.equal(data3.path, 'src/utils/math.ts');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('strictly confines retrieval to indexed snapshot and never performs arbitrary filesystem reads', async () => {
      const store = createIndexStore();
      // Snapshot only contains src/allowed.js
      store.setSnapshot({
        id: 'snapshot_confined',
        rootPath: '/repo',
        files: [
          {
            path: 'src/allowed.js',
            content: 'export const allowed = true;',
            lineCount: 1,
            language: 'javascript',
          },
        ],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        // Even if package.json exists on disk in the Trailo project directory,
        // it is not in store.currentSnapshot, so the API must return 404 FILE_NOT_FOUND
        const res = await fetch(`http://127.0.0.1:${port}/api/files?path=package.json`);
        assert.equal(res.status, 404);
        const data = await res.json();
        assert.equal(data.error.code, 'FILE_NOT_FOUND');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('dynamically reflects store snapshot updates across requests', async () => {
      const store = createIndexStore();
      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        // Initial state: not indexed
        const res1 = await fetch(`http://127.0.0.1:${port}/api/files?path=src/a.js`);
        assert.equal(res1.status, 404);

        // Snapshot 1 added
        store.setSnapshot({
          id: 'snap_v1',
          files: [{ path: 'src/a.js', content: 'version 1', lineCount: 1 }],
        });

        const res2 = await fetch(`http://127.0.0.1:${port}/api/files?path=src/a.js`);
        assert.equal(res2.status, 200);
        const data2 = await res2.json();
        assert.equal(data2.content, 'version 1');

        // Snapshot 2 replaces snapshot 1
        store.setSnapshot({
          id: 'snap_v2',
          files: [{ path: 'src/a.js', content: 'version 2', lineCount: 1 }],
        });

        const res3 = await fetch(`http://127.0.0.1:${port}/api/files?path=src/a.js`);
        assert.equal(res3.status, 200);
        const data3 = await res3.json();
        assert.equal(data3.content, 'version 2');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('rejects single-encoded, double-encoded, and obfuscated traversal attempts through HTTP query parameters', async () => {
      const store = createIndexStore();
      const snapshotId = 'snapshot_encoded_test';
      store.setSnapshot({
        id: snapshotId,
        rootPath: '/repo',
        files: [{ path: 'src/a.js', content: 'const a = 1;', lineCount: 1 }],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        const encodedAttacks = [
          '%2e%2e%2fsecret.txt',
          '%2e%2e/secret.txt',
          '..%2fsecret.txt',
          'src%2F%2e%2e%2Fsecret.txt',
          '%2e%2e%5csecret.txt',
          '%252e%252e%2fsecret.txt',
          '%252e%252e%252fsecret.txt',
          'src%2F%252e%252e%2Fsecret.txt',
          '%25252e%25252e%25252fsecret.txt',
          'src%2Fapp%00.js',
          'C%3A%2Fsecret.txt',
          '%2543%253A%252Fsecret.txt',
        ];

        for (const attack of encodedAttacks) {
          // Direct route: GET /api/files?path=...
          const res1 = await fetch(`http://127.0.0.1:${port}/api/files?path=${attack}`);
          assert.equal(res1.status, 400, `Expected 400 for attack on /api/files: ${attack}`);
          const data1 = await res1.json();
          assert.equal(data1.error.code, 'INVALID_FILE_PATH');

          // Canonical repository route: GET /api/repositories/:id/files?path=...
          const res2 = await fetch(`http://127.0.0.1:${port}/api/repositories/${snapshotId}/files?path=${attack}`);
          assert.equal(res2.status, 400, `Expected 400 for attack on /api/repositories/:id/files: ${attack}`);
          const data2 = await res2.json();
          assert.equal(data2.error.code, 'INVALID_FILE_PATH');
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('rejects encoded and double-encoded traversal attempts through HTTP wildcard path routes', async () => {
      const store = createIndexStore();
      const snapshotId = 'snapshot_wildcard_encoded';
      store.setSnapshot({
        id: snapshotId,
        rootPath: '/repo',
        files: [{ path: 'src/a.js', content: 'const a = 1;', lineCount: 1 }],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        const pathAttacks = [
          '%252e%252e/secret.txt',
          '%252e%252e%252fsecret.txt',
          'src/%252e%252e/secret.txt',
        ];

        for (const attack of pathAttacks) {
          const res1 = await fetch(`http://127.0.0.1:${port}/api/files/${attack}`);
          assert.equal(res1.status, 400, `Expected 400 for wildcard attack on /api/files/*: ${attack}`);
          const data1 = await res1.json();
          assert.equal(data1.error.code, 'INVALID_FILE_PATH');

          const res2 = await fetch(`http://127.0.0.1:${port}/api/repositories/${snapshotId}/files/${attack}`);
          assert.equal(res2.status, 400, `Expected 400 for wildcard attack on /api/repositories/:id/files/*: ${attack}`);
          const data2 = await res2.json();
          assert.equal(data2.error.code, 'INVALID_FILE_PATH');
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('successfully retrieves indexed file using legitimate URL-encoded path via HTTP endpoints', async () => {
      const store = createIndexStore();
      const snapshotId = 'snapshot_legit_encoded';
      store.setSnapshot({
        id: snapshotId,
        rootPath: '/repo',
        files: [
          {
            path: 'src/utils/math.ts',
            content: 'export const add = 1;',
            lineCount: 1,
            language: 'typescript',
          },
        ],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        // Query param with %2F
        const res1 = await fetch(`http://127.0.0.1:${port}/api/files?path=src%2Futils%2Fmath.ts`);
        assert.equal(res1.status, 200);
        const data1 = await res1.json();
        assert.equal(data1.path, 'src/utils/math.ts');
        assert.equal(data1.content, 'export const add = 1;');

        // Canonical repo route with %2F
        const res2 = await fetch(`http://127.0.0.1:${port}/api/repositories/${snapshotId}/files?path=src%2Futils%2Fmath.ts`);
        assert.equal(res2.status, 200);
        const data2 = await res2.json();
        assert.equal(data2.path, 'src/utils/math.ts');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});
