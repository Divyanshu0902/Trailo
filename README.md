# Trailo

**Understand any codebase faster.**

Trailo is a local-first repository explorer that helps developers build a mental model of an unfamiliar codebase through a file-level dependency graph, source inspection, and AI-powered Q&A grounded in repository evidence.

## MVP goals

- Select and safely index a local repository.
- Present a project overview and an interactive file dependency graph.
- Inspect source files and detected symbols/relationships.
- Ask natural-language questions about the indexed repository.
- Show validated evidence citations and navigate between answers, source files, and graph nodes.
- Remain useful for browsing even when the model provider is unavailable.

## Initial stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Language: JavaScript ES modules
- Model access: Ollama API; configurable cloud or local model
- Tests: Node.js built-in test runner
- Initial index: in-memory
- Initial retrieval: path-, identifier-, and keyword-based ranking

## Status

The project blueprint is the first milestone. Implementation status must be reflected in `docs/CURRENT_STATE.md`; do not infer implemented features from this README.

## Development

Commands will be documented here after the initial application skeleton and package scripts have been verified. Do not copy commands from an unverified plan and assume they work.
