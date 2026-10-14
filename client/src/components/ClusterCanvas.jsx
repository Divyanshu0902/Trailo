import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileNode } from './FileNode.jsx';
import { StarNode } from './StarNode.jsx';
import { ClusterGroupNode } from './ClusterGroupNode.jsx';
import { ClusterIcon } from './Icons.jsx';

function formatBytes(bytes) {
  if (!bytes || typeof bytes !== 'number') return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ClusterCanvas — Dedicated interactive graph canvas for Constellation Cluster View.
 * Renders repository code organized into circular celestial clusters and subclusters
 * with orbiting star nodes, constellation line connectors, cursor hover popovers,
 * and synchronized source inspection.
 */
export function ClusterCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  graphData,
  isScanning,
  error,
  onDismissError,
  onNodeClick,
  onPaneClick,
}) {
  const containerRef = useRef(null);
  const [hoveredStar, setHoveredStar] = useState(null);

  const nodeTypes = useMemo(
    () => ({
      starNode: StarNode,
      fileNode: FileNode,
      clusterGroup: ClusterGroupNode,
    }),
    []
  );

  const hasNodes = nodes && nodes.length > 0;

  const handleNodeClick = (_event, node) => {
    // Only file or star nodes trigger source code inspection; cluster containers do not
    if (node && (node.type === 'starNode' || node.type === 'fileNode') && onNodeClick) {
      onNodeClick(node.id);
    }
  };

  const handlePaneClick = () => {
    setHoveredStar(null);
    if (onPaneClick) {
      onPaneClick();
    }
  };

  const handleNodeMouseEnter = useCallback((event, node) => {
    if (node && (node.type === 'starNode' || node.type === 'fileNode')) {
      const rect = containerRef.current?.getBoundingClientRect();
      const offsetX = rect ? event.clientX - rect.left : event.clientX;
      const offsetY = rect ? event.clientY - rect.top : event.clientY;

      setHoveredStar({
        data: node.data,
        x: offsetX,
        y: offsetY,
      });
    }
  }, []);

  const handleNodeMouseMove = useCallback((event, node) => {
    if (node && (node.type === 'starNode' || node.type === 'fileNode')) {
      const rect = containerRef.current?.getBoundingClientRect();
      const offsetX = rect ? event.clientX - rect.left : event.clientX;
      const offsetY = rect ? event.clientY - rect.top : event.clientY;

      setHoveredStar((prev) => (prev ? { ...prev, x: offsetX, y: offsetY } : null));
    }
  }, []);

  const handleNodeMouseLeave = useCallback((_event, node) => {
    if (node && (node.type === 'starNode' || node.type === 'fileNode')) {
      setHoveredStar(null);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="graph-canvas-container cluster-canvas-container"
    >
      {/* 1. In-flight Loading Overlay */}
      {isScanning && (
        <div className="canvas-overlay loading-overlay" role="status" aria-live="polite">
          <div className="spinner large-spinner" />
          <h3 className="overlay-title">Scanning and indexing repository...</h3>
          <p className="overlay-desc">
            Discovering files and grouping architecture into circular constellation clusters.
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
            <div className="empty-icon">
              <ClusterIcon size={40} />
            </div>
            <h2 className="empty-heading">No Clusters Available</h2>
            <p className="empty-desc">
              Scan and index a local repository to visualize code organized into circular constellation clusters.
            </p>
          </div>
        </div>
      )}

      {/* 4. Interactive React Flow Canvas */}
      {hasNodes && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onNodeMouseEnter={handleNodeMouseEnter}
          onNodeMouseMove={handleNodeMouseMove}
          onNodeMouseLeave={handleNodeMouseLeave}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.05}
          maxZoom={2}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          proOptions={{ hideAttribution: true }}
          className="trailo-flow trailo-cluster-flow"
        >
          <Controls showInteractive={false} className="trailo-controls" />
          <Background color="#1f242c" gap={24} size={1} />
          <MiniMap
            nodeColor={(n) => (n.type === 'clusterGroup' ? 'rgba(88, 166, 255, 0.12)' : (n.data?.starColor || '#58a6ff'))}
            maskColor="rgba(13, 17, 23, 0.75)"
            className="trailo-minimap"
            zoomable
            pannable
          />
        </ReactFlow>
      )}

      {/* 5. Floating Star Hover Popover / Tooltip */}
      {hoveredStar && (
        <div
          className="constellation-cursor-tooltip"
          style={{
            transform: `translate3d(${hoveredStar.x + 14}px, ${hoveredStar.y + 14}px, 0)`,
          }}
          role="tooltip"
          aria-hidden="false"
        >
          <div className="star-tooltip-header">
            <span
              className="star-tooltip-dot"
              style={{ backgroundColor: hoveredStar.data?.starColor || '#58a6ff' }}
            />
            <span className="star-tooltip-name">
              {hoveredStar.data?.name || hoveredStar.data?.path}
            </span>
            {hoveredStar.data?.language && (
              <span className="star-tooltip-lang-badge">
                {hoveredStar.data.language.toUpperCase()}
              </span>
            )}
          </div>

          <div className="star-tooltip-path">
            {hoveredStar.data?.path}
          </div>

          <div className="star-tooltip-meta">
            <span>{hoveredStar.data?.lineCount ?? 0} lines</span>
            <span className="star-tooltip-meta-sep">•</span>
            <span>{formatBytes(hoveredStar.data?.size)}</span>
            {hoveredStar.data?.clusterLabel && (
              <>
                <span className="star-tooltip-meta-sep">•</span>
                <span className="star-tooltip-cluster">✦ {hoveredStar.data.clusterLabel}</span>
              </>
            )}
          </div>

          <div className="star-tooltip-hint">
            Click star to inspect source code
          </div>
        </div>
      )}
    </div>
  );
}
export default ClusterCanvas;
