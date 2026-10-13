# Technical Design and Contracts

**Status:** Initial contract principles. Exact schemas are to be approved alongside the relevant implementation phase.

## Contract rules

- Use stable IDs for repositories and files within an index snapshot.
- Store repository paths as normalized relative paths; never accept client-supplied absolute paths as trusted file references.
- Define API request/response shapes before connecting frontend and backend.
- Return structured errors with a stable code and safe human-readable message.
- Keep source line numbering consistent and document whether ranges are inclusive.
- Keep provider-specific request/response formats inside the model adapter.
- Keep indexing warnings visible to the UI and testable.

## Proposed API surface

- `GET /api/health` — service health and basic capability status.
- `POST /api/repositories` — validate/register a repository and initiate indexing.
- `GET /api/repositories/:id/status` — current indexing state and warnings.
- `GET /api/repositories/:id/files` — indexed file listing and optional supported filters.
- `GET /api/repositories/:id/graph` — graph nodes and detected edges.
- `GET /api/repositories/:id/files/:fileId` — file metadata, symbols, and source preview subject to size limits.
- `POST /api/repositories/:id/questions` — ask a repository-grounded question.

These endpoints are proposals until each is reviewed and implemented. Do not implement all endpoints in a single task.

## Conceptual records and contracts

### Repository
- stable repository ID
- canonical approved root path (server-side only)
- indexing state
- timestamps/snapshot version
- warnings and summary counts

### Indexed file
- stable file ID
- normalized relative path (POSIX forward slashes)
- detected language
- file size and content hash
- indexed text or bounded content representation
- extraction status/warnings
- recognized symbols and dependency references

### Language Analyzer Contract
A lightweight, language-neutral interface between the shared core and specific syntax analyzers:
- **Input:** `{ path: string, content: string, language: string }`
- **Output:** `{ dependencies: NormalizedDependency[], symbols: SymbolRecord[], diagnostics: string[] }`
- **Contract:** Pure analysis without filesystem I/O; keeps AST objects strictly internal; does not perform repository file resolution.

### Normalized Dependency Record (Language-Neutral)
A language-neutral structure representing dependencies for graph generation and Q&A evidence:
```json
{
  "sourcePath": "src/server.js",
  "targetPath": "src/utils.js",
  "specifier": "./utils",
  "kind": "import",
  "language": "javascript",
  "resolutionStatus": "resolved",
  "sourceLocation": {
    "startLine": 1,
    "endLine": 1
  }
}
```
- **sourcePath:** Normalized repository-relative path of the importing file.
- **targetPath:** Normalized repository-relative path of the target file (populated only when resolved against indexed repository files; `null` otherwise).
- **specifier:** The raw module or package specifier as declared in source code (e.g., `'./utils'`, `'express'`).
- **kind:** Categorical dependency kind (e.g., `'import'`, `'re-export'`, `'require'`).
- **language:** Source language of the importing file (e.g., `'javascript'`, `'typescript'`).
- **resolutionStatus:** State of the link: `'resolved'` (internal file match), `'external'` (third-party package/built-in), or `'unresolved'` (internal path not found).
- **sourceLocation:** 1-based start and end line where the dependency is declared.
- **AST decoupling:** No parser-specific nodes or AST references are stored in this record.

### Source Chunk (Independent of AST)
Line-aware text chunks created by a deterministic, line-based chunker:
- stable chunk ID (e.g. `${fileId}:L${startLine}-L${endLine}`)
- repository/snapshot ID
- file ID and relative path
- startLine and endLine (1-based, inclusive)
- chunk text
- retrieval score and ranking metadata (populated during query retrieval)
- **Design rule:** Chunking operates on text lines and is strictly decoupled from language ASTs.

### Answer Citation
- evidence/chunk ID
- normalized path
- inclusive line range (`startLine`, `endLine`)
- citation validation result (verified against active in-memory snapshot)

## Security invariants

- A repository root must be approved by the user and validated server-side.
- File access must remain within the approved root; handle traversal, symlinks, and race conditions deliberately.
- Never execute analyzed source.
- Apply file-count, per-file byte, total indexed byte, and request-size limits.
- Exclude secrets and ignored/generated/vendor paths according to documented rules; do not promise perfect secret detection.
- Treat filenames, source comments, README text, and other repository content as untrusted input.
- If cloud inference is selected, disclose that retrieved source excerpts leave the machine.
- Validate citations against the exact indexed snapshot; stale snapshots must be detectable.
- Avoid logging source contents, secrets, or full model prompts by default.

## Versioning

When a contract changes, update its tests and this document in the same task. Avoid premature generic API versioning for a single-user MVP, but do not rely on undocumented response shapes.
