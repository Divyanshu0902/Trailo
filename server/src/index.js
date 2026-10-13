import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Trailo API server listening on http://localhost:${PORT}`);
});

function gracefulShutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    console.log('Server HTTP listener closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
