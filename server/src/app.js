import express from 'express';
import { createGraphRouter } from './graph/index.js';
import {
  defaultIndexStore,
  createScanRouter,
  createFileRouter,
} from './indexer/index.js';
import { createQuestionRoutes } from './ask/index.js';

/**
 * Creates and configures the Express application.
 * Separated from listen() to allow test execution without port binding.
 *
 * @param {object} [config={}] - Optional application configuration
 * @param {import('./indexer/indexStore.js').IndexStore} [config.store] - In-memory index store instance
 * @param {Function} [config.indexRepository] - Optional repository indexing coordinator function
 * @param {Console | object} [config.logger] - Optional logger instance for server logging
 * @param {object} [config.geminiAdapter] - Optional Gemini streaming adapter instance
 * @param {number} [config.timeoutMs] - Optional streaming timeout in milliseconds
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

  // Repository scan and indexing endpoints
  app.use('/api', createScanRouter({
    store,
    indexRepository: config.indexRepository,
    logger: config.logger,
  }));

  // Source file content endpoints
  app.use('/api', createFileRouter({ store }));

  // Graph endpoints
  app.use('/api', createGraphRouter({ store }));

  // Ask Trailo Q&A streaming endpoints
  app.use('/api', createQuestionRoutes({
    store,
    geminiAdapter: config.geminiAdapter,
    timeoutMs: config.timeoutMs,
    logger: config.logger,
  }));

  return app;
}
