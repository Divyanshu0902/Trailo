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

### Frontend
Owns repository selection UX, indexing progress, overview, graph interaction, source inspection, question submission, answer display, and navigation between citations and graph nodes. It must not independently read arbitrary local filesystem paths.

### API layer
Validates requests, manages repository registration and status, invokes application services, and returns stable response shapes. It should not contain scanning, retrieval, or model-prompt logic directly.

### Repository scanner
Discovers candidate files beneath an approved root, applies ignore and resource limits, skips unsafe/unreadable content, and returns normalized relative paths and metadata. It never executes repository code.

### Indexer and parsers
Reads eligible source files, creates indexed file records and chunks, extracts best-effort symbols and static dependency relationships, and tracks warnings or unresolved references.

### Index store
Owns in-memory repository snapshots, indexing state, and lookup by repository/file identifiers. Its interface should permit a future persistent implementation without requiring it now.

### Graph service
Builds graph nodes and edges from indexed file/dependency records. Graph relationships must identify their evidence and resolution status where applicable.

### Retrieval and context builder
Ranks relevant chunks using path, identifier, and keyword signals. Applies bounded context budgets and returns evidence records with source paths and line ranges.

### Model provider
Wraps Ollama API communication, timeout/error handling, and response normalization. Provider-specific behavior stays behind an interface.

### Answer and citation validation
Builds prompts that treat repository text as untrusted evidence, parses model output, validates citations against the current indexed snapshot, and reports unsupported claims or invalid references.

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

## Failure handling

Represent indexing as explicit states (for example pending, running, completed, completed-with-warnings, failed). Provider errors, empty retrieval, unsupported files, and invalid citations should be observable and actionable rather than silently swallowed.

## Initial constraints

- In-memory state may be lost on restart; document this limitation.
- Do not introduce a vector database before an evaluation set demonstrates a need.
- Avoid premature worker queues or plugin systems.
- Set resource limits before indexing arbitrary repositories.
