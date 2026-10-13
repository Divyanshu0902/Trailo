import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSelectionHighlights } from '../../client/src/utils/graphSelection.js';
import { SourceLoader } from '../../client/src/utils/sourceLoader.js';
import {
  splitSourceLines,
  getPrismGrammar,
  tokenizeSourceLine,
  clampViewerWidth,
} from '../../client/src/utils/sourceHighlighter.js';
import { computeGraphLayout } from '../../client/src/utils/layout.js';

describe('Node Selection and Source Viewer (Phase 4C Step 2C)', () => {
  describe('computeSelectionHighlights (Unit)', () => {
    const fixtureNodes = [
      { id: 'src/index.js', name: 'index.js' },
      { id: 'src/utils.js', name: 'utils.js' },
      { id: 'src/server.js', name: 'server.js' },
      { id: 'src/helper.js', name: 'helper.js' },
      { id: 'src/isolated.js', name: 'isolated.js' },
    ];

    const fixtureEdges = [
      { id: 'e1', source: 'src/index.js', target: 'src/utils.js' }, // index imports utils (outgoing from index)
      { id: 'e2', source: 'src/server.js', target: 'src/index.js' }, // server imports index (incoming to index)
      { id: 'e3', source: 'src/server.js', target: 'src/helper.js' }, // unrelated to index
    ];

    it('returns normal state for all nodes and edges when no node is selected', () => {
      const res = computeSelectionHighlights(null, fixtureNodes, fixtureEdges);

      assert.equal(res.selectedNodeId, null);
      assert.equal(res.isIsolated, false);
      assert.equal(res.incomingNodeIds.size, 0);
      assert.equal(res.outgoingNodeIds.size, 0);

      for (const node of fixtureNodes) {
        assert.equal(res.nodeHighlightMap.get(node.id), 'normal');
      }
      for (const edge of fixtureEdges) {
        assert.equal(res.edgeHighlightMap.get(edge.id), 'normal');
      }
    });

    it('correctly highlights incoming dependents and outgoing dependencies when a node is selected', () => {
      const res = computeSelectionHighlights('src/index.js', fixtureNodes, fixtureEdges);

      assert.equal(res.selectedNodeId, 'src/index.js');
      assert.equal(res.isIsolated, false);

      // Incoming: server imports index
      assert.deepEqual(Array.from(res.incomingNodeIds), ['src/server.js']);
      // Outgoing: index imports utils
      assert.deepEqual(Array.from(res.outgoingNodeIds), ['src/utils.js']);

      // Node highlights
      assert.equal(res.nodeHighlightMap.get('src/index.js'), 'selected');
      assert.equal(res.nodeHighlightMap.get('src/server.js'), 'incoming');
      assert.equal(res.nodeHighlightMap.get('src/utils.js'), 'outgoing');
      assert.equal(res.nodeHighlightMap.get('src/helper.js'), 'dimmed');
      assert.equal(res.nodeHighlightMap.get('src/isolated.js'), 'dimmed');

      // Edge highlights
      assert.equal(res.edgeHighlightMap.get('e1'), 'outgoing'); // index -> utils
      assert.equal(res.edgeHighlightMap.get('e2'), 'incoming'); // server -> index
      assert.equal(res.edgeHighlightMap.get('e3'), 'dimmed');   // server -> helper
    });

    it('correctly handles selecting an isolated node with zero incident edges', () => {
      const res = computeSelectionHighlights('src/isolated.js', fixtureNodes, fixtureEdges);

      assert.equal(res.selectedNodeId, 'src/isolated.js');
      assert.equal(res.isIsolated, true);
      assert.equal(res.incomingNodeIds.size, 0);
      assert.equal(res.outgoingNodeIds.size, 0);

      assert.equal(res.nodeHighlightMap.get('src/isolated.js'), 'selected');
      assert.equal(res.nodeHighlightMap.get('src/index.js'), 'dimmed');
      assert.equal(res.nodeHighlightMap.get('src/utils.js'), 'dimmed');
      assert.equal(res.nodeHighlightMap.get('src/server.js'), 'dimmed');
      assert.equal(res.nodeHighlightMap.get('src/helper.js'), 'dimmed');

      for (const edge of fixtureEdges) {
        assert.equal(res.edgeHighlightMap.get(edge.id), 'dimmed');
      }
    });

    it('updates selection and neighbor highlights when another node is selected', () => {
      const res = computeSelectionHighlights('src/utils.js', fixtureNodes, fixtureEdges);

      assert.equal(res.selectedNodeId, 'src/utils.js');
      assert.equal(res.isIsolated, false);

      // Incoming to utils: index.js
      assert.deepEqual(Array.from(res.incomingNodeIds), ['src/index.js']);
      // Outgoing from utils: none
      assert.equal(res.outgoingNodeIds.size, 0);

      assert.equal(res.nodeHighlightMap.get('src/utils.js'), 'selected');
      assert.equal(res.nodeHighlightMap.get('src/index.js'), 'incoming');
      assert.equal(res.nodeHighlightMap.get('src/server.js'), 'dimmed');
      assert.equal(res.edgeHighlightMap.get('e1'), 'incoming');
      assert.equal(res.edgeHighlightMap.get('e2'), 'dimmed');
      assert.equal(res.edgeHighlightMap.get('e3'), 'dimmed');
    });
  });

  describe('SourceLoader (Unit)', () => {
    it('uses the actual API contract with encoded file paths and returns source data', async () => {
      let requestedUrl = null;
      const fakeFetch = async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            path: 'src/utils/math.ts',
            content: 'export function add(a, b) { return a + b; }',
            lineCount: 1,
            language: 'typescript',
            size: 44,
            extension: '.ts',
          }),
        };
      };

      const loader = new SourceLoader(fakeFetch);
      const res = await loader.loadSource('src/utils/math.ts');

      assert.equal(requestedUrl, '/api/files?path=src%2Futils%2Fmath.ts');
      assert.equal(res.isStale, false);
      assert.equal(res.data.path, 'src/utils/math.ts');
      assert.equal(res.data.language, 'typescript');
      assert.equal(res.data.lineCount, 1);
    });

    it('avoids duplicate network requests by serving from in-memory cache', async () => {
      let callCount = 0;
      const fakeFetch = async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            path: 'src/index.js',
            content: 'console.log("hello");',
            lineCount: 1,
            language: 'javascript',
            size: 21,
            extension: '.js',
          }),
        };
      };

      const loader = new SourceLoader(fakeFetch);

      // First call -> hits network
      const res1 = await loader.loadSource('src/index.js');
      assert.equal(callCount, 1);
      assert.equal(res1.data.path, 'src/index.js');

      // Second call for same path -> served from cache
      const res2 = await loader.loadSource('src/index.js');
      assert.equal(callCount, 1);
      assert.equal(res2.data.path, 'src/index.js');
    });

    it('handles structured API errors (e.g. FILE_NOT_FOUND, INVALID_FILE_PATH)', async () => {
      const fakeFetch = async () => ({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: 'FILE_NOT_FOUND',
            message: "File 'src/missing.js' not found in active repository index",
          },
        }),
      });

      const loader = new SourceLoader(fakeFetch);
      const res = await loader.loadSource('src/missing.js');

      assert.equal(res.isStale, false);
      assert.equal(res.error.code, 'FILE_NOT_FOUND');
      assert.match(res.error.message, /not found/);
    });

    it('prevents stale responses from rapid selection changes from overwriting the viewer', async () => {
      let resolveFirst;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      const fakeFetch = async (url) => {
        if (url.includes('fileA')) {
          await firstPromise;
          return {
            ok: true,
            status: 200,
            json: async () => ({ path: 'fileA.js', content: 'content A' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ path: 'fileB.js', content: 'content B' }),
        };
      };

      const loader = new SourceLoader(fakeFetch);

      // User clicks fileA
      const promiseA = loader.loadSource('fileA.js');

      // User immediately clicks fileB before fileA completes
      const promiseB = loader.loadSource('fileB.js');

      const resB = await promiseB;
      assert.equal(resB.isStale, false);
      assert.equal(resB.data.path, 'fileB.js');

      // Now resolve fileA late
      resolveFirst();
      const resA = await promiseA;
      assert.equal(resA.isStale, true); // Stale! Must be ignored by UI
    });

    it('safely invokes fetch when fetch expects window receiver (prevents Illegal invocation error)', async () => {
      // Simulates browser window where window.fetch throws "Illegal invocation" if `this` is not `window`
      class FakeWindow {
        fetch(url) {
          if (!(this instanceof FakeWindow)) {
            throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              path: 'src/utils/ApiResponse.js',
              content: 'class ApiResponse {}',
              lineCount: 1,
              language: 'javascript',
              size: 20,
              extension: '.js',
            }),
          });
        }
      }

      const fakeWindow = new FakeWindow();

      // Test 1: Simulating browser environment where global window has fetch, and loader uses default constructor
      const originalWindow = globalThis.window;
      try {
        globalThis.window = fakeWindow;
        const loader = new SourceLoader();
        const res = await loader.loadSource('src/utils/ApiResponse.js');
        assert.equal(res.isStale, false);
        assert.equal(res.data.path, 'src/utils/ApiResponse.js');
        assert.equal(res.data.content, 'class ApiResponse {}');
      } finally {
        globalThis.window = originalWindow;
      }
    });

    it('allows retrying after a failed request without caching the failure', async () => {
      let attempt = 0;
      const flakeyFetch = async () => {
        attempt++;
        if (attempt === 1) {
          throw new Error('Connection failed');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            path: 'src/app.js',
            content: 'import express from "express";',
            lineCount: 1,
            language: 'javascript',
            size: 30,
            extension: '.js',
          }),
        };
      };

      const loader = new SourceLoader(flakeyFetch);

      // Attempt 1 fails
      const res1 = await loader.loadSource('src/app.js');
      assert.equal(res1.isStale, false);
      assert.equal(res1.error.code, 'NETWORK_ERROR');
      assert.equal(res1.data, undefined);

      // Attempt 2 (Retry) succeeds
      const res2 = await loader.loadSource('src/app.js');
      assert.equal(res2.isStale, false);
      assert.equal(res2.error, undefined);
      assert.equal(res2.data.path, 'src/app.js');
      assert.equal(res2.data.content, 'import express from "express";');
    });

    it('clears in-memory cache and resets active request on clearCache', async () => {
      let callCount = 0;
      const fakeFetch = async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            path: 'src/app.js',
            content: 'console.log("hello");',
            lineCount: 1,
            language: 'javascript',
            size: 22,
            extension: '.js',
          }),
        };
      };

      const loader = new SourceLoader(fakeFetch);
      await loader.loadSource('src/app.js');
      assert.equal(callCount, 1);

      // Serving from cache
      await loader.loadSource('src/app.js');
      assert.equal(callCount, 1);

      // Clear cache
      loader.clearCache();

      // Fetches again after cache clear
      await loader.loadSource('src/app.js');
      assert.equal(callCount, 2);
    });
  });

  describe('splitSourceLines (Unit - Source Preservation & Line Alignment)', () => {
    it('returns an empty array for empty or non-string input', () => {
      assert.deepEqual(splitSourceLines(''), []);
      assert.deepEqual(splitSourceLines(null), []);
      assert.deepEqual(splitSourceLines(undefined), []);
      assert.deepEqual(splitSourceLines(123), []);
    });

    it('handles a single line without trailing newline without adding extra line', () => {
      const code = 'const answer = 42;';
      const lines = splitSourceLines(code);
      assert.deepEqual(lines, ['const answer = 42;']);
      assert.equal(lines.length, 1);
    });

    it('handles a single line with trailing newline without creating phantom line', () => {
      const code = 'const answer = 42;\n';
      const lines = splitSourceLines(code);
      assert.deepEqual(lines, ['const answer = 42;']);
      assert.equal(lines.length, 1);
    });

    it('normalizes CRLF to LF across multiple lines', () => {
      const code = 'import path from "node:path";\r\n\r\nexport const x = 1;\r\n';
      const lines = splitSourceLines(code);
      assert.deepEqual(lines, [
        'import path from "node:path";',
        '',
        'export const x = 1;',
      ]);
      assert.equal(lines.length, 3);
    });

    it('preserves multiple consecutive blank lines without collapsing them', () => {
      const code = 'line 1\n\n\nline 4\n';
      const lines = splitSourceLines(code);
      assert.deepEqual(lines, ['line 1', '', '', 'line 4']);
      assert.equal(lines.length, 4);
    });

    it('preserves intentional trailing blank line before EOF when multiple newlines occur', () => {
      const code = 'line 1\n\n';
      const lines = splitSourceLines(code);
      assert.deepEqual(lines, ['line 1', '']);
      assert.equal(lines.length, 2);
    });

    it('strictly preserves original whitespace, tabs, and indentation', () => {
      const code = '\tfunction indentTest() {\n  \t  const inner = true;\n\t}';
      const lines = splitSourceLines(code);
      assert.equal(lines[0], '\tfunction indentTest() {');
      assert.equal(lines[1], '  \t  const inner = true;');
      assert.equal(lines[2], '\t}');
      assert.equal(lines.length, 3);
    });
  });

  describe('Syntax Highlighting & Tokenization (Unit)', () => {
    it('resolves correct Prism grammars for recognized JS/TS languages and extensions', () => {
      assert.ok(getPrismGrammar('javascript', '.js'));
      assert.ok(getPrismGrammar('typescript', '.ts'));
      assert.ok(getPrismGrammar('jsx', '.jsx'));
      assert.ok(getPrismGrammar('tsx', '.tsx'));
      assert.ok(getPrismGrammar('json', '.json'));
      assert.ok(getPrismGrammar('css', '.css'));
      assert.ok(getPrismGrammar('markdown', '.md'));
    });

    it('returns null for unsupported languages and extensions without throwing', () => {
      assert.equal(getPrismGrammar('unknown', '.xyz'), null);
      assert.equal(getPrismGrammar('', ''), null);
      assert.equal(getPrismGrammar('text', '.txt'), null);
    });

    it('tokenizes supported code into structured Prism tokens', () => {
      const grammar = getPrismGrammar('javascript', '.js');
      const tokens = tokenizeSourceLine('const count = 42;', grammar);

      assert.ok(Array.isArray(tokens));
      assert.ok(tokens.length > 0);

      // Verify the keyword token exists and has correct type
      const keywordToken = tokens.find((t) => typeof t === 'object' && t.type === 'keyword');
      assert.ok(keywordToken);
      assert.equal(keywordToken.content, 'const');
    });

    it('gracefully returns raw line when grammar is null (unsupported language fallback)', () => {
      const rawLine = 'SOME UNKNOWN FORMAT line 1';
      const tokens = tokenizeSourceLine(rawLine, null);
      assert.deepEqual(tokens, [rawLine]);
    });

    it('handles blank lines safely without throwing', () => {
      const grammar = getPrismGrammar('typescript', '.ts');
      const tokens = tokenizeSourceLine('', grammar);
      assert.deepEqual(tokens, ['']);
    });
  });

  describe('clampViewerWidth (Unit - Resizable Panel)', () => {
    it('enforces minimum panel width of 320px', () => {
      assert.equal(clampViewerWidth(200, 1200), 320);
      assert.equal(clampViewerWidth(-50, 1200), 320);
    });

    it('enforces maximum panel width of 850px on spacious screens', () => {
      assert.equal(clampViewerWidth(1200, 1600), 850);
      assert.equal(clampViewerWidth(851, 1600), 850);
    });

    it('restricts max width so the graph canvas always retains at least 300px', () => {
      // In an 800px workspace, canvas gets 300px, so max viewer width is 500px
      assert.equal(clampViewerWidth(650, 800), 500);
      assert.equal(clampViewerWidth(450, 800), 450);
    });

    it('preserves valid widths within min and max boundaries', () => {
      assert.equal(clampViewerWidth(480, 1200), 480);
      assert.equal(clampViewerWidth(600, 1400), 600);
    });
  });

  describe('computeGraphLayout & Canvas State Synchronization (Regression)', () => {
    it('returns positioned nodes with valid positions for connected and isolated nodes', () => {
      const rawNodes = [
        { id: 'src/app.js', name: 'app.js' },
        { id: 'src/routes.js', name: 'routes.js' },
        { id: 'src/utils.js', name: 'utils.js' },
        { id: 'src/isolated.js', name: 'isolated.js' },
      ];
      const rawEdges = [
        { id: 'e1', source: 'src/app.js', target: 'src/routes.js' },
        { id: 'e2', source: 'src/routes.js', target: 'src/utils.js' },
      ];

      const layout = computeGraphLayout(rawNodes, rawEdges);

      // Verify array contract
      assert.ok(Array.isArray(layout));
      assert.equal(layout.length, 4);

      // Verify dual-interface compatibility (.nodes and .edges properties attached)
      assert.ok(Array.isArray(layout.nodes));
      assert.equal(layout.nodes.length, 4);
      assert.ok(Array.isArray(layout.edges));
      assert.equal(layout.edges.length, 2);

      // Every node has valid coordinates
      for (const node of layout) {
        assert.ok(typeof node.position.x === 'number');
        assert.ok(typeof node.position.y === 'number');
      }
    });

    it('prevents header metrics and graph canvas empty state from disagreeing on successful scan', () => {
      // Simulates VideoTube2 graph payload (16 nodes, 11 edges)
      const payloadNodes = Array.from({ length: 16 }, (_, i) => ({
        id: `src/file_${i}.js`,
        path: `src/file_${i}.js`,
        name: `file_${i}.js`,
        language: 'javascript',
        lineCount: 50,
        size: 1024,
        extension: '.js',
      }));

      const payloadEdges = Array.from({ length: 11 }, (_, i) => ({
        id: `edge-${i}`,
        source: `src/file_${i}.js`,
        target: `src/file_${i + 1}.js`,
        kind: 'import',
        specifier: `./file_${i + 1}.js`,
      }));

      const graphPayload = {
        repositoryId: 'repo-vt2',
        rootPath: '/path/to/VideoTube2',
        nodes: payloadNodes,
        edges: payloadEdges,
        summary: {
          totalNodes: 16,
          totalEdges: 11,
          resolvedCount: 11,
          unresolvedCount: 0,
          externalCount: 14,
        },
      };

      // Header derives metrics directly from graphPayload.summary
      assert.equal(graphPayload.summary.totalNodes, 16);
      assert.equal(graphPayload.summary.totalEdges, 11);

      // State transformation in loadGraphFromPayload
      const rawNodes = graphPayload.nodes.map((node) => ({
        id: node.id,
        type: 'fileNode',
        data: { ...node, highlightState: 'normal' },
        position: { x: 0, y: 0 },
      }));

      const rawEdges = graphPayload.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'default',
      }));

      const layout = computeGraphLayout(rawNodes, rawEdges);
      const positionedNodes = Array.isArray(layout) ? layout : (layout?.nodes || []);
      const finalEdges = rawEdges;

      // Canvas empty state condition: !hasNodes (nodes.length === 0)
      const hasNodes = positionedNodes && positionedNodes.length > 0;
      const hasEdges = finalEdges && finalEdges.length > 0;

      // Both canvas state and header metrics must agree
      assert.equal(hasNodes, true, 'Canvas must not report empty nodes when header reports 16 nodes');
      assert.equal(hasEdges, true, 'Canvas must not report empty edges when header reports 11 edges');
      assert.equal(positionedNodes.length, 16);
      assert.equal(finalEdges.length, 11);

      // Layout nodes must never be undefined
      assert.notEqual(layout.nodes, undefined);
      assert.notEqual(layout.edges, undefined);
    });

    it('returns empty array when nodes array is empty without throwing', () => {
      const layout = computeGraphLayout([], []);
      assert.ok(Array.isArray(layout));
      assert.equal(layout.length, 0);
      assert.ok(Array.isArray(layout.nodes));
      assert.equal(layout.nodes.length, 0);
      assert.ok(Array.isArray(layout.edges));
      assert.equal(layout.edges.length, 0);
    });
  });
});
