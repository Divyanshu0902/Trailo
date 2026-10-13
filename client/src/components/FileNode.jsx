import React from 'react';
import { Handle, Position } from '@xyflow/react';

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
 * Extract directory portion from a relative file path.
 *
 * @param {string} filePath
 * @returns {string}
 */
function getDirectory(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) return './';
  return filePath.slice(0, lastSlash + 1);
}

/**
 * Language badge abbreviation.
 *
 * @param {string} language
 * @param {string} ext
 * @returns {string}
 */
function getBadge(language, ext) {
  if (ext === '.tsx') return 'TSX';
  if (ext === '.jsx') return 'JSX';
  if (language === 'typescript') return 'TS';
  if (language === 'javascript') return 'JS';
  return ext.replace('.', '').toUpperCase() || 'SRC';
}

/**
 * Custom file node component for React Flow canvas.
 */
export function FileNode({ data }) {
  const dirPath = getDirectory(data.path);
  const badge = getBadge(data.language, data.extension);

  return (
    <div className="trailo-file-node" title={data.path}>
      <Handle type="target" position={Position.Left} className="node-handle handle-target" />

      <div className="node-card-body">
        <div className="node-title-row">
          <span className={`badge-lang badge-lang-${badge.toLowerCase()}`}>{badge}</span>
          <span className="node-filename" title={data.name}>{data.name}</span>
        </div>

        <div className="node-path-row" title={data.path}>
          <span className="node-dir">{dirPath}</span>
        </div>

        <div className="node-meta-row">
          <span className="node-metric">{data.lineCount} lines</span>
          <span className="node-divider">•</span>
          <span className="node-metric">{formatSize(data.size)}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="node-handle handle-source" />
    </div>
  );
}
