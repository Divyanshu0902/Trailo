import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from './Icons.jsx';
import { buildFileTree, getAncestorDirPaths } from '../utils/fileTree.js';

/**
 * Single tree node item (directory or file).
 */
function FileTreeNodeItem({
  item,
  level,
  expandedDirs,
  onToggleDir,
  selectedFilePath,
  onSelectFile,
}) {
  const isDir = item.type === 'directory';
  const isExpanded = isDir && expandedDirs.has(item.path);
  const isSelected = !isDir && selectedFilePath === item.path;

  // Base indent: 8px, plus 14px per level
  const paddingLeft = 8 + level * 14;

  if (isDir) {
    return (
      <div className="tree-group" role="group">
        <div
          className={`tree-row tree-dir-row ${isExpanded ? 'expanded' : 'collapsed'}`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => onToggleDir(item.path)}
          role="treeitem"
          aria-expanded={isExpanded}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleDir(item.path);
            }
          }}
          title={item.path}
        >
          <span className="tree-disclosure-btn" aria-hidden="true">
            {isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </span>
          <span className="tree-item-icon" aria-hidden="true">
            {isExpanded ? <FolderOpenIcon size={14} /> : <FolderIcon size={14} />}
          </span>
          <span className="tree-item-name">{item.name}</span>
        </div>

        {isExpanded && item.children && (
          <div className="tree-children">
            {item.children.map((child) => (
              <FileTreeNodeItem
                key={child.id}
                item={child}
                level={level + 1}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                selectedFilePath={selectedFilePath}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  return (
    <div
      className={`tree-row tree-file-row ${isSelected ? 'selected' : ''}`}
      style={{ paddingLeft: `${paddingLeft}px` }}
      onClick={() => onSelectFile(item.path)}
      role="treeitem"
      aria-selected={isSelected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectFile(item.path);
        }
      }}
      title={item.path}
    >
      <span className="tree-disclosure-spacer" aria-hidden="true" />
      <span className="tree-item-icon file-icon" aria-hidden="true">
        <FileIcon size={14} />
      </span>
      <span className="tree-item-name">{item.name}</span>
    </div>
  );
}

/**
 * Hierarchical repository file tree for contextual sidebar.
 *
 * @param {object} props
 * @param {Array<object | string>} props.files - Indexed files metadata or paths
 * @param {string | null} [props.selectedFilePath] - Active selected file path
 * @param {Function} props.onSelectFile - File selection callback (filePath)
 * @param {string | null} [props.repoName] - Active repository name for root header
 * @param {string | null} [props.rootPath] - Canonical root path
 */
export function FileTree({
  files = [],
  selectedFilePath = null,
  onSelectFile = () => {},
  repoName = null,
  rootPath = null,
}) {
  const [expandedDirs, setExpandedDirs] = useState(() => new Set());
  const lastRootPathRef = useRef(rootPath);

  // Reset expanded directories when active repository changes
  useEffect(() => {
    if (rootPath !== lastRootPathRef.current) {
      lastRootPathRef.current = rootPath;
      setExpandedDirs(new Set());
    }
  }, [rootPath]);

  // Auto-expand ancestors when a file is selected (e.g. from canvas or tree)
  useEffect(() => {
    if (!selectedFilePath) return;

    const ancestors = getAncestorDirPaths(selectedFilePath);
    if (ancestors.length === 0) return;

    setExpandedDirs((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const dir of ancestors) {
        if (!next.has(dir)) {
          next.add(dir);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedFilePath]);

  // Directory expansion toggle
  const handleToggleDir = useCallback((dirPath) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  // Construct sorted hierarchical tree
  const tree = useMemo(() => buildFileTree(files), [files]);

  if (!files || files.length === 0) {
    return (
      <div className="file-tree-empty">
        <p className="empty-subtext">No files available to display.</p>
      </div>
    );
  }

  return (
    <div className="file-tree-container" role="tree" aria-label="Repository File Tree">
      {repoName && (
        <div className="file-tree-root-header" title={rootPath || repoName}>
          <FolderOpenIcon size={14} className="tree-root-icon" />
          <span className="tree-root-title">{repoName}</span>
        </div>
      )}

      <div className="file-tree-list">
        {tree.map((item) => (
          <FileTreeNodeItem
            key={item.id}
            item={item}
            level={0}
            expandedDirs={expandedDirs}
            onToggleDir={handleToggleDir}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    </div>
  );
}

