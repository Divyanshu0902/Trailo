import React from 'react';
import {
  ScanIcon,
  FilesIcon,
  InternalDepIcon,
  ExternalDepIcon,
  UnresolvedDepIcon,
  GraphIcon,
  ClusterIcon,
  AskTrailoIcon,
} from './Icons.jsx';

/**
 * Narrow, persistent activity bar on the far-left of the application shell.
 * Never collapses; clicking top items toggles contextual sidebar,
 * clicking bottom items navigates/re-opens workspaces.
 */
export function ActivityBar({
  activeTab,
  isSidebarOpen,
  onSelectTab,
  summary,
  activeWorkspace,
  onSelectWorkspace,
}) {
  const tabs = [
    {
      id: 'scanner',
      label: 'Repository Scanner',
      icon: ScanIcon,
    },
    {
      id: 'files',
      label: 'Repository Files',
      icon: FilesIcon,
    },
    {
      id: 'internal',
      label: 'Internal Dependencies',
      icon: InternalDepIcon,
    },
    {
      id: 'external',
      label: 'External Dependencies',
      icon: ExternalDepIcon,
    },
    {
      id: 'unresolved',
      label: 'Unresolved Dependencies',
      icon: UnresolvedDepIcon,
    },
  ];

  const bottomWorkspaces = [
    {
      id: 'graph',
      label: 'Dependency Graph',
      icon: GraphIcon,
    },
    {
      id: 'cluster',
      label: 'Cluster View',
      icon: ClusterIcon,
    },
    {
      id: 'ask',
      label: 'Ask Trailo',
      icon: AskTrailoIcon,
    },
  ];

  return (
    <nav className="shell-activity-bar" aria-label="Activity Bar">
      <div className="activity-bar-items activity-bar-top">
        {tabs.map((tab) => {
          const IconComponent = tab.icon;
          const isActive = isSidebarOpen && activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              className={`activity-bar-button ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              aria-pressed={isActive}
            >
              <div className="activity-icon-wrapper">
                <IconComponent size={28} className="activity-icon" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="activity-bar-items activity-bar-bottom">
        {bottomWorkspaces.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeWorkspace === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`activity-bar-button ${isActive ? 'active' : ''}`}
              onClick={() => onSelectWorkspace && onSelectWorkspace(item.id)}
              title={item.label}
              aria-label={item.label}
              aria-pressed={isActive}
            >
              <div className="activity-icon-wrapper">
                <IconComponent size={28} className="activity-icon" />
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
