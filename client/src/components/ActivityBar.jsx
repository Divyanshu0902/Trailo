import React from 'react';
import {
  ScanIcon,
  FilesIcon,
  InternalDepIcon,
  ExternalDepIcon,
  UnresolvedDepIcon,
} from './Icons.jsx';

/**
 * Narrow, persistent activity bar on the far-left of the application shell.
 * Never collapses; clicking active item toggles contextual sidebar.
 */
export function ActivityBar({
  activeTab,
  isSidebarOpen,
  onSelectTab,
  summary,
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

  return (
    <nav className="shell-activity-bar" aria-label="Activity Bar">
      <div className="activity-bar-items">
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
                <IconComponent size={20} className="activity-icon" />
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
    </nav>
  );
}

