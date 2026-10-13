import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  FileIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  SearchIcon,
  CloseIcon,
  InternalDepIcon,
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
 * Inspector list for resolved internal repository dependency edges.
 *
 * @param {object} props
 * @param {Array<object>} props.edges - Array of graph edge records
 * @param {string | null} [props.selectedFilePath] - Currently selected file path
 * @param {Function} props.onSelectFile - Selection callback (filePath)
 */
export function InternalDepsList({
  edges = [],
  selectedFilePath = null,
  onSelectFile = () => {},
}) {
  const [filterText, setFilterText] = useState('');
  const [expandedSources, setExpandedSources] = useState(() => new Set());

  // Group edges by importing source file
  const groupedEdges = useMemo(() => {
    const map = new Map();

    for (const edge of edges) {
      if (!edge || !edge.source) continue;
      if (!map.has(edge.source)) {
        map.set(edge.source, []);
      }
      map.get(edge.source).push(edge);
    }

    // Sort source paths alphabetically
    const sortedEntries = Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    return sortedEntries.map(([source, sourceEdges]) => ({
      source,
      edges: sourceEdges.sort((a, b) =>
        (a.target || '').localeCompare(b.target || '', undefined, { sensitivity: 'base' })
      ),
    }));
  }, [edges]);

  // Initialize expanded state on initial load or edge list change
  useEffect(() => {
    if (groupedEdges.length > 0) {
      // Auto-expand all if 20 or fewer sources, otherwise collapse by default
      if (groupedEdges.length <= 20) {
        setExpandedSources(new Set(groupedEdges.map((g) => g.source)));
      }
    }
  }, [groupedEdges]);

  // Auto-expand group when selected file is source or target
  useEffect(() => {
    if (!selectedFilePath) return;

    for (const group of groupedEdges) {
      const isSource = group.source === selectedFilePath;
      const isTarget = group.edges.some((e) => e.target === selectedFilePath);

      if (isSource || isTarget) {
        setExpandedSources((prev) => {
          if (prev.has(group.source)) return prev;
          const next = new Set(prev);
          next.add(group.source);
          return next;
        });
      }
    }
  }, [selectedFilePath, groupedEdges]);

  // Toggle single source group expansion
  const handleToggleGroup = useCallback((sourcePath) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourcePath)) {
        next.delete(sourcePath);
      } else {
        next.add(sourcePath);
      }
      return next;
    });
  }, []);

  // Filter groups and edges
  const filteredGroups = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return groupedEdges;

    return groupedEdges
      .map((group) => {
        const sourceMatches = group.source.toLowerCase().includes(query);
        const matchingEdges = group.edges.filter(
          (edge) =>
            (edge.target || '').toLowerCase().includes(query) ||
            (edge.specifier || '').toLowerCase().includes(query)
        );

        if (sourceMatches) {
          return group;
        }

        if (matchingEdges.length > 0) {
          return {
            ...group,
            edges: matchingEdges,
          };
        }

        return null;
      })
      .filter(Boolean);
  }, [groupedEdges, filterText]);

  if (!edges || edges.length === 0) {
    return (
      <div className="dep-inspector-empty">
        <InternalDepIcon size={24} className="dep-empty-icon" />
        <h4 className="dep-empty-title">No Internal Dependencies</h4>
        <p className="dep-empty-desc">
          All indexed files are isolated or only import external packages.
        </p>
      </div>
    );
  }

  return (
    <div className="dep-inspector-container" role="region" aria-label="Internal Dependencies Inspector">
      {/* Search / Filter input */}
      <div className="dep-filter-wrapper">
        <SearchIcon size={14} className="dep-filter-icon" />
        <input
          type="text"
          className="dep-filter-input"
          placeholder="Filter by file or specifier..."
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

      {/* Summary Count Header */}
      <div className="dep-summary-bar">
        <span className="dep-summary-count">
          <strong>{filteredGroups.reduce((acc, g) => acc + g.edges.length, 0)}</strong> edges in{' '}
          <strong>{filteredGroups.length}</strong> source files
        </span>
      </div>

      {/* Grouped Edge List */}
      <div className="dep-items-list">
        {filteredGroups.length === 0 ? (
          <div className="dep-filter-empty">
            <p>No internal dependencies match "{filterText}".</p>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isExpanded = expandedSources.has(group.source);
            const { name: sourceName, dir: sourceDir } = splitPath(group.source);
            const isSourceSelected = selectedFilePath === group.source;

            return (
              <div key={group.source} className="dep-group-item">
                {/* Source File Header */}
                <div
                  className={`dep-group-header ${isSourceSelected ? 'selected' : ''}`}
                  onClick={() => handleToggleGroup(group.source)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleToggleGroup(group.source);
                    }
                  }}
                  title={group.source}
                >
                  <span className="dep-disclosure-toggle" aria-hidden="true">
                    {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                  </span>

                  <FileIcon size={14} className="dep-item-icon" />

                  <span className="dep-source-label">
                    <span className="dep-file-name">{sourceName}</span>
                    {sourceDir && <span className="dep-file-dir">{sourceDir}</span>}
                  </span>

                  <button
                    type="button"
                    className="dep-btn-open-file"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFile(group.source);
                    }}
                    title={`Open ${group.source} in source explorer`}
                  >
                    view
                  </button>

                  <span className="dep-badge-count" title={`${group.edges.length} outgoing imports`}>
                    {group.edges.length}
                  </span>
                </div>

                {/* Target Dependencies List */}
                {isExpanded && (
                  <div className="dep-sub-list">
                    {group.edges.map((edge) => {
                      const { name: targetName, dir: targetDir } = splitPath(edge.target);
                      const isTargetSelected = selectedFilePath === edge.target;
                      const line = edge.sourceLocation?.startLine;

                      return (
                        <div
                          key={edge.id}
                          className={`dep-sub-row ${isTargetSelected ? 'selected' : ''}`}
                          onClick={() => onSelectFile(edge.target)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectFile(edge.target);
                            }
                          }}
                          title={`Imported by ${group.source} -> ${edge.target} (${edge.specifier})`}
                        >
                          <span className="dep-edge-arrow" aria-hidden="true">
                            <ArrowRightIcon size={12} />
                          </span>

                          <div className="dep-sub-info">
                            <div className="dep-target-title-row">
                              <span className="dep-file-name">{targetName}</span>
                              {targetDir && <span className="dep-file-dir">{targetDir}</span>}
                            </div>
                            <div className="dep-target-specifier-row">
                              <code className="dep-specifier-text">{edge.specifier}</code>
                              {line && <span className="dep-line-pill">L{line}</span>}
                              {edge.kind && edge.kind !== 'import' && (
                                <span className="dep-kind-pill">{edge.kind}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

