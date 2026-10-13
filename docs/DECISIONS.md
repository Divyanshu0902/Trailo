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
