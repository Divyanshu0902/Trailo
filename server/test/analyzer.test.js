import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDependency,
  isRelativeSpecifier,
  detectLanguage,
  isSupportedJsTsFile,
  extractJsTsDependencies,
  analyzeJsTsFile,
  analyzeRepositoryFiles,
} from '../src/analyzer/index.js';

describe('JS/TS Dependency Analyzer (Increment B)', () => {
  describe('Resolver: resolveDependency', () => {
    const indexedPaths = [
      'src/app.js',
      'src/utils.ts',
      'src/components/Button.tsx',
      'src/components/index.js',
      'src/models/user.cjs',
      'src/helpers/string.mjs',
      'package.json',
    ];

    it('identifies relative vs non-relative specifiers', () => {
      assert.equal(isRelativeSpecifier('./utils'), true);
      assert.equal(isRelativeSpecifier('../config'), true);
      assert.equal(isRelativeSpecifier('.'), true);
      assert.equal(isRelativeSpecifier('..'), true);
      assert.equal(isRelativeSpecifier('express'), false);
      assert.equal(isRelativeSpecifier('node:fs'), false);
      assert.equal(isRelativeSpecifier('@org/package'), false);
    });

    it('marks external package and built-in module specifiers as external', () => {
      const result1 = resolveDependency('express', 'src/app.js', indexedPaths);
      assert.deepEqual(result1, { targetPath: null, resolutionStatus: 'external' });

      const result2 = resolveDependency('node:path', 'src/app.js', indexedPaths);
      assert.deepEqual(result2, { targetPath: null, resolutionStatus: 'external' });

      const result3 = resolveDependency('@types/node', 'src/app.js', indexedPaths);
      assert.deepEqual(result3, { targetPath: null, resolutionStatus: 'external' });
    });

    it('resolves relative import with exact extension match', () => {
      const res = resolveDependency('./utils.ts', 'src/app.js', indexedPaths);
      assert.deepEqual(res, { targetPath: 'src/utils.ts', resolutionStatus: 'resolved' });
    });

    it('resolves extensionless relative import by checking candidate extensions', () => {
      const res = resolveDependency('./utils', 'src/app.js', indexedPaths);
      assert.deepEqual(res, { targetPath: 'src/utils.ts', resolutionStatus: 'resolved' });

      const res2 = resolveDependency('./models/user', 'src/app.js', indexedPaths);
      assert.deepEqual(res2, { targetPath: 'src/models/user.cjs', resolutionStatus: 'resolved' });

      const res3 = resolveDependency('./helpers/string', 'src/app.js', indexedPaths);
      assert.deepEqual(res3, { targetPath: 'src/helpers/string.mjs', resolutionStatus: 'resolved' });
    });

    it('resolves directory import to index file', () => {
      const res = resolveDependency('./components', 'src/app.js', indexedPaths);
      assert.deepEqual(res, { targetPath: 'src/components/index.js', resolutionStatus: 'resolved' });
    });

    it('resolves relative import across parent directories', () => {
      const res = resolveDependency('../utils', 'src/components/Button.tsx', indexedPaths);
      assert.deepEqual(res, { targetPath: 'src/utils.ts', resolutionStatus: 'resolved' });
    });

    it('normalizes Windows backslashes in specifiers', () => {
      const res = resolveDependency('.\\utils', 'src/app.js', indexedPaths);
      assert.deepEqual(res, { targetPath: 'src/utils.ts', resolutionStatus: 'resolved' });
    });

    it('marks missing relative target as unresolved', () => {
      const res = resolveDependency('./nonExistentModule', 'src/app.js', indexedPaths);
      assert.deepEqual(res, { targetPath: null, resolutionStatus: 'unresolved' });
    });

    it('marks traversal outside repository root as unresolved', () => {
      const res = resolveDependency('../../outside', 'src/app.js', indexedPaths);
      assert.deepEqual(res, { targetPath: null, resolutionStatus: 'unresolved' });
    });

    it('resolves TypeScript ESM relative .js specifier to .ts source file', () => {
      const res = resolveDependency('./utils.js', 'src/app.js', ['src/app.js', 'src/utils.ts']);
      assert.deepEqual(res, { targetPath: 'src/utils.ts', resolutionStatus: 'resolved' });
    });

    it('resolves TypeScript ESM relative .js specifier to .tsx source file', () => {
      const res = resolveDependency('./Button.js', 'src/app.js', ['src/app.js', 'src/Button.tsx']);
      assert.deepEqual(res, { targetPath: 'src/Button.tsx', resolutionStatus: 'resolved' });
    });

    it('preserves exact-match precedence when an actual .js file exists alongside .ts', () => {
      const res = resolveDependency('./helper.js', 'src/app.js', [
        'src/app.js',
        'src/helper.js',
        'src/helper.ts',
      ]);
      assert.deepEqual(res, { targetPath: 'src/helper.js', resolutionStatus: 'resolved' });
    });

    it('marks whitespace-only and empty specifiers as unresolved', () => {
      assert.deepEqual(resolveDependency('   ', 'src/app.js', indexedPaths), {
        targetPath: null,
        resolutionStatus: 'unresolved',
      });
      assert.deepEqual(resolveDependency('\t\n', 'src/app.js', indexedPaths), {
        targetPath: null,
        resolutionStatus: 'unresolved',
      });
      assert.deepEqual(resolveDependency('', 'src/app.js', indexedPaths), {
        targetPath: null,
        resolutionStatus: 'unresolved',
      });
      assert.equal(isRelativeSpecifier('   '), false);
      assert.equal(isRelativeSpecifier(''), false);
    });

    it('handles invalid inputs gracefully without throwing', () => {
      assert.deepEqual(resolveDependency('', 'src/app.js', indexedPaths), {
        targetPath: null,
        resolutionStatus: 'unresolved',
      });
      assert.deepEqual(resolveDependency(null, 'src/app.js', indexedPaths), {
        targetPath: null,
        resolutionStatus: 'unresolved',
      });
      assert.deepEqual(resolveDependency('./foo', null, indexedPaths), {
        targetPath: null,
        resolutionStatus: 'unresolved',
      });
    });
  });

  describe('Language detection', () => {
    it('accurately identifies JS/TS variants and unsupported files', () => {
      assert.equal(detectLanguage('index.js'), 'javascript');
      assert.equal(detectLanguage('component.jsx'), 'javascript');
      assert.equal(detectLanguage('module.mjs'), 'javascript');
      assert.equal(detectLanguage('bundle.cjs'), 'javascript');
      assert.equal(detectLanguage('app.ts'), 'typescript');
      assert.equal(detectLanguage('view.tsx'), 'typescript');
      assert.equal(detectLanguage('types.d.ts'), 'typescript');
      assert.equal(detectLanguage('readme.md'), 'unknown');
      assert.equal(detectLanguage('data.json'), 'unknown');
      assert.equal(detectLanguage(null), 'unknown');

      assert.equal(isSupportedJsTsFile('app.ts'), true);
      assert.equal(isSupportedJsTsFile('readme.md'), false);
    });
  });

  describe('extractJsTsDependencies & analyzeJsTsFile', () => {
    it('extracts ESM imports (default, named, side-effect, type)', () => {
      const source = [
        'import React from "react";',
        'import { useState, useEffect } from "react";',
        'import * as path from "node:path";',
        'import "./styles.css";',
        'import type { User } from "./types";',
      ].join('\n');

      const file = { path: 'src/App.tsx', content: source };
      const analysis = analyzeJsTsFile(file, ['src/App.tsx', 'src/types.ts']);

      assert.equal(analysis.language, 'typescript');
      assert.equal(analysis.dependencies.length, 5);

      assert.deepEqual(analysis.dependencies[0], {
        sourcePath: 'src/App.tsx',
        targetPath: null,
        specifier: 'react',
        kind: 'import',
        language: 'typescript',
        resolutionStatus: 'external',
        sourceLocation: { startLine: 1, endLine: 1 },
      });

      assert.deepEqual(analysis.dependencies[1], {
        sourcePath: 'src/App.tsx',
        targetPath: null,
        specifier: 'react',
        kind: 'import',
        language: 'typescript',
        resolutionStatus: 'external',
        sourceLocation: { startLine: 2, endLine: 2 },
      });

      assert.deepEqual(analysis.dependencies[2], {
        sourcePath: 'src/App.tsx',
        targetPath: null,
        specifier: 'node:path',
        kind: 'import',
        language: 'typescript',
        resolutionStatus: 'external',
        sourceLocation: { startLine: 3, endLine: 3 },
      });

      assert.deepEqual(analysis.dependencies[3], {
        sourcePath: 'src/App.tsx',
        targetPath: null,
        specifier: './styles.css',
        kind: 'import',
        language: 'typescript',
        resolutionStatus: 'unresolved',
        sourceLocation: { startLine: 4, endLine: 4 },
      });

      assert.deepEqual(analysis.dependencies[4], {
        sourcePath: 'src/App.tsx',
        targetPath: 'src/types.ts',
        specifier: './types',
        kind: 'import',
        language: 'typescript',
        resolutionStatus: 'resolved',
        sourceLocation: { startLine: 5, endLine: 5 },
      });
    });

    it('extracts ESM export declarations with module specifiers', () => {
      const source = [
        'export { Button } from "./Button";',
        'export * from "./helpers";',
        'export * as utils from "./utils";',
        'export const localValue = 42;', // Local export: must NOT be extracted as a dependency
      ].join('\n');

      const file = { path: 'src/index.js', content: source };
      const indexed = ['src/index.js', 'src/Button.js', 'src/helpers.js', 'src/utils.js'];
      const analysis = analyzeJsTsFile(file, indexed);

      assert.equal(analysis.dependencies.length, 3);
      assert.equal(analysis.dependencies[0].specifier, './Button');
      assert.equal(analysis.dependencies[0].kind, 'export');
      assert.equal(analysis.dependencies[0].targetPath, 'src/Button.js');
      assert.equal(analysis.dependencies[0].resolutionStatus, 'resolved');

      assert.equal(analysis.dependencies[1].specifier, './helpers');
      assert.equal(analysis.dependencies[1].kind, 'export');

      assert.equal(analysis.dependencies[2].specifier, './utils');
      assert.equal(analysis.dependencies[2].kind, 'export');
    });

    it('extracts CommonJS require calls', () => {
      const source = [
        'const express = require("express");',
        'const { helper } = require("./helper");',
        'require("./init");',
        'const dynamic = require(someVar);', // dynamic: ignored safely
      ].join('\n');

      const file = { path: 'src/server.js', content: source };
      const analysis = analyzeJsTsFile(file, ['src/server.js', 'src/helper.js', 'src/init.js']);

      assert.equal(analysis.dependencies.length, 3);
      assert.equal(analysis.dependencies[0].specifier, 'express');
      assert.equal(analysis.dependencies[0].kind, 'require');
      assert.equal(analysis.dependencies[0].resolutionStatus, 'external');

      assert.equal(analysis.dependencies[1].specifier, './helper');
      assert.equal(analysis.dependencies[1].kind, 'require');
      assert.equal(analysis.dependencies[1].targetPath, 'src/helper.js');
      assert.equal(analysis.dependencies[1].resolutionStatus, 'resolved');

      assert.equal(analysis.dependencies[2].specifier, './init');
      assert.equal(analysis.dependencies[2].kind, 'require');
      assert.equal(analysis.dependencies[2].targetPath, 'src/init.js');
    });

    it('extracts dynamic import calls and TypeScript import equals', () => {
      const source = [
        'async function load() {',
        '  const mod = await import("./dynamic");',
        '}',
        'import ts = require("typescript");',
      ].join('\n');

      const file = { path: 'src/loader.ts', content: source };
      const analysis = analyzeJsTsFile(file, ['src/loader.ts', 'src/dynamic.ts']);

      assert.equal(analysis.dependencies.length, 2);
      assert.equal(analysis.dependencies[0].specifier, './dynamic');
      assert.equal(analysis.dependencies[0].kind, 'import');
      assert.equal(analysis.dependencies[0].sourceLocation.startLine, 2);
      assert.equal(analysis.dependencies[0].targetPath, 'src/dynamic.ts');

      assert.equal(analysis.dependencies[1].specifier, 'typescript');
      assert.equal(analysis.dependencies[1].kind, 'require');
      assert.equal(analysis.dependencies[1].resolutionStatus, 'external');
    });

    it('captures multi-line declarations with accurate 1-based start and end lines', () => {
      const source = [
        'import {',
        '  a,',
        '  b,',
        '  c,',
        '} from "./multi";',
      ].join('\n');

      const file = { path: 'src/multi.js', content: source };
      const analysis = analyzeJsTsFile(file, ['src/multi.js']);

      assert.equal(analysis.dependencies.length, 1);
      assert.equal(analysis.dependencies[0].sourceLocation.startLine, 1);
      assert.equal(analysis.dependencies[0].sourceLocation.endLine, 5);
    });

    it('handles syntax errors gracefully without throwing', () => {
      // Syntax error with incomplete expression, but valid import before it
      const invalidSource = [
        'import { ok } from "./valid";',
        'function broken( { syntax error here !!!',
      ].join('\n');

      const file = { path: 'src/broken.js', content: invalidSource };
      const analysis = analyzeJsTsFile(file, ['src/broken.js', 'src/valid.js']);

      // Tolerates syntax error, extracts import, captures diagnostics
      assert.equal(analysis.dependencies.length, 1);
      assert.equal(analysis.dependencies[0].specifier, './valid');
      assert.ok(analysis.diagnostics.length > 0);
    });

    it('returns empty dependencies for unsupported file types and empty content', () => {
      const nonJs = { path: 'README.md', content: '# Documentation' };
      const res1 = analyzeJsTsFile(nonJs, ['README.md']);
      assert.equal(res1.language, 'unknown');
      assert.deepEqual(res1.dependencies, []);

      const emptyJs = { path: 'src/empty.js', content: '' };
      const res2 = analyzeJsTsFile(emptyJs, ['src/empty.js']);
      assert.equal(res2.language, 'javascript');
      assert.deepEqual(res2.dependencies, []);
    });
  });

  describe('analyzeRepositoryFiles', () => {
    it('analyzes collection of scanned files and links internal edges', () => {
      const files = [
        {
          path: 'src/index.js',
          content: 'import { run } from "./app.js";\nconst pkg = require("lodash");\n',
        },
        {
          path: 'src/app.js',
          content: 'import { helper } from "./utils";\nexport function run() {}\n',
        },
        {
          path: 'src/utils.ts',
          content: 'export const helper = true;\n',
        },
        {
          path: 'README.md',
          content: '# Trailo',
        },
      ];

      const result = analyzeRepositoryFiles(files);

      assert.equal(result.dependencies.length, 3);

      const d1 = result.dependencies[0];
      assert.equal(d1.sourcePath, 'src/index.js');
      assert.equal(d1.targetPath, 'src/app.js');
      assert.equal(d1.resolutionStatus, 'resolved');

      const d2 = result.dependencies[1];
      assert.equal(d2.sourcePath, 'src/index.js');
      assert.equal(d2.targetPath, null);
      assert.equal(d2.resolutionStatus, 'external');

      const d3 = result.dependencies[2];
      assert.equal(d3.sourcePath, 'src/app.js');
      assert.equal(d3.targetPath, 'src/utils.ts');
      assert.equal(d3.resolutionStatus, 'resolved');
    });
  });
});
