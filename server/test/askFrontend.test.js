import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const askWorkspacePath = fileURLToPath(new URL('../../client/src/components/AskTrailoWorkspace.jsx', import.meta.url));
const sourceViewerPath = fileURLToPath(new URL('../../client/src/components/SourceViewer.jsx', import.meta.url));
const appPath = fileURLToPath(new URL('../../client/src/App.jsx', import.meta.url));
const appCssPath = fileURLToPath(new URL('../../client/src/App.css', import.meta.url));

describe('Ask Trailo Frontend — Component & Integration Specifications', () => {
  describe('1. AskTrailoWorkspace Component (client/src/components/AskTrailoWorkspace.jsx)', () => {
    it('defines AskTrailoWorkspace with conversation timeline, composer, and citation handling', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.match(content, /export function AskTrailoWorkspace/);
      assert.match(content, /repositoryId/);
      assert.match(content, /onCitationClick/);
    });

    it('implements robust SSE stream reading with TextDecoder and chunk boundary handling', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.match(content, /readSSEStream/);
      assert.match(content, /TextDecoder\(['"]utf-8['"]\)/);
      assert.match(content, /reader\.read\(\)/);
      assert.match(content, /buffer\.match\(\/\\r\?\\n\\r\?\\n\/\)/);
      assert.match(content, /JSON\.parse\(dataStr\)/);
    });

    it('calls the canonical POST /api/ask/stream endpoint with repositoryId, question, and bounded history', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.match(content, /fetch\(['"]\/api\/ask\/stream['"]/);
      assert.match(content, /method:\s*['"]POST['"]/);
      assert.match(content, /repositoryId/);
      assert.match(content, /question:/);
      assert.match(content, /history:/);
    });

    it('handles all SSE protocol events: start, delta, complete, and error', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.match(content, /eventName === 'delta'/);
      assert.match(content, /eventName === 'complete'/);
      assert.match(content, /eventName === 'error'/);
    });

    it('enforces session-only memory without localStorage or sessionStorage', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.doesNotMatch(content, /localStorage/);
      assert.doesNotMatch(content, /sessionStorage/);
      assert.doesNotMatch(content, /indexedDB/);
    });

    it('resets in-memory conversation when active repositoryId changes', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.match(content, /activeRepoIdRef/);
      assert.match(content, /activeRepoIdRef\.current !== repositoryId/);
      assert.match(content, /setMessages\(\[\]\)/);
    });

    it('provides Stop Generation using AbortController and Retry action for errors or cancellations', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.match(content, /abortRef\.current\.abort\(\)/);
      assert.match(content, /handleStop/);
      assert.match(content, /btn-stop-generating/);
      assert.match(content, /btn-retry-action/);
    });

    it('surfaces the required Google Gemini hosted-AI privacy disclosure', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.match(content, /ask-privacy-banner/);
      assert.match(content, /Google[’']?s hosted Gemini API/);
      assert.match(content, /Hosted AI Disclosure/);
    });

    it('renders AI text safely using pure React tokens without dangerouslySetInnerHTML', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.doesNotMatch(content, /dangerouslySetInnerHTML/);
    });

    it('renders validated clickable citations only after complete event', () => {
      const content = fs.readFileSync(askWorkspacePath, 'utf8');
      assert.match(content, /ask-citation-badge/);
      assert.match(content, /ask-sources-box/);
      assert.match(content, /onCitationClick/);
    });
  });

  describe('2. SourceViewer Citation Navigation (client/src/components/SourceViewer.jsx)', () => {
    it('accepts highlightRange prop and adds .source-code-row.is-cited', () => {
      const content = fs.readFileSync(sourceViewerPath, 'utf8');
      assert.match(content, /highlightRange = null/);
      assert.match(content, /is-cited/);
      assert.match(content, /lineNum >= highlightRange\.startLine/);
      assert.match(content, /lineNum <= highlightRange\.endLine/);
    });

    it('scrolls the first cited line into view using firstCitedRef and scrollIntoView', () => {
      const content = fs.readFileSync(sourceViewerPath, 'utf8');
      assert.match(content, /firstCitedRef/);
      assert.match(content, /scrollIntoView/);
      assert.match(content, /lineNum === highlightRange\.startLine \? firstCitedRef : undefined/);
    });

    it('displays active citation line badge in the viewer header', () => {
      const content = fs.readFileSync(sourceViewerPath, 'utf8');
      assert.match(content, /viewer-badge-citation/);
      assert.match(content, /highlightRange\.startLine/);
      assert.match(content, /highlightRange\.endLine/);
    });
  });

  describe('3. Application Integration (client/src/App.jsx)', () => {
    it('mounts AskTrailoWorkspace in main explore-workspace when activeWorkspace is "ask"', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      assert.match(content, /import \{ AskTrailoWorkspace \} from '\.\/components\/AskTrailoWorkspace\.jsx'/);
      assert.match(content, /activeWorkspace === 'ask'\s*\?\s*\(\s*<AskTrailoWorkspace/);
    });

    it('manages sourceHighlightRange and connects onCitationClick to SourceViewer', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      assert.match(content, /sourceHighlightRange/);
      assert.match(content, /handleCitationClick/);
      assert.match(content, /highlightRange=\{sourceHighlightRange\}/);
    });
  });

  describe('4. Visual Styling Specifications (client/src/App.css)', () => {
    it('defines distinct .source-code-row.is-cited styling with blue accent border', () => {
      const css = fs.readFileSync(appCssPath, 'utf8');
      assert.match(css, /\.source-code-row\.is-cited\s*\{/);
      assert.match(css, /border-left:\s*3px solid #58a6ff/);
    });

    it('defines styles for AskTrailoWorkspace timeline, composer, and citations', () => {
      const css = fs.readFileSync(appCssPath, 'utf8');
      assert.match(css, /\.ask-workspace\s*\{/);
      assert.match(css, /\.ask-timeline\s*\{/);
      assert.match(css, /\.ask-composer-area\s*\{/);
      assert.match(css, /\.ask-citation-badge\s*\{/);
      assert.match(css, /\.ask-sources-box\s*\{/);
    });
  });
});
