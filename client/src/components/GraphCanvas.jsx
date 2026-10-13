import React, { useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileNode } from './FileNode.jsx';

export function GraphCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  graphData,
  isScanning,
  error,
  onDismissError,
}) {
  const nodeTypes = useMemo(() => ({ fileNode: FileNode }), []);

  const hasNodes = nodes && nodes.length > 0;
  const hasEdges = edges && edges.length > 0;
  const summary = graphData?.summary;

  return (
    <div className="graph-canvas-container">
      {/* 1. In-flight Loading Overlay */}
      {isScanning && (
        <div className="canvas-overlay loading-overlay" role="status" aria-live="polite">
          <div className="spinner large-spinner" />
          <h3 className="overlay-title">Scanning and indexing repository...</h3>
          <p className="overlay-desc">
            Discovering files, parsing JavaScript/TypeScript ASTs, and resolving dependencies.
          </p>
        </div>
      )}

      {/* 2. Structured Error Card Overlay */}
      {!isScanning && error && (
        <div className="canvas-overlay error-overlay" role="alert">
          <div className="error-card">
            <div className="error-header">
              <span className="error-icon" role="img" aria-label="warning">⚠️</span>
              <div className="error-title-group">
                <h3 className="error-heading">Indexing Failed</h3>
                <span className="error-badge">{error.code || 'ERROR'}</span>
              </div>
            </div>
            <p className="error-message">{error.message || 'An unexpected error occurred while indexing.'}</p>
            <div className="error-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onDismissError}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Empty State (No Repository Indexed) */}
      {!isScanning && !error && !hasNodes && (
        <div className="canvas-overlay empty-overlay">
          <div className="empty-card">
            <div className="empty-icon" role="img" aria-label="compass">🧭</div>
            <h2 className="empty-heading">No Repository Indexed</h2>
            <p className="empty-desc">
              Enter an absolute local repository path in the search bar above and click{' '}
              <strong>Scan &amp; Index</strong> to map dependencies.
            </p>
            <div className="examples-container">
              <span className="examples-header">Example paths:</span>
              <ul className="examples-list">
                <li><code>C:\Users\dev\projects\my-express-api</code></li>
                <li><code>/home/dev/repos/web-application</code></li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 4. Truthful Banner when Files Exist but Zero Internal Edges */}
      {!isScanning && !error && hasNodes && !hasEdges && (
        <div className="canvas-banner info-banner" role="status">
          <div className="banner-content">
            <span className="banner-icon" role="img" aria-label="info">ℹ️</span>
            <span className="banner-main-text">
              No resolved internal dependencies detected in this repository.
            </span>
            {summary && summary.externalCount > 0 && (
              <span className="banner-subtext">
                • {summary.externalCount} external packages referenced.
              </span>
            )}
            {summary && summary.unresolvedCount > 0 && (
              <span className="banner-subtext">
                • {summary.unresolvedCount} unresolved imports detected.
              </span>
            )}
          </div>
        </div>
      )}

      {/* 5. Interactive React Flow Canvas */}
      {hasNodes && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.05}
          maxZoom={2}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          proOptions={{ hideAttribution: true }}
          className="trailo-flow"
        >
          <Controls showInteractive={false} className="trailo-controls" />
          <Background color="#30363d" gap={20} size={1} />
          <MiniMap
            nodeColor="#30363d"
            maskColor="rgba(13, 17, 23, 0.75)"
            className="trailo-minimap"
            zoomable
            pannable
          />
        </ReactFlow>
      )}
    </div>
  );
}
