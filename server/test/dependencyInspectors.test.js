import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const internalDepsComponentPath = fileURLToPath(
  new URL('../../client/src/components/InternalDepsList.jsx', import.meta.url)
);
const externalDepsComponentPath = fileURLToPath(
  new URL('../../client/src/components/ExternalDepsList.jsx', import.meta.url)
);
const unresolvedDepsComponentPath = fileURLToPath(
  new URL('../../client/src/components/UnresolvedDepsList.jsx', import.meta.url)
);
const sidebarComponentPath = fileURLToPath(
  new URL('../../client/src/components/ContextualSidebar.jsx', import.meta.url)
);
const cssFilePath = fileURLToPath(
  new URL('../../client/src/App.css', import.meta.url)
);

describe('Activity Bar Dependency Inspectors (Internal, External, Unresolved)', () => {
  describe('1. InternalDepsList Component Contract', () => {
    it('verifies InternalDepsList file exists and exports the component', () => {
      assert.equal(fs.existsSync(internalDepsComponentPath), true);
      const content = fs.readFileSync(internalDepsComponentPath, 'utf8');
      assert.match(content, /export function InternalDepsList/);
    });

    it('groups edges by source and supports filtering by file and specifier', () => {
      const content = fs.readFileSync(internalDepsComponentPath, 'utf8');

      // Groups edges by source path
      assert.match(content, /groupedEdges = useMemo/);
      assert.match(content, /map\.set\(edge\.source/);

      // Filter functionality
      assert.match(content, /filteredGroups = useMemo/);
      assert.match(content, /filterText/);

      // Disclosure and selection handlers
      assert.match(content, /handleToggleGroup/);
      assert.match(content, /onSelectFile\(group\.source\)/);
      assert.match(content, /onSelectFile\(edge\.target\)/);
    });

    it('renders truthful empty state when edges array is empty', () => {
      const content = fs.readFileSync(internalDepsComponentPath, 'utf8');
      assert.match(content, /No Internal Dependencies/);
      assert.match(content, /All indexed files are isolated or only import external packages/);
    });
  });

  describe('2. ExternalDepsList Component Contract', () => {
    it('verifies ExternalDepsList file exists and exports the component', () => {
      assert.equal(fs.existsSync(externalDepsComponentPath), true);
      const content = fs.readFileSync(externalDepsComponentPath, 'utf8');
      assert.match(content, /export function ExternalDepsList/);
    });

    it('aggregates dependencies by package specifier and counts occurrences', () => {
      const content = fs.readFileSync(externalDepsComponentPath, 'utf8');

      assert.match(content, /aggregatedPackages = useMemo/);
      assert.match(content, /const key = item\.specifier/);
      assert.match(content, /listB\.length - listA\.length/); // Sort by frequency descending
      assert.match(content, /handleTogglePackage/);
      assert.match(content, /onSelectFile\(importer\.sourcePath\)/);
    });

    it('renders truthful empty state when external array is empty', () => {
      const content = fs.readFileSync(externalDepsComponentPath, 'utf8');
      assert.match(content, /No External Packages/);
      assert.match(content, /No external or third-party packages were detected/);
    });
  });

  describe('3. UnresolvedDepsList Component Contract', () => {
    it('verifies UnresolvedDepsList file exists and exports the component', () => {
      assert.equal(fs.existsSync(unresolvedDepsComponentPath), true);
      const content = fs.readFileSync(unresolvedDepsComponentPath, 'utf8');
      assert.match(content, /export function UnresolvedDepsList/);
    });

    it('renders reassuring clean zero-state when unresolved array is empty', () => {
      const content = fs.readFileSync(unresolvedDepsComponentPath, 'utf8');

      assert.match(content, /Zero Unresolved Imports/);
      assert.match(content, /All relative module specifiers in this codebase resolved cleanly/);
    });

    it('surfaces broken specifiers, line numbers, and file navigation when unresolved imports exist', () => {
      const content = fs.readFileSync(unresolvedDepsComponentPath, 'utf8');

      assert.match(content, /MISSING TARGET/);
      assert.match(content, /item\.specifier/);
      assert.match(content, /item\.sourceLocation\?\.startLine/);
      assert.match(content, /onSelectFile\(item\.sourcePath\)/);
    });
  });

  describe('4. ContextualSidebar Integration', () => {
    it('imports and mounts all 3 inspector components for their respective tabs', () => {
      const content = fs.readFileSync(sidebarComponentPath, 'utf8');

      assert.match(content, /import \{ InternalDepsList \} from '\.\/InternalDepsList\.jsx'/);
      assert.match(content, /import \{ ExternalDepsList \} from '\.\/ExternalDepsList\.jsx'/);
      assert.match(content, /import \{ UnresolvedDepsList \} from '\.\/UnresolvedDepsList\.jsx'/);

      assert.match(content, /activeTab === 'internal'/);
      assert.match(content, /<InternalDepsList/);
      assert.match(content, /edges=\{graphData\.edges\}/);

      assert.match(content, /activeTab === 'external'/);
      assert.match(content, /<ExternalDepsList/);
      assert.match(content, /external=\{graphData\.external\}/);

      assert.match(content, /activeTab === 'unresolved'/);
      assert.match(content, /<UnresolvedDepsList/);
      assert.match(content, /unresolved=\{graphData\.unresolved\}/);
    });

    it('passes selectedFilePath and onSelectFile to all 3 inspectors', () => {
      const content = fs.readFileSync(sidebarComponentPath, 'utf8');

      // Internal
      assert.match(content, /<InternalDepsList[\s\S]*?selectedFilePath=\{selectedFilePath\}/);
      assert.match(content, /<InternalDepsList[\s\S]*?onSelectFile=\{onSelectFile\}/);

      // External
      assert.match(content, /<ExternalDepsList[\s\S]*?selectedFilePath=\{selectedFilePath\}/);
      assert.match(content, /<ExternalDepsList[\s\S]*?onSelectFile=\{onSelectFile\}/);

      // Unresolved
      assert.match(content, /<UnresolvedDepsList[\s\S]*?selectedFilePath=\{selectedFilePath\}/);
      assert.match(content, /<UnresolvedDepsList[\s\S]*?onSelectFile=\{onSelectFile\}/);
    });

    it('contains no remaining placeholder cards in internal, external, or unresolved tabs', () => {
      const content = fs.readFileSync(sidebarComponentPath, 'utf8');

      assert.doesNotMatch(content, /Internal Dependency Matrix/);
      assert.doesNotMatch(content, /will be implemented in Step 2/);
      assert.doesNotMatch(content, /External Package Inspector/);
      assert.doesNotMatch(content, /Import Diagnostics/);
    });

    it('strictly avoids duplicate sub-headings, retaining only the authoritative top capital title', () => {
      const content = fs.readFileSync(sidebarComponentPath, 'utf8');

      assert.match(content, /className="sidebar-header-title"/);
      assert.doesNotMatch(content, /sidebar-section-header/);
      assert.doesNotMatch(content, /Scan Local Repository/);
      assert.doesNotMatch(content, /Indexed Source Files/);
      assert.doesNotMatch(content, /Resolved Internal Edges/);
    });
  });

  describe('5. CSS Styling and Scrollbar Suppression', () => {
    it('defines styles for dependency inspector containers, filter input, groups, and cards', () => {
      const cssContent = fs.readFileSync(cssFilePath, 'utf8');

      assert.match(cssContent, /\.sidebar-deps-wrapper\s*\{/);
      assert.match(cssContent, /\.dep-inspector-container\s*\{/);
      assert.match(cssContent, /\.dep-filter-input\s*\{/);
      assert.match(cssContent, /\.dep-group-header\s*\{/);
      assert.match(cssContent, /\.dep-sub-row\s*\{/);
      assert.match(cssContent, /\.dep-unresolved-card\s*\{/);
    });

    it('includes dependency wrappers in scrollbar suppression while preserving scrollability', () => {
      const cssContent = fs.readFileSync(cssFilePath, 'utf8');

      assert.match(cssContent, /\.sidebar-deps-wrapper[\s\S]*?scrollbar-width:\s*none;/);
      assert.match(cssContent, /\.sidebar-deps-wrapper[\s\S]*?::-webkit-scrollbar/);
      assert.match(cssContent, /\.sidebar-deps-wrapper\s*\{[\s\S]*?overflow-y:\s*auto;/);
    });
  });
});

