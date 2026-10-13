import express from 'express';

/**
 * Creates and configures the Express application.
 * Separated from listen() to allow test execution without port binding.
 *
 * @param {object} [config={}] - Optional application configuration
 * @returns {import('express').Express}
 */
export function createApp(config = {}) {
  const app = express();

  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'trailo-api',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
