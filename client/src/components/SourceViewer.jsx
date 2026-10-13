import React, { useMemo } from 'react';
import {
  splitSourceLines,
  getPrismGrammar,
  tokenizeSourceLine,
} from '../utils/sourceHighlighter.js';

/**
 * Format bytes into human-readable size string.
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Recursively renders Prism tokens into safe React elements without dangerouslySetInnerHTML.
 *
 * @param {string | object} token
 * @param {number} index
 * @returns {React.ReactNode}
 */
function renderToken(token, index) {
  if (typeof token === 'string') {
    return <span key={index}>{token}</span>;
  }
  const content = Array.isArray(token.content)
    ? token.content.map((child, i) => renderToken(child, i))
    : typeof token.content === 'object' && token.content !== null
    ? renderToken(token.content, 0)
    : token.content;

  return (
    <span key={index} className={`token ${token.type || ''}`}>
      {content}
    </span>
  );
}

/**
 * Read-only source code viewer with unified line rows, syntax highlighting, and honest states.
 */
export function SourceViewer({
  selectedNode,
  sourceState,
  onRetry,
  onClose,
  incomingCount = 0,
  outgoingCount = 0,
  width,
}) {
  const panelStyle = width ? { width: `${width}px` } : undefined;

  // 1. Empty state: No node selected
  if (!selectedNode) {
    return (
      <aside
        className="source-viewer-panel panel-empty"
        style={panelStyle}
        aria-label="Source Viewer"
      >
        <div className="viewer-empty-content">
          <div className="viewer-empty-icon" role="img" aria-label="code">📄</div>
          <h3 className="viewer-empty-title">No File Selected</h3>
          <p className="viewer-empty-desc">
            Click any file node in the dependency graph to inspect its source code and dependency relationships.
          </p>
        </div>
      </aside>
    );
  }

  const { isLoading, error, data } = sourceState;
  const filePath = selectedNode?.data?.path || selectedNode?.id || '';
  const lang = data?.language || selectedNode?.data?.language || 'text';
  const lineCount = data?.lineCount ?? selectedNode?.data?.lineCount ?? 0;
  const byteSize = data?.size ?? selectedNode?.data?.size ?? 0;

  // Split lines accurately using shared line-splitting rules
  const lines = useMemo(() => {
    return data?.content !== undefined ? splitSourceLines(data.content) : [];
  }, [data?.content]);

  // Resolve syntax highlighting grammar for the active file
  const grammar = useMemo(() => {
    return getPrismGrammar(lang, selectedNode.data?.extension);
  }, [lang, selectedNode.data?.extension]);

  return (
    <aside
      className="source-viewer-panel"
      style={panelStyle}
      aria-label="Source Viewer"
    >
      {/* Viewer Header */}
      <div className="viewer-header">
        <div className="viewer-header-info">
          <div className="viewer-title-row">
            <span className="viewer-badge-lang">{lang.toUpperCase()}</span>
            <span className="viewer-file-path" title={filePath}>{filePath}</span>
          </div>

          <div className="viewer-meta-row">
            <span className="viewer-meta-item">{lineCount} lines</span>
            <span className="viewer-meta-divider">•</span>
            <span className="viewer-meta-item">{formatSize(byteSize)}</span>
            <span className="viewer-meta-divider">•</span>
            <span className="viewer-meta-dep" title="Dependencies imported by this file">
              {outgoingCount} imports
            </span>
            <span className="viewer-meta-divider">•</span>
            <span className="viewer-meta-dep" title="Dependents that import this file">
              {incomingCount} dependents
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn-icon-close"
          onClick={onClose}
          title="Deselect node and close viewer"
          aria-label="Close source viewer"
        >
          ✕
        </button>
      </div>

      {/* Viewer Content Area */}
      <div className="viewer-body">
        {/* Loading State: Active fetch or waiting for initial payload */}
        {(isLoading || (!data && !error)) && (
          <div className="viewer-status-state viewer-loading" role="status">
            <div className="spinner" />
            <span className="viewer-status-text">Loading source for {filePath}...</span>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="viewer-status-state viewer-error" role="alert">
            <div className="viewer-error-card">
              <div className="viewer-error-header">
                <span className="viewer-error-icon" role="img" aria-label="warning">⚠️</span>
                <div>
                  <h4 className="viewer-error-title">Failed to Load Source</h4>
                  <span className="viewer-error-code">{error.code || 'ERROR'}</span>
                </div>
              </div>
              <p className="viewer-error-msg">{error.message || 'Source content unavailable for this file.'}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onRetry}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Success State: Read-Only Code with Unified Line Rows and Safe Syntax Highlighting */}
        {!isLoading && !error && data && (
          <div className="viewer-code-container">
            <div className="source-code-table" role="region" aria-label="Source code">
              {lines.map((line, index) => {
                const lineNum = index + 1;
                const tokens = tokenizeSourceLine(line, grammar);
                return (
                  <div key={lineNum} className="source-code-row">
                    <span className="source-line-num" aria-hidden="true">
                      {lineNum}
                    </span>
                    <span className="source-line-content">
                      {line.length > 0 ? (
                        tokens.map((token, i) => renderToken(token, i))
                      ) : (
                        '\u200B'
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
