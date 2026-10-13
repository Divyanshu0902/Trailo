import { Router } from 'express';
import { defaultIndexStore } from './indexStore.js';
import { indexRepository } from './indexer.js';
import { ScannerError } from '../scanner/index.js';

/**
 * Maps ScannerError code to appropriate HTTP status code.
 *
 * @param {string} code
 * @returns {number}
 */
function mapScannerErrorCodeToStatus(code) {
  switch (code) {
    case 'ROOT_NOT_FOUND':
      return 404;
    case 'INVALID_ROOT':
    case 'NOT_A_DIRECTORY':
      return 400;
    case 'ROOT_ACCESS_ERROR':
      return 403;
    default:
      return 500;
  }
}

/**
 * Creates Express router for repository scanning and indexing endpoints.
 *
 * @param {object} [options={}]
 * @param {import('./indexStore.js').IndexStore} [options.store=defaultIndexStore]
 * @param {Function} [options.indexRepository=indexRepository]
 * @param {Console | object} [options.logger=console] - Logger for server-side error logging
 * @returns {Router}
 */
export function createScanRouter(options = {}) {
  const router = Router();
  const store = options.store || defaultIndexStore;
  const indexFn = options.indexRepository || indexRepository;
  const logger = options.logger || console;

  async function handleScanRequest(req, res) {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ROOT',
          message: 'Request body must be a JSON object containing "rootPath"',
        },
      });
    }

    const rootPath = body.rootPath || body.path;
    if (!rootPath || typeof rootPath !== 'string' || !rootPath.trim()) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ROOT',
          message: 'A valid non-empty rootPath string is required',
        },
      });
    }

    try {
      const result = await indexFn(rootPath.trim(), {
        store,
        scannerOptions: body.scannerOptions,
        chunkOptions: body.chunkOptions,
      });

      return res.status(200).json({
        repositoryId: result.summary.id,
        rootPath: result.summary.rootPath,
        indexedAt: result.summary.indexedAt,
        summary: result.summary,
        warnings: result.summary.warnings,
      });
    } catch (err) {
      if (err instanceof ScannerError || err.name === 'ScannerError') {
        const status = mapScannerErrorCodeToStatus(err.code);
        return res.status(status).json({
          error: {
            code: err.code || 'SCAN_ERROR',
            message: err.message,
          },
        });
      }

      logger.error('[ScanRoutes] Unexpected error while indexing repository:', err);

      return res.status(500).json({
        error: {
          code: 'INDEXING_ERROR',
          message: 'An unexpected internal error occurred while indexing repository',
        },
      });
    }
  }

  // Canonical scan trigger routes
  router.post('/scan', handleScanRequest);
  router.post('/repositories', handleScanRequest);

  return router;
}
