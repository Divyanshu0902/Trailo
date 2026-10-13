import React from 'react';
import { SidebarIcon, SourceIcon, FolderIcon } from './Icons.jsx';
import logoImg from '../../../assets/logo.png';

/**
 * Top application bar matching VS Code title bar conventions.
 * Features the official product logo, repository context, and layout toggles.
 */
export function AppTitleBar({
  repoName,
  repoPath,
  isSidebarOpen,
  onToggleSidebar,
  isSourceOpen,
  onToggleSource,
}) {
  return (
    <header className="shell-titlebar">
      <div className="titlebar-left">
        <div className="titlebar-brand" title="Trailo — Codebase Understanding">
          <img src={logoImg} alt="Trailo Logo" className="titlebar-logo-img" />
          <span className="titlebar-brand-name">Trailo</span>
        </div>

        {repoName ? (
          <div className="titlebar-repo-pill" title={repoPath}>
            <FolderIcon size={14} className="titlebar-repo-icon" />
            <span className="titlebar-repo-text">{repoName}</span>
          </div>
        ) : (
          <span className="titlebar-empty-tag">No folder opened</span>
        )}
      </div>

      <div className="titlebar-center">
        <span className="titlebar-window-title">
          {repoName ? `${repoName} — Trailo` : 'Trailo — Understand Any Codebase Faster'}
        </span>
      </div>

      <div className="titlebar-right">
        <button
          type="button"
          className={`titlebar-action-btn ${isSidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title={isSidebarOpen ? 'Collapse Primary Side Bar' : 'Expand Primary Side Bar'}
          aria-label="Toggle Primary Side Bar"
          aria-pressed={isSidebarOpen}
        >
          <SidebarIcon size={16} />
        </button>

        <button
          type="button"
          className={`titlebar-action-btn ${isSourceOpen ? 'active' : ''}`}
          onClick={onToggleSource}
          title={isSourceOpen ? 'Collapse Source Inspector' : 'Expand Source Inspector'}
          aria-label="Toggle Source Inspector"
          aria-pressed={isSourceOpen}
        >
          <SourceIcon size={16} />
        </button>
      </div>
    </header>
  );
}

