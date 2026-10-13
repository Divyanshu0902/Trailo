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
      badge: null,
    },
    {
      id: 'files',
      label: 'Repository Files',
      icon: FilesIcon,
      badge: summary?.totalNodes ?? null,
    },
    {
      id: 'internal',
      label: 'Internal Dependencies',
      icon: InternalDepIcon,
      badge: summary?.totalEdges ?? null,
    },
    {
      id: 'external',
      label: 'External Dependencies',
      icon: ExternalDepIcon,
      badge: summary?.externalCount ? summary.externalCount : null,
    },
    {
      id: 'unresolved',
      label: 'Unresolved Dependencies',
      icon: UnresolvedDepIcon,
      badge: summary?.unresolvedCount ? summary.unresolvedCount : null,
      isWarning: Boolean(summary?.unresolvedCount),
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
                <IconComponent size={23} className="activity-icon" />
                {tab.badge !== null && tab.badge > 0 && (
                  <span
                    className={`activity-badge ${tab.isWarning ? 'badge-warning' : ''}`}
                    title={`${tab.badge} items`}
                  >
                    {tab.badge > 999 ? '999+' : tab.badge}
                  </span>
                )}
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
                <IconComponent size={23} className="activity-icon" />
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
