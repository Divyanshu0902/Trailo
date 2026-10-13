import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_LIMITS,
  DEFAULT_ALLOWED_EXTENSIONS,
  BINARY_EXTENSIONS,
  isIgnoredDirectory,
  isIgnoredOrSecretFile,
  isAllowedSourceFile,
  isBinaryBuffer,
} from './rules.js';

export class ScannerError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'ScannerError';
    this.code = code;
  }
}

/**
 * Normalizes filesystem path across platforms.
 * Strips Windows extended-length prefix \\?\ if present.
 *
 * @param {string} p
 * @returns {string}
 */
function normalizePath(p) {
  let resolved = path.resolve(p);
  if (resolved.startsWith('\\\\?\\')) {
    resolved = resolved.slice(4);
  }
  return resolved;
}

/**
 * Checks if candidatePath is equal to or located within parentDir.
 *
 * @param {string} parentDir
 * @param {string} candidatePath
 * @returns {boolean}
 */
function isSubpathOrEqual(parentDir, candidatePath) {
  const normParent = normalizePath(parentDir);
  const normCandidate = normalizePath(candidatePath);

  // Compare case-insensitively on Windows
  const isWindows = process.platform === 'win32';
  const p1 = isWindows ? normParent.toLowerCase() : normParent;
  const p2 = isWindows ? normCandidate.toLowerCase() : normCandidate;

  const rel = path.relative(p1, p2);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Converts a path relative to the root into normalized forward-slash format.
 *
 * @param {string} rootPath
 * @param {string} targetPath
 * @returns {string}
 */
export function toRelativePosixPath(rootPath, targetPath) {
  const rel = path.relative(rootPath, targetPath);
  return rel.split(path.sep).join('/');
}

/**
 * Calculates line count for text content.
 * Standardizes across CRLF and LF. Truncates final trailing empty line if present.
 *
 * @param {string} content
 * @returns {number}
 */
export function countLines(content) {
  if (!content || content.length === 0) return 0;
  const lines = content.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    return lines.length - 1;
  }
  return lines.length;
}

/**
 * Scans a local repository root safely, returning indexed file records and skip metrics.
 *
 * @param {string} requestedRoot - Local directory path to scan
 * @param {object} [options={}] - Optional configuration and limit overrides
 * @param {number} [options.maxFiles] - Maximum files to index
 * @param {number} [options.maxFileSizeBytes] - Maximum size per file
 * @param {number} [options.maxTotalBytes] - Maximum total indexed bytes
 * @param {Set<string>|string[]} [options.allowedExtensions] - Allowed source extensions
 * @returns {Promise<{
 *   rootPath: string,
 *   files: Array<{ path: string, content: string, lineCount: number, size: number, extension: string }>,
 *   skipped: Array<{ path: string, reason: string }>,
 *   warnings: string[],
 *   stats: { totalFiles: number, totalBytes: number, scannedCount: number, skippedCount: number }
 * }>}
 */
