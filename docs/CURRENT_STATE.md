# Current Project State

**Last updated:** Phase 4C UI Redesign Step 3 & Scrollbar/Snapshot Self-Healing Fixes (completed and verified)
**Current phase:** Phase 4C — Interactive Graph and Source Explorer (Application Shell, Compact Header, Startup Screen, Contextual Sidebar Scanner, Repository File Tree, and Scrollbar/Snapshot Fixes complete; Step 4 pending review and authorization)
**Verified commit:** 4085612 (working tree contains Step 3 Repository File Tree and Bugfix updates)
**Branch:** main

## Phase Roadmap Status

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 0** | Fresh foundation and documentation | **Complete** (committed in `ee60225`) |
| **Phase 1** | App skeleton | **Complete** (committed in `e410760`) |
| **Phase 2** | Safe scanning | **Complete** (committed in `e410760`, 10/10 tests pass) |
| **Phase 3** | Index and dependency extraction | **Complete** (committed in `20c0ecf`, 54/54 tests pass) |
| **Phase 4** | Graph and source explorer | **In Progress** (Phase 4A, 4B, 4C Steps 1, 1.1, Startup Screen, Sidebar Scanner, File Tree, and Scrollbar/Snapshot Fixes complete, 173/173 tests pass; Step 4 pending) |
| **Phase 5** | Q&A vertical slice | **Not Started** |
| **Phase 6** | Citation validation and integration | **Not Started** |
| **Phase 7** | Complete user journey | **Not Started** |
| **Phase 8** | Hardening and release | **Not Started** |

## Verified Implementation

