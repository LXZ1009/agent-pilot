# Artifact Workspace Platformization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Artifacts tab into a generic, run-scoped DeepAgents artifact workspace with strict admission rules and backend-resolved artifact content.

**Architecture:** Keep the frontend projection layer conservative and pure, then add a backend artifact registry/resolver boundary that merges declared inline artifacts with workspace-backed descriptors. Preserve DeepAgents thread-scoped storage underneath while making run ownership explicit at the platform API layer.

**Tech Stack:** React 19, TypeScript, Vitest, FastAPI, Pydantic, Pytest, DeepAgents/LangGraph event streams

---

## File Map

- `frontend/src/workspaceView.ts`: strict artifact projection helpers, descriptor model updates, manifest expansion, run ownership propagation.
- `frontend/src/workspaceView.test.ts`: projection admission, exclusion, manifest, source/role, and run-scoped behavior tests.
- `frontend/src/api.ts`: artifact API client types and fetch helpers.
- `frontend/src/api.test.ts`: artifact endpoint URL and response-shape tests.
- `frontend/src/App.tsx`: artifact workspace UI, lazy loading, preview state, metadata display, selection reset.
- `frontend/src/styles.css`: dense side-panel artifact layout and state styling.
- `backend/src/agent_pilot/artifacts.py`: artifact models, registry, resolver, virtual URI normalization, inline/workspace size enforcement.
- `backend/src/agent_pilot/api.py`: artifact list/content endpoints.
- `backend/src/agent_pilot/agent_gateway.py`: stable run ID propagation into lifecycle events.
- `backend/src/agent_pilot/evidence.py`: helper access for declared artifacts by run.
- `backend/tests/test_artifacts.py`: backend registry, traversal, ownership, and content loading tests.
- `backend/tests/test_agent_gateway.py`: run ID propagation tests.

## Delivery Sequence

1. Tighten frontend artifact admission and descriptor fields.
2. Preserve explicit backend run ownership.
3. Add generic backend artifact registry and APIs.
4. Connect the frontend viewer to the APIs and add loading/error metadata states.
5. Run full verification and inspect the diff for business-specific leaks.

## Verification

- `python -m pytest backend/tests -q`
- `npm.cmd test` from `frontend/`
- `npm.cmd run build` from `frontend/`
- `rg -n "asset_index|pricing_meeting|material_asset_agent" frontend/src backend/src/agent_pilot/artifacts.py`

