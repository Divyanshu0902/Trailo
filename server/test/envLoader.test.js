import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCandidateEnvPaths, loadEnvironment } from '../src/ask/index.js';

describe('Ask Trailo — Environment Loader (Unit)', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const expectedServerEnv = path.resolve(__dirname, '../.env'); // <repo>/server/.env
  const expectedRootEnv = path.resolve(__dirname, '../../.env');  // <repo>/.env

  it('resolves both server/.env and root .env when launched from repository root', () => {
    const rootCwd = path.resolve(__dirname, '../..');
    const candidates = getCandidateEnvPaths({ cwd: rootCwd });

    assert.ok(candidates.includes(expectedServerEnv), 'must include <repo>/server/.env');
    assert.ok(candidates.includes(expectedRootEnv), 'must include <repo>/.env');
    // Ensure precedence: server/.env is checked before root .env
    const serverIdx = candidates.indexOf(expectedServerEnv);
    const rootIdx = candidates.indexOf(expectedRootEnv);
    assert.ok(serverIdx < rootIdx, 'server/.env must have precedence over root .env');
  });

  it('resolves both server/.env and root .env when launched from server/ directory', () => {
    const serverCwd = path.resolve(__dirname, '..');
    const candidates = getCandidateEnvPaths({ cwd: serverCwd });

    assert.ok(candidates.includes(expectedServerEnv), 'must include <repo>/server/.env');
    assert.ok(candidates.includes(expectedRootEnv), 'must include <repo>/.env');
  });

  it('does not include the unintended server/src/.env path', () => {
    const candidates = getCandidateEnvPaths();
    const unintended = path.resolve(__dirname, '../src/.env');
    assert.equal(candidates.includes(unintended), false);
  });

  it('gives explicit envPath top precedence when provided', () => {
    const custom = path.resolve('/custom/secure/app.env');
    const candidates = getCandidateEnvPaths({ envPath: custom });
    assert.deepEqual(candidates, [custom]);
  });

  it('returns null safely without crashing when no candidate env files exist', () => {
    // Specify a non-existent path
    const result = loadEnvironment({ envPath: path.resolve(__dirname, 'fixtures/nonexistent.env') });
    assert.equal(result, null);
  });
});

