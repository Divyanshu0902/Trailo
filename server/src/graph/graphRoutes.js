import { Router } from 'express';
import { buildDependencyGraph } from './graphBuilder.js';
import { defaultIndexStore } from '../indexer/index.js';

/**
 * Creates Express router for graph endpoints.
 *
 * @param {object} [options={}]
 * @param {import('../indexer/indexStore.js').IndexStore} [options.store=defaultIndexStore]
 * @returns {Router}
 */
export function createGraphRouter(options = {}) {
  const router = Router();
  const store = options.store || defaultIndexStore;

  function handleGraphRequest(req, res) {
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

    try {
      const graph = buildDependencyGraph(snapshot);
      return res.status(200).json(graph);
    } catch (err) {
      return res.status(500).json({
        error: {
          code: 'GRAPH_BUILD_ERROR',
          message: err.message || 'Failed to construct repository graph',
        },
      });
    }
  }

  // Canonical route according to technical design
  router.get('/repositories/:id/graph', handleGraphRequest);

  // Direct active graph route
  router.get('/graph', handleGraphRequest);

  return router;
}
