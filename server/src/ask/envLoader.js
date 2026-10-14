import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Trailo Ask Trailo — Environment Loader
 *
 * Explicitly resolves and loads environment variables from <repo>/server/.env
 * or <repo>/.env using Node 22's built-in process.loadEnvFile without modifying .gitignore.
 */

/**
 * Resolves candidate environment file paths in order of precedence.
 * Works deterministically whether launched from repository root or server/ directory.
 *
 * @param {object} [options={}]
 * @param {string} [options.envPath] - Explicit path to environment file (takes precedence)
 * @param {string} [options.cwd] - Working directory for resolution (defaults to process.cwd())
 * @returns {string[]} Ordered list of candidate file paths to check
 */
export function getCandidateEnvPaths(options = {}) {
  const customPath = options.envPath;
  if (customPath) {
    return [path.resolve(customPath)];
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // Derived from import.meta.url: envLoader.js lives at <repo>/server/src/ask/
  const serverEnv = path.resolve(__dirname, '../../.env');    // <repo>/server/.env
  const rootEnv = path.resolve(__dirname, '../../../.env');   // <repo>/.env

  // Also evaluate cwd-relative locations if launched from a custom directory
  const cwd = options.cwd || process.cwd();
  const cwdServerEnv = path.resolve(cwd, 'server/.env');
  const cwdRootEnv = path.resolve(cwd, '.env');

  const candidates = [
    serverEnv,
    rootEnv,
    cwdServerEnv,
    cwdRootEnv,
  ];

  // Return unique candidate paths in order of precedence
  return Array.from(new Set(candidates));
}

/**
 * Loads the first existing candidate environment file safely.
 * Never creates or overwrites environment files and never logs secrets.
 *
 * @param {object} [options={}]
 * @param {string} [options.envPath] - Explicit path to environment file
 * @param {string} [options.cwd] - Optional working directory override
 * @returns {string|null} Loaded file path, or null if no candidate loaded
 */
export function loadEnvironment(options = {}) {
  if (typeof process.loadEnvFile !== 'function') {
    return null;
  }

  const candidates = getCandidateEnvPaths(options);

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
        return envPath;
      } catch {
        // Continue checking subsequent candidates
      }
    }
  }

  return null;
}
