import React from 'react';
import {
  ScanIcon,
  FilesIcon,
  InternalDepIcon,
  ExternalDepIcon,
  UnresolvedDepIcon,
  ChevronLeftIcon,
  FolderIcon,
} from './Icons.jsx';
import { FileTree } from './FileTree.jsx';
import { InternalDepsList } from './InternalDepsList.jsx';
import { ExternalDepsList } from './ExternalDepsList.jsx';
import { UnresolvedDepsList } from './UnresolvedDepsList.jsx';

/**
 * Contextual sidebar immediately adjacent to the activity bar.
 * Adapts its content to the selected activity category.
 */
export function ContextualSidebar({
  activeTab,
  onCollapse,
  repoPath,
  setRepoPath,
  onScan,
  isScanning,
  graphData,
  error,
  selectedFilePath = null,
  onSelectFile = () => {},
}) {
  const summary = graphData?.summary;
  const repoName = graphData?.rootPath
    ? graphData.rootPath.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
    : null;

  const handleSubmitScan = (e) => {
    e.preventDefault();
    onScan();
  };

  return (
    <aside className="shell-contextual-sidebar" aria-label="Contextual Sidebar">
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="sidebar-header-title-row">
          <span className="sidebar-header-title">
            {activeTab === 'scanner' && 'REPOSITORY SCANNER'}
            {activeTab === 'files' && 'REPOSITORY FILES'}
            {activeTab === 'internal' && 'INTERNAL DEPENDENCIES'}
            {activeTab === 'external' && 'EXTERNAL PACKAGES'}
            {activeTab === 'unresolved' && 'UNRESOLVED IMPORTS'}
          </span>
        </div>

        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onCollapse}
          title="Collapse Side Bar (Ctrl+B)"
          aria-label="Collapse Side Bar"
        >
          <ChevronLeftIcon size={16} />
        </button>
      </div>

      {/* Sidebar Content Area */}
      <div className={`sidebar-body ${activeTab === 'files' ? 'sidebar-body-files' : ''} ${activeTab !== 'scanner' ? 'sidebar-body-deps' : ''}`}>
        {/* 1. Repository Scanner Category */}
        {activeTab === 'scanner' && (
          <div className="sidebar-section">
            <form className="sidebar-scan-form" onSubmit={handleSubmitScan}>
              <div className="form-group">
                <label htmlFor="sidebar-repo-input" className="form-label">
                  Local Folder Path
                </label>
                <input
                  id="sidebar-repo-input"
                  type="text"
                  className="sidebar-input"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="e.g. D:\Projects\repo or /home/dev/repo"
                  disabled={isScanning}
                  spellCheck="false"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block btn-scan-sidebar"
                disabled={isScanning || !repoPath.trim()}
              >
                {isScanning ? (
                  <>
                    <span className="spinner-inline" />
                    <span>Indexing Repository...</span>
                  </>
                ) : (
                  <>
                    <ScanIcon size={16} />
                    <span>Scan &amp; Index</span>
                  </>
                )}
              </button>
            </form>

            {error && (
              <div className="sidebar-error-card">
                <span className="sidebar-error-badge">{error.code || 'SCAN_ERROR'}</span>
                <p className="sidebar-error-message">{error.message}</p>
              </div>
            )}

            {graphData && (
              <div className="sidebar-repo-meta">
                <div className="meta-item">
                  <span className="meta-label">Active Project:</span>
                  <span className="meta-value" title={graphData.rootPath}>
                    <FolderIcon size={14} className="inline-icon" />
                    {repoName}
                  </span>
                </div>
                <div className="meta-stats-grid">
                  <div className="stat-box">
                    <span className="stat-number">{summary?.totalNodes ?? 0}</span>
                    <span className="stat-title">Files</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-number">{summary?.totalEdges ?? 0}</span>
                    <span className="stat-title">Edges</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-number">{summary?.externalCount ?? 0}</span>
                    <span className="stat-title">External</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-number">{summary?.unresolvedCount ?? 0}</span>
                    <span className="stat-title">Unresolved</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Repository Files Category */}
        {activeTab === 'files' && (
          <div className="sidebar-section">
            {graphData?.nodes && graphData.nodes.length > 0 ? (
              <div className="sidebar-file-tree-wrapper">
                <FileTree
                  files={graphData.nodes}
                  selectedFilePath={selectedFilePath}
                  onSelectFile={onSelectFile}
                  repoName={repoName}
                  rootPath={graphData.rootPath}
                />
              </div>
            ) : (
              <div className="sidebar-empty-state">
                <p className="empty-text">No repository indexed yet.</p>
                <p className="empty-subtext">Open the Repository Scanner tab to index a codebase.</p>
              </div>
            )}
          </div>
        )}

        {/* 3. Internal Dependencies Category */}
        {activeTab === 'internal' && (
          <div className="sidebar-section">
            {graphData ? (
              <div className="sidebar-deps-wrapper">
                <InternalDepsList
                  edges={graphData.edges}
                  selectedFilePath={selectedFilePath}
                  onSelectFile={onSelectFile}
                />
              </div>
            ) : (
              <div className="sidebar-empty-state">
                <p className="empty-text">No repository indexed yet.</p>
                <p className="empty-subtext">Index a repository to view internal dependencies.</p>
              </div>
            )}
          </div>
        )}

        {/* 4. External Dependencies Category */}
        {activeTab === 'external' && (
          <div className="sidebar-section">
            {graphData ? (
              <div className="sidebar-deps-wrapper">
                <ExternalDepsList
                  external={graphData.external}
                  selectedFilePath={selectedFilePath}
                  onSelectFile={onSelectFile}
                />
              </div>
            ) : (
              <div className="sidebar-empty-state">
                <p className="empty-text">No repository indexed yet.</p>
                <p className="empty-subtext">Index a repository to analyze package dependencies.</p>
              </div>
            )}
          </div>
        )}

        {/* 5. Unresolved Dependencies Category */}
        {activeTab === 'unresolved' && (
          <div className="sidebar-section">
            {graphData ? (
              <div className="sidebar-deps-wrapper">
                <UnresolvedDepsList
                  unresolved={graphData.unresolved}
                  selectedFilePath={selectedFilePath}
                  onSelectFile={onSelectFile}
                />
              </div>
            ) : (
              <div className="sidebar-empty-state">
                <p className="empty-text">No repository indexed yet.</p>
                <p className="empty-subtext">Index a repository to verify import resolutions.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

