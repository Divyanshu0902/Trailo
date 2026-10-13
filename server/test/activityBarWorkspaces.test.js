import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const activityBarPath = fileURLToPath(new URL('../../client/src/components/ActivityBar.jsx', import.meta.url));
const tabBarPath = fileURLToPath(new URL('../../client/src/components/WorkspaceTabBar.jsx', import.meta.url));
const iconsPath = fileURLToPath(new URL('../../client/src/components/Icons.jsx', import.meta.url));
const appPath = fileURLToPath(new URL('../../client/src/App.jsx', import.meta.url));
const appCssPath = fileURLToPath(new URL('../../client/src/App.css', import.meta.url));

describe('Activity Bar Enhancements & Crossable Workspaces', () => {
  describe('1. Activity Bar Icon Sizing & Bottom Workspace Icons (client/src/components/ActivityBar.jsx)', () => {
    it('increases activity bar icon size to 23px for improved legibility', () => {
      const content = fs.readFileSync(activityBarPath, 'utf8');
      assert.match(content, /<IconComponent size=\{23\}/);
    });

    it('defines the 3 bottom workspace icons: Dependency Graph, Cluster View, and Ask Trailo', () => {
      const content = fs.readFileSync(activityBarPath, 'utf8');
      assert.match(content, /GraphIcon/);
      assert.match(content, /ClusterIcon/);
      assert.match(content, /AskTrailoIcon/);
      assert.match(content, /id:\s*'graph'/);
      assert.match(content, /id:\s*'cluster'/);
      assert.match(content, /id:\s*'ask'/);
    });

    it('renders separate activity-bar-top and activity-bar-bottom containers', () => {
      const content = fs.readFileSync(activityBarPath, 'utf8');
      assert.match(content, /activity-bar-items activity-bar-top/);
      assert.match(content, /activity-bar-items activity-bar-bottom/);
    });

    it('triggers onSelectWorkspace when a bottom workspace button is clicked', () => {
      const content = fs.readFileSync(activityBarPath, 'utf8');
      assert.match(content, /onSelectWorkspace\s*&&\s*onSelectWorkspace\(item\.id\)/);
    });
  });

  describe('2. Custom SVG Icons (client/src/components/Icons.jsx)', () => {
    it('exports ClusterIcon with standard Lucide viewBox and stroke properties', () => {
      const content = fs.readFileSync(iconsPath, 'utf8');
      assert.match(content, /export function ClusterIcon/);
      assert.match(content, /viewBox="0 0 24 24"/);
      assert.match(content, /stroke="currentColor"/);
    });

    it('exports AskTrailoIcon with standard Lucide viewBox and speech/code elements', () => {
      const content = fs.readFileSync(iconsPath, 'utf8');
      assert.match(content, /export function AskTrailoIcon/);
      assert.match(content, /viewBox="0 0 24 24"/);
      assert.match(content, /stroke="currentColor"/);
    });
  });

  describe('3. Crossable Workspace Tabs (client/src/components/WorkspaceTabBar.jsx)', () => {
    it('provides close button with CloseIcon for Dependency Graph workspace', () => {
      const content = fs.readFileSync(tabBarPath, 'utf8');
      assert.match(content, /hasRepository\s*&&/);
      assert.match(content, /Dependency Graph/);
      assert.match(content, /tab-close-btn/);
      assert.match(content, /CloseIcon/);
      assert.match(content, /onCloseWorkspace\('graph'\)/);
    });

    it('supports crossable tabs for Cluster View and Ask Trailo', () => {
      const content = fs.readFileSync(tabBarPath, 'utf8');
      assert.match(content, /onCloseWorkspace\('cluster'\)/);
      assert.match(content, /onCloseWorkspace\('ask'\)/);
      assert.match(content, /ClusterIcon/);
      assert.match(content, /AskTrailoIcon/);
    });

    it('strictly excludes any Welcome or Scanner workspace tab', () => {
      const content = fs.readFileSync(tabBarPath, 'utf8');
      assert.doesNotMatch(content, /tab-title.*Welcome/);
      assert.doesNotMatch(content, /tab-title.*Scanner/);
    });
  });

  describe('4. Shell State & Workspace Switching (client/src/App.jsx)', () => {
    it('manages openWorkspaces and activeWorkspace state', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      assert.match(content, /openWorkspaces/);
      assert.match(content, /activeWorkspace/);
      assert.match(content, /handleSelectWorkspace/);
      assert.match(content, /handleCloseWorkspace/);
    });

    it('returns to StartupScreen when all workspaces are closed', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      assert.match(content, /!activeWorkspace\s*\|\|\s*openWorkspaces\.length\s*===\s*0\s*\?\s*\(\s*<StartupScreen \/>\s*\)/);
    });

    it('passes workspace state and navigation handlers to ActivityBar and WorkspaceTabBar', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      assert.match(content, /activeWorkspace=\{activeWorkspace\}/);
      assert.match(content, /onSelectWorkspace=\{handleSelectWorkspace\}/);
      assert.match(content, /onCloseWorkspace=\{handleCloseWorkspace\}/);
    });
  });

  describe('5. CSS Layout & Whitespace (client/src/App.css)', () => {
    it('preserves strict 48px width for shell activity bar', () => {
      const css = fs.readFileSync(appCssPath, 'utf8');
      assert.match(css, /\.shell-activity-bar\s*\{[^}]*width:\s*48px;/);
      assert.match(css, /\.shell-activity-bar\s*\{[^}]*min-width:\s*48px;/);
    });

    it('anchors activity-bar-bottom to the bottom via margin-top: auto', () => {
      const css = fs.readFileSync(appCssPath, 'utf8');
      assert.match(css, /\.activity-bar-bottom\s*\{[^}]*margin-top:\s*auto;/);
    });

    it('styles tab close button with subtle hover feedback', () => {
      const css = fs.readFileSync(appCssPath, 'utf8');
      assert.match(css, /\.workspace-tab\s+\.tab-close-btn\s*\{/);
      assert.match(css, /\.workspace-tab\s+\.tab-close-btn:hover\s*\{/);
    });
  });
});

