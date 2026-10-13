# Testing and Verification Strategy

## Principles

- Define expected behavior independently of the implementation.
- Test both success and failure paths.
- Prefer deterministic tests with small fixtures.
- Add regression coverage for every fixed defect.
- Use integration tests to verify contracts across modules.
- Use manual acceptance tests for user-facing workflows and visual behavior.
- Do not treat a passing test suite as proof of security or correctness in every repository.

## Test layers

### Unit
Scanner path handling, ignore matching, chunk line ranges, import extraction, retrieval ranking, citation validation, configuration parsing.

### Integration
Repository registration → indexing; index → graph payload; question → retrieval → provider adapter → citation validation; API error mapping.

### End-to-end/manual
Select a fixture repository, watch indexing, inspect overview, navigate graph nodes, open source, ask known questions, follow citations, recover from model unavailability.

### Security/robustness
Path traversal, symlinks, unreadable files, binary files, oversized files/repositories, malformed requests, prompt injection in repository content, model-generated invalid paths, provider timeout, stale snapshot.

## Fixture repositories

Maintain small fixtures with known expected files, symbols, imports, graph edges, and answer evidence. Fixtures should include ignored directories and edge cases. Never execute fixture code as part of scanning.

## AI answer evaluation

Create a small set of questions with expected evidence files/lines and unacceptable unsupported claims. Evaluate retrieval separately from generation:
1. Did retrieval include the relevant evidence?
2. Did the model answer consistently with that evidence?
3. Did citation validation accept only real indexed ranges?
4. Did the UI make evidence easy to inspect?

Use deterministic assertions for retrieval/citations where possible. Do not require exact model wording.

## Required reporting

For each task, record actual commands run, pass/fail counts, and known untested paths. If a check was not run, say so.
