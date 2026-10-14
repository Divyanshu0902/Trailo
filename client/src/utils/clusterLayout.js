import { MarkerType } from '@xyflow/react';

/**
 * Derives the cluster key (parent directory path) for a given file path.
 * Files in the project root are grouped under 'root'.
 *
 * @param {string} filePath - Repository-relative POSIX file path
 * @returns {string} Cluster key
 */
export function getClusterKey(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'root';
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return 'root';
  return normalized.slice(0, lastSlash);
}

/**
 * Derives a user-facing label for a cluster key.
 *
 * @param {string} clusterKey
 * @returns {string} User-facing directory cluster title
 */
export function getClusterLabel(clusterKey) {
  if (!clusterKey || clusterKey === 'root') return 'Root / Config';
  return clusterKey;
}

/**
 * Maps a file's detected language / extension to a celestial starlight color.
 *
 * @param {string} [language]
 * @param {string} [extension]
 * @returns {string} Hex color string
 */
export function getStarColor(language, extension) {
  const ext = (extension || '').toLowerCase();
  const lang = (language || '').toLowerCase();

  // TypeScript / React TSX — Celestial Azure Blue
  if (lang === 'typescript' || ext === '.ts' || ext === '.tsx') return '#58a6ff';
  // JavaScript / React JSX — Radiant Amber Gold
  if (lang === 'javascript' || ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return '#f1e05a';
  // Stylesheets — Cosmic Magenta Pink
  if (lang === 'css' || lang === 'scss' || ext === '.css' || ext === '.scss') return '#f778ba';
  // Configuration / JSON — Nebula Emerald Green
  if (lang === 'json' || ext === '.json') return '#56d364';
  // Documentation / Markdown — Deep Lavender Violet
  if (lang === 'markdown' || ext === '.md') return '#bc8cff';

  // Default Starlight Silver-White
  return '#e6edf3';
}

/**
 * Builds a hierarchical directory tree from flat file nodes.
 *
 * @param {Array<object>} rawNodes
 * @returns {object} Root directory node with subdirectories and direct files
 */
export function buildDirectoryTree(rawNodes = []) {
  const rootNode = {
    name: 'root',
    path: '',
    files: [],
    subdirs: new Map(),
  };

  for (const node of rawNodes) {
    const rawPath = (node.path || node.id || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rawPath) continue;

    const parts = rawPath.split('/');
    if (parts.length === 1) {
      // Root level file
      rootNode.files.push(node);
      continue;
    }

    const dirParts = parts.slice(0, -1);
    let current = rootNode;
    let accumulatedPath = '';

    for (const part of dirParts) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      if (!current.subdirs.has(part)) {
        current.subdirs.set(part, {
          name: part,
          path: accumulatedPath,
          files: [],
          subdirs: new Map(),
        });
      }
      current = current.subdirs.get(part);
    }

    current.files.push(node);
  }

  return rootNode;
}

/**
 * Compresses single-child directory chains where an intermediate directory
 * contains 0 direct files and exactly 1 child subdirectory.
 * (e.g. client -> src collapses to client/src).
 *
 * @param {object} node - Directory tree node
 */
export function compressDirectoryTree(node) {
  for (const [key, child] of Array.from(node.subdirs.entries())) {
    // Recursively compress deeper levels first
    compressDirectoryTree(child);

    // If child has 0 files and exactly 1 grandchild, collapse child with grandchild
    let compressed = false;
    while (child.files.length === 0 && child.subdirs.size === 1) {
      const [grandchildKey, grandchild] = Array.from(child.subdirs.entries())[0];
      child.name = `${child.name}/${grandchild.name}`;
      child.path = grandchild.path;
      child.files = grandchild.files;
      child.subdirs = grandchild.subdirs;
      compressed = true;
    }

    if (compressed) {
      node.subdirs.delete(key);
      node.subdirs.set(child.name, child);
    }
  }
}

/**
 * Recursively lays out a directory node into circular subclusters and orbiting star nodes.
 *
 * @param {object} dirNode - Directory tree node
 * @param {string|null} parentClusterId - React Flow parent cluster node ID
 * @returns {object} Layout info with radius, groupNodes, and starNodes
 */
