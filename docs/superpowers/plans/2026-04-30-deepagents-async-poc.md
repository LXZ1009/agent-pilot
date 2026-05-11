# DeepAgents Async Subagents POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a runnable Python + TypeScript POC for finance table-domain agents based on DeepAgents async subagents.

**Architecture:** FastAPI hosts a real DeepAgents runtime that requires OpenAI model credentials and delegates to finance business-domain subagents with MySQL tools. LangGraph graph definitions also expose the official DeepAgents `AsyncSubAgent` path for Agent Protocol deployments. Finance business-domain agents own individual tables and a report agent synthesizes their outputs. Vite React renders a compact finance analysis console.

**Tech Stack:** Python 3.11, FastAPI, Pydantic, pytest, httpx, deepagents, LangGraph CLI, TypeScript, Vite, React, Vitest.

---

## Files

- `backend/pyproject.toml`: backend package metadata and dependencies.
- `backend/src/agent_pilot/models.py`: request, response, run, task, and event schemas.
- `backend/src/agent_pilot/finance_agents.py`: finance table-domain agents and read-only MySQL repository.
- `backend/src/agent_pilot/deepagents_runtime.py`: FastAPI-facing DeepAgents runtime.
- `backend/src/agent_pilot/api.py`: FastAPI routes.
- `backend/src/agent_pilot/deepagents_factory.py`: embedded DeepAgents supervisor and official async-subagent supervisor factories.
- `backend/src/agent_pilot/deepagents_graphs.py`: official DeepAgents/LangGraph graph entrypoints.
- `backend/tests/test_runtime.py`: runtime behavior tests.
- `backend/tests/test_api.py`: API tests.
- `frontend/package.json`: frontend scripts and dependencies.
- `frontend/src/api.ts`: typed API client.
- `frontend/src/App.tsx`: operations console.
- `frontend/src/*.css`: UI styling.
- `frontend/src/api.test.ts`: frontend utility test.
- `README.md`: setup and run instructions.
- `langgraph.json`: graph registration for local DeepAgents/LangGraph development.

## Tasks

- [x] Create backend tests for finance domain routing, task lifecycle, updates, report generation, and API responses.
- [x] Implement backend schemas, finance agents, MySQL repository, runtime, API routes, and DeepAgents graph definitions.
- [x] Create frontend TypeScript finance console, API client, UI, and tests.
- [x] Add documentation and example environment files without committing secrets.
- [x] Run backend tests, frontend tests, frontend build, ruff, DeepAgents graph import, and live read-only MySQL integration.
