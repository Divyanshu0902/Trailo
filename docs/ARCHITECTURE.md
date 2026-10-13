# System Architecture

**Status:** Approved high-level direction. Detailed interfaces must be reviewed before implementation.

## Runtime shape

A local web application:

- React + Vite frontend
- Node.js + Express backend
- In-memory repository index for the initial MVP
- Ollama API adapter for cloud or local model access

No desktop wrapper and no model weights bundled in the MVP.

## Logical components

### 1. Shared Language-Agnostic Core
The core application handles repository exploration, indexing, retrieval, and Q&A without depending on language-specific AST structures:

- **Frontend:** Owns repository selection UX, indexing progress, overview, graph interaction, source inspection, question submission, answer display, and navigation between citations and graph nodes. Never directly reads arbitrary local filesystem paths.
- **API layer:** Validates requests, manages repository registration and status, orchestrates services, and returns stable response shapes. Does not contain raw scanning, parsing, or prompt logic.
- **Repository scanner:** Discovers candidate files beneath an approved root, enforces ignore rules and safety bounds, skips unsafe/binary content, and returns normalized relative paths and metadata. Never executes repository code.
- **Line-aware chunker:** Creates deterministic, line-based text chunks with stable chunk IDs and 1-based line ranges directly from source text. Completely decoupled from language ASTs.
- **Index store:** Owns in-memory repository snapshots, indexing state, file records, line chunks, and normalized dependency records.
- **Graph service:** Constructs graph nodes and edges from normalized, language-neutral dependency records, distinguishing resolved, external, and unresolved relationships.
- **Retrieval and context builder:** Ranks relevant text chunks using path, identifier, and keyword signals within a bounded token budget.
- **Model provider adapter:** Wraps Ollama API communication, timeout/error handling, and response normalization behind an interface.
- **Answer and citation validation:** Builds prompts treating repository text as untrusted evidence, parses model responses, validates citations against the active snapshot, and rejects invalid references.

### 2. Language Analyzer Interface
A minimal conceptual boundary separating the shared core from language-specific structural analysis:
- Receives source-file information (`path`, `content`, `language`) from the scanned repository.
- Emits structured, normalized dependency records and file-level symbols.
- Keeps language-specific AST objects internal to the analyzer; no parser-specific node types leak into the core.
- Kept intentionally minimal for the MVP—a direct module interface without a complex dynamic plugin system.

### 3. JavaScript/TypeScript Analyzer (TypeScript Compiler API)
The first syntax-aware analyzer, targeted for Phase 3:
- Uses the TypeScript Compiler API (`typescript`) as a parser and syntax analysis tool.
- Parses JS/TS source into a syntax tree to detect ES module `import`/`export` and CommonJS `require()` declarations.
- Captures original module specifiers, dependency kinds, and source line locations.
- Emits normalized dependency records.
- Does not perform full type-checking, project compilation, or whole-program construction for the MVP.
- **Separation of resolution:** Parsing extracts declarations; resolution against repository files is handled separately against indexed snapshot paths.

### 4. Future Language Analyzers (Post-MVP)
- Additional analyzers (e.g. Python, Java, Go) can implement the analyzer interface in future milestones.
- Shared parsing infrastructure such as Tree-sitter may be evaluated if multiple languages justify it, but is strictly out of scope for the hackathon MVP.

## Main data flows

### Indexing
UI → repository registration API → scanner → source indexing/parsing → index store → indexing status/overview/graph data → UI.

### Q&A
UI → question API → request validation → retrieval → bounded context → model provider → answer parsing → citation validation → response → UI evidence navigation.

### Graph exploration
UI graph request → graph service over indexed dependency records → graph payload → user selects node → file details/source request → UI.

## Dependency rules

- UI communicates with backend through documented API contracts.
- API routes orchestrate services; they do not own domain logic.
- Scanner is independent of the model provider.
- Graph generation must work without model inference.
- Retrieval does not call the model directly; it returns evidence to the answer service.
- Citation validation does not trust model-generated paths or line numbers.
- Repository contents are data, never executable instructions for the agent or application.
- Shared core does not depend on language-specific AST structures or syntax.
- Source chunking is line-aware and strictly decoupled from language ASTs.
- Syntax-aware dependency extraction is decoupled from repository file resolution.

## Failure handling

Represent indexing as explicit states (for example pending, running, completed, completed-with-warnings, failed). Provider errors, empty retrieval, unsupported files, and invalid citations should be observable and actionable rather than silently swallowed.

## Initial constraints

- In-memory state may be lost on restart; document this limitation.
- Do not introduce a vector database before an evaluation set demonstrates a need.
- Avoid premature worker queues or plugin systems.
- Set resource limits before indexing arbitrary repositories.
