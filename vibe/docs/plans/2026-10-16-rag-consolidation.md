# Consolidate the agent inside Vibe

The user approved one application with the Python agent inside `services/agent`, useful retrieval and memory features from the original project, focused verification, and removal of the outer reference directory after checking for unique work. Existing datathon changes belong to another task and must be preserved. This task does not authorize publication, a second frontend/authentication service, paid calls, or a cloud deployment.

Publication scope update, 2026-10-16: the user subsequently authorized committing all remaining work in the main conversation. The combined publication includes this consolidation, the session-cache correction, and the application `design.md`. The main conversation rebuilt the development agent without removing volumes. See [combined verification](../VERIFICATION.md#combined-rag-memory-and-interface-publication--2026-10-16).

## Design

Keep Bun/Hono as the authenticated browser boundary and React as the single workspace. Extend the existing Chroma adapter with owner-filtered lexical BM25 ranking and reciprocal rank fusion with dense retrieval. Read lexical candidates from Chroma itself, so document deletion and existing indexes need no separate search database or backfill. Bound lexical work and document the dense-only fallback for larger corpora. Preserve optional reranking.

Replace the inactive legacy memory facade with explicit user-managed notes stored through the existing async SQLAlchemy database. The browser can list, add, and delete its owner's notes through the Bun proxy. The agent gets a read-only memory search tool with the user identity injected by the graph. Models and uploaded documents cannot create or delete memories. No new dependencies are required.

Keep source citations and owner isolation. Compare vector and hybrid retrieval on controlled document fixtures; test the actual local Chroma adapter and persistent memory database. Such checks establish deterministic behavior, not real-provider answer quality. Real AI quality still requires configured models and a representative labeled set.

## Execution plan

- [x] Added failing retrieval tests for exact identifiers, multilingual keywords, deduplication, deletion, owner isolation, and the candidate bound. Implemented keyword ranking/RRF in the Chroma adapter.
- [x] Added failing database/HTTP tests for memory persistence, explicit create/delete, validation, unauthenticated requests, and cross-user isolation. Registered the SQLAlchemy model matching existing migration `20260716_0002`, with the service and authenticated routes. Verified PostgreSQL's concurrent quota enforcement.
- [x] Added the read-only memory tool, retained trusted tool identity and document source events, and verified that a model-supplied foreign owner is overwritten by graph identity.
- [x] Added shared memory contracts, Bun proxy routes, and a memory card with per-owner query keys. Contracts/transport tests, full Bun checks, and final frontend type/targeted lint checks passed.
- [x] Recorded active/replaced/excluded original capabilities, confirmed a clean outer directory, and removed it. Preserved attribution files and source recovery through Git history.
- [x] Updated documentation and the capability registry while preserving datathon changes. Verified the full Python service, real Chroma retrieval fixtures, and isolated PostgreSQL behavior. Retained the existing development processes/volumes; a running old agent image requires the documented rebuild.

## Acceptance

`vibe` contains the one active agent implementation. Search and memories never cross user boundaries. Memory writes require an explicit authenticated UI/API action. Existing uploads, chat streaming, citations, and checkpoints retain their contracts. The outer `agentic-rag` directory is removed only after source reconciliation and clean-state checks. No real AI score or external deployment is claimed without corresponding evidence.
