# Current Project State

**Last updated:** Phase 4C UI Redesign Step 1 (Application Shell completed and verified)
**Current phase:** Phase 4C — Interactive Graph and Source Explorer (Application Shell complete; Step 3 File Tree pending review and authorization)
**Verified commit:** 5d8b0b5 (feat: render interactive repository dependency graph; working tree contains Phase 4C Step 2C and UI Redesign Step 1 implementations)
**Branch:** uiModify

## Phase Roadmap Status

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 0** | Fresh foundation and documentation | **Complete** (committed in `ee60225`) |
| **Phase 1** | App skeleton | **Complete** (committed in `e410760`) |
| **Phase 2** | Safe scanning | **Complete** (committed in `e410760`, 10/10 tests pass) |
| **Phase 3** | Index and dependency extraction | **Complete** (committed in `20c0ecf`, 54/54 tests pass) |
| **Phase 4** | Graph and source explorer | **In Progress** (Phase 4A, 4B, 4C Steps 1, 2B, 2C complete, 100/100 tests pass; Step 3 pending) |
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
- **VS Code-inspired application shell (Phase 4C UI Redesign Step 1):** Implemented in `client/` and verified.
  - Top Application Bar (`client/src/components/AppTitleBar.jsx`): Houses official product logo `assets/logo.png`, "Trailo" title, active repository pill, centered workspace title, and layout toggle buttons (sidebar toggle `Ctrl+B`, source viewer toggle).
  - Activity Bar (`client/src/components/ActivityBar.jsx`): 48px wide persistent activity bar on the far left featuring categories: Scanner (`ScanIcon`), Files (`FilesIcon`), Internal dependencies (`InternalDepIcon`), External dependencies (`ExternalDepIcon`), and Unresolved dependencies (`UnresolvedDepIcon`), with dynamic badge counters and warning states.
  - Contextual Sidebar (`client/src/components/ContextualSidebar.jsx`): 280px sidebar beside activity bar with header collapse button, hosting repository scan form under "Scanner", and truthful placeholders for Files, Internal, External, and Unresolved categories.
  - Main Workspace Area (`client/src/components/WorkspaceTabBar.jsx`, `client/src/components/GraphCanvas.jsx`, `client/src/components/SourceViewer.jsx`): Retains full graph canvas, collapsible and resizable source viewer (320px–850px), syntax highlighting, and graph selection highlights.
  - Consistent SVG Icon System (`client/src/components/Icons.jsx`): Developer icon system with uniform 24x24 viewBox, stroke-width 1.75, fill none, stroke currentColor without adding external npm dependencies.
  - Shell Navigation State (`client/src/utils/graphSelection.js`): Pure deterministic helper `transitionActivityBarState` handles category switching, collapse/expand toggle on repeated clicks, and sidebar state persistence.
- **Automated test suite:** 133/133 tests passing cleanly across 31 suites with Node.js built-in runner (`node --test`), covering health endpoint, repository scanner, line chunker, JS/TS analyzer, path resolver, index store, end-to-end repository indexing, graph builder, graph routes, scan routes, secure file content routes, graph selection engine, source loader cache/race protection, browser fetch invocation receiver bindings, line splitting and newline preservation, Prism grammar resolution and tokenization, resizer panel width clamping, graph layout state synchronization, collapsible source explorer state transitions, and application shell navigation transitions.
- **Client production build:** Verified `vite build` cleanly emitting production assets into `client/dist/` in 2.37s.
- **Git & Whitespace:** `git diff --check` reports 0 errors.

## Open Items & Next Intended Task

- **Current Increment Status:** Phase 4C UI Redesign Step 1 — Application Shell (completed, tested, and verified; awaiting developer review and approval).
- **Next Phase / Increment:** Phase 4C UI Redesign Step 2 / Step 3 (Welcome Screen and Repository File Tree / Dependency Lists).
- **Execution rule:** Next steps remain **not started**. Implementation will begin only upon explicit user authorization.

## Update Rule

Update this file at phase boundaries and significant handoffs. Record the actual commit, tested capabilities, failures, limitations, and next approved task. Do not mark work complete without observed evidence.
