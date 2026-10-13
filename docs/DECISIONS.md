# Architecture Decision Log

Record consequential decisions with date, status, context, decision, alternatives, and consequences. Keep entries concise. Supersede decisions explicitly rather than silently editing history.

## D-001 — Local web application for MVP
- **Status:** Accepted
- **Context:** A hackathon MVP must be quick to run and demonstrate.
- **Decision:** Use React + Vite and a Node.js + Express backend as a local web app.
- **Alternatives:** Desktop wrapper, hosted multi-user app.
- **Consequences:** No installer is required; filesystem access remains on the backend; packaging and persistent storage stay minimal initially.

## D-002 — Ollama-compatible model provider
- **Status:** Accepted
- **Context:** The development machine has limited RAM and local inference may be slow.
- **Decision:** Integrate through Ollama's API and support configured cloud or local models.
- **Alternatives:** Bundle weights or hardcode a single hosted provider.
- **Consequences:** Do not bundle weights; disclose cloud data flow; keep provider configuration separate from answer logic.

## D-003 — In-memory index first
- **Status:** Accepted for MVP
- **Context:** The first goal is a working end-to-end experience, not persistence infrastructure.
- **Decision:** Start with an in-memory index.
- **Consequences:** Restart may require reindexing; introduce persistence only with a clear requirement.

## D-004 — Keyword/identifier retrieval before embeddings
- **Status:** Accepted for initial implementation
- **Context:** Simplicity and debuggability matter during the MVP.
- **Decision:** Start with path-, identifier-, and keyword-based ranking and evaluate it on known questions.
- **Consequences:** Retrieval quality may be limited; add embeddings only if evaluation demonstrates a meaningful gap.

## D-005 — Static dependency graph
- **Status:** Accepted
- **Context:** Static file relationships are practical to extract in a short MVP.
- **Decision:** Graph detected file-level dependencies and reports unresolved edges honestly.
- **Consequences:** It is not a runtime call graph and cannot represent all dynamic behavior.

## D-006 — Language-agnostic core with JS/TS-first analyzer using TypeScript Compiler API
- **Status:** Accepted
- **Context:** Regex-only dependency extraction is fragile and fails on multi-line statements, comments, and re-exports. Conversely, implementing multi-language AST parsers or adopting Tree-sitter introduces heavy native dependencies and excessive scope for a 1-day hackathon MVP.
- **Decision:** Architect a language-agnostic shared core with a minimal analyzer interface. Implement the first syntax-aware analyzer specifically for JavaScript and TypeScript using the TypeScript Compiler API (`typescript`). Keep source chunking line-based and strictly independent of AST parsing.
- **Alternatives:**
  - *Regex-only extraction for JS/TS:* Rejected as the primary extraction mechanism due to unreliability with multi-line statements, re-exports, and string edge cases.
  - *Full multi-language parser support from day one:* Rejected to preserve a credible and achievable hackathon delivery scope.
  - *Tree-sitter integration:* Rejected for MVP to avoid native C/C++ compilation overhead and build toolchain complexities.
  - *AST-coupled chunking:* Rejected to keep text chunking, retrieval, and Q&A independent of language parsing.
  - *Complex plugin infrastructure:* Rejected as premature abstraction for a single-user MVP.
- **Consequences:**
  - The `typescript` package will be introduced as a server dependency in Phase 3 (it is not installed prior to Phase 3).
  - JavaScript and TypeScript will have rich syntax-aware dependency graphs in the MVP; other languages will be supported for text search and Q&A only.
  - Dependency declaration extraction is cleanly decoupled from file path resolution.
  - Additional language analyzers (e.g. Python, Java, Go) can be introduced post-MVP behind the established analyzer interface.
