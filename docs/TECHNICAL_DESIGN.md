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

## Conceptual records

### Repository
- stable repository ID
- canonical approved root path (server-side only)
- indexing state
- timestamps/snapshot version
- warnings and summary counts

### Indexed file
- stable file ID
- normalized relative path
- detected language
- file size and content hash
- indexed text or bounded content representation
- extraction status/warnings
- recognized symbols and dependency references

### Dependency edge
- source file ID
- target file ID when resolved
- original import/reference specifier
- relationship type
- resolution status
- source location when available

### Evidence chunk
- repository/snapshot ID
- file ID and relative path
- start/end line
- text
- retrieval score and reasons

### Answer citation
- evidence/file ID
- normalized path
- inclusive line range
- citation validation result

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
