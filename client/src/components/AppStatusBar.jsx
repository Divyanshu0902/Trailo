import React from 'react';
import { FolderIcon } from './Icons.jsx';

/**
 * Bottom status bar adhering to developer-tool conventions.
 */
export function AppStatusBar({
  repoName,
  summary,
  selectedNode,
}) {
  return (
    <footer className="shell-status-bar" role="contentinfo" aria-label="Status Bar">
      <div className="status-bar-left">
        <div className="status-item status-repo">
          <FolderIcon size={12} className="status-icon" />
          <span>{repoName || 'No repository open'}</span>
        </div>

        {summary && (
          <>
            <div className="status-separator" />
            <div className="status-item">
              <span>{summary.totalNodes} files</span>
            </div>
            <div className="status-separator" />
            <div className="status-item">
              <span>{summary.totalEdges} internal edges</span>
            </div>
          </>
        )}

        {selectedNode && (
          <>
            <div className="status-separator" />
            <div className="status-item status-selected" title={selectedNode.data?.path}>
              <span>Active: {selectedNode.data?.name || selectedNode.id}</span>
            </div>
          </>
        )}
      </div>

      <div className="status-bar-right">
        <div className="status-item">
          <span>AST Graph</span>
        </div>
        <div className="status-separator" />
        <div className="status-item">
          <span>Local-first</span>
        </div>
        <div className="status-separator" />
        <div className="status-item status-brand">
          <span>Trailo</span>
        </div>
      </div>
    </footer>
  );
}

