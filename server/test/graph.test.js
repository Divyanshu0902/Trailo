import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { buildDependencyGraph } from '../src/graph/index.js';
import { createIndexStore } from '../src/indexer/index.js';

describe('Backend Graph Construction and API (Phase 4A)', () => {
  describe('buildDependencyGraph (Unit)', () => {
    it('throws TypeError when snapshot is missing or not an object', () => {
      assert.throws(() => buildDependencyGraph(null), {
        name: 'TypeError',
        message: /snapshot must be a valid object/,
      });
      assert.throws(() => buildDependencyGraph(undefined), {
        name: 'TypeError',
      });
      assert.throws(() => buildDependencyGraph('not-an-object'), {
        name: 'TypeError',
      });
    });

    it('transforms an empty repository snapshot into an empty graph payload', () => {
      const snapshot = {
        id: 'snapshot_empty',
        rootPath: '/empty-repo',
        indexedAt: '2026-10-13T12:00:00.000Z',
        files: [],
        dependencies: [],
      };

      const graph = buildDependencyGraph(snapshot);

      assert.equal(graph.repositoryId, 'snapshot_empty');
      assert.equal(graph.rootPath, '/empty-repo');
      assert.equal(graph.indexedAt, '2026-10-13T12:00:00.000Z');
      assert.deepEqual(graph.nodes, []);
      assert.deepEqual(graph.edges, []);
      assert.deepEqual(graph.unresolved, []);
      assert.deepEqual(graph.external, []);
      assert.deepEqual(graph.summary, {
        totalNodes: 0,
        totalEdges: 0,
        resolvedCount: 0,
        unresolvedCount: 0,
        externalCount: 0,
      });
    });

    it('constructs nodes and directed edges preserving direction, metadata, and isolated nodes', () => {
      const snapshot = {
        id: 'snapshot_123',
        rootPath: '/my-repo',
        indexedAt: '2026-10-13T12:00:00.000Z',
        files: [
          { path: 'src/index.js', language: 'javascript', lineCount: 10, size: 200, extension: '.js' },
          { path: 'src/app.ts', language: 'typescript', lineCount: 25, size: 500, extension: '.ts' },
          { path: 'src/utils.ts', language: 'typescript', lineCount: 15, size: 300, extension: '.ts' },
          { path: 'src/standalone.js', language: 'javascript', lineCount: 5, size: 100, extension: '.js' }, // isolated file
        ],
        dependencies: [
          // Resolved internal: index.js -> app.ts
          {
            sourcePath: 'src/index.js',
            targetPath: 'src/app.ts',
            specifier: './app',
            kind: 'import',
            language: 'javascript',
            resolutionStatus: 'resolved',
            sourceLocation: { startLine: 1, endLine: 1 },
          },
          // Resolved internal: app.ts -> utils.ts
          {
            sourcePath: 'src/app.ts',
            targetPath: 'src/utils.ts',
            specifier: './utils',
            kind: 'import',
            language: 'typescript',
            resolutionStatus: 'resolved',
            sourceLocation: { startLine: 2, endLine: 2 },
          },
          // External: index.js -> express
          {
            sourcePath: 'src/index.js',
            targetPath: null,
            specifier: 'express',
            kind: 'require',
            language: 'javascript',
            resolutionStatus: 'external',
            sourceLocation: { startLine: 3, endLine: 3 },
          },
          // Unresolved: app.ts -> ./missing
          {
            sourcePath: 'src/app.ts',
            targetPath: null,
            specifier: './missing',
            kind: 'import',
            language: 'typescript',
            resolutionStatus: 'unresolved',
            sourceLocation: { startLine: 5, endLine: 5 },
          },
        ],
      };

      const graph = buildDependencyGraph(snapshot);

      // 1. Nodes check: all 4 files become nodes, including standalone.js
      assert.equal(graph.nodes.length, 4);
      const nodePaths = graph.nodes.map((n) => n.path).sort();
      assert.deepEqual(nodePaths, ['src/app.ts', 'src/index.js', 'src/standalone.js', 'src/utils.ts']);

      const indexNode = graph.nodes.find((n) => n.id === 'src/index.js');
      assert.deepEqual(indexNode, {
        id: 'src/index.js',
        path: 'src/index.js',
        name: 'index.js',
        language: 'javascript',
        lineCount: 10,
        size: 200,
        extension: '.js',
      });

      // 2. Edges check: only resolved internal dependencies become edges
      assert.equal(graph.edges.length, 2);

      // Edge 1: src/index.js -> src/app.ts (directed: source is importing file, target is imported file)
      const edge1 = graph.edges.find((e) => e.source === 'src/index.js' && e.target === 'src/app.ts');
      assert.ok(edge1);
      assert.equal(edge1.id, 'src/index.js->src/app.ts:import:1');
      assert.equal(edge1.specifier, './app');
      assert.equal(edge1.kind, 'import');
      assert.deepEqual(edge1.sourceLocation, { startLine: 1, endLine: 1 });

      // Edge 2: src/app.ts -> src/utils.ts
      const edge2 = graph.edges.find((e) => e.source === 'src/app.ts' && e.target === 'src/utils.ts');
      assert.ok(edge2);
      assert.equal(edge2.id, 'src/app.ts->src/utils.ts:import:2');
      assert.equal(edge2.specifier, './utils');

      // 3. Unresolved dependencies check
      assert.equal(graph.unresolved.length, 1);
      assert.deepEqual(graph.unresolved[0], {
        sourcePath: 'src/app.ts',
        specifier: './missing',
        kind: 'import',
        language: 'typescript',
        resolutionStatus: 'unresolved',
        sourceLocation: { startLine: 5, endLine: 5 },
      });

      // 4. External dependencies check (not converted to repository file nodes)
      assert.equal(graph.external.length, 1);
      assert.deepEqual(graph.external[0], {
        sourcePath: 'src/index.js',
        specifier: 'express',
        kind: 'require',
        language: 'javascript',
        resolutionStatus: 'external',
        sourceLocation: { startLine: 3, endLine: 3 },
      });
      assert.equal(graph.nodes.some((n) => n.id === 'express'), false);

      // 5. Summary metrics
      assert.deepEqual(graph.summary, {
        totalNodes: 4,
        totalEdges: 2,
        resolvedCount: 2,
        unresolvedCount: 1,
        externalCount: 1,
      });
    });

    it('deduplicates duplicate nodes and identical edges', () => {
      const snapshot = {
        id: 'snapshot_dedup',
        files: [
          { path: 'src/a.js', language: 'javascript' },
          { path: 'src/a.js', language: 'javascript' }, // duplicate node input
          { path: 'src/b.js', language: 'javascript' },
        ],
        dependencies: [
          {
            sourcePath: 'src/a.js',
            targetPath: 'src/b.js',
            specifier: './b',
            kind: 'import',
            resolutionStatus: 'resolved',
            sourceLocation: { startLine: 1, endLine: 1 },
          },
          {
            sourcePath: 'src/a.js',
            targetPath: 'src/b.js',
            specifier: './b',
            kind: 'import',
            resolutionStatus: 'resolved',
            sourceLocation: { startLine: 1, endLine: 1 }, // duplicate identical edge
          },
        ],
      };

      const graph = buildDependencyGraph(snapshot);
      assert.equal(graph.nodes.length, 2);
      assert.equal(graph.edges.length, 1);
      assert.equal(graph.summary.totalNodes, 2);
      assert.equal(graph.summary.totalEdges, 1);
    });
  });

  describe('Graph API Endpoints (Integration)', () => {
    it('returns HTTP 404 with structured error when index is unavailable (not yet indexed)', async () => {
      const emptyStore = createIndexStore();
      const app = createApp({ store: emptyStore });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        // Test canonical route with arbitrary id
        const res1 = await fetch(`http://127.0.0.1:${port}/api/repositories/some-id/graph`);
        assert.equal(res1.status, 404);
        const data1 = await res1.json();
        assert.equal(data1.error.code, 'REPOSITORY_NOT_FOUND');
        assert.ok(data1.error.message.includes('not yet indexed'));

        // Test direct route
        const res2 = await fetch(`http://127.0.0.1:${port}/api/graph`);
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
        id: 'snapshot_active_1',
        rootPath: '/repo',
        files: [{ path: 'src/a.js' }],
        dependencies: [],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/repositories/non_matching_id/graph`);
        assert.equal(res.status, 404);
        const data = await res.json();
        assert.equal(data.error.code, 'REPOSITORY_NOT_FOUND');
        assert.ok(data.error.message.includes('non_matching_id'));
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('returns HTTP 200 with complete graph payload on GET /api/repositories/:id/graph and /api/graph', async () => {
      const store = createIndexStore();
      const snapshotId = 'snapshot_live_99';
      store.setSnapshot({
        id: snapshotId,
        rootPath: '/work/my-project',
        files: [
          { path: 'src/server.js', language: 'javascript', lineCount: 20 },
          { path: 'src/routes.js', language: 'javascript', lineCount: 15 },
        ],
        dependencies: [
          {
            sourcePath: 'src/server.js',
            targetPath: 'src/routes.js',
            specifier: './routes.js',
            kind: 'import',
            language: 'javascript',
            resolutionStatus: 'resolved',
            sourceLocation: { startLine: 1, endLine: 1 },
          },
          {
            sourcePath: 'src/server.js',
            targetPath: null,
            specifier: 'express',
            kind: 'import',
            language: 'javascript',
            resolutionStatus: 'external',
            sourceLocation: { startLine: 2, endLine: 2 },
          },
        ],
      });

      const app = createApp({ store });
      const server = app.listen(0);
      const { port } = server.address();

      try {
        // 1. Fetch by exact snapshot ID
        const res1 = await fetch(`http://127.0.0.1:${port}/api/repositories/${snapshotId}/graph`);
        assert.equal(res1.status, 200);
        const data1 = await res1.json();

        assert.equal(data1.repositoryId, snapshotId);
        assert.equal(data1.rootPath, '/work/my-project');
        assert.equal(data1.nodes.length, 2);
        assert.equal(data1.edges.length, 1);
        assert.equal(data1.edges[0].source, 'src/server.js');
        assert.equal(data1.edges[0].target, 'src/routes.js');
        assert.equal(data1.external.length, 1);
        assert.equal(data1.unresolved.length, 0);
        assert.deepEqual(data1.summary, {
          totalNodes: 2,
          totalEdges: 1,
          resolvedCount: 1,
          unresolvedCount: 0,
          externalCount: 1,
        });

        // 2. Fetch using "current" alias
        const res2 = await fetch(`http://127.0.0.1:${port}/api/repositories/current/graph`);
        assert.equal(res2.status, 200);
        const data2 = await res2.json();
        assert.equal(data2.repositoryId, snapshotId);

        // 3. Fetch using direct /api/graph endpoint
        const res3 = await fetch(`http://127.0.0.1:${port}/api/graph`);
        assert.equal(res3.status, 200);
        const data3 = await res3.json();
        assert.equal(data3.repositoryId, snapshotId);
        assert.equal(data3.edges.length, 1);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});
