import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import { AppTitleBar } from './components/AppTitleBar.jsx';
import { ActivityBar } from './components/ActivityBar.jsx';
import { ContextualSidebar } from './components/ContextualSidebar.jsx';
import { WorkspaceTabBar } from './components/WorkspaceTabBar.jsx';
import { AppStatusBar } from './components/AppStatusBar.jsx';
import { GraphCanvas } from './components/GraphCanvas.jsx';
import { ClusterCanvas } from './components/ClusterCanvas.jsx';
import { SourceViewer } from './components/SourceViewer.jsx';
import { StartupScreen } from './components/StartupScreen.jsx';
import { AskTrailoIcon } from './components/Icons.jsx';
import { computeGraphLayout } from './utils/layout.js';
import { computeClusterLayout } from './utils/clusterLayout.js';
import {
  computeSelectionHighlights,
  transitionSelectionState,
  transitionActivityBarState,
} from './utils/graphSelection.js';
import { defaultSourceLoader } from './utils/sourceLoader.js';
import { clampViewerWidth } from './utils/sourceHighlighter.js';
import './App.css';

export default function App() {
  const [repoPath, setRepoPath] = useState('');
  const [graphData, setGraphData] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);

  // Application shell navigation state
  const [activeSidebarTab, setActiveSidebarTab] = useState('scanner');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Open workspaces & active workspace state
  const [openWorkspaces, setOpenWorkspaces] = useState(['graph']);
  const [activeWorkspace, setActiveWorkspace] = useState('graph');

  // Selection & Source explorer state

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isSourceOpen, setIsSourceOpen] = useState(false);
  const [sourceRetryCount, setSourceRetryCount] = useState(0);
  const [sourceState, setSourceState] = useState({
    isLoading: false,
    error: null,
    data: null,
  });

  // Resizable panel state
  const [viewerWidth, setViewerWidth] = useState(480);
  const [isDragging, setIsDragging] = useState(false);
  const workspaceRef = useRef(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [clusterNodes, setClusterNodes, onClusterNodesChange] = useNodesState([]);
  const [clusterEdges, setClusterEdges, onClusterEdgesChange] = useEdgesState([]);

  /**
   * Applies selection highlighting to existing React Flow nodes and edges.
   */
  const applyHighlights = useCallback((activeId, baseNodes, baseEdges) => {
    const highlights = computeSelectionHighlights(activeId, baseNodes, baseEdges);

    setNodes((prevNodes) =>
      prevNodes.map((n) => {
        const hState = highlights.nodeHighlightMap.get(n.id) || 'normal';
        return {
          ...n,
          data: {
            ...n.data,
            highlightState: hState,
          },
        };
      })
    );

    setEdges((prevEdges) =>
      prevEdges.map((e) => {
        const edgeState = highlights.edgeHighlightMap.get(e.id) || 'normal';

        if (edgeState === 'outgoing') {
          return {
            ...e,
            zIndex: 10,
            style: { stroke: '#58a6ff', strokeWidth: 2.5 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: '#58a6ff',
            },
          };
        }

        if (edgeState === 'incoming') {
          return {
            ...e,
            zIndex: 10,
            style: { stroke: '#3fb950', strokeWidth: 2.5 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: '#3fb950',
            },
          };
        }

        if (edgeState === 'dimmed') {
          return {
            ...e,
            zIndex: 0,
            style: { stroke: '#30363d', strokeWidth: 1, opacity: 0.25 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 12,
              height: 12,
              color: '#30363d',
            },
          };
        }

        // Normal (no selection active)
        return {
          ...e,
          zIndex: 1,
          style: { stroke: '#58a6ff', strokeWidth: 1.5, opacity: 1 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: '#58a6ff',
          },
        };
      })
    );
    // Apply highlights to Cluster View nodes (child file nodes) and edges
    setClusterNodes((prevNodes) =>
      prevNodes.map((n) => {
        if (n.type === 'clusterGroup') return n;
        const hState = highlights.nodeHighlightMap.get(n.id) || 'normal';
        return {
          ...n,
          data: {
            ...n.data,
            highlightState: hState,
          },
        };
      })
    );

    setClusterEdges((prevEdges) =>
      prevEdges.map((e) => {
        const edgeState = highlights.edgeHighlightMap.get(e.id) || 'normal';

        if (edgeState === 'outgoing') {
          return {
            ...e,
            zIndex: 10,
            style: { stroke: '#58a6ff', strokeWidth: 2.5 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: '#58a6ff',
            },
          };
        }

        if (edgeState === 'incoming') {
          return {
            ...e,
            zIndex: 10,
            style: { stroke: '#3fb950', strokeWidth: 2.5 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: '#3fb950',
            },
          };
        }

        if (edgeState === 'dimmed') {
          return {
            ...e,
            zIndex: 0,
            style: { stroke: '#30363d', strokeWidth: 1, opacity: 0.25 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 12,
              height: 12,
              color: '#30363d',
            },
          };
        }

        return {
          ...e,
          zIndex: 1,
          style: { stroke: '#58a6ff', strokeWidth: 1.5, opacity: 1 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: '#58a6ff',
          },
        };
      })
    );
  }, [setNodes, setEdges, setClusterNodes, setClusterEdges]);

  /**
   * Transforms graph payload and sets up nodes/edges using DAG and Cluster layouts.
   */
  const loadGraphFromPayload = useCallback((payload) => {
    setGraphData(payload);
    setSelectedNodeId(null);
    setIsSourceOpen(false);
    setSourceState({ isLoading: false, error: null, data: null });
    defaultSourceLoader.clearCache();

    if (payload?.rootPath) {
      setRepoPath(payload.rootPath);
    }

    if (!payload || !payload.nodes || payload.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      setClusterNodes([]);
      setClusterEdges([]);
      setOpenWorkspaces([]);
      setActiveWorkspace(null);
      return;
    }

    setOpenWorkspaces((prev) => (prev.includes('graph') ? prev : [...prev, 'graph']));
    setActiveWorkspace('graph');

    const rawNodes = payload.nodes.map((node) => ({
      id: node.id,
      type: 'fileNode',
      data: {
        id: node.id,
        path: node.path,
        name: node.name,
        language: node.language,
        lineCount: node.lineCount,
        size: node.size,
        extension: node.extension,
        highlightState: 'normal',
      },
      position: { x: 0, y: 0 },
    }));

    const rawEdges = (payload.edges || []).map((edge) => ({
      id: edge.id || `edge-${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: 'default',
      style: { stroke: '#58a6ff', strokeWidth: 1.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: '#58a6ff',
      },
      data: {
        kind: edge.kind,
        specifier: edge.specifier,
      },
    }));

    const layout = computeGraphLayout(rawNodes, rawEdges);
    const positionedNodes = Array.isArray(layout) ? layout : (layout?.nodes || []);
    setNodes(positionedNodes);
    setEdges(rawEdges);

    const clusterLayout = computeClusterLayout(rawNodes, rawEdges);
    const positionedClusterNodes = Array.isArray(clusterLayout) ? clusterLayout : (clusterLayout?.nodes || []);
    const positionedClusterEdges = Array.isArray(clusterLayout?.edges) ? clusterLayout.edges : rawEdges;
    setClusterNodes(positionedClusterNodes);
    setClusterEdges(positionedClusterEdges);
  }, [setNodes, setEdges, setClusterNodes, setClusterEdges]);

  /**
   * Check if a repository is already active on initial mount.
   */
  useEffect(() => {
    async function checkActiveGraph() {
      try {
        const res = await fetch('/api/graph');
        if (res.ok) {
          const payload = await res.json();
          loadGraphFromPayload(payload);
        }
      } catch {
        // Active graph unavailable; startup screen remains
      }
    }

    checkActiveGraph();
  }, [loadGraphFromPayload]);

  /**
   * Asynchronously loads source content for the active selectedNodeId.
   * Cancels in-flight work and avoids race conditions via effect cleanup.
   */
  useEffect(() => {
    if (!selectedNodeId) {
      setSourceState({ isLoading: false, error: null, data: null });
      return;
    }

    let isCurrent = true;
    setSourceState({ isLoading: true, error: null, data: null });

    defaultSourceLoader
      .loadSource(selectedNodeId)
      .then(async (result) => {
        if (!isCurrent) return;

        if (result.error) {
          const activeRoot = graphData?.rootPath || repoPath;

          // If server lost in-memory snapshot (e.g. after server restart), attempt automatic re-indexing
          if (result.error.code === 'REPOSITORY_NOT_FOUND' && activeRoot) {
            try {
              const scanRes = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rootPath: activeRoot }),
              });

              if (!isCurrent) return;

              if (scanRes.ok) {
                const retryResult = await defaultSourceLoader.loadSource(selectedNodeId);
                if (!isCurrent) return;

                if (retryResult.error) {
                  setSourceState({ isLoading: false, error: retryResult.error, data: null });
                } else {
                  setSourceState({ isLoading: false, error: null, data: retryResult.data });
                }
                return;
              }
            } catch {
              // Rescan network error - fall through to report original error
            }
          }

          if (!isCurrent) return;
          setSourceState({ isLoading: false, error: result.error, data: null });
        } else {
          setSourceState({ isLoading: false, error: null, data: result.data });
        }
      })
      .catch((err) => {
        if (!isCurrent) return;
        setSourceState({
          isLoading: false,
          error: {
            code: 'NETWORK_ERROR',
            message: err.message || 'Failed to fetch source content',
          },
          data: null,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedNodeId, sourceRetryCount, graphData?.rootPath, repoPath]);

  /**
   * Handles node selection from the canvas.
   * - Clicking any file node automatically expands the source explorer.
   * - Clicking the already-selected node when collapsed reopens the explorer.
   * - Clicking another node updates the explorer without closing it.
   * - Deselection (e.g. clicking canvas background) clears selection and closes explorer.
   */
  const handleSelectNode = useCallback(
    (nodeId) => {
      const next = transitionSelectionState({
        currentSelectedId: selectedNodeId,
        nextSelectedId: nodeId,
        isSourceOpen,
      });

      if (next.selectedNodeId === selectedNodeId && next.isSourceOpen === isSourceOpen) {
        return;
      }

      setSelectedNodeId(next.selectedNodeId);
      setIsSourceOpen(next.isSourceOpen);
      applyHighlights(next.selectedNodeId, nodes, edges);
    },
    [selectedNodeId, isSourceOpen, nodes, edges, applyHighlights]
  );

  /**
   * Handles file selection from the repository file tree.
   * - Sets active file selection.
   * - Automatically opens/updates the source explorer.
   * - If the file has a matching node on the dependency graph, highlights the node and edges.
   * - If the file has no graph node, clears graph node highlights while still displaying source.
   */
  const handleSelectFile = useCallback(
    (filePath) => {
      if (!filePath) return;

      setSelectedNodeId(filePath);
      setIsSourceOpen(true);

      const matchingNode = Array.isArray(nodes) ? nodes.find((n) => n.id === filePath) : null;
      if (matchingNode) {
        applyHighlights(filePath, nodes, edges);
      } else {
        applyHighlights(null, nodes, edges);
      }
    },
    [nodes, edges, applyHighlights]
  );

  /**
   * Manually collapses the source explorer panel, restoring full canvas width.
   * Retains node selection highlight so the user can easily re-expand.
   */
  const handleCollapseSource = useCallback(() => {
    setIsSourceOpen(false);
  }, []);

  /**
   * Manually expands the source explorer panel.
   */
  const handleExpandSource = useCallback(() => {
    setIsSourceOpen(true);
  }, []);

  /**
   * Closes the source explorer and clears selection.
   */
  const handleCloseSource = useCallback(() => {
    setIsSourceOpen(false);
    setSelectedNodeId(null);
    applyHighlights(null, nodes, edges);
  }, [nodes, edges, applyHighlights]);

  /**
   * Retry loading source for currently selected node.
   * If error is REPOSITORY_NOT_FOUND, triggers re-indexing to restore server snapshot.
   */
  const handleRetrySource = useCallback(async () => {
    const activeRoot = graphData?.rootPath || repoPath;
    if (sourceState.error?.code === 'REPOSITORY_NOT_FOUND' && activeRoot) {
      setSourceState({ isLoading: true, error: null, data: null });
      try {
        const scanRes = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rootPath: activeRoot }),
        });
        if (scanRes.ok) {
          setSourceRetryCount((count) => count + 1);
          return;
        }
      } catch {
        // Fall through to retry count
      }
    }
    setSourceRetryCount((count) => count + 1);
  }, [sourceState.error, graphData?.rootPath, repoPath]);

  /**
   * Mouse drag handlers for resizing the source viewer panel.
   */
  const handleSplitterMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);

    const handleMouseMove = (moveEvent) => {
      if (!workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const newWidth = rect.right - moveEvent.clientX;
      const clamped = clampViewerWidth(newWidth, rect.width, 320, 850);
      setViewerWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  /**
   * Keyboard accessibility for resizing the source viewer panel.
   */
  const handleSplitterKeyDown = useCallback((e) => {
    if (!workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setViewerWidth((w) => clampViewerWidth(w + 24, rect.width, 320, 850));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setViewerWidth((w) => clampViewerWidth(w - 24, rect.width, 320, 850));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setViewerWidth(320);
    } else if (e.key === 'End') {
      e.preventDefault();
      setViewerWidth(clampViewerWidth(850, rect.width, 320, 850));
    }
  }, []);

  /**
   * Initiates repository scanning via POST /api/scan, then retrieves graph.
   */
  const handleScan = async () => {
    const trimmedPath = repoPath.trim();
    if (!trimmedPath) {
      setError({
        code: 'INVALID_PATH',
        message: 'Please enter a valid local repository path.',
      });
      return;
    }

    setIsScanning(true);
    setError(null);
    defaultSourceLoader.clearCache();

    try {
      // Step 1: Scan and index repository
      const scanRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: trimmedPath }),
      });

      if (!scanRes.ok) {
        const errorData = await scanRes.json().catch(() => null);
        throw (
          errorData?.error || {
            code: 'SCAN_FAILED',
            message: `Server returned HTTP ${scanRes.status}`,
          }
        );
      }

      // Step 2: Fetch constructed dependency graph
      const graphRes = await fetch('/api/graph');
      if (!graphRes.ok) {
        const graphErrorData = await graphRes.json().catch(() => null);
        throw (
          graphErrorData?.error || {
            code: 'GRAPH_FETCH_FAILED',
            message: 'Failed to retrieve dependency graph after indexing.',
          }
        );
      }

      const payload = await graphRes.json();
      loadGraphFromPayload(payload);
    } catch (err) {
      setError({
        code: err.code || 'SCAN_ERROR',
        message: err.message || 'An error occurred during repository scanning.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Extract repository name from path
  const repoName = useMemo(() => {
    if (!graphData?.rootPath) return null;
    const clean = graphData.rootPath.replace(/[/\\]+$/, '');
    const parts = clean.split(/[/\\]/);
    return parts[parts.length - 1] || clean;
  }, [graphData?.rootPath]);

  // Activity bar tab selection & sidebar toggling
  const handleSelectActivityTab = useCallback(
    (tabId) => {
      const next = transitionActivityBarState({
        currentTab: activeSidebarTab,
        isSidebarOpen,
        clickedTab: tabId,
      });
      setActiveSidebarTab(next.activeTab);
      setIsSidebarOpen(next.isSidebarOpen);
    },
    [activeSidebarTab, isSidebarOpen]
  );

  // Workspace navigation and closing
  const handleSelectWorkspace = useCallback(
    (wsId) => {
      if (wsId === 'graph' && !graphData) {
        // If graph requested without active repository, open scanner tab in sidebar
        setActiveSidebarTab('scanner');
        setIsSidebarOpen(true);
        return;
      }
      setOpenWorkspaces((prev) => (prev.includes(wsId) ? prev : [...prev, wsId]));
      setActiveWorkspace(wsId);
    },
    [graphData]
  );

  const handleCloseWorkspace = useCallback((wsId) => {
    setOpenWorkspaces((prev) => {
      const next = prev.filter((id) => id !== wsId);
      setActiveWorkspace((currentActive) => {
        if (currentActive !== wsId) return currentActive;
        return next.length > 0 ? next[next.length - 1] : null;
      });
      return next;
    });
  }, []);


  // Keyboard shortcut Ctrl+B (or Cmd+B) to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        if (!['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) {
          e.preventDefault();
          setIsSidebarOpen((open) => !open);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Find currently selected node object and incident edge counts
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    if (Array.isArray(nodes)) {
      const found = nodes.find((n) => n.id === selectedNodeId);
      if (found) return found;
    }
    // Fallback for indexed files without graph nodes
    const fileName = selectedNodeId.split('/').pop() || selectedNodeId;
    const extMatch = fileName.match(/\.[^.]+$/);
    return {
      id: selectedNodeId,
      data: {
        id: selectedNodeId,
        path: selectedNodeId,
        name: fileName,
        extension: extMatch ? extMatch[0] : '',
        language: 'text',
      },
    };
  }, [selectedNodeId, nodes]);

  const { incomingCount, outgoingCount } = useMemo(() => {
    if (!selectedNodeId || !Array.isArray(edges)) {
      return { incomingCount: 0, outgoingCount: 0 };
    }
    let inCount = 0;
    let outCount = 0;
    for (const e of edges) {
      if (e.target === selectedNodeId) inCount++;
      if (e.source === selectedNodeId) outCount++;
    }
    return { incomingCount: inCount, outgoingCount: outCount };
  }, [selectedNodeId, edges]);

  return (
    <div className="trailo-explore-app">
      {/* Top Application Bar with Logo, Repo Context, and Window Controls */}
      <AppTitleBar
        repoName={repoName}
        repoPath={graphData?.rootPath || repoPath}
      />

      {/* Middle Container: Activity Bar + Contextual Sidebar + Main Workspace */}
      <div className="shell-middle-container">
        <ActivityBar
          activeTab={activeSidebarTab}
          isSidebarOpen={isSidebarOpen}
          onSelectTab={handleSelectActivityTab}
          summary={graphData?.summary}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
        />

        {isSidebarOpen && (
          <ContextualSidebar
            activeTab={activeSidebarTab}
            onCollapse={() => setIsSidebarOpen(false)}
            repoPath={repoPath}
            setRepoPath={setRepoPath}
            onScan={handleScan}
            isScanning={isScanning}
            graphData={graphData}
            error={error}
            selectedFilePath={selectedNodeId}
            onSelectFile={handleSelectFile}
          />
        )}

        <div className="shell-main-workspace">
          <WorkspaceTabBar
            hasRepository={Boolean(graphData)}
            openWorkspaces={openWorkspaces}
            activeWorkspace={activeWorkspace}
            onSelectWorkspace={handleSelectWorkspace}
            onCloseWorkspace={handleCloseWorkspace}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
            isSourceOpen={isSourceOpen}
            onToggleSource={() => setIsSourceOpen((open) => !open)}
          />

          {!graphData ? (
            <StartupScreen />
          ) : !activeWorkspace || openWorkspaces.length === 0 ? (
            <StartupScreen />
          ) : activeWorkspace === 'ask' ? (
            <div className="workspace-placeholder" role="region" aria-label="Ask Trailo Workspace">
              <div className="workspace-placeholder-content">
                <div className="placeholder-icon-badge">
                  <AskTrailoIcon size={32} />
                </div>
                <h2 className="placeholder-title">Ask Trailo</h2>
                <p className="placeholder-desc">Get code-grounded answers from AI.</p>
                <div className="placeholder-status-pill">Phase 5 — Codebase Q&amp;A Vertical Slice</div>
              </div>
            </div>
          ) : (
            <main
              ref={workspaceRef}
              className={`explore-workspace ${isDragging ? 'workspace-resizing' : ''}`}
            >
              <div className="workspace-center-canvas">
                {activeWorkspace === 'cluster' ? (
                  <ClusterCanvas
                    nodes={clusterNodes}
                    edges={clusterEdges}
                    onNodesChange={onClusterNodesChange}
                    onEdgesChange={onClusterEdgesChange}
                    graphData={graphData}
                    isScanning={isScanning}
                    error={error}
                    onDismissError={() => setError(null)}
                    onNodeClick={handleSelectNode}
                    onPaneClick={() => handleSelectNode(null)}
                  />
                ) : (
                  <GraphCanvas
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    graphData={graphData}
                    isScanning={isScanning}
                    error={error}
                    onDismissError={() => setError(null)}
                    onNodeClick={handleSelectNode}
                    onPaneClick={() => handleSelectNode(null)}
                  />
                )}
              </div>


              {graphData && graphData.nodes && graphData.nodes.length > 0 && isSourceOpen && (
                <>
                  <div
                    className={`workspace-splitter ${isDragging ? 'is-dragging' : ''}`}
                    role="separator"
                    aria-orientation="vertical"
                    aria-valuenow={viewerWidth}
                    aria-valuemin={320}
                    aria-valuemax={850}
                    aria-label="Resize source viewer panel"
                    tabIndex={0}
                    onMouseDown={handleSplitterMouseDown}
                    onKeyDown={handleSplitterKeyDown}
                  />
                  <SourceViewer
                    selectedNode={selectedNode}
                    sourceState={sourceState}
                    onRetry={handleRetrySource}
                    onClose={handleCloseSource}
                    onCollapse={handleCollapseSource}
                    incomingCount={incomingCount}
                    outgoingCount={outgoingCount}
                    width={viewerWidth}
                  />
                </>
              )}

              {graphData && graphData.nodes && graphData.nodes.length > 0 && !isSourceOpen && (
                <button
                  type="button"
                  className="btn-expand-explorer"
                  onClick={handleExpandSource}
                  title={selectedNode ? `Expand source explorer (${selectedNode.data.name})` : 'Expand source explorer'}
                  aria-label="Expand source explorer"
                >
                  <span className="expand-icon" aria-hidden="true">‹</span>
                  <span className="expand-label">Source</span>
                </button>
              )}
            </main>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <AppStatusBar
        repoName={repoName}
        summary={graphData?.summary}
        selectedNode={selectedNode}
      />
    </div>
  );
}
