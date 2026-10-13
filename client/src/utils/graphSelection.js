/**
 * Deterministically computes selection states for React Flow nodes and edges.
 *
 * Directed edge convention:
 * - Edge points from importing file (source) to imported file (target).
 * - Outgoing edges (selected -> target): dependencies imported by selected node.
 * - Incoming edges (source -> selected): dependents that import selected node.
 *
 * @param {string|null} selectedId - ID (relative path) of the currently selected node
 * @param {Array<object>} rawNodes - List of raw or RF nodes
 * @param {Array<object>} rawEdges - List of raw or RF edges
 * @returns {{
 *   selectedNodeId: string|null,
 *   incomingNodeIds: Set<string>,
 *   outgoingNodeIds: Set<string>,
 *   isIsolated: boolean,
 *   nodeHighlightMap: Map<string, 'selected' | 'incoming' | 'outgoing' | 'dimmed' | 'normal'>,
 *   edgeHighlightMap: Map<string, 'incoming' | 'outgoing' | 'dimmed' | 'normal'>
 * }}
 */
export function computeSelectionHighlights(selectedId, rawNodes = [], rawEdges = []) {
  const incomingNodeIds = new Set();
  const outgoingNodeIds = new Set();
  const nodeHighlightMap = new Map();
  const edgeHighlightMap = new Map();

  if (!selectedId) {
    for (const node of rawNodes) {
      nodeHighlightMap.set(node.id, 'normal');
    }
    for (const edge of rawEdges) {
      edgeHighlightMap.set(edge.id, 'normal');
    }
    return {
      selectedNodeId: null,
      incomingNodeIds,
      outgoingNodeIds,
      isIsolated: false,
      nodeHighlightMap,
      edgeHighlightMap,
    };
  }

  // Identify incoming and outgoing connections
  for (const edge of rawEdges) {
    if (edge.target === selectedId) {
      incomingNodeIds.add(edge.source);
    }
    if (edge.source === selectedId) {
      outgoingNodeIds.add(edge.target);
    }
  }

  const isIsolated = incomingNodeIds.size === 0 && outgoingNodeIds.size === 0;

  // Classify each node
  for (const node of rawNodes) {
    if (node.id === selectedId) {
      nodeHighlightMap.set(node.id, 'selected');
    } else if (incomingNodeIds.has(node.id)) {
      nodeHighlightMap.set(node.id, 'incoming');
    } else if (outgoingNodeIds.has(node.id)) {
      nodeHighlightMap.set(node.id, 'outgoing');
    } else {
      nodeHighlightMap.set(node.id, 'dimmed');
    }
  }

  // Classify each edge
  for (const edge of rawEdges) {
    if (edge.target === selectedId) {
      edgeHighlightMap.set(edge.id, 'incoming');
    } else if (edge.source === selectedId) {
      edgeHighlightMap.set(edge.id, 'outgoing');
    } else {
      edgeHighlightMap.set(edge.id, 'dimmed');
    }
  }

  return {
    selectedNodeId: selectedId,
    incomingNodeIds,
    outgoingNodeIds,
    isIsolated,
    nodeHighlightMap,
    edgeHighlightMap,
  };
}

