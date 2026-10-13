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

/**
 * Resolves selection and source explorer open/collapsed state upon node click or deselection.
 *
 * Rules:
 * 1. Initial / scan reset: explorer starts collapsed (`isSourceOpen: false`).
 * 2. Clicking any file node (`nextSelectedId !== null`): automatically expands explorer (`isSourceOpen: true`).
 * 3. Selecting another node while open: updates selection and remains open (`isSourceOpen: true`).
 * 4. Clicking the already-selected node when collapsed: reopens the explorer (`isSourceOpen: true`).
 * 5. Deselecting (`nextSelectedId === null`): clears selection and collapses explorer (`isSourceOpen: false`).
 *
 * @param {object} params
 * @param {string|null} [params.currentSelectedId=null] - Currently selected node ID
 * @param {string|null} params.nextSelectedId - Node ID being clicked, or null for deselection
 * @param {boolean} [params.isSourceOpen=false] - Current open state of the source explorer
 * @returns {{ selectedNodeId: string|null, isSourceOpen: boolean }}
 */
export function transitionSelectionState({ currentSelectedId = null, nextSelectedId, isSourceOpen = false } = {}) {
  if (nextSelectedId === null || nextSelectedId === undefined) {
    return {
      selectedNodeId: null,
      isSourceOpen: false,
    };
  }

  return {
    selectedNodeId: nextSelectedId,
    isSourceOpen: true,
  };
}

/**
 * Resolves activity bar tab and contextual sidebar open/collapsed state.
 *
 * Rules:
 * 1. Clicking an activity icon when closed: selects that category and opens the sidebar.
 * 2. Clicking the currently selected activity icon again when open: collapses the sidebar.
 * 3. Clicking another activity icon: switches category and opens sidebar.
 * 4. Clicking the currently selected icon when collapsed: reopens the sidebar.
 *
 * @param {object} params
 * @param {string} params.currentTab - Currently active sidebar tab (e.g. 'scanner')
 * @param {boolean} params.isSidebarOpen - Current open state of sidebar
 * @param {string} params.clickedTab - Tab being clicked
 * @returns {{ activeTab: string, isSidebarOpen: boolean }}
 */
export function transitionActivityBarState({ currentTab = 'scanner', isSidebarOpen = false, clickedTab } = {}) {
  if (currentTab === clickedTab && isSidebarOpen) {
    return {
      activeTab: currentTab,
      isSidebarOpen: false,
    };
  }

  return {
    activeTab: clickedTab || currentTab,
    isSidebarOpen: true,
  };
}

