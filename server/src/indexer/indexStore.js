import crypto from 'node:crypto';

/**
 * In-memory index store for Trailo.
 * Stores scanned file records, deterministic source chunks, and normalized dependency records.
 */
export class IndexStore {
  /**
   * @param {object} [snapshotData]
   */
  constructor(snapshotData = null) {
    this.currentSnapshot = null;
    if (snapshotData) {
      this.setSnapshot(snapshotData);
    }
  }

  /**
   * Stores a new index snapshot in memory.
   *
   * @param {object} snapshot
   * @param {string} [snapshot.id]
   * @param {string} snapshot.rootPath
   * @param {Array<object>} snapshot.files
   * @param {Array<object>} snapshot.chunks
   * @param {Array<object>} snapshot.dependencies
   * @param {Array<object>} [snapshot.skipped=[]]
   * @param {Array<string>} [snapshot.warnings=[]]
   * @param {object} [snapshot.stats]
   * @returns {object} The stored snapshot
   */
  setSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new TypeError('snapshot must be an object');
    }

    const id = snapshot.id || `snapshot_${crypto.randomUUID()}`;
    const filesMap = new Map();
    const chunksById = new Map();
    const chunksByFile = new Map();
    const outboundDeps = new Map();
    const inboundDeps = new Map();

    const files = Array.isArray(snapshot.files) ? snapshot.files : [];
    for (const f of files) {
      if (f && typeof f.path === 'string') {
        filesMap.set(f.path, f);
      }
    }

    const chunks = Array.isArray(snapshot.chunks) ? snapshot.chunks : [];
    for (const c of chunks) {
      if (c && typeof c.chunkId === 'string') {
        chunksById.set(c.chunkId, c);
        if (!chunksByFile.has(c.filePath)) {
          chunksByFile.set(c.filePath, []);
        }
        chunksByFile.get(c.filePath).push(c);
      }
    }

    const dependencies = Array.isArray(snapshot.dependencies) ? snapshot.dependencies : [];
    for (const dep of dependencies) {
      if (!dep) continue;
      // Index by sourcePath
      if (dep.sourcePath) {
        if (!outboundDeps.has(dep.sourcePath)) {
          outboundDeps.set(dep.sourcePath, []);
        }
        outboundDeps.get(dep.sourcePath).push(dep);
      }
      // Index by targetPath
      if (dep.targetPath) {
        if (!inboundDeps.has(dep.targetPath)) {
          inboundDeps.set(dep.targetPath, []);
        }
        inboundDeps.get(dep.targetPath).push(dep);
      }
    }

    const resolvedDeps = dependencies.filter((d) => d.resolutionStatus === 'resolved').length;
    const externalDeps = dependencies.filter((d) => d.resolutionStatus === 'external').length;
    const unresolvedDeps = dependencies.filter((d) => d.resolutionStatus === 'unresolved').length;

    const stats = {
      totalFiles: filesMap.size,
      totalChunks: chunks.length,
      totalDependencies: dependencies.length,
      resolvedDependencies: resolvedDeps,
      externalDependencies: externalDeps,
      unresolvedDependencies: unresolvedDeps,
      ...(snapshot.stats || {}),
    };

    this.currentSnapshot = {
      id,
      rootPath: snapshot.rootPath || '',
      indexedAt: snapshot.indexedAt || new Date().toISOString(),
      filesMap,
      files,
      chunks,
      chunksById,
      chunksByFile,
      dependencies,
      outboundDeps,
      inboundDeps,
      skipped: snapshot.skipped || [],
      warnings: snapshot.warnings || [],
      stats,
    };

    return this.getSnapshotSummary();
  }

  /**
   * Retrieves summary information for the current index snapshot.
   *
   * @returns {object | null}
   */
  getSnapshotSummary() {
    if (!this.currentSnapshot) return null;
    return {
      id: this.currentSnapshot.id,
      rootPath: this.currentSnapshot.rootPath,
      indexedAt: this.currentSnapshot.indexedAt,
      stats: this.currentSnapshot.stats,
      warnings: this.currentSnapshot.warnings,
      skippedCount: this.currentSnapshot.skipped.length,
    };
  }

  /**
   * Retrieves a file record by normalized relative path.
   *
   * @param {string} filePath
   * @returns {object | null}
   */
  getFile(filePath) {
    if (!this.currentSnapshot) return null;
    return this.currentSnapshot.filesMap.get(filePath) || null;
  }

  /**
   * Returns all indexed files in the active snapshot.
   *
   * @returns {Array<object>}
   */
  getAllFiles() {
    if (!this.currentSnapshot) return [];
    return this.currentSnapshot.files;
  }

  /**
   * Retrieves chunks, optionally filtered by file path.
   *
   * @param {string} [filePath]
   * @returns {Array<object>}
   */
  getChunks(filePath) {
    if (!this.currentSnapshot) return [];
    if (filePath) {
      return this.currentSnapshot.chunksByFile.get(filePath) || [];
    }
    return this.currentSnapshot.chunks;
  }

  /**
   * Retrieves a specific chunk by its deterministic chunk ID.
   *
   * @param {string} chunkId
   * @returns {object | null}
   */
  getChunkById(chunkId) {
    if (!this.currentSnapshot) return null;
    return this.currentSnapshot.chunksById.get(chunkId) || null;
  }

  /**
   * Returns all dependencies in the active snapshot.
   *
   * @returns {Array<object>}
   */
  getAllDependencies() {
    if (!this.currentSnapshot) return [];
    return this.currentSnapshot.dependencies;
  }

  /**
   * Returns outbound dependencies originating from a specific source file.
   *
   * @param {string} filePath
   * @returns {Array<object>}
   */
  getOutboundDependencies(filePath) {
    if (!this.currentSnapshot) return [];
    return this.currentSnapshot.outboundDeps.get(filePath) || [];
  }

  /**
   * Returns inbound dependencies pointing to a specific target file.
   *
   * @param {string} filePath
   * @returns {Array<object>}
   */
  getInboundDependencies(filePath) {
    if (!this.currentSnapshot) return [];
    return this.currentSnapshot.inboundDeps.get(filePath) || [];
  }

  /**
   * Clears the active snapshot from memory.
   */
  clear() {
    this.currentSnapshot = null;
  }
}

/**
 * Global singleton in-memory index store instance for the application runtime.
 */
export const defaultIndexStore = new IndexStore();

/**
 * Creates a new isolated IndexStore instance.
 *
 * @param {object} [snapshotData]
 * @returns {IndexStore}
 */
export function createIndexStore(snapshotData = null) {
  return new IndexStore(snapshotData);
}
