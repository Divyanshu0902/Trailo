import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitLines,
  createLineChunks,
  chunkScannedFiles,
  DEFAULT_CHUNK_OPTIONS,
} from '../src/indexer/chunker.js';

describe('Source Chunker (Increment A)', () => {
  describe('splitLines', () => {
    it('returns an empty array for empty string content', () => {
      assert.deepEqual(splitLines(''), []);
    });

    it('splits a single line without trailing newline', () => {
      assert.deepEqual(splitLines('const x = 1;'), ['const x = 1;']);
    });

    it('splits a single line with trailing LF', () => {
      assert.deepEqual(splitLines('const x = 1;\n'), ['const x = 1;']);
    });

    it('splits multiple lines with trailing CRLF', () => {
      assert.deepEqual(splitLines('line 1\r\nline 2\r\n'), ['line 1', 'line 2']);
    });

    it('preserves blank lines in the middle of content', () => {
      const content = 'line 1\n\nline 3\n';
      assert.deepEqual(splitLines(content), ['line 1', '', 'line 3']);
    });

    it('preserves multiple consecutive blank lines', () => {
      const content = 'line 1\n\n\nline 4';
      assert.deepEqual(splitLines(content), ['line 1', '', '', 'line 4']);
    });
  });

  describe('createLineChunks', () => {
    it('returns empty array for empty content or zero-length string', () => {
      assert.deepEqual(createLineChunks('src/index.js', ''), []);
      assert.deepEqual(createLineChunks('src/index.js', null), []);
    });

    it('throws TypeError if filePath is not a non-empty string', () => {
      assert.throws(() => createLineChunks('', 'content'), {
        name: 'TypeError',
        message: /filePath must be a non-empty string/,
      });
      assert.throws(() => createLineChunks(null, 'content'), {
        name: 'TypeError',
      });
    });

    it('creates a single chunk when file line count is within linesPerChunk', () => {
      const content = 'const a = 1;\nconst b = 2;\nconst c = 3;\n';
      const chunks = createLineChunks('src/math.js', content, { linesPerChunk: 50 });

      assert.equal(chunks.length, 1);
      assert.deepEqual(chunks[0], {
        chunkId: 'src/math.js:L1-L3',
        filePath: 'src/math.js',
        startLine: 1,
        endLine: 3,
        lineCount: 3,
        text: 'const a = 1;\nconst b = 2;\nconst c = 3;',
      });
    });

    it('chunks across multiple boundaries with 1-based inclusive line numbers and deterministic IDs', () => {
      // 5 lines, chunk size 2, overlap 0
      const lines = ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'];
      const content = lines.join('\n');

      const chunks = createLineChunks('src/data.txt', content, { linesPerChunk: 2, overlap: 0 });

      assert.equal(chunks.length, 3);

      assert.deepEqual(chunks[0], {
        chunkId: 'src/data.txt:L1-L2',
        filePath: 'src/data.txt',
        startLine: 1,
        endLine: 2,
        lineCount: 2,
        text: 'line 1\nline 2',
      });

      assert.deepEqual(chunks[1], {
        chunkId: 'src/data.txt:L3-L4',
        filePath: 'src/data.txt',
        startLine: 3,
        endLine: 4,
        lineCount: 2,
        text: 'line 3\nline 4',
      });

      assert.deepEqual(chunks[2], {
        chunkId: 'src/data.txt:L5-L5',
        filePath: 'src/data.txt',
        startLine: 5,
        endLine: 5,
        lineCount: 1,
        text: 'line 5',
      });
    });

    it('supports overlapping chunks without infinite loops or bounds overflow', () => {
      // 4 lines, chunk size 3, overlap 1 -> step 2
      const content = 'line 1\nline 2\nline 3\nline 4';
      const chunks = createLineChunks('src/overlap.js', content, { linesPerChunk: 3, overlap: 1 });

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].chunkId, 'src/overlap.js:L1-L3');
      assert.equal(chunks[0].startLine, 1);
      assert.equal(chunks[0].endLine, 3);
      assert.equal(chunks[0].text, 'line 1\nline 2\nline 3');

      assert.equal(chunks[1].chunkId, 'src/overlap.js:L3-L4');
      assert.equal(chunks[1].startLine, 3);
      assert.equal(chunks[1].endLine, 4);
      assert.equal(chunks[1].text, 'line 3\nline 4');
    });

    it('preserves blank lines within chunk text', () => {
      const content = 'import fs from "node:fs";\n\nfunction read() {}\n';
      const chunks = createLineChunks('src/io.js', content, { linesPerChunk: 10 });

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].lineCount, 3);
      assert.equal(chunks[0].startLine, 1);
      assert.equal(chunks[0].endLine, 3);
      assert.equal(chunks[0].text, 'import fs from "node:fs";\n\nfunction read() {}');
    });

    it('handles files with CRLF correctly', () => {
      const content = 'line 1\r\nline 2\r\nline 3\r\n';
      const chunks = createLineChunks('src/crlf.js', content, { linesPerChunk: 2 });

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].text, 'line 1\nline 2');
      assert.equal(chunks[1].text, 'line 3');
      assert.equal(chunks[0].chunkId, 'src/crlf.js:L1-L2');
      assert.equal(chunks[1].chunkId, 'src/crlf.js:L3-L3');
    });

    it('uses DEFAULT_CHUNK_OPTIONS when options are omitted', () => {
      // Generate 75 lines
      const lines = Array.from({ length: 75 }, (_, i) => `line ${i + 1}`);
      const content = lines.join('\n');

      const chunks = createLineChunks('src/large.js', content);
      assert.equal(DEFAULT_CHUNK_OPTIONS.linesPerChunk, 50);
      assert.equal(DEFAULT_CHUNK_OPTIONS.overlap, 0);

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].chunkId, 'src/large.js:L1-L50');
      assert.equal(chunks[0].startLine, 1);
      assert.equal(chunks[0].endLine, 50);
      assert.equal(chunks[0].lineCount, 50);

      assert.equal(chunks[1].chunkId, 'src/large.js:L51-L75');
      assert.equal(chunks[1].startLine, 51);
      assert.equal(chunks[1].endLine, 75);
      assert.equal(chunks[1].lineCount, 25);
    });

    it('normalizes Windows-style backslashes in filePath when generating chunk IDs', () => {
      const content = 'export const button = true;\n';
      const chunks = createLineChunks('src\\components\\Button.jsx', content);

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].filePath, 'src/components/Button.jsx');
      assert.equal(chunks[0].chunkId, 'src/components/Button.jsx:L1-L1');
    });
  });

  describe('chunkScannedFiles', () => {
    it('throws TypeError if files argument is not an array', () => {
      assert.throws(() => chunkScannedFiles(null), {
        name: 'TypeError',
        message: /files must be an array/,
      });
    });

    it('processes multiple files and skips invalid file records gracefully', () => {
      const files = [
        { path: 'src/a.js', content: 'const a = 1;\n' },
        null,
        { path: 'src/b.js', content: 'const b = 2;\nconst c = 3;\n' },
        { invalid: true },
      ];

      const chunks = chunkScannedFiles(files, { linesPerChunk: 10 });
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].chunkId, 'src/a.js:L1-L1');
      assert.equal(chunks[1].chunkId, 'src/b.js:L1-L2');
    });
  });
});
