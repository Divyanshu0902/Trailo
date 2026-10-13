import path from 'node:path';
import { Router } from 'express';
import { defaultIndexStore } from './indexStore.js';

/**
 * Validates and normalizes a candidate repository-relative file path.
 * Enforces POSIX separators, rejects traversal, absolute paths, Windows drive prefixes, and null bytes.
 *
 * @param {unknown} rawPath
 * @returns {{ valid: true, path: string } | { valid: false, code: string, message: string }}
 */
export function validateRelativeFilePath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    return {
      valid: false,
      code: 'INVALID_FILE_PATH',
      message: 'File path must be a non-empty string',
    };
  }

  const trimmed = rawPath.trim();

  // Decode URI encoding safely
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return {
      valid: false,
      code: 'INVALID_FILE_PATH',
      message: 'Malformed URL encoding in file path',
    };
  }

  // Check for nested/double URI encoding attempts
  if (decoded.includes('%')) {
    try {
      const doubleDecoded = decodeURIComponent(decoded);
      if (doubleDecoded !== decoded) {
        decoded = doubleDecoded;
      }
    } catch {
      // If double decoding fails, proceed with single-decoded string
    }
  }

  // Reject null bytes
  if (decoded.includes('\0')) {
    return {
      valid: false,
      code: 'INVALID_FILE_PATH',
      message: 'Null bytes are not permitted in file path',
    };
  }

  // Reject Windows drive letters (e.g. C:, D:/foo, c:bar)
  if (/^[a-zA-Z]:/.test(decoded)) {
    return {
      valid: false,
      code: 'INVALID_FILE_PATH',
      message: 'Absolute Windows drive paths are not permitted',
    };
  }

  // Reject leading slashes or backslashes (e.g. /etc/passwd, \Windows)
  if (decoded.startsWith('/') || decoded.startsWith('\\')) {
    return {
      valid: false,
      code: 'INVALID_FILE_PATH',
      message: 'Absolute and leading-slash paths are not permitted',
    };
  }

  // Normalize backslashes to forward slashes for POSIX consistency
  const posixSeparators = decoded.replace(/\\/g, '/');

  // Split into segments and inspect each token
  const segments = posixSeparators.split('/');

  for (const seg of segments) {
    if (seg === '..') {
      return {
        valid: false,
        code: 'INVALID_FILE_PATH',
        message: 'Path traversal sequences ("..") are not permitted',
      };
    }
    if (seg === '.') {
      return {
        valid: false,
        code: 'INVALID_FILE_PATH',
        message: 'Path navigation tokens (".") are not permitted',
      };
    }
    if (seg === '') {
      return {
        valid: false,
        code: 'INVALID_FILE_PATH',
        message: 'Empty path segments and trailing slashes are not permitted',
      };
    }
  }

  // Verify against POSIX path normalization
  const normalized = path.posix.normalize(posixSeparators);
  if (
    normalized.startsWith('..') ||
    path.posix.isAbsolute(normalized) ||
    normalized !== posixSeparators
  ) {
    return {
      valid: false,
      code: 'INVALID_FILE_PATH',
      message: 'Invalid path format or traversal attempt',
    };
  }

  return {
    valid: true,
    path: normalized,
  };
}

/**
 * Creates Express router for secure source file content retrieval.
 * Retrieves file text strictly from the active in-memory index snapshot.
 *
 * @param {object} [options={}]
 * @param {import('./indexStore.js').IndexStore} [options.store=defaultIndexStore]
 * @returns {Router}
 */
export function createFileRouter(options = {}) {
  const router = Router();
  const store = options.store || defaultIndexStore;

  function handleFileRequest(req, res) {
    const snapshot = store.currentSnapshot;

    if (!snapshot) {
      return res.status(404).json({
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: 'Repository snapshot not found or not yet indexed',
        },
      });
    }

    const requestedId = req.params.id;
    if (requestedId && requestedId !== 'current' && requestedId !== snapshot.id) {
      return res.status(404).json({
        error: {
          code: 'REPOSITORY_NOT_FOUND',
          message: `Repository '${requestedId}' not found`,
        },
      });
    }

    let rawPath = req.query.path;
    if (rawPath === undefined || rawPath === '') {
      rawPath = req.params[0] || req.params.path;
    }

    if (rawPath === undefined) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FILE_PATH',
          message: 'File path parameter is required',
        },
      });
    }

    const validation = validateRelativeFilePath(rawPath);
    if (!validation.valid) {
      return res.status(400).json({
        error: {
          code: validation.code,
          message: validation.message,
        },
      });
    }

    const file = store.getFile(validation.path);
    if (!file) {
      return res.status(404).json({
        error: {
          code: 'FILE_NOT_FOUND',
          message: `File '${validation.path}' not found in active repository index`,
        },
      });
    }

    return res.status(200).json({
      path: file.path,
      content: file.content,
      lineCount: file.lineCount,
      language: file.language || 'unknown',
      size: file.size,
      extension: file.extension,
    });
  }

  // Canonical repository routes
  router.get('/repositories/:id/files', handleFileRequest);
  router.get('/repositories/:id/files/*', handleFileRequest);

  // Direct active routes
  router.get('/files', handleFileRequest);
  router.get('/files/*', handleFileRequest);

  return router;
}
