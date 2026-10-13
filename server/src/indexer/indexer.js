import { scanRepository } from '../scanner/index.js';
import { chunkScannedFiles } from './chunker.js';
import { analyzeRepositoryFiles, detectLanguage } from '../analyzer/index.js';
import { defaultIndexStore, IndexStore } from './indexStore.js';

/**
 * Creates an index snapshot object from scanned files by chunking and extracting dependencies.
 *
 * @param {object} params
 * @param {string} params.rootPath - Canonical repository root path
 * @param {Array<object>} params.files - Array of scanned file records
 * @param {Array<object>} [params.skipped=[]] - Files skipped by scanner
 * @param {Array<string>} [params.warnings=[]] - Warnings generated during scan
 * @param {object} [params.chunkOptions] - Options for line chunker
 * @returns {object} Full snapshot ready for IndexStore
 */
export function createIndexSnapshot({
  rootPath = '',
  files = [],
  skipped = [],
  warnings = [],
  chunkOptions = {},
}) {
  // 1. Enrich file records with detected language
  const enrichedFiles = files.map((file) => ({
    ...file,
    language: detectLanguage(file.path),
  }));

  // 2. Generate line-aware chunks (independent of AST)
  const chunks = chunkScannedFiles(enrichedFiles, chunkOptions);

  // 3. Extract and normalize dependencies via TypeScript Compiler API
  const { dependencies, diagnostics } = analyzeRepositoryFiles(enrichedFiles);

  const combinedWarnings = [...warnings];
  if (diagnostics.length > 0) {
    for (const d of diagnostics) {
      combinedWarnings.push(`[Analyzer] ${d.filePath}: ${d.message}`);
    }
  }

  return {
    rootPath,
    files: enrichedFiles,
    chunks,
    dependencies,
    skipped,
    warnings: combinedWarnings,
  };
}

/**
 * Full end-to-end indexing pipeline:
 * Scans repository root -> Chunks source lines -> Analyzes JS/TS dependencies -> Populates IndexStore.
 *
 * @param {string} rootPath - Absolute path to repository root
 * @param {object} [options={}]
 * @param {object} [options.scannerOptions] - Options passed to scanner (limits, etc.)
 * @param {object} [options.chunkOptions] - Options passed to line chunker
 * @param {IndexStore} [options.store=defaultIndexStore] - IndexStore instance to populate
 * @returns {Promise<{
 *   store: IndexStore,
 *   summary: object,
 *   files: Array<object>,
 *   chunks: Array<object>,
 *   dependencies: Array<object>
 * }>}
 */
export async function indexRepository(rootPath, options = {}) {
  const store = options.store || defaultIndexStore;

  // Step 1: Safe repository scan
  const scanResult = await scanRepository(rootPath, options.scannerOptions);

  // Step 2 & 3: Chunk and analyze
  const snapshotData = createIndexSnapshot({
    rootPath: scanResult.rootPath,
    files: scanResult.files,
    skipped: scanResult.skipped,
    warnings: scanResult.warnings,
    chunkOptions: options.chunkOptions,
  });

  // Step 4: Populate in-memory store
  store.setSnapshot(snapshotData);

  return {
    store,
    summary: store.getSnapshotSummary(),
    files: store.getAllFiles(),
    chunks: store.getChunks(),
    dependencies: store.getAllDependencies(),
  };
}
