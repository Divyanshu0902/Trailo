import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import { ExploreHeader } from './components/ExploreHeader.jsx';
import { GraphCanvas } from './components/GraphCanvas.jsx';
import { SourceViewer } from './components/SourceViewer.jsx';
import { computeGraphLayout } from './utils/layout.js';
import { computeSelectionHighlights } from './utils/graphSelection.js';
import { defaultSourceLoader } from './utils/sourceLoader.js';
import { clampViewerWidth } from './utils/sourceHighlighter.js';
import './App.css';

export default function App() {
  const [repoPath, setRepoPath] = useState('');
  const [graphData, setGraphData] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);

  // Selection & Source state
  const [selectedNodeId, setSelectedNodeId] = useState(null);
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
  }, [setNodes, setEdges]);

  /**
   * Transforms graph payload and sets up nodes/edges using DAG layout.
   */
  const loadGraphFromPayload = useCallback((payload) => {
    setGraphData(payload);
    setSelectedNodeId(null);
    setSourceState({ isLoading: false, error: null, data: null });
    defaultSourceLoader.clearCache();

    if (payload?.rootPath) {
      setRepoPath(payload.rootPath);
    }

    if (!payload || !payload.nodes || payload.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

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
  }, [setNodes, setEdges]);

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
        // Active graph unavailable; stays in empty startup state
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
      .then((result) => {
        if (!isCurrent) return;

        if (result.error) {
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
  }, [selectedNodeId, sourceRetryCount]);

  /**
   * Handles node selection from the canvas.
   * Sticky selection: Clicking the already-selected node retains selection.
   * Deselection only happens when explicitly passed null (e.g. clicking canvas background or close button).
   */
  const handleSelectNode = useCallback((nodeId) => {
    if (!nodeId) {
      setSelectedNodeId(null);
      applyHighlights(null, nodes, edges);
      return;
    }

    if (nodeId === selectedNodeId) {
      return;
    }

    setSelectedNodeId(nodeId);
    applyHighlights(nodeId, nodes, edges);
  }, [selectedNodeId, nodes, edges, applyHighlights]);

  /**
   * Retry loading source for currently selected node.
   */
  const handleRetrySource = useCallback(() => {
    setSourceRetryCount((count) => count + 1);
  }, []);

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
      setGraphData(null);
      setNodes([]);
      setEdges([]);
      setSelectedNodeId(null);
      setSourceState({ isLoading: false, error: null, data: null });
      setError({
        code: err.code || 'SCAN_ERROR',
        message: err.message || 'An error occurred during repository scanning.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Find currently selected node object and incident edge counts
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !Array.isArray(nodes)) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
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
      <ExploreHeader
        repoPath={repoPath}
        setRepoPath={setRepoPath}
        onScan={handleScan}
        isScanning={isScanning}
        graphData={graphData}
      />

      <main
        ref={workspaceRef}
        className={`explore-workspace ${isDragging ? 'workspace-resizing' : ''}`}
      >
        <div className="workspace-center-canvas">
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
        </div>

        {graphData && graphData.nodes && graphData.nodes.length > 0 && (
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
              onClose={() => handleSelectNode(null)}
              incomingCount={incomingCount}
              outgoingCount={outgoingCount}
              width={viewerWidth}
            />
          </>
        )}
      </main>

      <footer className="explore-footer">
        <span className="footer-brand">Trailo</span>
        <span className="footer-sep">•</span>
        <span className="footer-tagline">Local-first repository explorer</span>
        <span className="footer-sep">•</span>
        <span className="footer-evidence">Verified AST dependency graphs</span>
      </footer>
    </div>
  );
}
