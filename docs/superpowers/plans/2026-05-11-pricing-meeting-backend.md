# Pricing Meeting Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the backend finance POC with a pricing-meeting agent service that can be called by an external DingTalk service.

**Architecture:** Keep the existing FastAPI runtime and DeepAgents graph factory. Replace finance-domain agents with meeting-domain agents and expose meeting asset artifacts, while treating DingTalk scheduling, message sending, and file delivery as external service responsibilities.

**Tech Stack:** Python 3.11, FastAPI, Pydantic v2, DeepAgents, pytest.

---

### Task 1: Backend Agent Contract

**Files:**
- Modify: `backend/tests/test_runtime.py`
- Modify: `backend/tests/test_api.py`
- Modify: `backend/tests/test_deepagents_factory.py`
- Modify: `backend/src/agent_pilot/models.py`
- Create: `backend/src/agent_pilot/meeting_agents.py`

- [ ] Write failing tests for meeting agent names, default selection, final pricing meeting agent, and optional meeting context.
- [ ] Replace `AgentName` enum values with meeting agents.
- [ ] Add meeting agent metadata and deterministic tool contracts in `meeting_agents.py`.
- [ ] Run backend tests for model/runtime/API behavior.

### Task 2: DeepAgents Runtime And Graphs

**Files:**
- Modify: `backend/src/agent_pilot/deepagents_runtime.py`
- Modify: `backend/src/agent_pilot/deepagents_factory.py`
- Modify: `backend/src/agent_pilot/deepagents_graphs.py`
- Modify: `langgraph.json`

- [ ] Update runtime to create `pricing_meeting_agent` runs and `meeting-asset-package.json` artifacts.
- [ ] Update DeepAgents supervisor prompts and subagent graph IDs.
- [ ] Register the meeting graph IDs in `langgraph.json`.
- [ ] Run backend DeepAgents factory tests.

### Task 3: API Artifact Contract

**Files:**
- Modify: `backend/src/agent_pilot/api.py`
- Modify: `backend/tests/test_api.py`
- Modify: `README.md`

- [ ] Add meeting asset artifact endpoints under `/api/runs/{run_id}/artifacts/meeting-assets`.
- [ ] Keep the current run/task/event endpoints stable for DingTalk service polling.
- [ ] Document that DingTalk service owns scheduling, pushing, and meeting lifecycle logic.
- [ ] Run full backend tests and ruff.
