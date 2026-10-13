# Product Requirements

**Status:** Approved starting direction; detailed UI behavior may evolve through reviewed decisions.

## Problem

Developers often struggle to understand an unfamiliar repository's structure, dependencies, entry points, and cross-file behavior. Trailo should help them build a reliable mental model faster, without requiring them to trust unsupported AI claims.

## Target user

A developer exploring an unfamiliar or personally maintained codebase. The MVP prioritizes a single developer using a local web application.

## Product promise

**Understand any codebase faster.**

Trailo combines visual exploration and evidence-grounded explanations. It is a repository understanding tool, not an autonomous code-editing agent.

## Core journey

1. Select a local repository.
2. See safe indexing progress, counts, warnings, and partial failures.
3. Review a project overview with major directories, likely entry points, languages, and suggested questions.
4. Explore an interactive file-level dependency graph.
5. Select a file/node and inspect source, recognized symbols, and detected relationships.
6. Ask a natural-language question about the repository.
7. Read an answer with validated evidence citations.
8. Open cited source and navigate back to relevant graph nodes.

## MVP must-haves

- Local repository selection/registration and indexing status.
- Safe bounded file scanning and source indexing.
- Project overview.
- Interactive graph with file nodes, detected dependency edges, search/filter, node selection, and neighbor exploration.
- File source preview and basic symbol/relationship details.
- Q&A through an Ollama-compatible provider.
- Retrieval that selects relevant source rather than sending the whole repository.
- Citation validation against indexed file content and line ranges.
- Clear errors, partial-support reporting, and behavior when the model is unavailable.
- Tests and setup instructions.

## Honest limitations

- The graph is a best-effort static file dependency graph, not a complete runtime call graph.
- Import resolution and symbol extraction may be incomplete for some languages and dynamic patterns.
- AI answers are only as reliable as retrieval and available source evidence; the product must expose uncertainty.
- “Local-first” does not mean all model inference is local when a cloud model is selected. Disclose what source excerpts are sent to the configured provider.

## Initial language scope

Prioritize JavaScript/TypeScript. Add lightweight Python and Java support only where it fits the phase plan and can be tested honestly. Do not claim comprehensive language support from extension recognition alone.

## Out of scope for the initial MVP

- Editing code or automatically applying patches.
- Full runtime tracing or a complete call graph.
- Distributed collaboration and hosted multi-user workspaces.
- A desktop installer or bundled model weights.
- Vector database infrastructure before retrieval evaluations justify it.
- Persistent learning trails, automatic documentation generation, and advanced incremental indexing unless time remains after core acceptance criteria.

## Product principles

1. Evidence over confident-sounding answers.
2. Useful graph and source exploration without AI availability.
3. Explicit limitations rather than fake completeness.
4. Safe handling of untrusted repositories.
5. Short feedback loops and observable progress.
