# Engineering Roadmap

A phase is complete only when its acceptance criteria are demonstrated. Agent completion messages alone do not count as evidence.

## Phase 0 — Fresh foundation and documentation
- Establish a fresh Git repository in the existing project folder after explicitly approved reset.
- Create and review the project blueprint.
- Establish agent rules and a clean initial commit.
- Acceptance: correct repository root; no old implementation accidentally retained; docs agree and status is clean.

## Phase 1 — App skeleton
- Establish frontend/backend structure, configuration, scripts, health route, and baseline tests.
- Acceptance: reproducible startup; health behavior tested; invalid configuration yields actionable errors.

## Phase 2 — Safe scanning
- Implement bounded file discovery, ignore rules, normalized relative paths, symlink policy, and binary/size filtering.
- Acceptance: positive and negative fixture tests, traversal attempts, limits, and unreadable-file handling.

## Phase 3 — Index and dependency extraction
- Create file records, line-aware chunks, basic symbols, and static import relationships.
- Acceptance: deterministic fixture output; correct line ranges; unresolved/external dependencies represented honestly.

## Phase 4 — Graph and source explorer
- Build interactive graph, search/filter, selection, neighbors, and source preview.
- Acceptance: graph matches fixture data; interactions and empty/error states work.

## Phase 5 — Q&A vertical slice
- Implement retrieval, bounded context, Ollama adapter, answer service, and structured error handling.
- Acceptance: known questions retrieve relevant evidence; provider failure is handled; whole-repository prompting is avoided.

## Phase 6 — Citation validation and integration
- Validate citations and link answers to source and graph.
- Acceptance: valid citations navigate correctly; fabricated/out-of-range citations are rejected or flagged.

## Phase 7 — Complete user journey
- Connect selection, indexing progress, overview, graph, source inspection, and Q&A.
- Acceptance: a user completes the core journey through the UI without manually calling APIs.

## Phase 8 — Hardening and release
- Run integration, regression, security, and manual acceptance checks; document limitations and setup.
- Acceptance: release checklist passes; known limitations are explicit; clean-start demo is repeatable.

## Change control

The human developer may reorder or split phases when evidence supports it. Record consequential changes in `DECISIONS.md` and update this roadmap. Do not silently skip acceptance criteria to meet a deadline.