export async function scanRepository(requestedRoot, options = {}) {
  if (!requestedRoot || typeof requestedRoot !== 'string' || requestedRoot.trim() === '') {
    throw new ScannerError('Repository root path is required', 'INVALID_ROOT');
  }

  const maxFiles = options.maxFiles ?? DEFAULT_LIMITS.maxFiles;
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_LIMITS.maxFileSizeBytes;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_LIMITS.maxTotalBytes;

  const allowedExtensions = options.allowedExtensions
    ? new Set(Array.from(options.allowedExtensions).map((ext) => ext.toLowerCase()))
    : DEFAULT_ALLOWED_EXTENSIONS;

  // Resolve and canonicalize root
  let canonicalRoot;
  try {
    const resolved = normalizePath(requestedRoot);
    canonicalRoot = normalizePath(await fs.realpath(resolved));
  } catch (err) {
    throw new ScannerError(`Repository root does not exist or cannot be accessed: ${err.message}`, 'ROOT_NOT_FOUND');
  }

  // Ensure root is a directory
  try {
    const rootStat = await fs.stat(canonicalRoot);
    if (!rootStat.isDirectory()) {
      throw new ScannerError('Target repository root is not a directory', 'NOT_A_DIRECTORY');
    }
  } catch (err) {
    if (err instanceof ScannerError) throw err;
    throw new ScannerError(`Cannot inspect repository root: ${err.message}`, 'ROOT_ACCESS_ERROR');
  }

  const files = [];
  const skipped = [];
  const warnings = [];
  let totalBytes = 0;
  let scannedCount = 0;

  // Track visited directory canonical paths to prevent symlink/junction cycles
  const visitedDirs = new Set([canonicalRoot]);
  const dirQueue = [canonicalRoot];

  while (dirQueue.length > 0) {
    const currentDir = dirQueue.shift();

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      const relDir = toRelativePosixPath(canonicalRoot, currentDir) || '.';
      skipped.push({ path: relDir, reason: 'unreadable_directory' });
      continue;
    }

    // Sort entries deterministically
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      scannedCount++;
      const fullPath = path.join(currentDir, entry.name);
      const relPath = toRelativePosixPath(canonicalRoot, fullPath);

      // 1. Symlink handling
      if (entry.isSymbolicLink()) {
        let realTarget;
        try {
          realTarget = normalizePath(await fs.realpath(fullPath));
        } catch {
          skipped.push({ path: relPath, reason: 'broken_symlink' });
          continue;
        }

        // Verify symlink target stays within canonical root
        if (!isSubpathOrEqual(canonicalRoot, realTarget)) {
          skipped.push({ path: relPath, reason: 'symlink_outside_root' });
          continue;
        }

        let targetStat;
        try {
          targetStat = await fs.stat(realTarget);
        } catch {
          skipped.push({ path: relPath, reason: 'unreadable_symlink_target' });
          continue;
        }

        if (targetStat.isDirectory()) {
          if (visitedDirs.has(realTarget)) {
            skipped.push({ path: relPath, reason: 'symlink_cycle' });
            continue;
          }

          const relTargetDir = toRelativePosixPath(canonicalRoot, realTarget);
          const isTargetIgnored =
            isIgnoredDirectory(entry.name) ||
            relTargetDir.split('/').filter(Boolean).some((segment) => isIgnoredDirectory(segment));

          if (isTargetIgnored) {
            skipped.push({ path: relPath, reason: 'ignored_directory' });
            continue;
          }
          visitedDirs.add(realTarget);
          dirQueue.push(realTarget);
          continue;
        }

        // Symlink points to a file inside the root -> check target path before processing
        const relTargetFile = toRelativePosixPath(canonicalRoot, realTarget);
        const targetDirSegments = relTargetFile.split('/').slice(0, -1);
        if (
          isIgnoredDirectory(entry.name) ||
          targetDirSegments.some((seg) => isIgnoredDirectory(seg))
        ) {
          skipped.push({ path: relPath, reason: 'ignored_directory' });
          continue;
        }
        if (isIgnoredOrSecretFile(path.basename(realTarget))) {
          skipped.push({ path: relPath, reason: 'ignored_or_secret_file' });
          continue;
        }

        await processFileEntry(fullPath, relPath, entry.name, targetStat);
        continue;
      }

      // 2. Directory handling
      if (entry.isDirectory()) {
        if (isIgnoredDirectory(entry.name)) {
          skipped.push({ path: relPath, reason: 'ignored_directory' });
          continue;
        }

        let canonicalDir;
        try {
          canonicalDir = normalizePath(await fs.realpath(fullPath));
        } catch {
          skipped.push({ path: relPath, reason: 'unreadable_directory' });
          continue;
        }

        if (visitedDirs.has(canonicalDir)) {
          skipped.push({ path: relPath, reason: 'symlink_cycle' });
          continue;
        }

        visitedDirs.add(canonicalDir);
        dirQueue.push(canonicalDir);
        continue;
      }

      // 3. Regular File handling
      if (entry.isFile()) {
        let fileStat;
        try {
          fileStat = await fs.stat(fullPath);
        } catch {
          skipped.push({ path: relPath, reason: 'unreadable_file' });
          continue;
        }

        await processFileEntry(fullPath, relPath, entry.name, fileStat);
      }
    }
  }

  /**
   * Internal helper to filter, read, and index a file entry safely.
   */
  async function processFileEntry(filePath, relativePath, fileName, fileStat) {
    if (isIgnoredOrSecretFile(fileName)) {
      skipped.push({ path: relativePath, reason: 'ignored_or_secret_file' });
      return;
    }

    const ext = path.extname(fileName).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext)) {
      skipped.push({ path: relativePath, reason: 'binary_extension' });
      return;
    }

    if (!isAllowedSourceFile(ext, allowedExtensions)) {
      skipped.push({ path: relativePath, reason: 'unsupported_extension' });
      return;
    }

    // Check file count limit before reading
    if (files.length >= maxFiles) {
      if (!warnings.includes(`Maximum file limit reached (${maxFiles} files)`)) {
        warnings.push(`Maximum file limit reached (${maxFiles} files)`);
      }
      skipped.push({ path: relativePath, reason: 'max_files_limit_reached' });
      return;
    }

    // Check per-file size limit
    if (fileStat.size > maxFileSizeBytes) {
      skipped.push({ path: relativePath, reason: 'file_too_large' });
      return;
    }

    // Check total byte limit
    if (totalBytes + fileStat.size > maxTotalBytes) {
      if (!warnings.includes(`Maximum total content limit reached (${maxTotalBytes} bytes)`)) {
        warnings.push(`Maximum total content limit reached (${maxTotalBytes} bytes)`);
      }
      skipped.push({ path: relativePath, reason: 'max_bytes_limit_reached' });
      return;
    }

    // Read content safely
    let buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch {
      skipped.push({ path: relativePath, reason: 'unreadable_file' });
      return;
    }

    // Safeguard: check for null bytes in buffer
    if (isBinaryBuffer(buffer)) {
      skipped.push({ path: relativePath, reason: 'binary_content' });
      return;
    }

    const content = buffer.toString('utf8');
    const lineCount = countLines(content);

    files.push({
      path: relativePath,
      content,
      lineCount,
      size: fileStat.size,
      extension: ext,
    });

    totalBytes += fileStat.size;
  }

  return {
    rootPath: canonicalRoot,
    files,
    skipped,
    warnings,
    stats: {
      totalFiles: files.length,
      totalBytes,
      scannedCount,
      skippedCount: skipped.length,
    },
  };
}
