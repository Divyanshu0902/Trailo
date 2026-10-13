import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  scanRepository,
  countLines,
  ScannerError,
} from '../src/scanner/index.js';

describe('Safe Repository Scanner', () => {
  let baseTmpDir;

  before(async () => {
    baseTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trailo-scanner-test-'));
  });

  after(async () => {
    if (baseTmpDir) {
      await fs.rm(baseTmpDir, { recursive: true, force: true });
    }
  });

  it('correctly calculates line counts across newline formats', () => {
    assert.equal(countLines(''), 0);
    assert.equal(countLines('const a = 1;'), 1);
    assert.equal(countLines('const a = 1;\n'), 1);
    assert.equal(countLines('const a = 1;\r\n'), 1);
    assert.equal(countLines('const a = 1;\nconst b = 2;\n'), 2);
    assert.equal(countLines('const a = 1;\r\nconst b = 2;\r\n'), 2);
    assert.equal(countLines('const a = 1;\n\n'), 2);
  });

  it('discovers valid JS/TS files and excludes ignored and hidden directories', async () => {
    const repoDir = path.join(baseTmpDir, 'repo-standard');
    await fs.mkdir(path.join(repoDir, 'src', 'components'), { recursive: true });
    await fs.mkdir(path.join(repoDir, 'node_modules', 'pkg'), { recursive: true });
    await fs.mkdir(path.join(repoDir, '.git', 'objects'), { recursive: true });
    await fs.mkdir(path.join(repoDir, '.hidden_dir'), { recursive: true });
    await fs.mkdir(path.join(repoDir, 'dist'), { recursive: true });

    // Valid files
    await fs.writeFile(path.join(repoDir, 'index.js'), 'export const main = 1;\n');
    await fs.writeFile(path.join(repoDir, 'src', 'app.ts'), 'export const app = true;\nconst second = 2;\n');
    await fs.writeFile(path.join(repoDir, 'src', 'components', 'Button.jsx'), 'export function Button() { return null; }\n');
    await fs.writeFile(path.join(repoDir, 'src', 'types.d.ts'), 'export type X = string;\n');

    // Files that must be excluded
    await fs.writeFile(path.join(repoDir, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};');
    await fs.writeFile(path.join(repoDir, '.git', 'config.js'), 'ignored');
    await fs.writeFile(path.join(repoDir, '.hidden_dir', 'hidden.js'), 'ignored');
    await fs.writeFile(path.join(repoDir, 'dist', 'bundle.js'), 'ignored');
    await fs.writeFile(path.join(repoDir, '.env'), 'SECRET=123');
    await fs.writeFile(path.join(repoDir, '.env.local'), 'SECRET=456');
    await fs.writeFile(path.join(repoDir, 'id_rsa'), 'PRIVATE_KEY');
    await fs.writeFile(path.join(repoDir, 'server.key'), 'CERTIFICATE_KEY');

    const result = await scanRepository(repoDir);

    const indexedPaths = result.files.map((f) => f.path).sort();
    assert.deepEqual(indexedPaths, [
      'index.js',
      'src/app.ts',
      'src/components/Button.jsx',
      'src/types.d.ts',
    ]);

    // Check line counts and normalization
    const appTs = result.files.find((f) => f.path === 'src/app.ts');
    assert.ok(appTs);
    assert.equal(appTs.lineCount, 2);
    assert.equal(appTs.extension, '.ts');
    assert.ok(appTs.content.includes('export const app = true;'));

    // Verify ignored directories were recorded
    const skippedReasons = result.skipped.map((s) => s.reason);
    assert.ok(skippedReasons.includes('ignored_directory'));
    assert.ok(skippedReasons.includes('ignored_or_secret_file'));
  });

  it('skips unsupported file types, binary files, and oversized files', async () => {
    const repoDir = path.join(baseTmpDir, 'repo-filters');
    await fs.mkdir(repoDir, { recursive: true });

    // Valid file
    await fs.writeFile(path.join(repoDir, 'valid.js'), 'console.log("valid");');

    // Unsupported extension
    await fs.writeFile(path.join(repoDir, 'notes.md'), '# Notes\nSome doc.');
    await fs.writeFile(path.join(repoDir, 'style.css'), 'body { margin: 0; }');

    // Binary file extension
    await fs.writeFile(path.join(repoDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    // Binary content masquerading with .js extension (contains null byte)
    await fs.writeFile(path.join(repoDir, 'fake.js'), Buffer.from([0x63, 0x6f, 0x6e, 0x00, 0x73, 0x74]));

    // Oversized file (> 500 KB default limit)
    const bigContent = 'x'.repeat(510 * 1024);
    await fs.writeFile(path.join(repoDir, 'big.js'), bigContent);

    const result = await scanRepository(repoDir);

    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, 'valid.js');

    const skippedByPath = new Map(result.skipped.map((s) => [s.path, s.reason]));
    assert.equal(skippedByPath.get('notes.md'), 'unsupported_extension');
    assert.equal(skippedByPath.get('style.css'), 'unsupported_extension');
    assert.equal(skippedByPath.get('image.png'), 'binary_extension');
    assert.equal(skippedByPath.get('fake.js'), 'binary_content');
    assert.equal(skippedByPath.get('big.js'), 'file_too_large');
  });

  it('enforces file-count limits and adds an informative warning', async () => {
    const repoDir = path.join(baseTmpDir, 'repo-file-limit');
    await fs.mkdir(repoDir, { recursive: true });

    for (let i = 1; i <= 5; i++) {
      await fs.writeFile(path.join(repoDir, `file${i}.js`), `const n = ${i};`);
    }

    const result = await scanRepository(repoDir, { maxFiles: 3 });

    assert.equal(result.files.length, 3);
    assert.ok(result.warnings.some((w) => w.includes('Maximum file limit reached (3 files)')));
    assert.ok(result.skipped.some((s) => s.reason === 'max_files_limit_reached'));
  });

  it('enforces total byte limits and adds an informative warning', async () => {
    const repoDir = path.join(baseTmpDir, 'repo-byte-limit');
    await fs.mkdir(repoDir, { recursive: true });

    // Each file is 100 bytes
    const chunk = 'a'.repeat(100);
    await fs.writeFile(path.join(repoDir, 'a.js'), chunk);
    await fs.writeFile(path.join(repoDir, 'b.js'), chunk);
    await fs.writeFile(path.join(repoDir, 'c.js'), chunk);

    // Limit to 250 bytes
    const result = await scanRepository(repoDir, { maxTotalBytes: 250 });

    assert.equal(result.files.length, 2);
    assert.equal(result.stats.totalBytes, 200);
    assert.ok(result.warnings.some((w) => w.includes('Maximum total content limit reached (250 bytes)')));
    assert.ok(result.skipped.some((s) => s.reason === 'max_bytes_limit_reached'));
  });

  it('rejects invalid or non-existent repository roots', async () => {
    await assert.rejects(
      async () => scanRepository(''),
      (err) => err instanceof ScannerError && err.code === 'INVALID_ROOT'
    );

    await assert.rejects(
      async () => scanRepository(path.join(baseTmpDir, 'non-existent-folder-12345')),
      (err) => err instanceof ScannerError && err.code === 'ROOT_NOT_FOUND'
    );

    // Passing a file instead of a directory
    const filePath = path.join(baseTmpDir, 'just-a-file.js');
    await fs.writeFile(filePath, 'console.log("hello");');
    await assert.rejects(
      async () => scanRepository(filePath),
      (err) => err instanceof ScannerError && err.code === 'NOT_A_DIRECTORY'
    );
  });

  it('rejects or skips symlinks pointing outside the repository root', async (t) => {
    const repoDir = path.join(baseTmpDir, 'repo-symlinks');
    const outsideDir = path.join(baseTmpDir, 'outside-secret');
    await fs.mkdir(repoDir, { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });

    await fs.writeFile(path.join(outsideDir, 'secret.js'), 'export const leaked = true;');
    await fs.writeFile(path.join(repoDir, 'legit.js'), 'export const legit = true;');

    const symlinkTarget = path.join(outsideDir, 'secret.js');
    const symlinkPath = path.join(repoDir, 'escaped_link.js');

    try {
      await fs.symlink(symlinkTarget, symlinkPath, 'file');
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        t.skip('Skipping symlink test: Current Windows user environment requires elevated privileges to create file symlinks');
        return;
      }
      throw err;
    }

    const result = await scanRepository(repoDir);
    const filePaths = result.files.map((f) => f.path);

    assert.ok(filePaths.includes('legit.js'));
    assert.ok(!filePaths.includes('escaped_link.js'));
    assert.ok(!filePaths.includes('secret.js'));

    const symlinkSkip = result.skipped.find((s) => s.path === 'escaped_link.js');
    assert.ok(symlinkSkip);
    assert.equal(symlinkSkip.reason, 'symlink_outside_root');
  });

  it('prevents symlink cycles from creating infinite recursion', async (t) => {
    const repoDir = path.join(baseTmpDir, 'repo-cycles');
    const subDir = path.join(repoDir, 'sub');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, 'sub_file.js'), 'export const sub = 1;');

    const cycleLinkPath = path.join(subDir, 'cycle_to_root');

    try {
      // Use directory junction on Windows which doesn't require admin privileges
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
      await fs.symlink(repoDir, cycleLinkPath, symlinkType);
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        t.skip('Skipping cycle test: Insufficient privileges for directory symlinks');
        return;
      }
      throw err;
    }

    const result = await scanRepository(repoDir);
    const filePaths = result.files.map((f) => f.path);

    assert.deepEqual(filePaths, ['sub/sub_file.js']);
    assert.ok(result.skipped.some((s) => s.reason === 'symlink_cycle'));
  });

  it('prevents symlinks with ordinary names from bypassing ignored directory rules', async (t) => {
    const repoDir = path.join(baseTmpDir, 'repo-symlink-bypass');
    const nodeModulesDir = path.join(repoDir, 'node_modules', 'dep');
    const gitDir = path.join(repoDir, '.git', 'hooks');
    await fs.mkdir(nodeModulesDir, { recursive: true });
    await fs.mkdir(gitDir, { recursive: true });

    // Legitimate file in repo root
    await fs.writeFile(path.join(repoDir, 'index.js'), 'export const root = true;');

    // Files inside ignored directories that must not be indexed
    await fs.writeFile(path.join(nodeModulesDir, 'dep.js'), 'export const dep = true;');
    await fs.writeFile(path.join(gitDir, 'hook.js'), 'export const hook = true;');

    // Symlinks with ordinary names pointing to excluded directories
    const ordinaryLinkToNodeModules = path.join(repoDir, 'external_libs');
    const ordinaryLinkToGit = path.join(repoDir, 'repo_meta');

    try {
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
      await fs.symlink(path.join(repoDir, 'node_modules'), ordinaryLinkToNodeModules, symlinkType);
      await fs.symlink(path.join(repoDir, '.git'), ordinaryLinkToGit, symlinkType);
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        t.skip('Skipping bypass test: Insufficient privileges for directory symlinks');
        return;
      }
      throw err;
    }

    const result = await scanRepository(repoDir);
    const filePaths = result.files.map((f) => f.path);

    // Only index.js should be indexed; contents of node_modules and .git must not be indexed
    assert.deepEqual(filePaths, ['index.js']);

    // Verify ordinary symlinks were skipped as ignored_directory
    const skippedMap = new Map(result.skipped.map((s) => [s.path, s.reason]));
    assert.equal(skippedMap.get('external_libs'), 'ignored_directory');
    assert.equal(skippedMap.get('repo_meta'), 'ignored_directory');
  });
});
