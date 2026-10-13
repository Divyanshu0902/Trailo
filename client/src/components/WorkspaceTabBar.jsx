import React from 'react';
import { GraphIcon, SidebarIcon, SourceIcon } from './Icons.jsx';

/**
 * Top workspace bar reserved for editor tabs and workspace navigation.
 * Sits directly above the main canvas / editor area.
 */
export function WorkspaceTabBar({
  isSidebarOpen,
  onToggleSidebar,
  isSourceOpen,
  onToggleSource,
}) {
  return (
    <div className="shell-workspace-tab-bar" role="tablist" aria-label="Workspace Tabs">
      <div className="tab-bar-tabs">
        <div className="workspace-tab active" role="tab" aria-selected="true">
          <GraphIcon size={13} className="tab-icon" />
          <span className="tab-title">Dependency Graph</span>
        </div>
      </div>

      <div className="tab-bar-actions">
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
      </div>
    </div>
  );
}

