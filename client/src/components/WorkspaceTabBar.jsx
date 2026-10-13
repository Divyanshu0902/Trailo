import React from 'react';
import {
  GraphIcon,
  ClusterIcon,
  AskTrailoIcon,
  SidebarIcon,
  SourceIcon,
  CloseIcon,
} from './Icons.jsx';

/**
 * Top workspace bar for tabs and workspace navigation.
 * Displays tabs for open workspaces with close buttons.
 */
export function WorkspaceTabBar({
  hasRepository = false,
  openWorkspaces = ['graph'],
  activeWorkspace = 'graph',
  onSelectWorkspace = () => {},
  onCloseWorkspace = () => {},
  isSidebarOpen = true,
  onToggleSidebar = () => {},
  isSourceOpen = false,
  onToggleSource = () => {},
}) {
  return (
    <div className="shell-workspace-tab-bar" role="tablist" aria-label="Workspace Tabs">
      <div className="tab-bar-tabs">
        {hasRepository && openWorkspaces.includes('graph') && (
          <button
            type="button"
            className={`workspace-tab ${activeWorkspace === 'graph' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeWorkspace === 'graph'}
            onClick={() => onSelectWorkspace('graph')}
            title="Interactive Dependency Graph Workspace"
          >
            <GraphIcon size={13} className="tab-icon" />
            <span className="tab-title">Dependency Graph</span>
            <span
              className="tab-close-btn"
              role="button"
              tabIndex={0}
              title="Close Workspace"
              aria-label="Close Dependency Graph"
              onClick={(e) => {
                e.stopPropagation();
                onCloseWorkspace('graph');
              }}
            >
              <CloseIcon size={11} />
            </span>
          </button>
        )}

        {openWorkspaces.includes('cluster') && (
          <button
            type="button"
            className={`workspace-tab ${activeWorkspace === 'cluster' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeWorkspace === 'cluster'}
            onClick={() => onSelectWorkspace('cluster')}
            title="Cluster View Workspace"
          >
            <ClusterIcon size={13} className="tab-icon" />
            <span className="tab-title">Cluster View</span>
            <span
              className="tab-close-btn"
              role="button"
              tabIndex={0}
              title="Close Workspace"
              aria-label="Close Cluster View"
              onClick={(e) => {
                e.stopPropagation();
                onCloseWorkspace('cluster');
              }}
            >
              <CloseIcon size={11} />
            </span>
          </button>
        )}

        {openWorkspaces.includes('ask') && (
          <button
            type="button"
            className={`workspace-tab ${activeWorkspace === 'ask' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeWorkspace === 'ask'}
            onClick={() => onSelectWorkspace('ask')}
            title="Ask Trailo Workspace"
          >
            <AskTrailoIcon size={13} className="tab-icon" />
            <span className="tab-title">Ask Trailo</span>
            <span
              className="tab-close-btn"
              role="button"
              tabIndex={0}
              title="Close Workspace"
              aria-label="Close Ask Trailo"
              onClick={(e) => {
                e.stopPropagation();
                onCloseWorkspace('ask');
              }}
            >
              <CloseIcon size={11} />
            </span>
          </button>
        )}
      </div>

      <div className="tab-bar-actions">
        {/* Toggle contextual sidebar */}
        <button
          type="button"
          className={`tab-action-btn ${isSidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title={isSidebarOpen ? 'Collapse Primary Side Bar (Ctrl+B)' : 'Expand Primary Side Bar (Ctrl+B)'}
          aria-label="Toggle Primary Side Bar"
          aria-pressed={isSidebarOpen}
        >
          <SidebarIcon size={14} />
        </button>

        {/* Toggle source inspector (only applicable when repository is loaded and graph is active) */}
        {hasRepository && activeWorkspace === 'graph' && (
          <button
            type="button"
            className={`tab-action-btn ${isSourceOpen ? 'active' : ''}`}
            onClick={onToggleSource}
            title={isSourceOpen ? 'Collapse Source Inspector' : 'Expand Source Inspector'}
            aria-label="Toggle Source Inspector"
            aria-pressed={isSourceOpen}
          >
            <SourceIcon size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
