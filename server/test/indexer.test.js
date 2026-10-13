import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  IndexStore,
  createIndexStore,
  createIndexSnapshot,
  indexRepository,
} from '../src/indexer/index.js';

describe('In-Memory Index Store & Integration (Increment C)', () => {
  describe('IndexStore unit methods', () => {
    it('initializes empty and returns null summary before snapshot is set', () => {
      const store = createIndexStore();
      assert.equal(store.getSnapshotSummary(), null);
      assert.deepEqual(store.getAllFiles(), []);
      assert.deepEqual(store.getChunks(), []);
      assert.deepEqual(store.getAllDependencies(), []);
      assert.equal(store.getFile('src/app.js'), null);
      assert.equal(store.getChunkById('c1'), null);
    });

    it('stores snapshot, indexes lookups, and calculates summary metrics', () => {
      const store = createIndexStore();

      const files = [
        { path: 'src/a.js', content: 'const a = 1;', lineCount: 1, language: 'javascript' },
        { path: 'src/b.ts', content: 'const b = 2;\nconst c = 3;', lineCount: 2, language: 'typescript' },
      ];

      const chunks = [
        { chunkId: 'src/a.js:L1-L1', filePath: 'src/a.js', startLine: 1, endLine: 1, lineCount: 1, text: 'const a = 1;' },
        { chunkId: 'src/b.ts:L1-L2', filePath: 'src/b.ts', startLine: 1, endLine: 2, lineCount: 2, text: 'const b = 2;\nconst c = 3;' },
      ];

      const dependencies = [
        {
          sourcePath: 'src/a.js',
          targetPath: 'src/b.ts',
          specifier: './b',
          kind: 'import',
          language: 'javascript',
          resolutionStatus: 'resolved',
          sourceLocation: { startLine: 1, endLine: 1 },
        },
        {
          sourcePath: 'src/a.js',
          targetPath: null,
          specifier: 'lodash',
          kind: 'require',
          language: 'javascript',
          resolutionStatus: 'external',
          sourceLocation: { startLine: 2, endLine: 2 },
        },
        {
          sourcePath: 'src/b.ts',
          targetPath: null,
          specifier: './missing',
          kind: 'import',
          language: 'typescript',
          resolutionStatus: 'unresolved',
          sourceLocation: { startLine: 1, endLine: 1 },
        },
      ];

      const summary = store.setSnapshot({
        rootPath: '/repo',
        files,
        chunks,
        dependencies,
        warnings: ['Warning 1'],
        skipped: [{ path: 'dist/bundle.js', reason: 'ignored' }],
      });

      assert.equal(summary.rootPath, '/repo');
      assert.equal(summary.stats.totalFiles, 2);
      assert.equal(summary.stats.totalChunks, 2);
      assert.equal(summary.stats.totalDependencies, 3);
      assert.equal(summary.stats.resolvedDependencies, 1);
      assert.equal(summary.stats.externalDependencies, 1);
      assert.equal(summary.stats.unresolvedDependencies, 1);
      assert.equal(summary.skippedCount, 1);

      // File lookups
      assert.equal(store.getFile('src/a.js').path, 'src/a.js');
      assert.equal(store.getFile('src/nonExistent.js'), null);

      // Chunk lookups
      assert.equal(store.getChunkById('src/a.js:L1-L1').text, 'const a = 1;');
      assert.equal(store.getChunks('src/b.ts').length, 1);
      assert.equal(store.getChunks().length, 2);

      // Dependency queries (inbound and outbound)
      const outA = store.getOutboundDependencies('src/a.js');
      assert.equal(outA.length, 2);

      const inB = store.getInboundDependencies('src/b.ts');
      assert.equal(inB.length, 1);
      assert.equal(inB[0].sourcePath, 'src/a.js');

      // Clear store
      store.clear();
      assert.equal(store.getSnapshotSummary(), null);
    });
  });

  describe('createIndexSnapshot', () => {
    it('creates enriched files, line chunks, and extracted dependencies from raw scanned files', () => {
      const scannedFiles = [
        {
          path: 'src/main.ts',
          content: 'import { util } from "./util";\nimport express from "express";\n',
          lineCount: 2,
        },
        {
          path: 'src/util.ts',
          content: 'export const util = 42;\n',
          lineCount: 1,
        },
      ];

      const snapshot = createIndexSnapshot({
        rootPath: '/project',
        files: scannedFiles,
        chunkOptions: { linesPerChunk: 50 },
      });

      assert.equal(snapshot.files.length, 2);
      assert.equal(snapshot.files[0].language, 'typescript');
      assert.equal(snapshot.files[1].language, 'typescript');

      assert.equal(snapshot.chunks.length, 2);
      assert.equal(snapshot.chunks[0].chunkId, 'src/main.ts:L1-L2');

      assert.equal(snapshot.dependencies.length, 2);
      assert.equal(snapshot.dependencies[0].sourcePath, 'src/main.ts');
      assert.equal(snapshot.dependencies[0].targetPath, 'src/util.ts');
      assert.equal(snapshot.dependencies[0].resolutionStatus, 'resolved');

      assert.equal(snapshot.dependencies[1].specifier, 'express');
      assert.equal(snapshot.dependencies[1].resolutionStatus, 'external');
    });
  });

  describe('indexRepository End-to-End Pipeline', () => {
    let tmpDir;

    before(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trailo-indexer-e2e-'));
    });

    after(async () => {
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('indexes a realistic repository on disk into files, chunks, and normalized dependencies', async () => {
      // Create repo fixture structure
      await fs.mkdir(path.join(tmpDir, 'src', 'components'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, 'src', 'utils'), { recursive: true });
      await fs.mkdir(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true });

      // Valid source files
      await fs.writeFile(
        path.join(tmpDir, 'src', 'index.js'),
        'import { run } from "./app";\nconst express = require("express");\n'
      );
      await fs.writeFile(
        path.join(tmpDir, 'src', 'app.ts'),
        'import { Button } from "./components/Button";\nexport function run() { return Button(); }\n'
      );
      await fs.writeFile(
        path.join(tmpDir, 'src', 'components', 'Button.tsx'),
        'import React from "react";\nimport "./Button.css";\nimport { format } from "../utils/helper";\nexport function Button() { return format("btn"); }\n'
      );
      await fs.writeFile(
        path.join(tmpDir, 'src', 'utils', 'helper.ts'),
        'export function format(s: string): string { return s.toUpperCase(); }\n'
      );

      // Ignored / excluded files
      await fs.writeFile(path.join(tmpDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};');
      await fs.writeFile(path.join(tmpDir, 'src', 'components', 'Button.css'), '.btn { color: red; }');

      const store = createIndexStore();
      const result = await indexRepository(tmpDir, {
        store,
        chunkOptions: { linesPerChunk: 10 },
      });

      // Verify files indexed
      assert.equal(result.files.length, 4);
      const paths = result.files.map((f) => f.path).sort();
      assert.deepEqual(paths, [
        'src/app.ts',
        'src/components/Button.tsx',
        'src/index.js',
        'src/utils/helper.ts',
      ]);

      // Verify chunks generated
      assert.equal(result.chunks.length, 4);
      assert.ok(result.chunks.some((c) => c.chunkId === 'src/index.js:L1-L2'));
      assert.ok(result.chunks.some((c) => c.chunkId === 'src/app.ts:L1-L2'));
      assert.ok(result.chunks.some((c) => c.chunkId === 'src/components/Button.tsx:L1-L4'));
      assert.ok(result.chunks.some((c) => c.chunkId === 'src/utils/helper.ts:L1-L1'));

      // Verify dependency extraction & graph connectivity
      const deps = result.dependencies;
      assert.equal(deps.length, 6);

      // 1. src/index.js -> src/app.ts (resolved)
      const indexToApp = deps.find((d) => d.sourcePath === 'src/index.js' && d.specifier === './app');
      assert.ok(indexToApp);
      assert.equal(indexToApp.targetPath, 'src/app.ts');
      assert.equal(indexToApp.resolutionStatus, 'resolved');
      assert.equal(indexToApp.kind, 'import');

      // 2. src/index.js -> express (external require)
      const indexToExpress = deps.find((d) => d.sourcePath === 'src/index.js' && d.specifier === 'express');
      assert.ok(indexToExpress);
      assert.equal(indexToExpress.targetPath, null);
      assert.equal(indexToExpress.resolutionStatus, 'external');
      assert.equal(indexToExpress.kind, 'require');

      // 3. src/app.ts -> src/components/Button.tsx (resolved)
      const appToButton = deps.find((d) => d.sourcePath === 'src/app.ts' && d.specifier === './components/Button');
      assert.ok(appToButton);
      assert.equal(appToButton.targetPath, 'src/components/Button.tsx');
      assert.equal(appToButton.resolutionStatus, 'resolved');

      // 4. src/components/Button.tsx -> react (external import)
      const buttonToReact = deps.find((d) => d.sourcePath === 'src/components/Button.tsx' && d.specifier === 'react');
      assert.ok(buttonToReact);
      assert.equal(buttonToReact.resolutionStatus, 'external');

      // 5. src/components/Button.tsx -> ./Button.css (unresolved in JS/TS index)
      const buttonToCss = deps.find((d) => d.sourcePath === 'src/components/Button.tsx' && d.specifier === './Button.css');
      assert.ok(buttonToCss);
      assert.equal(buttonToCss.targetPath, null);
      assert.equal(buttonToCss.resolutionStatus, 'unresolved');

      // 6. src/components/Button.tsx -> src/utils/helper.ts (resolved)
      const buttonToHelper = deps.find((d) => d.sourcePath === 'src/components/Button.tsx' && d.specifier === '../utils/helper');
      assert.ok(buttonToHelper);
      assert.equal(buttonToHelper.targetPath, 'src/utils/helper.ts');
      assert.equal(buttonToHelper.resolutionStatus, 'resolved');

      // Verify store queries for graph traversal
      const helperInbound = store.getInboundDependencies('src/utils/helper.ts');
      assert.equal(helperInbound.length, 1);
      assert.equal(helperInbound[0].sourcePath, 'src/components/Button.tsx');

      const appOutbound = store.getOutboundDependencies('src/app.ts');
      assert.equal(appOutbound.length, 1);
      assert.equal(appOutbound[0].targetPath, 'src/components/Button.tsx');

      // Verify summary metrics
      const summary = result.summary;
      assert.equal(summary.stats.totalFiles, 4);
      assert.equal(summary.stats.totalChunks, 4);
      assert.equal(summary.stats.totalDependencies, 6);
      assert.equal(summary.stats.resolvedDependencies, 3);
      assert.equal(summary.stats.externalDependencies, 2);
      assert.equal(summary.stats.unresolvedDependencies, 1);
    });
  });
});
