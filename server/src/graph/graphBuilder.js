/**
 * Graph construction module for Trailo.
 * Transforms an in-memory index snapshot into a dependency graph payload.
 */

/**
 * Transforms an index snapshot into graph nodes, edges, and dependency groupings.
 *
 * @param {object} snapshot - In-memory index snapshot from IndexStore
 * @returns {{
 *   repositoryId: string | null,
 *   rootPath: string,
 *   indexedAt: string | null,
 *   nodes: Array<{
 *     id: string,
 *     path: string,
 *     name: string,
 *     language: string,
 *     lineCount: number,
 *     size: number,
 *     extension: string
 *   }>,
 *   edges: Array<{
 *     id: string,
 *     source: string,
 *     target: string,
 *     specifier: string,
 *     kind: string,
 *     sourceLocation: { startLine: number, endLine: number } | null
 *   }>,
 *   unresolved: Array<{
 *     sourcePath: string,
 *     specifier: string,
 *     kind: string,
 *     language: string,
 *     resolutionStatus: 'unresolved',
 *     sourceLocation: { startLine: number, endLine: number } | null
 *   }>,
 *   external: Array<{
 *     sourcePath: string,
 *     specifier: string,
 *     kind: string,
 *     language: string,
 *     resolutionStatus: 'external',
 *     sourceLocation: { startLine: number, endLine: number } | null
 *   }>,
 *   summary: {
 *     totalNodes: number,
 *     totalEdges: number,
 *     resolvedCount: number,
 *     unresolvedCount: number,
 *     externalCount: number
 *   }
 * }}
 */
export function buildDependencyGraph(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('snapshot must be a valid object');
  }

  const nodes = [];
  const edges = [];
  const unresolved = [];
  const external = [];

  const seenNodePaths = new Set();
  const files = Array.isArray(snapshot.files) ? snapshot.files : [];

  for (const file of files) {
    if (!file || typeof file.path !== 'string') continue;
    if (seenNodePaths.has(file.path)) continue;

    seenNodePaths.add(file.path);

    nodes.push({
      id: file.path,
      path: file.path,
      name: file.path.split('/').pop() || file.path,
      language: file.language || 'unknown',
      lineCount: typeof file.lineCount === 'number' ? file.lineCount : 0,
      size: typeof file.size === 'number' ? file.size : 0,
      extension: typeof file.extension === 'string' ? file.extension : '',
    });
  }

  const dependencies = Array.isArray(snapshot.dependencies) ? snapshot.dependencies : [];
  const seenEdgeKeys = new Set();

  for (const dep of dependencies) {
    if (!dep || typeof dep.sourcePath !== 'string') continue;

    // 1. Explicitly record unresolved dependencies without guessing targets
    if (dep.resolutionStatus === 'unresolved') {
      unresolved.push({
        sourcePath: dep.sourcePath,
        specifier: dep.specifier || '',
        kind: dep.kind || 'unknown',
        language: dep.language || 'unknown',
        resolutionStatus: 'unresolved',
        sourceLocation: dep.sourceLocation || null,
      });
      continue;
    }

    // 2. Explicitly record external packages without polluting repository file nodes
    if (dep.resolutionStatus === 'external') {
      external.push({
        sourcePath: dep.sourcePath,
        specifier: dep.specifier || '',
        kind: dep.kind || 'unknown',
        language: dep.language || 'unknown',
        resolutionStatus: 'external',
        sourceLocation: dep.sourceLocation || null,
      });
      continue;
    }

    // 3. Resolved internal dependency: directed edge from importing to imported file
    if (dep.resolutionStatus === 'resolved' && typeof dep.targetPath === 'string') {
      // Must connect valid indexed repository files
      if (!seenNodePaths.has(dep.sourcePath) || !seenNodePaths.has(dep.targetPath)) {
        continue;
      }

      const startLine = dep.sourceLocation?.startLine ?? 0;
      const edgeKey = `${dep.sourcePath}->${dep.targetPath}:${dep.kind || 'import'}:${startLine}:${dep.specifier || ''}`;

      if (seenEdgeKeys.has(edgeKey)) {
        continue;
      }
      seenEdgeKeys.add(edgeKey);

      edges.push({
        id: `${dep.sourcePath}->${dep.targetPath}:${dep.kind || 'import'}:${startLine}`,
        source: dep.sourcePath,
        target: dep.targetPath,
        specifier: dep.specifier || '',
        kind: dep.kind || 'import',
        sourceLocation: dep.sourceLocation || null,
      });
    }
  }

  const summary = {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    resolvedCount: edges.length,
    unresolvedCount: unresolved.length,
    externalCount: external.length,
  };

  return {
    repositoryId: snapshot.id || null,
    rootPath: snapshot.rootPath || '',
    indexedAt: snapshot.indexedAt || null,
    nodes,
    edges,
    unresolved,
    external,
    summary,
  };
}
