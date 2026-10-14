import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  computeClusterLayout,
  getClusterKey,
  getClusterLabel,
  getStarColor,
  buildDirectoryTree,
  compressDirectoryTree,
} from '../../client/src/utils/clusterLayout.js';

const appPath = fileURLToPath(new URL('../../client/src/App.jsx', import.meta.url));
const clusterCanvasPath = fileURLToPath(new URL('../../client/src/components/ClusterCanvas.jsx', import.meta.url));
const clusterGroupNodePath = fileURLToPath(new URL('../../client/src/components/ClusterGroupNode.jsx', import.meta.url));
const starNodePath = fileURLToPath(new URL('../../client/src/components/StarNode.jsx', import.meta.url));
const appCssPath = fileURLToPath(new URL('../../client/src/App.css', import.meta.url));

describe('Constellation Cluster View & Circular Architectural Grouping (Phase 4D)', () => {
  describe('1. Cluster Key, Label, and Starlight Color Mapping', () => {
    it('groups root-level files under "root" with "Root / Config" label', () => {
      assert.equal(getClusterKey('package.json'), 'root');
      assert.equal(getClusterKey('README.md'), 'root');
      assert.equal(getClusterKey('index.js'), 'root');
      assert.equal(getClusterLabel('root'), 'Root / Config');
    });

    it('extracts parent directory as cluster key for nested files', () => {
      assert.equal(getClusterKey('src/controllers/user.js'), 'src/controllers');
      assert.equal(getClusterKey('src/models/userModel.ts'), 'src/models');
      assert.equal(getClusterKey('src/index.js'), 'src');
      assert.equal(getClusterLabel('src/controllers'), 'src/controllers');
    });

    it('handles empty or non-string paths safely without throwing', () => {
      assert.equal(getClusterKey(null), 'root');
      assert.equal(getClusterKey(undefined), 'root');
      assert.equal(getClusterKey(''), 'root');
      assert.equal(getClusterLabel(''), 'Root / Config');
    });

    it('maps file languages and extensions to celestial starlight colors', () => {
      assert.equal(getStarColor('typescript', '.ts'), '#58a6ff'); // Azure blue
      assert.equal(getStarColor('javascript', '.jsx'), '#f1e05a'); // Amber gold
      assert.equal(getStarColor('css', '.css'), '#f778ba'); // Cosmic pink
      assert.equal(getStarColor('json', '.json'), '#56d364'); // Emerald green
      assert.equal(getStarColor('markdown', '.md'), '#bc8cff'); // Lavender violet
      assert.equal(getStarColor(null, null), '#e6edf3'); // Default silver-white
    });
  });

  describe('2. computeClusterLayout Constellation Engine', () => {
    const fixtureNodes = [
      { id: 'src/controllers/auth.js', path: 'src/controllers/auth.js', name: 'auth.js', language: 'javascript' },
      { id: 'src/controllers/user.js', path: 'src/controllers/user.js', name: 'user.js', language: 'javascript' },
      { id: 'src/models/userModel.js', path: 'src/models/userModel.js', name: 'userModel.js', language: 'javascript' },
      { id: 'src/utils/helpers.js', path: 'src/utils/helpers.js', name: 'helpers.js', language: 'javascript' },
      { id: 'package.json', path: 'package.json', name: 'package.json', language: 'json' },
    ];

    const fixtureEdges = [
      { id: 'e1', source: 'src/controllers/user.js', target: 'src/models/userModel.js', kind: 'import' },
      { id: 'e2', source: 'src/controllers/auth.js', target: 'src/utils/helpers.js', kind: 'import' },
    ];

    it('returns empty array when nodes are empty or missing', () => {
      const emptyLayout = computeClusterLayout([], []);
      assert.ok(Array.isArray(emptyLayout));
      assert.equal(emptyLayout.length, 0);
      assert.deepEqual(emptyLayout.nodes, []);
      assert.deepEqual(emptyLayout.edges, []);
    });

    it('partitions files into circular clusterGroup parents and orbiting child starNodes', () => {
      const result = computeClusterLayout(fixtureNodes, fixtureEdges);

      const parentNodes = result.filter((n) => n.type === 'clusterGroup');
      const childNodes = result.filter((n) => n.type === 'starNode' || n.type === 'fileNode');

      // 5 clusters: src (parent cluster), src/controllers (subcluster), src/models (subcluster), src/utils (subcluster), root
      assert.equal(parentNodes.length, 5);
      assert.equal(childNodes.length, 5);

      const clusterKeys = parentNodes.map((n) => n.data.clusterKey).sort();
      assert.deepEqual(clusterKeys, ['root', 'src', 'src/controllers', 'src/models', 'src/utils'].sort());

      // Every parent cluster must be styled as a circle (borderRadius: 50%)
      for (const parent of parentNodes) {
        assert.equal(parent.style?.borderRadius, '50%');
        assert.ok(parent.style?.width > 0);
        assert.equal(parent.style?.width, parent.style?.height);
      }
    });

    it('compresses single-child directory chains to eliminate redundant empty rings', () => {
      const chainNodes = [
        { id: 'client/src/components/Button.jsx', path: 'client/src/components/Button.jsx', name: 'Button.jsx' },
        { id: 'client/src/components/Modal.jsx', path: 'client/src/components/Modal.jsx', name: 'Modal.jsx' },
        { id: 'client/src/utils/helpers.js', path: 'client/src/utils/helpers.js', name: 'helpers.js' },
      ];

      const tree = buildDirectoryTree(chainNodes);
      compressDirectoryTree(tree);

      // client has 0 direct files and 1 child (src), so it compresses into client/src
      assert.ok(tree.subdirs.has('client/src'));
      const compressedNode = tree.subdirs.get('client/src');
      assert.equal(compressedNode.path, 'client/src');
      // client/src splits into components and utils
      assert.equal(compressedNode.subdirs.size, 2);
    });

    it('ensures all parent cluster nodes precede child nodes in the array (React Flow invariant)', () => {
      const result = computeClusterLayout(fixtureNodes, fixtureEdges);

      let foundChild = false;
      for (const node of result) {
        if (node.type === 'starNode' || node.type === 'fileNode') {
          foundChild = true;
        } else if (node.type === 'clusterGroup' && foundChild) {
          assert.fail('Parent clusterGroup node found after child starNode; violates React Flow hierarchy');
        }
      }
    });

    it('assigns parentId and extent: "parent" with valid circular relative coordinates to star nodes', () => {
      const result = computeClusterLayout(fixtureNodes, fixtureEdges);
      const childNodes = result.filter((n) => n.type === 'starNode' || n.type === 'fileNode');

      for (const child of childNodes) {
        assert.ok(child.parentId.startsWith('cluster:'));
        assert.equal(child.extent, 'parent');
        // Relative coordinates must be non-negative
        assert.ok(child.position.x >= 0, `child X ${child.position.x} must be non-negative`);
        assert.ok(child.position.y >= 0, `child Y ${child.position.y} must be non-negative`);
      }
    });

    it('preserves directed dependency edges and dual-interface compatibility', () => {
      const result = computeClusterLayout(fixtureNodes, fixtureEdges);

      assert.ok(Array.isArray(result.edges));
      assert.equal(result.edges.length, 2);
      assert.equal(result.edges[0].source, 'src/controllers/user.js');
      assert.equal(result.edges[0].target, 'src/models/userModel.js');
      assert.equal(result.edges[1].source, 'src/controllers/auth.js');
      assert.equal(result.edges[1].target, 'src/utils/helpers.js');
    });
  });

  describe('3. ClusterGroupNode Component (client/src/components/ClusterGroupNode.jsx)', () => {
    it('renders circular boundary, orbit guide, apex header, and file count badge', () => {
      const content = fs.readFileSync(clusterGroupNodePath, 'utf8');

      assert.match(content, /FolderIcon/);
      assert.match(content, /cluster-orbit-guide/);
      assert.match(content, /cluster-group-header/);
      assert.match(content, /cluster-group-title/);
      assert.match(content, /cluster-group-badge/);
      assert.match(content, /fileCount/);
    });
  });

  describe('4. StarNode Component (client/src/components/StarNode.jsx)', () => {
    it('renders central handles, luminous core, and glowing halos for constellation lines', () => {
      const content = fs.readFileSync(starNodePath, 'utf8');

      assert.match(content, /constellation-star-node/);
      assert.match(content, /constellation-handle/);
      assert.match(content, /star-core/);
      assert.match(content, /star-glow-outer/);
      assert.match(content, /starColor/);
    });
  });

  describe('5. ClusterCanvas Component (client/src/components/ClusterCanvas.jsx)', () => {
    it('registers starNode, fileNode, and clusterGroup node types with ReactFlow', () => {
      const content = fs.readFileSync(clusterCanvasPath, 'utf8');

      assert.match(content, /starNode:\s*StarNode/);
      assert.match(content, /fileNode:\s*FileNode/);
      assert.match(content, /clusterGroup:\s*ClusterGroupNode/);
      assert.match(content, /<ReactFlow/);
    });

    it('filters node clicks so only starNode and fileNode items trigger onNodeClick selection', () => {
      const content = fs.readFileSync(clusterCanvasPath, 'utf8');

      assert.match(content, /node\.type === 'starNode'/);
      assert.match(content, /onNodeClick\(node\.id\)/);
    });

    it('renders floating cursor tooltip showing file metadata on star hover', () => {
      const content = fs.readFileSync(clusterCanvasPath, 'utf8');

      assert.match(content, /constellation-cursor-tooltip/);
      assert.match(content, /star-tooltip-name/);
      assert.match(content, /star-tooltip-path/);
      assert.match(content, /star-tooltip-meta/);
      assert.match(content, /onNodeMouseEnter/);
      assert.match(content, /onNodeMouseLeave/);
    });

    it('provides empty state and loading overlays consistent with developer tool conventions', () => {
      const content = fs.readFileSync(clusterCanvasPath, 'utf8');

      assert.match(content, /No Clusters Available/);
      assert.match(content, /loading-overlay/);
      assert.match(content, /error-overlay/);
    });
  });

  describe('6. App Shell Integration (client/src/App.jsx)', () => {
    it('imports ClusterCanvas and computeClusterLayout', () => {
      const content = fs.readFileSync(appPath, 'utf8');

      assert.match(content, /import \{ ClusterCanvas \} from '\.\/components\/ClusterCanvas\.jsx'/);
      assert.match(content, /import \{ computeClusterLayout \} from '\.\/utils\/clusterLayout\.js'/);
    });

    it('mounts ClusterCanvas when activeWorkspace is "cluster" inside explore-workspace', () => {
      const content = fs.readFileSync(appPath, 'utf8');

      assert.match(content, /activeWorkspace === 'cluster'\s*\?\s*\(\s*<ClusterCanvas/);
      assert.doesNotMatch(content, /Cluster View Workspace/); // Placeholder is removed
    });

    it('shares selection and SourceViewer across Dependency Graph and Cluster View', () => {
      const content = fs.readFileSync(appPath, 'utf8');

      // ClusterCanvas passes handleSelectNode
      assert.match(content, /<ClusterCanvas[\s\S]*?onNodeClick=\{handleSelectNode\}/);
      assert.match(content, /<ClusterCanvas[\s\S]*?onPaneClick=\{/);

      // SourceViewer is rendered alongside canvas in explore-workspace
      assert.match(content, /<SourceViewer/);
    });
  });

  describe('7. Visual Styling (client/src/App.css)', () => {
    it('defines styles for circular cluster groups, orbit guidelines, star nodes, and hover tooltip', () => {
      const css = fs.readFileSync(appCssPath, 'utf8');

      assert.match(css, /\.trailo-cluster-group\s*\{/);
      assert.match(css, /border-radius:\s*50%/);
      assert.match(css, /\.cluster-orbit-guide\s*\{/);
      assert.match(css, /\.cluster-group-header\s*\{/);
      assert.match(css, /\.constellation-star-node\s*\{/);
      assert.match(css, /\.star-core\s*\{/);
      assert.match(css, /\.constellation-cursor-tooltip\s*\{/);
      assert.match(css, /\.cluster-canvas-container\s*\{/);
    });
  });
});
