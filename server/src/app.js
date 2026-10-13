import express from 'express';
import { createGraphRouter } from './graph/index.js';
import { defaultIndexStore } from './indexer/index.js';

/**
 * Creates and configures the Express application.
 * Separated from listen() to allow test execution without port binding.
 *
 * @param {object} [config={}] - Optional application configuration
 * @param {import('./indexer/indexStore.js').IndexStore} [config.store] - In-memory index store instance
 * @returns {import('express').Express}
 */
export function createApp(config = {}) {
  const app = express();
  const store = config.store || defaultIndexStore;

  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'trailo-api',
      timestamp: new Date().toISOString(),
    });
  });

  // Graph endpoints
  app.use('/api', createGraphRouter({ store }));

  return app;
}
