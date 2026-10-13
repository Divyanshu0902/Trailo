/**
 * Deterministic layered graph layout for Trailo.
 * Positions nodes along left-to-right dependency layers and tiles isolated nodes below.
 *
 * @param {Array<object>} nodes - Raw graph nodes from backend API
 * @param {Array<object>} edges - Directed dependency edges from backend API
 * @returns {Array<object>} Nodes with computed { x, y } positions
 */
export function computeGraphLayout(nodes, edges) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    const empty = [];
    empty.nodes = [];
    empty.edges = [];
    return empty;
  }

  // 1. If there are no edges, tile all nodes in a responsive grid
  if (!Array.isArray(edges) || edges.length === 0) {
    const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(nodes.length))));
    const positioned = nodes.map((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        ...node,
        position: {
          x: col * 280 + 60,
          y: row * 110 + 60,
        },
      };
    });
    positioned.nodes = positioned;
    positioned.edges = [];
    return positioned;
  }

  // 2. Build in-degree, out-degree, and child maps
  const inDegree = new Map();
  const outDegree = new Map();
  const childrenMap = new Map();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
    childrenMap.set(node.id, []);
  }

  for (const edge of edges) {
    if (inDegree.has(edge.target)) {
      inDegree.set(edge.target, inDegree.get(edge.target) + 1);
    }
    if (outDegree.has(edge.source)) {
      outDegree.set(edge.source, outDegree.get(edge.source) + 1);
    }
    if (childrenMap.has(edge.source)) {
      childrenMap.get(edge.source).push(edge.target);
    }
  }

  // 3. Separate isolated nodes from connected nodes
  const isolatedNodes = [];
  const connectedNodes = [];
  const layers = new Map();
  const queue = [];

  for (const node of nodes) {
    const inD = inDegree.get(node.id) || 0;
    const outD = outDegree.get(node.id) || 0;

    if (inD === 0 && outD === 0) {
      isolatedNodes.push(node);
    } else {
      connectedNodes.push(node);
      if (inD === 0) {
        layers.set(node.id, 0);
        queue.push(node.id);
      }
    }
  }

  // 4. BFS layer assignment for directed acyclic flow
  const visited = new Set();
  const maxIterations = nodes.length * 2;
  let iterations = 0;

  while (queue.length > 0 && iterations < maxIterations) {
    iterations++;
    const curr = queue.shift();
    if (visited.has(curr)) continue;
    visited.add(curr);

    const currLayer = layers.get(curr) || 0;
    const children = childrenMap.get(curr) || [];

    for (const child of children) {
      const existingLayer = layers.get(child);
      const nextLayer = currLayer + 1;
      if (existingLayer === undefined || nextLayer > existingLayer) {
        layers.set(child, nextLayer);
      }
      if (!visited.has(child)) {
        queue.push(child);
      }
    }
  }

  // Fallback for nodes in cycles that had no in-degree 0 root
  for (const node of connectedNodes) {
    if (!layers.has(node.id)) {
      layers.set(node.id, 0);
    }
  }

  // 5. Group connected nodes by layer
  const layerGroups = new Map();
  for (const node of connectedNodes) {
    const l = layers.get(node.id) || 0;
    if (!layerGroups.has(l)) {
      layerGroups.set(l, []);
    }
    layerGroups.get(l).push(node);
  }

  // 6. Position connected nodes: X = Layer * 320, Y = Index in layer * 120
  const positionedNodes = [];
  const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
  let maxConnectedY = 0;

  for (const layer of sortedLayers) {
    const group = layerGroups.get(layer);
    group.forEach((node, idx) => {
      const x = layer * 320 + 60;
      const y = idx * 120 + 60;
      if (y > maxConnectedY) maxConnectedY = y;

      positionedNodes.push({
        ...node,
        position: { x, y },
      });
    });
  }

  // 7. Position isolated nodes in an orderly grid below connected nodes
  if (isolatedNodes.length > 0) {
    const isolatedStartY = maxConnectedY > 0 ? maxConnectedY + 160 : 60;
    const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(isolatedNodes.length))));

    isolatedNodes.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      positionedNodes.push({
        ...node,
        position: {
          x: col * 280 + 60,
          y: isolatedStartY + row * 110,
        },
      });
    });
  }

  positionedNodes.nodes = positionedNodes;
  positionedNodes.edges = Array.isArray(edges) ? edges : [];
  return positionedNodes;
}
