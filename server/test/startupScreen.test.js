import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const startupScreenPath = fileURLToPath(new URL('../../client/src/components/StartupScreen.jsx', import.meta.url));
const appPath = fileURLToPath(new URL('../../client/src/App.jsx', import.meta.url));
const appCssPath = fileURLToPath(new URL('../../client/src/App.css', import.meta.url));
const tabBarPath = fileURLToPath(new URL('../../client/src/components/WorkspaceTabBar.jsx', import.meta.url));
const titleBarPath = fileURLToPath(new URL('../../client/src/components/AppTitleBar.jsx', import.meta.url));
const sidebarPath = fileURLToPath(new URL('../../client/src/components/ContextualSidebar.jsx', import.meta.url));
const logo2Path = fileURLToPath(new URL('../../assets/logo2.png', import.meta.url));

describe('Startup Screen & Scanner Sidebar Specification (Phase 4C UI Redesign)', () => {
  describe('1. Startup Screen Component (client/src/components/StartupScreen.jsx)', () => {
    it('imports and displays assets/logo2.png directly', () => {
      const content = fs.readFileSync(startupScreenPath, 'utf8');
      assert.match(content, /assets\/logo2\.png/);
      assert.match(content, /<img[^>]+src=\{logo2Img\}[^>]*alt="Trailo Logo"/);
    });

    it('excludes any separate Trailo heading beneath the logo', () => {
      const content = fs.readFileSync(startupScreenPath, 'utf8');
      assert.doesNotMatch(content, /<h[1-6][^>]*>Trailo<\/h[1-6]>/);
      assert.doesNotMatch(content, /className="[^"]*heading[^"]*"/);
    });

    it('excludes the tagline or any caption beneath the logo', () => {
      const content = fs.readFileSync(startupScreenPath, 'utf8');
      assert.doesNotMatch(content, /Understand any codebase faster/);
      assert.doesNotMatch(content, /className="[^"]*tagline[^"]*"/);
    });

    it('renders the exact 4 informational guidance items with correct descriptions', () => {
      const content = fs.readFileSync(startupScreenPath, 'utf8');

      // 1. Scanner
      assert.match(content, /Scanner/);
      assert.match(content, /Scans and indexes a repository\./);

      // 2. Dependency Graph
      assert.match(content, /Dependency Graph/);
      assert.match(content, /Visualizes dependencies between files\./);

      // 3. Cluster View
      assert.match(content, /Cluster View/);
      assert.match(content, /Groups related code into visual clusters\./);

      // 4. Ask Trailo
      assert.match(content, /Ask Trailo/);
      assert.match(content, /Get code-grounded answers from AI\./);
    });

    it('is purely informational with no interactive forms, inputs, or buttons', () => {
      const content = fs.readFileSync(startupScreenPath, 'utf8');
      assert.doesNotMatch(content, /<form/);
      assert.doesNotMatch(content, /<input/);
      assert.doesNotMatch(content, /<button/);
      assert.doesNotMatch(content, /<a /);
    });
  });

  describe('2. Visual Styling & CSS Filters (client/src/App.css)', () => {
    it('preserves logo2.png original black shade with zero CSS filters or recoloring', () => {
      const css = fs.readFileSync(appCssPath, 'utf8');

      // Verify startup-logo-img styling
      assert.match(css, /\.startup-logo-img\s*\{/);

      // Must NOT contain filter: invert, brightness, etc. on startup-logo-img
      const logoRuleMatch = css.match(/\.startup-logo-img\s*\{([^}]+)\}/);
      assert.ok(logoRuleMatch, '.startup-logo-img rule should exist');
      const logoRule = logoRuleMatch[1];
      assert.doesNotMatch(logoRule, /filter\s*:/);
      assert.doesNotMatch(logoRule, /invert/);
    });

    it('renders startup screen on clean unadorned background without cards or borders', () => {
      const css = fs.readFileSync(appCssPath, 'utf8');
      const screenRuleMatch = css.match(/\.startup-screen\s*\{([^}]+)\}/);
      assert.ok(screenRuleMatch, '.startup-screen rule should exist');
      const screenRule = screenRuleMatch[1];
      assert.doesNotMatch(screenRule, /border\s*:/);
      assert.doesNotMatch(screenRule, /box-shadow\s*:/);
    });
  });

  describe('3. Absolute Absence of "Welcome" & "Scanner" Tabs in Navigation', () => {
    it('verifies WorkspaceTabBar contains no Welcome or Scanner tab', () => {
      const content = fs.readFileSync(tabBarPath, 'utf8');
      assert.doesNotMatch(content, /tab-title.*Welcome/);
      assert.doesNotMatch(content, /tab-title.*Scanner/);
      assert.doesNotMatch(content, /'welcome'/);
      assert.doesNotMatch(content, /'scanner'/);
      assert.doesNotMatch(content, /HomeIcon/);
      assert.doesNotMatch(content, /ScanIcon/);
    });

    it('verifies WorkspaceTabBar renders "Dependency Graph" tab conditionally when repository is active', () => {
      const content = fs.readFileSync(tabBarPath, 'utf8');
      assert.match(content, /hasRepository\s*&&/);
      assert.match(content, /Dependency Graph/);
      assert.match(content, /GraphIcon/);
    });

    it('verifies AppTitleBar does not navigate to a Welcome screen on brand click', () => {
      const content = fs.readFileSync(titleBarPath, 'utf8');
      assert.doesNotMatch(content, /welcome/i);
      assert.doesNotMatch(content, /onSelectWorkspace/);
    });
  });

  describe('4. Repository Scanner in Contextual Sidebar', () => {
    it('hosts the scan form, folder input, and scan button inside ContextualSidebar', () => {
      const content = fs.readFileSync(sidebarPath, 'utf8');
      assert.match(content, /id="sidebar-repo-input"/);
      assert.match(content, /className="sidebar-scan-form"/);
      assert.match(content, /btn-scan-sidebar/);
      assert.match(content, /Scan &amp; Index/);
    });

    it('provides scanning spinner and structured error display in ContextualSidebar', () => {
      const content = fs.readFileSync(sidebarPath, 'utf8');
      assert.match(content, /spinner-inline/);
      assert.match(content, /sidebar-error-card/);
      assert.match(content, /sidebar-error-badge/);
      assert.match(content, /sidebar-error-message/);
    });
  });

  describe('5. Application State & Layout Flow (client/src/App.jsx)', () => {
    it('renders StartupScreen when no repository is loaded (!graphData)', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      assert.match(content, /import \{ StartupScreen \} from '\.\/components\/StartupScreen\.jsx'/);
      assert.match(content, /!graphData\s*\?\s*\(\s*<StartupScreen \/>\s*\)\s*:/);
    });

    it('does not import or reference deprecated WelcomeScreen or ScannerWorkspace components', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      assert.doesNotMatch(content, /WelcomeScreen/);
      assert.doesNotMatch(content, /ScannerWorkspace/);
      assert.doesNotMatch(content, /workspaceState/);
    });

    it('ensures source explorer is collapsed by default after successful scan and graph load', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      // loadGraphFromPayload sets setIsSourceOpen(false)
      assert.match(content, /loadGraphFromPayload/);
      assert.match(content, /setIsSourceOpen\(false\)/);
    });

    it('retains current view and surfaces error in sidebar when scan fails', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      // catch block sets error without navigating away
      assert.match(content, /catch\s*\(\s*err\s*\)\s*\{/);
      assert.match(content, /setError\(\{/);
    });
  });

  describe('6. Asset Integrity', () => {
    it('verifies assets/logo2.png exists as a valid image asset', () => {
      assert.equal(fs.existsSync(logo2Path), true);
      const stat = fs.statSync(logo2Path);
      assert.ok(stat.size > 1000, 'logo2.png should be a non-trivial file');
    });
  });
});
