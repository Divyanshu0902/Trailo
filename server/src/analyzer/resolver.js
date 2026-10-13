import path from 'node:path';

/**
 * Resolution candidate extensions to try when resolving extensionless module specifiers.
 */
export const DEFAULT_RESOLVE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
];

/**
 * Directory index candidates to try when resolving directory specifiers.
 */
export const DEFAULT_INDEX_EXTENSIONS = [
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/index.mjs',
  '/index.cjs',
];

/**
 * Normalizes a path string to use POSIX forward slashes.
 *
 * @param {string} p
 * @returns {string}
 */
export function toPosixPath(p) {
  if (typeof p !== 'string') return '';
  return p.replace(/\\/g, '/');
}

/**
 * Determines whether a module specifier is a relative path.
 *
 * @param {string} specifier
 * @returns {boolean}
 */
export function isRelativeSpecifier(specifier) {
  if (!specifier || typeof specifier !== 'string') return false;
  const normalized = toPosixPath(specifier.trim());
  if (normalized === '') return false;
  return normalized.startsWith('./') || normalized.startsWith('../') || normalized === '.' || normalized === '..';
}

/**
 * Resolves a module specifier from a source file against a set of known indexed file paths.
 *
 * Resolution strategy:
 * 1. Missing or whitespace-only specifiers are marked "unresolved".
 * 2. Non-relative specifiers (e.g. "express", "node:fs", "@pkg/foo") are marked "external".
 * 3. Relative specifiers ("./foo", "../bar") are normalized against the importing file's directory.
 * 4. If a relative candidate escapes the repository root ("../"), it is marked "unresolved".
 * 5. Candidates are tested in order:
 *    a. Exact match against indexed paths (e.g. explicit extension already present).
 *    b. TypeScript ESM mapping: if specifier ends with .js, test .ts and .tsx source file alternatives.
 *    c. With extensions (.ts, .tsx, .js, .jsx, .mjs, .cjs).
 *    d. As a directory index (candidate/index.ts, etc.).
 * 6. If matched, returns { targetPath, resolutionStatus: "resolved" }.
 * 7. If no indexed file matches, returns { targetPath: null, resolutionStatus: "unresolved" }.
 *
 * @param {string} specifier - The raw import/require/export specifier
 * @param {string} sourcePath - The repository-relative POSIX path of the declaring file
 * @param {Set<string>|string[]} indexedPaths - Collection of repository-relative POSIX paths
 * @returns {{ targetPath: string | null, resolutionStatus: 'resolved' | 'external' | 'unresolved' }}
 */
export function resolveDependency(specifier, sourcePath, indexedPaths) {
  if (!specifier || typeof specifier !== 'string' || specifier.trim() === '') {
    return { targetPath: null, resolutionStatus: 'unresolved' };
  }

  const cleanSpecifier = toPosixPath(specifier.trim());

  if (!isRelativeSpecifier(cleanSpecifier)) {
    return { targetPath: null, resolutionStatus: 'external' };
  }

  if (!sourcePath || typeof sourcePath !== 'string') {
    return { targetPath: null, resolutionStatus: 'unresolved' };
  }

  const pathSet = indexedPaths instanceof Set
    ? indexedPaths
    : new Set(Array.isArray(indexedPaths) ? indexedPaths.map(toPosixPath) : []);

  const sourceDir = path.posix.dirname(toPosixPath(sourcePath));
  const candidate = path.posix.normalize(path.posix.join(sourceDir, cleanSpecifier));

  // Traversal outside the repository root
  if (candidate.startsWith('..') || candidate.startsWith('/')) {
    return { targetPath: null, resolutionStatus: 'unresolved' };
  }

  // 1. Exact match (already includes extension or matches exact path)
  if (pathSet.has(candidate)) {
    return { targetPath: candidate, resolutionStatus: 'resolved' };
  }

  // 1b. TypeScript ESM mapping: relative .js specifier pointing to a .ts or .tsx source file
  if (candidate.endsWith('.js')) {
    const candidateBase = candidate.slice(0, -3);
    if (pathSet.has(candidateBase + '.ts')) {
      return { targetPath: candidateBase + '.ts', resolutionStatus: 'resolved' };
    }
    if (pathSet.has(candidateBase + '.tsx')) {
      return { targetPath: candidateBase + '.tsx', resolutionStatus: 'resolved' };
    }
  }

  // 2. Try appending candidate extensions
  for (const ext of DEFAULT_RESOLVE_EXTENSIONS) {
    const withExt = candidate + ext;
    if (pathSet.has(withExt)) {
      return { targetPath: withExt, resolutionStatus: 'resolved' };
    }
  }

  // 3. Try directory index resolution
  const dirBase = candidate === '.' ? '' : candidate;
  for (const indexSuffix of DEFAULT_INDEX_EXTENSIONS) {
    let indexCandidate = dirBase + indexSuffix;
    if (indexCandidate.startsWith('/')) {
      indexCandidate = indexCandidate.slice(1);
    }
    if (pathSet.has(indexCandidate)) {
      return { targetPath: indexCandidate, resolutionStatus: 'resolved' };
    }
  }

  // Not found in indexed repository files
  return { targetPath: null, resolutionStatus: 'unresolved' };
}
