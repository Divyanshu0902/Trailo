/**
 * Deterministic line-aware source chunking for Trailo.
 * Splits text into chunks with 1-based inclusive line ranges without AST coupling.
 */

export const DEFAULT_CHUNK_OPTIONS = {
  linesPerChunk: 50,
  overlap: 0,
};

/**
 * Splits text into individual lines while normalizing line endings to \n.
 * Respects empty lines and handles trailing newlines properly.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function splitLines(content) {
  if (content === '') return [];

  // Normalize Windows CRLF to LF
  const normalized = content.replace(/\r\n/g, '\n');

  // Split on newline
  const rawLines = normalized.split('\n');

  // If content ends with a trailing newline, the last element from split is an empty string
  // representing the post-newline EOF rather than an actual text line.
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }

  return rawLines;
}

/**
 * Creates line-aware chunks for a single file.
 *
 * @param {string} filePath - Normalized relative file path (e.g. "src/app.js")
 * @param {string} content - Raw UTF-8 source content
 * @param {object} [options={}] - Chunking options
 * @param {number} [options.linesPerChunk=50] - Maximum lines per chunk
 * @param {number} [options.overlap=0] - Number of overlapping lines between consecutive chunks
 * @returns {Array<{
 *   chunkId: string,
 *   filePath: string,
 *   startLine: number,
 *   endLine: number,
 *   lineCount: number,
 *   text: string
 * }>}
 */
export function createLineChunks(filePath, content, options = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new TypeError('filePath must be a non-empty string');
  }

  const normalizedPath = filePath.replace(/\\/g, '/');

  if (typeof content !== 'string' || content.length === 0) {
    return [];
  }

  const lines = splitLines(content);
  if (lines.length === 0) {
    return [];
  }

  const linesPerChunk = Math.max(1, options.linesPerChunk ?? DEFAULT_CHUNK_OPTIONS.linesPerChunk);
  const overlap = Math.max(0, Math.min(linesPerChunk - 1, options.overlap ?? DEFAULT_CHUNK_OPTIONS.overlap));
  const step = linesPerChunk - overlap;

  const chunks = [];

  for (let i = 0; i < lines.length; i += step) {
    const chunkLines = lines.slice(i, i + linesPerChunk);
    const startLine = i + 1; // 1-based
    const endLine = i + chunkLines.length; // 1-based inclusive

    const chunkId = `${normalizedPath}:L${startLine}-L${endLine}`;
    const text = chunkLines.join('\n');

    chunks.push({
      chunkId,
      filePath: normalizedPath,
      startLine,
      endLine,
      lineCount: chunkLines.length,
      text,
    });

    // If we've reached or covered the end of the file, break
    if (i + linesPerChunk >= lines.length) {
      break;
    }
  }

  return chunks;
}

/**
 * Batch-chunks an array of scanned file records.
 *
 * @param {Array<{ path: string, content: string }>} files
 * @param {object} [options={}]
 * @returns {Array<{ chunkId: string, filePath: string, startLine: number, endLine: number, lineCount: number, text: string }>}
 */
export function chunkScannedFiles(files, options = {}) {
  if (!Array.isArray(files)) {
    throw new TypeError('files must be an array');
  }

  const allChunks = [];
  for (const file of files) {
    if (file && typeof file.path === 'string' && typeof file.content === 'string') {
      const fileChunks = createLineChunks(file.path, file.content, options);
      allChunks.push(...fileChunks);
    }
  }
  return allChunks;
}
