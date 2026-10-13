import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  FileIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  CloseIcon,
  ExternalDepIcon,
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
 * Inspector list for third-party / external npm package dependencies.
 *
 * @param {object} props
 * @param {Array<object>} props.external - Array of external dependency records
 * @param {string | null} [props.selectedFilePath] - Currently selected file path
 * @param {Function} props.onSelectFile - Selection callback (filePath)
 */
export function ExternalDepsList({
  external = [],
  selectedFilePath = null,
  onSelectFile = () => {},
}) {
  const [filterText, setFilterText] = useState('');
  const [expandedPackages, setExpandedPackages] = useState(() => new Set());

  // Aggregate external dependencies by package specifier
  const aggregatedPackages = useMemo(() => {
    const map = new Map();

    for (const item of external) {
      if (!item || !item.specifier) continue;
      const key = item.specifier;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push({
        sourcePath: item.sourcePath,
        line: item.sourceLocation?.startLine,
        kind: item.kind,
      });
    }

    // Sort by number of import occurrences descending, then alphabetically
    const sorted = Array.from(map.entries()).sort(([pkgA, listA], [pkgB, listB]) => {
      if (listB.length !== listA.length) {
        return listB.length - listA.length;
      }
      return pkgA.localeCompare(pkgB, undefined, { sensitivity: 'base' });
    });

    return sorted.map(([packageName, importers]) => ({
      packageName,
      importers: importers.sort((a, b) =>
        (a.sourcePath || '').localeCompare(b.sourcePath || '', undefined, { sensitivity: 'base' })
      ),
    }));
  }, [external]);

  // Auto-expand packages initially
  useEffect(() => {
    if (aggregatedPackages.length > 0) {
      if (aggregatedPackages.length <= 15) {
        setExpandedPackages(new Set(aggregatedPackages.map((p) => p.packageName)));
      }
    }
  }, [aggregatedPackages]);

  // Auto-expand packages imported by active file
  useEffect(() => {
    if (!selectedFilePath) return;

    for (const pkg of aggregatedPackages) {
      const isImportedBySelected = pkg.importers.some((i) => i.sourcePath === selectedFilePath);
      if (isImportedBySelected) {
        setExpandedPackages((prev) => {
          if (prev.has(pkg.packageName)) return prev;
          const next = new Set(prev);
          next.add(pkg.packageName);
          return next;
        });
      }
    }
  }, [selectedFilePath, aggregatedPackages]);

  const handleTogglePackage = useCallback((packageName) => {
    setExpandedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(packageName)) {
        next.delete(packageName);
      } else {
        next.add(packageName);
      }
      return next;
    });
  }, []);

  // Filter packages and their importers
  const filteredPackages = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return aggregatedPackages;

    return aggregatedPackages
      .map((pkg) => {
        const pkgMatches = pkg.packageName.toLowerCase().includes(query);
        const matchingImporters = pkg.importers.filter((i) =>
          (i.sourcePath || '').toLowerCase().includes(query)
        );

        if (pkgMatches) {
          return pkg;
        }

        if (matchingImporters.length > 0) {
          return {
            ...pkg,
            importers: matchingImporters,
          };
        }

        return null;
      })
      .filter(Boolean);
  }, [aggregatedPackages, filterText]);

  if (!external || external.length === 0) {
    return (
      <div className="dep-inspector-empty">
        <ExternalDepIcon size={24} className="dep-empty-icon" />
        <h4 className="dep-empty-title">No External Packages</h4>
        <p className="dep-empty-desc">
          No external or third-party packages were detected in the indexed repository.
        </p>
      </div>
    );
  }

  const totalImports = filteredPackages.reduce((acc, p) => acc + p.importers.length, 0);

  return (
    <div className="dep-inspector-container" role="region" aria-label="External Packages Inspector">
      {/* Search / Filter input */}
      <div className="dep-filter-wrapper">
        <SearchIcon size={14} className="dep-filter-icon" />
        <input
          type="text"
          className="dep-filter-input"
          placeholder="Filter packages or files..."
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
          <strong>{filteredPackages.length}</strong> unique packages • <strong>{totalImports}</strong> imports
        </span>
      </div>

      {/* Package List */}
      <div className="dep-items-list">
        {filteredPackages.length === 0 ? (
          <div className="dep-filter-empty">
            <p>No external packages match "{filterText}".</p>
          </div>
        ) : (
          filteredPackages.map((pkg) => {
            const isExpanded = expandedPackages.has(pkg.packageName);
            const hasSelectedImporter = pkg.importers.some((i) => i.sourcePath === selectedFilePath);

            return (
              <div key={pkg.packageName} className="dep-group-item">
                {/* Package Name Header */}
                <div
                  className={`dep-group-header dep-package-header ${hasSelectedImporter ? 'has-selected' : ''}`}
                  onClick={() => handleTogglePackage(pkg.packageName)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleTogglePackage(pkg.packageName);
                    }
                  }}
                  title={pkg.packageName}
                >
                  <span className="dep-disclosure-toggle" aria-hidden="true">
                    {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                  </span>

                  <ExternalDepIcon size={14} className="dep-item-icon package-icon" />

                  <span className="dep-package-name" title={pkg.packageName}>
                    {pkg.packageName}
                  </span>

                  <span className="dep-badge-count" title={`${pkg.importers.length} import statements`}>
                    {pkg.importers.length}
                  </span>
                </div>

                {/* Importing Files List */}
                {isExpanded && (
                  <div className="dep-sub-list">
                    {pkg.importers.map((importer, idx) => {
                      const { name: fileName, dir: fileDir } = splitPath(importer.sourcePath);
                      const isFileSelected = selectedFilePath === importer.sourcePath;

                      return (
                        <div
                          key={`${importer.sourcePath}-${idx}`}
                          className={`dep-sub-row ${isFileSelected ? 'selected' : ''}`}
                          onClick={() => onSelectFile(importer.sourcePath)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectFile(importer.sourcePath);
                            }
                          }}
                          title={`Imported in ${importer.sourcePath} at line ${importer.line || '?'}`}
                        >
                          <FileIcon size={12} className="dep-item-icon file-sub-icon" />

                          <div className="dep-sub-info">
                            <div className="dep-target-title-row">
                              <span className="dep-file-name">{fileName}</span>
                              {fileDir && <span className="dep-file-dir">{fileDir}</span>}
                            </div>
                            <div className="dep-target-specifier-row">
                              {importer.line && <span className="dep-line-pill">L{importer.line}</span>}
                              {importer.kind && importer.kind !== 'import' && (
                                <span className="dep-kind-pill">{importer.kind}</span>
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