function layoutDirectoryNode(dirNode, parentClusterId = null) {
  const clusterId = dirNode.path ? `cluster:${dirNode.path}` : 'cluster:root';
  const clusterKey = dirNode.path || 'root';
  const clusterLabel = getClusterLabel(clusterKey);

  // 1. Recursively layout all child subclusters
  const childSubclusters = [];
  for (const sub of dirNode.subdirs.values()) {
    const subLayout = layoutDirectoryNode(sub, clusterId);
    childSubclusters.push(subLayout);
  }

  const M = childSubclusters.length;
  const N = dirNode.files.length;
  const starRadius = 9; // 18px diameter star node

  let R = 70; // Base cluster radius
  const groupNodes = [];
  const starNodes = [];

  if (M === 0) {
    // Leaf cluster: contains only star nodes
    if (N === 0) {
      R = 60;
    } else if (N === 1) {
      R = 75;
      const file = dirNode.files[0];
      starNodes.push(createStarNode(file, R - starRadius, R - starRadius, clusterId, clusterKey, clusterLabel));
    } else if (N <= 8) {
      const r = 55;
      R = r + 45;
      for (let i = 0; i < N; i++) {
        const theta = (2 * Math.PI * i) / N - Math.PI / 2;
        const x = Math.round(R + r * Math.cos(theta) - starRadius);
        const y = Math.round(R + r * Math.sin(theta) - starRadius);
        starNodes.push(createStarNode(dirNode.files[i], x, y, clusterId, clusterKey, clusterLabel));
      }
    } else if (N <= 18) {
      const r1 = 50;
      const r2 = 95;
      R = r2 + 45;
      const n1 = Math.min(6, N);
      const n2 = N - n1;
      for (let i = 0; i < n1; i++) {
        const theta = (2 * Math.PI * i) / n1 - Math.PI / 2;
        const x = Math.round(R + r1 * Math.cos(theta) - starRadius);
        const y = Math.round(R + r1 * Math.sin(theta) - starRadius);
        starNodes.push(createStarNode(dirNode.files[i], x, y, clusterId, clusterKey, clusterLabel));
      }
      for (let i = 0; i < n2; i++) {
        const theta = (2 * Math.PI * i) / n2 - Math.PI / 2 + Math.PI / n2;
        const x = Math.round(R + r2 * Math.cos(theta) - starRadius);
        const y = Math.round(R + r2 * Math.sin(theta) - starRadius);
        starNodes.push(createStarNode(dirNode.files[n1 + i], x, y, clusterId, clusterKey, clusterLabel));
      }
    } else {
      const r1 = 50;
      const r2 = 95;
      const r3 = 140;
      R = r3 + 45;
      const n1 = 6;
      const n2 = 12;
      const n3 = N - 18;
      for (let i = 0; i < n1; i++) {
        const theta = (2 * Math.PI * i) / n1 - Math.PI / 2;
        const x = Math.round(R + r1 * Math.cos(theta) - starRadius);
        const y = Math.round(R + r1 * Math.sin(theta) - starRadius);
        starNodes.push(createStarNode(dirNode.files[i], x, y, clusterId, clusterKey, clusterLabel));
      }
      for (let i = 0; i < n2; i++) {
        const theta = (2 * Math.PI * i) / n2 - Math.PI / 2 + Math.PI / n2;
        const x = Math.round(R + r2 * Math.cos(theta) - starRadius);
        const y = Math.round(R + r2 * Math.sin(theta) - starRadius);
        starNodes.push(createStarNode(dirNode.files[n1 + i], x, y, clusterId, clusterKey, clusterLabel));
      }
      for (let i = 0; i < n3; i++) {
        const theta = (2 * Math.PI * i) / n3 - Math.PI / 2;
        const x = Math.round(R + r3 * Math.cos(theta) - starRadius);
        const y = Math.round(R + r3 * Math.sin(theta) - starRadius);
        starNodes.push(createStarNode(dirNode.files[n1 + n2 + i], x, y, clusterId, clusterKey, clusterLabel));
      }
    }
  } else {
    // Non-leaf cluster: contains subclusters (and optionally direct files)
    const maxSubRadius = Math.max(...childSubclusters.map((c) => c.radius));
    let Dsub;

    if (M === 1) {
      if (N === 0) {
        Dsub = 0;
        R = maxSubRadius + 45;
      } else {
        Dsub = 0;
        const rFiles = maxSubRadius + 40;
        R = rFiles + 45;
        for (let i = 0; i < N; i++) {
          const theta = (2 * Math.PI * i) / N - Math.PI / 2;
          const x = Math.round(R + rFiles * Math.cos(theta) - starRadius);
          const y = Math.round(R + rFiles * Math.sin(theta) - starRadius);
          starNodes.push(createStarNode(dirNode.files[i], x, y, clusterId, clusterKey, clusterLabel));
        }
      }
    } else {
      // Multiple subclusters orbiting around parent center
      const chordFactor = Math.sin(Math.PI / M);
      const minD = (maxSubRadius + 25) / chordFactor;
      Dsub = Math.max(maxSubRadius + 50, Math.round(minD));
      R = Dsub + maxSubRadius + 50;

      // Position direct files on an inner orbit if any exist
      if (N > 0) {
        const rInner = Math.min(50, Math.max(30, Dsub - maxSubRadius - 20));
        for (let i = 0; i < N; i++) {
          const theta = (2 * Math.PI * i) / N - Math.PI / 2;
          const x = Math.round(R + rInner * Math.cos(theta) - starRadius);
          const y = Math.round(R + rInner * Math.sin(theta) - starRadius);
          starNodes.push(createStarNode(dirNode.files[i], x, y, clusterId, clusterKey, clusterLabel));
        }
      }
    }

    // Position each child subcluster relative to this parent cluster
    for (let j = 0; j < M; j++) {
      const sub = childSubclusters[j];
      let subX;
      let subY;

      if (M === 1 && Dsub === 0) {
        subX = R - sub.radius;
        subY = R - sub.radius;
      } else {
        const phi = (2 * Math.PI * j) / M - Math.PI / 2;
        const cx = R + Dsub * Math.cos(phi);
        const cy = R + Dsub * Math.sin(phi);
        subX = Math.round(cx - sub.radius);
        subY = Math.round(cy - sub.radius);
      }

      // Update position of the child cluster group node
      sub.groupNode.position = { x: subX, y: subY };

      // Collect child group nodes and star nodes
      groupNodes.push(sub.groupNode);
      groupNodes.push(...sub.descendantGroupNodes);
      starNodes.push(...sub.descendantStarNodes);
    }
  }

  // Count total files recursively inside this cluster
  const totalFiles = N + childSubclusters.reduce((acc, c) => acc + c.totalFiles, 0);

  // Create this cluster's own group node
  const thisGroupNode = {
    id: clusterId,
    type: 'clusterGroup',
    position: { x: 0, y: 0 },
    parentId: parentClusterId || undefined,
    extent: parentClusterId ? 'parent' : undefined,
    style: {
      width: 2 * R,
      height: 2 * R,
      borderRadius: '50%',
    },
    data: {
      clusterKey,
      label: clusterLabel,
      fileCount: totalFiles,
      isSubcluster: Boolean(parentClusterId),
      radius: R,
    },
  };

  return {
    radius: R,
    totalFiles,
    groupNode: thisGroupNode,
    descendantGroupNodes: groupNodes,
    descendantStarNodes: starNodes,
  };
}

