import Prism from 'prismjs';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-markdown.js';

/**
 * Splits source text into individual lines while normalizing CRLF to LF.
 * Preserves leading spaces, tabs, and consecutive blank lines without trimming.
 * Strips the terminal empty string resulting from a trailing EOF newline to match
 * backend line counting and chunking semantics (scanner.countLines and chunker.splitLines).
 *
 * @param {string} content - Raw source code string
 * @returns {string[]} Array of source lines
 */
export function splitSourceLines(content) {
  if (typeof content !== 'string' || content.length === 0) {
    return [];
  }

  // Normalize CRLF to LF
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  // If the file ends with a trailing newline, the split produces an extra empty string.
  // We pop it to match backend scanner lineCount and chunker line ranges.
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

/**
 * Resolves the appropriate Prism grammar for a given language identifier or file extension.
 * Returns null if the language is unsupported or should render as plain text.
 *
 * @param {string} [language]
 * @param {string} [extension]
 * @returns {object | null}
 */
export function getPrismGrammar(language = '', extension = '') {
  const normLang = (language || '').toLowerCase().trim();
  const normExt = (extension || '').toLowerCase().trim();

  // Extension matching first (more specific)
  if (normExt === '.tsx') return Prism.languages.tsx || Prism.languages.typescript;
  if (normExt === '.jsx') return Prism.languages.jsx || Prism.languages.javascript;
  if (normExt === '.ts' || normExt === '.d.ts') return Prism.languages.typescript || Prism.languages.javascript;
  if (normExt === '.js' || normExt === '.mjs' || normExt === '.cjs') return Prism.languages.javascript;
  if (normExt === '.json') return Prism.languages.json;
  if (normExt === '.css') return Prism.languages.css;
  if (normExt === '.md') return Prism.languages.markdown;

  // Language name matching
  if (normLang === 'typescript' || normLang === 'ts') return Prism.languages.typescript || Prism.languages.javascript;
  if (normLang === 'javascript' || normLang === 'js') return Prism.languages.javascript;
  if (normLang === 'tsx') return Prism.languages.tsx || Prism.languages.typescript;
  if (normLang === 'jsx') return Prism.languages.jsx || Prism.languages.javascript;
  if (normLang === 'json') return Prism.languages.json;
  if (normLang === 'css') return Prism.languages.css;
  if (normLang === 'markdown' || normLang === 'md') return Prism.languages.markdown;

  // Fallback to javascript if known web file, otherwise null (plain text)
  if (normExt.match(/\.[jt]sx?$/)) {
    return Prism.languages.javascript;
  }

  return null;
}

/**
 * Tokenizes a single line of source code safely into Prism tokens or strings.
 * Falls back to plain string array if no grammar is available.
 *
 * @param {string} line
 * @param {object | null} grammar
 * @returns {Array<string | object>}
 */
export function tokenizeSourceLine(line, grammar) {
  if (!line || !grammar) {
    return [line];
  }

  try {
    return Prism.tokenize(line, grammar);
  } catch {
    // If tokenization ever fails, fall back gracefully to raw line
    return [line];
  }
}

/**
 * Clamps a proposed source panel width to safe minimum and maximum bounds,
 * ensuring the dependency graph canvas always retains usable space.
 *
 * @param {number} targetWidth - Requested width in pixels
 * @param {number} containerWidth - Total workspace container width in pixels
 * @param {number} [minWidth=320] - Minimum panel width
 * @param {number} [maxWidth=850] - Maximum panel width
 * @returns {number} Clamped width in pixels
 */
export function clampViewerWidth(targetWidth, containerWidth, minWidth = 320, maxWidth = 850) {
  const safeContainerWidth = typeof containerWidth === 'number' && containerWidth > 0 ? containerWidth : 1200;
  // Ensure the graph canvas always retains at least 300px
  const effectiveMax = Math.max(minWidth, Math.min(maxWidth, safeContainerWidth - 300));
  return Math.min(effectiveMax, Math.max(minWidth, Math.round(targetWidth)));
}

