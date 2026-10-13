import React, { useState, useEffect, useCallback } from 'react';
import { useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import { ExploreHeader } from './components/ExploreHeader.jsx';
import { GraphCanvas } from './components/GraphCanvas.jsx';
import { computeGraphLayout } from './utils/layout.js';
import './App.css';

export default function App() {
  const [repoPath, setRepoPath] = useState('');
  const [graphData, setGraphData] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  /**
   * Transforms raw backend graph payload into React Flow nodes and directed edges.
   */
  const loadGraphFromPayload = useCallback((payload) => {
    if (!payload || !Array.isArray(payload.nodes)) {
      setNodes([]);
      setEdges([]);
      setGraphData(null);
      return;
    }

    const layoutedNodes = computeGraphLayout(payload.nodes, payload.edges || []);

    const rfNodes = layoutedNodes.map((n) => ({
      id: n.id,
      type: 'fileNode',
      position: n.position,
      data: {
        name: n.name,
        path: n.path,
        language: n.language,
        lineCount: n.lineCount,
        size: n.size,
        extension: n.extension,
      },
    }));

    const rfEdges = (payload.edges || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: '#58a6ff',
      },
      style: {
        stroke: '#58a6ff',
        strokeWidth: 1.5,
      },
      data: {
        specifier: e.specifier,
        kind: e.kind,
        sourceLocation: e.sourceLocation,
      },
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
    setGraphData(payload);
    if (payload.rootPath) {
      setRepoPath(payload.rootPath);
    }
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

  return (
    <div className="trailo-explore-app">
      <ExploreHeader
        repoPath={repoPath}
        setRepoPath={setRepoPath}
        onScan={handleScan}
        isScanning={isScanning}
        graphData={graphData}
      />

      <main className="explore-workspace">
        <GraphCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          graphData={graphData}
          isScanning={isScanning}
          error={error}
          onDismissError={() => setError(null)}
        />
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