/**
 * Helper to construct a star node for React Flow.
 */
function createStarNode(file, relX, relY, parentClusterId, clusterKey, clusterLabel) {
  const language = file.language || file.data?.language;
  const extension = file.extension || file.data?.extension;
  const starColor = getStarColor(language, extension);

  return {
    id: file.id,
    type: 'starNode',
    parentId: parentClusterId,
    extent: 'parent',
    position: { x: relX, y: relY },
    data: {
      ...(file.data || file),
      starColor,
      clusterKey,
      clusterLabel,
      highlightState: 'normal',
    },
  };
}

/**
 * Computes deterministic circular constellation layout for Trailo Cluster View.
 * Groups repository files into nested circular clusters and subclusters with single-child
 * directory compression, celestial radial orbits, glowing star nodes, and preserved dependency edges.
 *
 * @param {Array<object>} rawNodes - Graph file nodes from backend API
 * @param {Array<object>} rawEdges - Directed dependency edges from backend API
 * @returns {Array<object>} Flat array of parent clusterGroup nodes followed by child star nodes
 */
export function computeClusterLayout(rawNodes = [], rawEdges = []) {
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    const empty = [];
    empty.nodes = [];
    empty.edges = [];
    return empty;
  }

  // 1. Build directory tree from repository file paths
  const rootTree = buildDirectoryTree(rawNodes);

  // 2. Compress single-child directory chains (e.g. client/src)
  compressDirectoryTree(rootTree);

  // 3. Collect top-level cluster targets
  // Top-level items can be named directories under root, or root files
  const topLevelClusters = [];

  // Top-level directories
  for (const sub of rootTree.subdirs.values()) {
    topLevelClusters.push(layoutDirectoryNode(sub, null));
  }

  // Top-level root files (e.g. package.json, README.md)
  if (rootTree.files.length > 0) {
    const rootDirNode = {
      name: 'root',
      path: '',
      files: rootTree.files,
      subdirs: new Map(),
    };
    topLevelClusters.push(layoutDirectoryNode(rootDirNode, null));
  }

  // 4. Arrange top-level clusters on the global canvas
  const K = topLevelClusters.length;
  if (K === 1) {
    topLevelClusters[0].groupNode.position = { x: 120, y: 120 };
  } else if (K <= 6) {
    // Arrange in a celestial constellation circle around canvas center
    const maxR = Math.max(...topLevelClusters.map((c) => c.radius));
    const chordFactor = Math.sin(Math.PI / K);
    const Dtop = Math.max(380, Math.round((maxR + 80) / chordFactor));
    const cx = Dtop + maxR + 100;
    const cy = Dtop + maxR + 100;

    for (let k = 0; k < K; k++) {
      const cluster = topLevelClusters[k];
      const phi = (2 * Math.PI * k) / K - Math.PI / 2;
      const x = Math.round(cx + Dtop * Math.cos(phi) - cluster.radius);
      const y = Math.round(cy + Dtop * Math.sin(phi) - cluster.radius);
      cluster.groupNode.position = { x, y };
    }
  } else {
    // Multi-column constellation layout
    const cols = Math.min(3, Math.ceil(Math.sqrt(K)));
    let curX = 100;
    let curY = 100;
    let maxHeightInRow = 0;

    for (let k = 0; k < K; k++) {
      const cluster = topLevelClusters[k];
      const col = k % cols;
      if (col === 0 && k > 0) {
        curX = 100;
        curY += maxHeightInRow + 120;
        maxHeightInRow = 0;
      }
      cluster.groupNode.position = { x: curX, y: curY };
      curX += 2 * cluster.radius + 120;
      maxHeightInRow = Math.max(maxHeightInRow, 2 * cluster.radius);
    }
  }

  // 5. Flatten nodes strictly respecting React Flow hierarchy:
  // Top-level cluster groups -> nested subclusters -> star nodes
  const rootGroupNodes = topLevelClusters.map((c) => c.groupNode);
  const nestedGroupNodes = topLevelClusters.flatMap((c) => c.descendantGroupNodes);
  const allStarNodes = topLevelClusters.flatMap((c) => c.descendantStarNodes);

  // React Flow requirement: Parent group nodes MUST precede child nodes in the array
  const allNodes = [...rootGroupNodes, ...nestedGroupNodes, ...allStarNodes];

  // 6. Map directed constellation dependency edges
  const allEdges = (rawEdges || []).map((edge) => ({
    id: edge.id || `edge-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: 'default',
    style: { stroke: 'rgba(88, 166, 255, 0.45)', strokeWidth: 1.5 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 10,
      height: 10,
      color: '#58a6ff',
    },
    data: {
      kind: edge.kind,
      specifier: edge.specifier,
    },
  }));

  allNodes.nodes = allNodes;
  allNodes.edges = allEdges;

  return allNodes;
}
