/**
 * Utility functions for building and navigating hierarchical repository file trees.
 */

/**
 * Normalizes a file path to POSIX format, stripping leading and trailing slashes.
 *
 * @param {string} rawPath
 * @returns {string}
 */
export function normalizeTreePath(rawPath) {
  if (typeof rawPath !== 'string') return '';
  return rawPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Extracts all ancestor directory paths for a given file path.
 * E.g., 'src/components/common/Button.tsx' -> ['src', 'src/components', 'src/components/common']
 *
 * @param {string} filePath
 * @returns {string[]}
 */
export function getAncestorDirPaths(filePath) {
  const normalized = normalizeTreePath(filePath);
  if (!normalized) return [];

  const segments = normalized.split('/');
  const ancestors = [];
  let current = '';

  for (let i = 0; i < segments.length - 1; i++) {
    current = current ? `${current}/${segments[i]}` : segments[i];
    ancestors.push(current);
  }

  return ancestors;
}

/**
 * Deterministic comparison for file tree nodes:
 * 1. Directories before files.
 * 2. Alphabetical case-insensitive sorting within each group.
 * 3. Tie-breaker with case-sensitive comparison.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function compareTreeNodes(a, b) {
  if (a.type !== b.type) {
    return a.type === 'directory' ? -1 : 1;
  }
  const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (cmp !== 0) return cmp;
  return a.name.localeCompare(b.name);
}

/**
 * Transforms an array of file objects or path strings into a nested, deterministically sorted tree.
 *
 * @param {Array<{ path: string, [key: string]: any } | string>} files
 * @returns {Array<{
 *   id: string,
 *   path: string,
 *   name: string,
 *   type: 'directory' | 'file',
 *   children?: Array<any>,
 *   fileData?: object
 * }>}
 */
export function buildFileTree(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  const rootChildrenMap = new Map();

  for (const item of files) {
    const rawPath = typeof item === 'string' ? item : item?.path;
    const normalized = normalizeTreePath(rawPath);
    if (!normalized) continue;

    const segments = normalized.split('/');
    let currentMap = rootChildrenMap;

    for (let i = 0; i < segments.length; i++) {
      const segmentName = segments[i];
      const isFile = i === segments.length - 1;
      const currentPath = segments.slice(0, i + 1).join('/');

      if (!isFile) {
        // Directory
        if (!currentMap.has(segmentName)) {
          currentMap.set(segmentName, {
            id: currentPath,
            path: currentPath,
            name: segmentName,
            type: 'directory',
            childrenMap: new Map(),
          });
        }
        const dirEntry = currentMap.get(segmentName);
        if (dirEntry.type !== 'directory') {
          dirEntry.type = 'directory';
          dirEntry.childrenMap = dirEntry.childrenMap || new Map();
        }
        currentMap = dirEntry.childrenMap;
      } else {
        // File
        currentMap.set(segmentName, {
          id: normalized,
          path: normalized,
          name: segmentName,
          type: 'file',
          fileData: typeof item === 'object' && item !== null ? item : undefined,
        });
      }
    }
  }

  function convertMapToArray(map) {
    const list = [];
    for (const entry of map.values()) {
      if (entry.type === 'directory') {
        list.push({
          id: entry.id,
          path: entry.path,
          name: entry.name,
          type: 'directory',
          children: convertMapToArray(entry.childrenMap),
        });
      } else {
        list.push({
          id: entry.id,
          path: entry.path,
          name: entry.name,
          type: 'file',
          fileData: entry.fileData,
        });
      }
    }
    return list.sort(compareTreeNodes);
  }

  return convertMapToArray(rootChildrenMap);
}

