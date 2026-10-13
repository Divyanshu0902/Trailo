import React from 'react';
import { GraphIcon, SourceIcon } from './Icons.jsx';

/**
 * Top workspace bar reserved for editor tabs and workspace navigation.
 * Sits directly above the main canvas / editor area.
 */
export function WorkspaceTabBar({
  selectedNode,
  repoName,
  isSourceOpen,
  onToggleSource,
}) {
  return (
    <div className="shell-workspace-tab-bar" role="tablist" aria-label="Workspace Tabs">
      <div className="tab-bar-tabs">
        <div className="workspace-tab active" role="tab" aria-selected="true">
          <GraphIcon size={15} className="tab-icon" />
          <span className="tab-title">Dependency Graph</span>
        </div>
      </div>

      <div className="tab-bar-breadcrumbs">
        {repoName && (
          <span className="breadcrumb-item breadcrumb-repo">{repoName}</span>
        )}
        {selectedNode && (
          <>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-item breadcrumb-active-file" title={selectedNode.data?.path}>
              {selectedNode.data?.name || selectedNode.id}
            </span>
          </>
        )}
      </div>

      <div className="tab-bar-actions">
        <button
          type="button"
          className={`tab-action-btn ${isSourceOpen ? 'active' : ''}`}
          onClick={onToggleSource}
          title={isSourceOpen ? 'Hide Source Viewer' : 'Show Source Viewer'}
          aria-label="Toggle Source Viewer"
        >
          <SourceIcon size={14} />
          <span className="tab-action-label">Source</span>
        </button>
      </div>
    </div>
  );
}

