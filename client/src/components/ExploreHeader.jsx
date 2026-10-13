import React from 'react';

/**
 * Extract repository folder name from absolute or relative path.
 *
 * @param {string} rootPath
 * @returns {string}
 */
function getRepoName(rootPath) {
  if (!rootPath) return '';
  const clean = rootPath.replace(/[/\\]+$/, '');
  const parts = clean.split(/[/\\]/);
  return parts[parts.length - 1] || clean;
}

export function ExploreHeader({
  repoPath,
  setRepoPath,
  onScan,
  isScanning,
  graphData,
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onScan();
  };

  const summary = graphData?.summary;
  const repoName = graphData?.rootPath ? getRepoName(graphData.rootPath) : null;

  return (
    <header className="explore-header">
      <div className="header-brand-section">
        <div className="brand-logo">
          <span className="brand-icon" role="img" aria-label="compass">🧭</span>
          <span className="brand-title">Trailo</span>
        </div>
        <span className="brand-tag">Explore</span>
      </div>

      <form className="header-search-form" onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <input
            type="text"
            className="repo-input"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="Enter local repository path (e.g. C:\Projects\repo or /home/dev/repo)..."
            disabled={isScanning}
            aria-label="Local repository path"
            spellCheck="false"
          />
        </div>
        <button
          type="submit"
          className="btn btn-scan"
          disabled={isScanning || !repoPath.trim()}
        >
          {isScanning ? (
            <>
              <span className="spinner-inline" />
              <span>Indexing...</span>
            </>
          ) : (
            <span>Scan &amp; Index</span>
          )}
        </button>
      </form>

      {summary && (
        <div className="header-summary-section">
          {repoName && (
            <div className="summary-pill pill-repo" title={graphData.rootPath}>
              <span className="pill-icon">📁</span>
              <span className="pill-text">{repoName}</span>
            </div>
          )}
          <div className="summary-pill pill-files" title={`${summary.totalNodes} indexed source files`}>
            <span className="pill-count">{summary.totalNodes}</span>
            <span className="pill-label">Files</span>
          </div>
          <div className="summary-pill pill-edges" title={`${summary.totalEdges} resolved dependency edges`}>
            <span className="pill-count">{summary.totalEdges}</span>
            <span className="pill-label">Edges</span>
          </div>
          {summary.externalCount > 0 && (
            <div className="summary-pill pill-external" title={`${summary.externalCount} external package imports`}>
              <span className="pill-count">{summary.externalCount}</span>
              <span className="pill-label">External</span>
            </div>
          )}
          {summary.unresolvedCount > 0 && (
            <div className="summary-pill pill-unresolved" title={`${summary.unresolvedCount} unresolved relative imports`}>
              <span className="pill-count">{summary.unresolvedCount}</span>
              <span className="pill-label">Unresolved</span>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
