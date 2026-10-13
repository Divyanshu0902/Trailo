import React, { useState, useMemo } from 'react';
import {
  FileIcon,
  SearchIcon,
  CloseIcon,
  UnresolvedDepIcon,
  CheckCircleIcon,
} from './Icons.jsx';

/**
 * Splits a file path into its basename and parent directory for display.
 *
 * @param {string} filePath
 * @returns {{ name: string, dir: string }}
 */
function splitPath(filePath) {
  if (!filePath) return { name: '', dir: '' };
  const parts = filePath.split('/');
  const name = parts.pop() || filePath;
  const dir = parts.length > 0 ? parts.join('/') + '/' : '';
  return { name, dir };
}

/**
 * Inspector list for unresolved / missing import specifiers.
 *
 * @param {object} props
 * @param {Array<object>} props.unresolved - Array of unresolved dependency records
 * @param {string | null} [props.selectedFilePath] - Currently selected file path
 * @param {Function} props.onSelectFile - Selection callback (filePath)
 */
export function UnresolvedDepsList({
  unresolved = [],
  selectedFilePath = null,
  onSelectFile = () => {},
}) {
  const [filterText, setFilterText] = useState('');

  // Filter unresolved imports
  const filteredItems = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return unresolved;

    return unresolved.filter((item) => {
      const specifierMatches = (item.specifier || '').toLowerCase().includes(query);
      const sourceMatches = (item.sourcePath || '').toLowerCase().includes(query);
      return specifierMatches || sourceMatches;
    });
  }, [unresolved, filterText]);

  // Zero-state: All imports resolved cleanly
  if (!unresolved || unresolved.length === 0) {
    return (
      <div className="dep-inspector-empty dep-empty-clean">
        <CheckCircleIcon size={32} className="dep-clean-icon" />
        <h4 className="dep-clean-title">Zero Unresolved Imports</h4>
        <p className="dep-clean-desc">
          All relative module specifiers in this codebase resolved cleanly to indexed repository files.
        </p>
      </div>
    );
  }

  return (
    <div className="dep-inspector-container" role="region" aria-label="Unresolved Imports Inspector">
      {/* Search / Filter input */}
      <div className="dep-filter-wrapper">
        <SearchIcon size={14} className="dep-filter-icon" />
        <input
          type="text"
          className="dep-filter-input"
          placeholder="Filter unresolved imports..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          spellCheck="false"
        />
        {filterText && (
          <button
            type="button"
            className="dep-filter-clear-btn"
            onClick={() => setFilterText('')}
            title="Clear filter"
            aria-label="Clear filter"
          >
            <CloseIcon size={12} />
          </button>
        )}
      </div>

      {/* Warning Summary Bar */}
      <div className="dep-summary-bar dep-summary-warning">
        <UnresolvedDepIcon size={14} className="dep-warning-icon" />
        <span className="dep-summary-count">
          <strong>{filteredItems.length}</strong> unresolved {filteredItems.length === 1 ? 'import' : 'imports'} requiring attention
        </span>
      </div>

      {/* Unresolved Items List */}
      <div className="dep-items-list">
        {filteredItems.length === 0 ? (
          <div className="dep-filter-empty">
            <p>No unresolved imports match "{filterText}".</p>
          </div>
        ) : (
          filteredItems.map((item, index) => {
            const { name: fileName, dir: fileDir } = splitPath(item.sourcePath);
            const isFileSelected = selectedFilePath === item.sourcePath;
            const line = item.sourceLocation?.startLine;

            return (
              <div
                key={`${item.sourcePath}-${item.specifier}-${index}`}
                className={`dep-unresolved-card ${isFileSelected ? 'selected' : ''}`}
                onClick={() => onSelectFile(item.sourcePath)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectFile(item.sourcePath);
                  }
                }}
                title={`Click to open ${item.sourcePath} in source explorer`}
              >
                <div className="dep-unresolved-header">
                  <span className="dep-unresolved-badge">MISSING TARGET</span>
                  {line && <span className="dep-line-pill dep-line-warning">L{line}</span>}
                </div>

                <div className="dep-unresolved-specifier-box">
                  <code className="dep-unresolved-specifier-text">{item.specifier}</code>
                </div>

                <div className="dep-unresolved-footer">
                  <FileIcon size={12} className="dep-item-icon" />
                  <span className="dep-unresolved-file-label">
                    <span className="dep-file-name">{fileName}</span>
                    {fileDir && <span className="dep-file-dir">{fileDir}</span>}
                  </span>
                  <span className="dep-action-hint">open ›</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

