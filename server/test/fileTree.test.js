import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildFileTree,
  getAncestorDirPaths,
  normalizeTreePath,
  compareTreeNodes,
} from '../../client/src/utils/fileTree.js';

const fileTreeComponentPath = fileURLToPath(new URL('../../client/src/components/FileTree.jsx', import.meta.url));
const sidebarComponentPath = fileURLToPath(new URL('../../client/src/components/ContextualSidebar.jsx', import.meta.url));
const appComponentPath = fileURLToPath(new URL('../../client/src/App.jsx', import.meta.url));
const tabBarComponentPath = fileURLToPath(new URL('../../client/src/components/WorkspaceTabBar.jsx', import.meta.url));
const sourceViewerComponentPath = fileURLToPath(new URL('../../client/src/components/SourceViewer.jsx', import.meta.url));
const cssFilePath = fileURLToPath(new URL('../../client/src/App.css', import.meta.url));

describe('Repository File Tree Navigation (Phase 4C Step 3)', () => {
  describe('1. normalizeTreePath & getAncestorDirPaths (Unit)', () => {
    it('normalizes backslashes, leading, and trailing slashes to clean POSIX format', () => {
      assert.equal(normalizeTreePath('\\src\\components\\App.jsx\\'), 'src/components/App.jsx');
      assert.equal(normalizeTreePath('//server/src//index.js/'), 'server/src//index.js');
      assert.equal(normalizeTreePath(''), '');
      assert.equal(normalizeTreePath(null), '');
      assert.equal(normalizeTreePath(undefined), '');
    });

    it('extracts ordered ancestor directory paths for nested files', () => {
      assert.deepEqual(getAncestorDirPaths('README.md'), []);
      assert.deepEqual(getAncestorDirPaths('src/index.js'), ['src']);
      assert.deepEqual(
        getAncestorDirPaths('src/components/common/Button.tsx'),
        ['src', 'src/components', 'src/components/common']
      );
    });

    it('handles files in root correctly without returning ancestors', () => {
      assert.deepEqual(getAncestorDirPaths('package.json'), []);
      assert.deepEqual(getAncestorDirPaths(''), []);
    });
  });

  describe('2. buildFileTree Tree Construction & Deterministic Sorting (Unit)', () => {
    it('returns empty array when files is empty, null, or undefined', () => {
      assert.deepEqual(buildFileTree([]), []);
      assert.deepEqual(buildFileTree(null), []);
      assert.deepEqual(buildFileTree(undefined), []);
      assert.deepEqual(buildFileTree('not-an-array'), []);
    });

    it('nests children under their correct parent directories', () => {
      const files = [
        { path: 'src/components/Header.jsx' },
        { path: 'src/components/Footer.jsx' },
        { path: 'src/App.jsx' },
        { path: 'package.json' },
      ];

      const tree = buildFileTree(files);

      // Root level: directory 'src' and file 'package.json'
      assert.equal(tree.length, 2);
      assert.equal(tree[0].name, 'src');
      assert.equal(tree[0].type, 'directory');
      assert.equal(tree[1].name, 'package.json');
      assert.equal(tree[1].type, 'file');

      // Inside 'src': directory 'components' and file 'App.jsx'
      const srcChildren = tree[0].children;
      assert.equal(srcChildren.length, 2);
      assert.equal(srcChildren[0].name, 'components');
      assert.equal(srcChildren[0].type, 'directory');
      assert.equal(srcChildren[1].name, 'App.jsx');
      assert.equal(srcChildren[1].type, 'file');

      // Inside 'src/components': Footer.jsx and Header.jsx
      const compChildren = srcChildren[0].children;
      assert.equal(compChildren.length, 2);
      assert.equal(compChildren[0].name, 'Footer.jsx');
      assert.equal(compChildren[0].type, 'file');
      assert.equal(compChildren[1].name, 'Header.jsx');
      assert.equal(compChildren[1].type, 'file');
    });

    it('sorts directories before files at every level', () => {
      const files = [
        'zebra.js',
        'src/utils.js',
        'alpha.js',
        'docs/readme.md',
        'build/output.js',
      ];

      const tree = buildFileTree(files);

      // Root level: build, docs, src (all dirs) must come before alpha.js, zebra.js (files)
      assert.deepEqual(
        tree.map((n) => ({ name: n.name, type: n.type })),
        [
          { name: 'build', type: 'directory' },
          { name: 'docs', type: 'directory' },
          { name: 'src', type: 'directory' },
          { name: 'alpha.js', type: 'file' },
          { name: 'zebra.js', type: 'file' },
        ]
      );
    });

    it('sorts names case-insensitively while preserving original casing in display', () => {
      const files = [
        'src/b.js',
        'src/A.js',
        'src/c.js',
        'src/Beta/file.js',
        'src/alpha/file.js',
      ];

      const tree = buildFileTree(files);
      const srcNode = tree.find((n) => n.name === 'src');
      assert.ok(srcNode);

      // Directories sorted case-insensitively: 'alpha', 'Beta'
      const dirs = srcNode.children.filter((n) => n.type === 'directory');
      assert.deepEqual(dirs.map((d) => d.name), ['alpha', 'Beta']);

      // Files sorted case-insensitively: 'A.js', 'b.js', 'c.js'
      const filesInSrc = srcNode.children.filter((n) => n.type === 'file');
      assert.deepEqual(filesInSrc.map((f) => f.name), ['A.js', 'b.js', 'c.js']);
    });

    it('handles filenames and directory names with spaces, dots, and hyphens', () => {
      const files = [
        'my project/sub-folder/cool.spec.test.ts',
        'my project/another folder/file with spaces.js',
        'special-root-file.min.css',
      ];

      const tree = buildFileTree(files);

      assert.equal(tree.length, 2);
      assert.equal(tree[0].name, 'my project');
      assert.equal(tree[0].type, 'directory');
      assert.equal(tree[1].name, 'special-root-file.min.css');
      assert.equal(tree[1].type, 'file');

      const myProjectChildren = tree[0].children;
      assert.equal(myProjectChildren.length, 2);
      assert.equal(myProjectChildren[0].name, 'another folder');
      assert.equal(myProjectChildren[1].name, 'sub-folder');
    });

    it('attaches original fileData object to file tree items', () => {
      const fileRecord = {
        path: 'src/main.ts',
        lineCount: 42,
        size: 1024,
        language: 'typescript',
        extension: '.ts',
      };

      const tree = buildFileTree([fileRecord]);
      const srcDir = tree[0];
      const mainFile = srcDir.children[0];

      assert.equal(mainFile.name, 'main.ts');
      assert.equal(mainFile.fileData?.lineCount, 42);
      assert.equal(mainFile.fileData?.language, 'typescript');
    });
  });

  describe('3. FileTree Component Contracts (client/src/components/FileTree.jsx)', () => {
    it('implements accessible tree roles (role="tree", role="treeitem", aria-expanded, aria-selected)', () => {
      const content = fs.readFileSync(fileTreeComponentPath, 'utf8');

      assert.match(content, /role="tree"/);
      assert.match(content, /role="treeitem"/);
      assert.match(content, /aria-expanded=\{isExpanded\}/);
      assert.match(content, /aria-selected=\{isSelected\}/);
    });

    it('uses standard icons without emoji icons (ChevronDown, ChevronRight, Folder, FolderOpen, File)', () => {
      const content = fs.readFileSync(fileTreeComponentPath, 'utf8');

      assert.match(content, /ChevronDownIcon/);
      assert.match(content, /ChevronRightIcon/);
      assert.match(content, /FolderIcon/);
      assert.match(content, /FolderOpenIcon/);
      assert.match(content, /FileIcon/);
      assert.doesNotMatch(content, /📁/);
      assert.doesNotMatch(content, /📄/);
    });

    it('auto-expands ancestor directories when a file is selected', () => {
      const content = fs.readFileSync(fileTreeComponentPath, 'utf8');

      assert.match(content, /getAncestorDirPaths\(selectedFilePath\)/);
      assert.match(content, /setExpandedDirs/);
    });

    it('resets expanded directories when active rootPath changes to prevent stale paths', () => {
      const content = fs.readFileSync(fileTreeComponentPath, 'utf8');

      assert.match(content, /lastRootPathRef\.current/);
      assert.match(content, /setExpandedDirs\(new Set\(\)\)/);
    });
  });

  describe('4. ContextualSidebar Integration (client/src/components/ContextualSidebar.jsx)', () => {
    it('renders FileTree under activeTab === "files" when repository is indexed', () => {
      const content = fs.readFileSync(sidebarComponentPath, 'utf8');

      assert.match(content, /import \{ FileTree \} from '\.\/FileTree\.jsx'/);
      assert.match(content, /activeTab === 'files'/);
      assert.match(content, /<FileTree/);
      assert.match(content, /files=\{graphData\.nodes\}/);
      assert.match(content, /selectedFilePath=\{selectedFilePath\}/);
      assert.match(content, /onSelectFile=\{onSelectFile\}/);
    });

    it('renders honest empty state when no repository is indexed', () => {
      const content = fs.readFileSync(sidebarComponentPath, 'utf8');

      assert.match(content, /No repository indexed yet\./);
      assert.match(content, /Open the Repository Scanner tab to index a codebase\./);
    });
  });

  describe('5. Application State & Graph/Source Synchronization (client/src/App.jsx)', () => {
    it('passes selectedFilePath and handleSelectFile to ContextualSidebar', () => {
      const content = fs.readFileSync(appComponentPath, 'utf8');

      assert.match(content, /selectedFilePath=\{selectedNodeId\}/);
      assert.match(content, /onSelectFile=\{handleSelectFile\}/);
    });

    it('implements handleSelectFile: sets selectedNodeId, opens source explorer, and updates graph highlights', () => {
      const content = fs.readFileSync(appComponentPath, 'utf8');

      assert.match(content, /handleSelectFile = useCallback/);
      assert.match(content, /setSelectedNodeId\(filePath\)/);
      assert.match(content, /setIsSourceOpen\(true\)/);
      assert.match(content, /applyHighlights\(filePath, nodes, edges\)/);
    });

    it('supports isolated files without graph nodes by providing fallback selectedNode metadata', () => {
      const content = fs.readFileSync(appComponentPath, 'utf8');

      assert.match(content, /Fallback for indexed files without graph nodes/);
      assert.match(content, /id: selectedNodeId/);
      assert.match(content, /path: selectedNodeId/);
    });
  });

  describe('6. Scope Guard: Absence of Files Workspace/Tab', () => {
    it('confirms WorkspaceTabBar does not contain a "Files" tab', () => {
      const content = fs.readFileSync(tabBarComponentPath, 'utf8');

      assert.doesNotMatch(content, /tab-title.*Files/);
      assert.doesNotMatch(content, /'files'/);
      assert.doesNotMatch(content, /FilesIcon/);
    });
  });

  describe('7. Scrollbar Suppression & REPOSITORY_NOT_FOUND Recovery', () => {
    it('suppresses visual scrollbars in sidebar and source viewer while maintaining scrollability', () => {
      const cssContent = fs.readFileSync(cssFilePath, 'utf8');

      // Verify scrollbar-width: none and -ms-overflow-style: none exist for sidebar and viewer
      assert.match(cssContent, /\.shell-contextual-sidebar[\s\S]*?scrollbar-width:\s*none;/);
      assert.match(cssContent, /\.sidebar-body[\s\S]*?scrollbar-width:\s*none;/);
      assert.match(cssContent, /\.sidebar-file-tree-wrapper[\s\S]*?scrollbar-width:\s*none;/);
      assert.match(cssContent, /\.viewer-code-container[\s\S]*?scrollbar-width:\s*none;/);
      assert.match(cssContent, /::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);

      // Verify mouse-wheel scrolling capability is preserved via overflow-y: auto / overflow: auto
      assert.match(cssContent, /\.sidebar-body\s*\{[\s\S]*?overflow-y:\s*auto;/);
      assert.match(cssContent, /\.sidebar-file-tree-wrapper\s*\{[\s\S]*?overflow-y:\s*auto;/);
      assert.match(cssContent, /\.viewer-code-container\s*\{[\s\S]*?overflow:\s*auto;/);
    });

    it('ContextualSidebar applies sidebar-body-files class modifier for files tab', () => {
      const content = fs.readFileSync(sidebarComponentPath, 'utf8');
      assert.match(content, /sidebar-body \$\{activeTab === 'files' \? 'sidebar-body-files' : ''\}/);
    });

    it('App implements auto-reindexing recovery when REPOSITORY_NOT_FOUND occurs', () => {
      const content = fs.readFileSync(appComponentPath, 'utf8');

      // Verify auto-reindexing logic in source loading effect
      assert.match(content, /result\.error\.code === 'REPOSITORY_NOT_FOUND'/);
      assert.match(content, /fetch\('\/api\/scan'/);
      assert.match(content, /defaultSourceLoader\.loadSource\(selectedNodeId\)/);

      // Verify retry handler also re-indexes when REPOSITORY_NOT_FOUND is active
      assert.match(content, /handleRetrySource = useCallback/);
      assert.match(content, /sourceState\.error\?\.code === 'REPOSITORY_NOT_FOUND'/);
    });

    it('SourceViewer displays informative snapshot error and re-index action button', () => {
      const content = fs.readFileSync(sourceViewerComponentPath, 'utf8');

      assert.match(content, /error\.code === 'REPOSITORY_NOT_FOUND'/);
      assert.match(content, /Re-index & Load Source/);
    });
  });
});