- **Monorepo setup:** Clean root `package.json` with npm workspaces for `server` and `client`.
- **Backend foundation:** Express application using ES modules with decoupled app creation (`createApp`) in `server/src/app.js` and standalone listener in `server/src/index.js`.
- **Health endpoint:** `GET /api/health` returning JSON payload `{ status: 'ok', service: 'trailo-api', timestamp }`.
- **Frontend foundation:** React 18 + Vite client with dev proxy for `/api`, dark theme, responsive landing layout, dynamic health status check with success/error states, and retry capability.
- **Repository scanner module:** `server/src/scanner/` implemented with `scanRepository`, `countLines`, and `ScannerError`.
  - Canonical root resolution via `fs.realpath` and path traversal confinement checks.
  - Directory and secret ignore policies (`.git`, `node_modules`, `dist`, `.env*`, `id_rsa*`, etc.).
  - Extensions allowlist for JS/TS (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`), binary extensions filter, and buffer null-byte detection.
  - Symlink safety: rejects links escaping root, prevents ordinary-name symlinks from bypassing ignored directory rules, breaks directory/junction cycles without recursion.
  - Resource limits: caps at 1,000 files, 500 KB per file, 20 MB total content.
- **Source chunking module (Phase 3 Increment A):** `server/src/indexer/chunker.js`.
  - Deterministic line-aware chunking decoupled from language parsers and ASTs.
  - 1-based inclusive line numbers (`startLine`, `endLine`) and stable chunk ID format (`${filePath}:L${startLine}-L${endLine}`).
  - Robust handling of CRLF/LF normalizations, blank lines, trailing newlines, and empty files.
- **JS/TS dependency analyzer (Phase 3 Increment B):** `server/src/analyzer/`.
  - Uses TypeScript Compiler API (`typescript@5.9.3`) for pure in-memory AST syntax analysis without filesystem I/O or executing analyzed code.
  - Extracts ESM imports (default, named, namespace, side-effect, type), ESM re-exports (`export ... from '...'`), CommonJS `require(...)`, dynamic imports, and TypeScript `import = require(...)`.
  - Records 1-based declaration line ranges (`sourceLocation: { startLine, endLine }`).
  - Path resolver (`resolver.js`) resolves relative imports against indexed files with candidate extensions (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) and directory index resolution (`/index.ts`, etc.). Handles TS ESM `.js` specifiers mapped to `.ts` / `.tsx` source files.
  - Normalizes output to language-neutral records: `{ sourcePath, targetPath, specifier, kind, language, resolutionStatus, sourceLocation }` where `resolutionStatus` is honestly reported as `'resolved'`, `'external'`, or `'unresolved'`.
  - AST objects are strictly internal and never leak into downstream models.
- **In-memory index store & coordinator (Phase 3 Increment C):** `server/src/indexer/`.
  - `IndexStore`: Holds active index snapshots with files, chunks, and normalized dependencies. Provides fast lookups (`getFile`, `getAllFiles`, `getChunks`, `getChunkById`, `getAllDependencies`, `getOutboundDependencies`, `getInboundDependencies`, `getSnapshotSummary`).
  - `indexer.js`: End-to-end coordinator (`indexRepository`) uniting repository scanning, source line chunking, dependency analysis, and store population.
- **Dependency graph module (Phase 4A):** `server/src/graph/` (`graphBuilder.js`, `graphRoutes.js`, `index.js`).
  - Separates graph construction from routing logic.
  - `buildDependencyGraph(snapshot)`: Generates validated node records (`id`, `path`, `name`, `language`, `lineCount`, `size`, `extension`), directed dependency edges (`source` -> `target`), separate `unresolved` and `external` dependency arrays without creating external nodes, deduplicating identical edges, and computing graph summary metrics (`totalNodes`, `totalEdges`, `resolvedCount`, `unresolvedCount`, `externalCount`).
  - Graph API routes: `GET /api/repositories/:id/graph` (supporting snapshot ID or `'current'`) and `GET /api/graph` returning the current active snapshot graph.
  - Structured 404 error responses for unindexed snapshots or missing IDs (`{ error: { code: 'REPOSITORY_NOT_FOUND', message: '...' } }`).
- **UI interaction specification (Phase 4B):** Documented in `docs/UI_INTERACTION_SPEC.md` (Focused Revision).
  - Formally specifies dual workspaces (Explore, Ask Trailo), 3-panel split layouts with flexible laptop-friendly sizing, core MVP vs. optional/deferred features, truthful empty states, citation validation UX, and minimal Phase 4C backend prerequisites.
- **Backend prerequisites for interactive explorer (Phase 4C Step 1):** Implemented in `server/src/indexer/` (`scanRoutes.js`, `fileRoutes.js`).
  - Scan initialization: `POST /api/scan` and `POST /api/repositories` with input validation, `ScannerError` HTTP mapping, and repository summary responses.
  - Source content retrieval: `GET /api/repositories/:id/files?path=...` and `GET /api/files?path=...` (also `.../files/*`) with strict in-memory snapshot retrieval, POSIX relative path validation, and traversal prevention (`INVALID_FILE_PATH`, `FILE_NOT_FOUND`).
- **Real dependency graph rendering (Phase 4C Step 2B):** Implemented in `client/` using `@xyflow/react` (`^12.12.0`).
  - Workspace header (`client/src/components/ExploreHeader.jsx`): Repository path input, scan trigger button with loading indicator, and summary metrics pills (`Files`, `Edges`, `External`, `Unresolved`).
  - Interactive canvas (`client/src/components/GraphCanvas.jsx`): React Flow integration with `<Controls>`, `<Background>`, `<MiniMap>`, smoothstep directed edges with directional arrow markers, zoom, pan, and fit-to-view.
  - Custom file node (`client/src/components/FileNode.jsx`): Shows language badge (`JS`, `TS`, `TSX`, `JSX`), file name, directory path, line count, and byte size.
  - Deterministic layout (`client/src/utils/layout.js`): Layered topological layout for connected dependency graphs with orderly grid tiling for isolated nodes.
  - Truthful states: Unindexed state prompt, in-flight loading overlay, structured error card overlay, and an informative banner when indexed files have zero internal dependency edges.
- **Node selection & source viewer stabilization (Phase 4C Step 2C):** Implemented in `client/` and verified with automated test suite.
  - Selection engine (`client/src/utils/graphSelection.js`): Pure deterministic helper classifying nodes (`selected`, `incoming`, `outgoing`, `dimmed`, `normal`) and directed edges (`incoming`, `outgoing`, `dimmed`, `normal`). Handles isolated nodes (zero incident edges).
  - Sticky selection: Single click selects active file; clicking the already-selected node retains selection rather than toggling off. Deselection is scoped to background pane clicks and the close `[✕]` button.
  - Asynchronous source loading (`client/src/App.jsx`, `client/src/utils/sourceLoader.js`): Driven by React `useEffect` with cleanup cancellation flag (`isCurrent = false`) ensuring superseded in-flight requests never freeze the viewer or overwrite newer selections. Native browser `window.fetch` is invoked directly with `window` as its explicit receiver, guaranteeing zero "Illegal invocation" WebIDL errors without fragile `.call()` or detached function references.
  - Draggable splitter divider (`.workspace-splitter`): Draggable divider between graph canvas and source viewer supporting mouse dragging and keyboard adjustment (ArrowLeft, ArrowRight, Home, End) bounded between 320px and 850px (reserving at least 300px for graph canvas).
  - Unified line-number rendering (`client/src/components/SourceViewer.jsx`, `client/src/App.css`): Unified `.source-code-row` layout pairing line numbers with code content per row, physically preventing vertical gutter drift or disappearing line numbers on trailing lines. Honest loading indicator is rendered while awaiting initial file payload.
  - Source line splitting & indentation (`client/src/utils/sourceHighlighter.js`): Shared `splitSourceLines` utility normalizing CRLF/LF, preserving leading spaces, tabs, and consecutive blank lines, while stripping terminal EOF split artifacts to match backend `scanner.countLines` and `chunker.splitLines`. Monospace display enforces `tab-size: 2; -moz-tab-size: 2; white-space: pre;`.
  - Safe syntax highlighting (`prismjs@^1.30.0`): Syntax tokenization mapped to pure React `<span>` elements with unique keys and zero `dangerouslySetInnerHTML`, supporting JS, TS, JSX, TSX, JSON, CSS, and Markdown with dark theme token colors and plain-text fallback.
  - Collapsible source explorer: Explorer panel is collapsed by default after scanning, granting full viewport width to the dependency graph. Automatically expands on node selection, updates when clicking other nodes without closing, supports manual collapse via `›` control or deselection via `✕`, reopens when clicking a node again on canvas or via the docked `‹ Source` tab, and preserves custom resized panel width (`320px` to `850px`).
- **VS Code-inspired application shell (Phase 4C UI Redesign Step 1 & Step 1.1 Refinements):** Implemented in `client/` and verified.
  - Top Application Bar (`client/src/components/AppTitleBar.jsx`): Compact 30px height, official product logo `assets/logo.png` (enlarged slightly to 20px x 20px for crisp visibility while keeping titlebar compact at 30px), 0.82rem brand title, repository folder name in clean white text separated from Trailo by ` | ` (deep blue pill and highlighting removed), and desktop window controls (minimize, fullscreen/maximize, close) in the top-right corner. Brand click returns to Welcome screen.
  - Activity Bar (`client/src/components/ActivityBar.jsx`): 48px wide persistent activity bar on the far left featuring categories: Scanner (`ScanIcon`), Files (`FilesIcon`), Internal dependencies (`InternalDepIcon`), External dependencies (`ExternalDepIcon`), and Unresolved dependencies (`UnresolvedDepIcon`), with dynamic badge counters and warning states. Scanner icon toggles/selects the contextual sidebar's Scanner category.
  - Contextual Sidebar (`client/src/components/ContextualSidebar.jsx`): 280px sidebar beside activity bar with 30px header collapse button aligned with workspace tabs, hosting local repository scan form (`#sidebar-repo-input`, `Scan & Index` action, in-flight spinner, and structured error card) under "Scanner", hierarchical repository file tree (`FileTree.jsx`) under "Files", active repository metadata summary when indexed, and truthful placeholders for Internal, External, and Unresolved categories.
  - Compact Workspace Tab Bar (`client/src/components/WorkspaceTabBar.jsx`): Compact 30px height with clean navigation tab (`Dependency Graph` when repository is active; empty when no repository is open), plus primary sidebar toggle (`SidebarIcon`) and source inspector toggle (`SourceIcon`). Contains zero "Welcome" or "Scanner" tabs.
  - Main Workspace Area (`client/src/components/GraphCanvas.jsx`, `client/src/components/SourceViewer.jsx`, `client/src/components/StartupScreen.jsx`): Renders the Startup Screen when no repository is loaded (`!graphData`), and transitions automatically to the full graph canvas upon successful scan with the source viewer collapsed by default.
  - Consistent SVG Icon System (`client/src/components/Icons.jsx`): Developer icon system with uniform 24x24 viewBox, stroke-width 1.75, fill none, stroke currentColor, including `MinimizeIcon`, `MaximizeIcon`, `ChevronDownIcon`, `FileIcon`, and `FolderOpenIcon`.
  - Shell Navigation State (`client/src/utils/graphSelection.js`): Pure deterministic helper `transitionActivityBarState` handles category switching, collapse/expand toggle on repeated clicks, and sidebar state persistence.
- **Repository File Tree Navigation (Phase 4C UI Redesign Step 3):** Implemented in `client/` and verified.
  - Hierarchical Tree Builder (`client/src/utils/fileTree.js`): Pure deterministic utility (`buildFileTree`, `getAncestorDirPaths`, `compareTreeNodes`) constructing nested directory trees from indexed repository file metadata. Orders directories before files at every level, sorts names alphabetically case-insensitively while preserving original display casing, and normalizes paths to POSIX format.
  - Interactive File Tree Component (`client/src/components/FileTree.jsx`): Embedded in `ContextualSidebar.jsx` under the `Files` category. Supports expanding and collapsing directories with clear disclosure chevrons, auto-expands ancestor directories when a file is selected (from canvas or sidebar), resets directory expansion on repository switch, provides accessible roles (`role="tree"`, `role="treeitem"`, `aria-expanded`, `aria-selected`), and handles keyboard interaction (`Enter` / `Space`).
  - Graph Selection & Source Viewer Synchronization: Selecting a file in the tree updates `selectedNodeId` and automatically opens/updates the source explorer panel. If the file has a corresponding graph node, it highlights the node and its incident edges on canvas; if the file is isolated or lacks a graph node, it clears graph highlights without errors while still retrieving and displaying source code through the existing source API. Clicking graph nodes synchronizes with the file tree highlight bidirectionally.
  - Truthful Empty State: Displays a clean "No repository indexed yet." empty state in the Files category when no repository has been loaded into memory.
- **Scrollbar Suppression & In-Memory Snapshot Self-Healing (Bugfix):** Implemented in `client/` and verified.
  - Scrollbar Suppression (`client/src/App.css`): Completely hides visual scrollbars across `.shell-contextual-sidebar`, `.sidebar-body`, `.sidebar-file-tree-wrapper`, `.file-tree-container`, `.source-viewer-panel`, `.viewer-body`, and `.viewer-code-container` using standard `scrollbar-width: none`, `-ms-overflow-style: none`, and `::-webkit-scrollbar { display: none !important; }`, while strictly preserving 100% normal mouse scroll wheel, trackpad, and keyboard scrolling functionality.
  - File Tree Sidebar Layout (`client/src/components/ContextualSidebar.jsx`, `client/src/App.css`): Added `.sidebar-body-files` modifier class providing unified single-container scrolling for the file tree, eliminating nested scroll boundaries.
- **Activity Bar Dependency Inspectors (Phase 4C Step 4):** Implemented in `client/` and verified.
  - Internal Dependencies Inspector (`client/src/components/InternalDepsList.jsx`): Replaced placeholder card with an interactive inspector under the Internal tab (`activeTab === 'internal'`). Groups resolved internal edges by source file, supports real-time text filtering (across source, target, and specifier), provides collapsible source file groups with outgoing counts, displays target files with import specifiers and line numbers (`L${line}`), and enables direct single-click navigation (`onSelectFile(file)`) to open any file in the Source Viewer and highlight its node on the graph canvas.
  - External Packages Inspector (`client/src/components/ExternalDepsList.jsx`): Replaced placeholder card under the External tab (`activeTab === 'external'`). Aggregates third-party dependencies by package specifier (e.g. `express`, `cors`, `dotenv`), counts total import references across the repository, sorts packages by usage frequency descending then alphabetically, provides collapsible package cards with usage badges, displays each importing file with line number and kind pills, and supports real-time search filtering.
  - Unresolved Imports Inspector (`client/src/components/UnresolvedDepsList.jsx`): Replaced placeholder card under the Unresolved tab (`activeTab === 'unresolved'`). Displays diagnostic warning cards for broken relative paths or missing files with line numbers and diagnostic badges (`MISSING TARGET`), enables jumping directly to the importing source location, provides real-time search, and shows a truthful reassuring green checkmark empty state when all relative imports resolve cleanly (`0 unresolved`).
  - Contextual Sidebar Integration (`client/src/components/ContextualSidebar.jsx`): Mounted all 3 inspectors with `graphData.edges`, `graphData.external`, and `graphData.unresolved`, unified single-container scrolling with `.sidebar-body-deps`, and eliminated all remaining placeholder cards.
- **Activity Bar Enhancements & Crossable Workspaces (Phase 4C UI Refinement):** Implemented in `client/` and verified.
  - Icon Sizing & Spacing (`ActivityBar.jsx`, `App.css`): Increased icon size slightly from 20px to 23px for crisper legibility, while preserving the strict 48px activity bar width with balanced 12.5px whitespace padding and smooth hover scaling.
  - Bottom Workspace Icons: Added 3 dedicated workspace icons pinned at the bottom of the Activity Bar (`.activity-bar-bottom`): Dependency Graph (`GraphIcon`), Cluster View (`ClusterIcon`), and Ask Trailo (`AskTrailoIcon`). Clicking any bottom icon opens or brings forward the corresponding workspace tab.
  - Crossable Workspace Tabs (`WorkspaceTabBar.jsx`, `App.jsx`, `App.css`): Added close (`✕`) buttons to workspace tabs. Closing a workspace tab removes it from open tabs; when all open workspaces are closed, the application cleanly and automatically returns to the centered `StartupScreen`.
  - Workspace Placeholders: Added dark-themed preview/placeholder workspaces for Cluster View and Ask Trailo, allowing full multi-workspace tab navigation.
- **Automated test suite:** 202/202 tests passing cleanly across 58 suites with Node.js built-in runner (`node --test`), covering health endpoint, repository scanner, line chunker, JS/TS analyzer, path resolver, index store, end-to-end repository indexing, graph builder, graph routes, scan routes, secure file content routes, graph selection engine, source loader cache/race protection, browser fetch invocation receiver bindings, line splitting and newline preservation, Prism grammar resolution and tokenization, resizer panel width clamping, graph layout state synchronization, collapsible source explorer state transitions, application shell navigation transitions, Startup Screen / Scanner Sidebar contracts, repository file tree navigation contracts, scrollbar suppression / snapshot recovery contracts, dependency inspectors contracts (`InternalDepsList`, `ExternalDepsList`, `UnresolvedDepsList`), and Activity Bar bottom icons / crossable workspace contracts.
- **Client production build:** Verified `vite build` cleanly emitting production assets into `client/dist/` in 3.60s.
- **Git & Whitespace:** `git diff --check` reports 0 errors.

## Open Items & Next Intended Task

- **Current Increment Status:** Activity Bar icon sizing, bottom workspace icons, and crossable workspaces completed, tested, and verified; awaiting developer review and acceptance.
- **Next Phase / Increment:** Phase 5 — Codebase Q&A Slice (Ollama model adapter, bounded evidence retrieval, and conversation UI).
- **Execution rule:** Phase 5 and subsequent steps remain **not started**. Implementation will begin only upon explicit user authorization.

## Update Rule

Update this file at phase boundaries and significant handoffs. Record the actual commit, tested capabilities, failures, limitations, and next approved task. Do not mark work complete without observed evidence.
