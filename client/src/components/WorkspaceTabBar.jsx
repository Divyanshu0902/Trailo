import React from 'react';
import { GraphIcon, SidebarIcon, SourceIcon } from './Icons.jsx';

/**
 * Top workspace bar for tabs and workspace navigation.
 * Displays the Dependency Graph tab when a repository is loaded into memory.
 */
export function WorkspaceTabBar({
  hasRepository = false,
  isSidebarOpen = true,
  onToggleSidebar = () => {},
  isSourceOpen = false,
  onToggleSource = () => {},
}) {
  return (
    <div className="shell-workspace-tab-bar" role="tablist" aria-label="Workspace Tabs">
      <div className="tab-bar-tabs">
        {hasRepository && (
          <button
            type="button"
            className="workspace-tab active"
            role="tab"
            aria-selected={true}
            title="Interactive Dependency Graph Workspace"
          >
            <GraphIcon size={13} className="tab-icon" />
            <span className="tab-title">Dependency Graph</span>
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

        {/* Toggle source inspector (only applicable when repository is loaded) */}
        {hasRepository && (
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
