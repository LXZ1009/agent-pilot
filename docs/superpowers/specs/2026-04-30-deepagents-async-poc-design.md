# DeepAgents Async Subagents POC Design

## Goal

Build a small monorepo POC that validates finance text-to-data workflows with business-domain agents, read-only table analysis, and comprehensive report generation.

## Architecture

The project uses FastAPI instead of Sanic:

- `backend` exposes a FastAPI API that invokes a real DeepAgents supervisor graph.
- `backend/src/agent_pilot/deepagents_runtime.py` starts the DeepAgents run in the background and records run/task/event state for the UI.
- `backend/src/agent_pilot/deepagents_factory.py` defines both the FastAPI embedded-subagent supervisor and the official `AsyncSubAgent` supervisor.
- `backend/src/agent_pilot/finance_agents.py` defines the finance table-domain agents and read-only MySQL repository implementation.
- `backend/src/agent_pilot/deepagents_graphs.py` defines the DeepAgents/LangGraph entrypoints for supervisor and async subagent graphs.
- `frontend` is a Vite React TypeScript app that visualizes runs, task state, results, updates, and cancellation.

FastAPI is preferred for this POC because Pydantic schemas, automatic OpenAPI docs, ASGI compatibility, and Python AI ecosystem familiarity matter more than extreme HTTP throughput.

FastAPI requires OpenAI model credentials for real execution. If the key is not configured, the run fails explicitly instead of returning simulated analysis. The LangGraph `supervisor` entrypoint uses official DeepAgents async-subagent tools (`start_async_task`, `check_async_task`, `update_async_task`, `cancel_async_task`, `list_async_tasks`) against the registered table-agent graph IDs.

## Agents

- `main_metric_agent`: owns `ods_fin_main_metric_raw` and handles finance main metrics.
- `partner_aging_agent`: owns `ods_fin_partner_aging_raw` and handles partner aging, overdue, long-aging, and bad-debt risks.
- `partner_balance_agent`: owns `ods_fin_partner_balance_raw` and handles partner balance metrics; returns `no_data` when the table is empty.
- `finance_report_agent`: summarizes domain-agent outputs into a comprehensive finance report and does not query the database directly.

The supervisor can route automatically or accept an explicit table-domain agent list from the frontend. The report agent is automatically appended.

## API Surface

- `GET /api/health`
- `GET /api/agents`
- `POST /api/runs`
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `POST /api/runs/{run_id}/tasks/{task_id}/updates`
- `POST /api/runs/{run_id}/tasks/{task_id}/cancel`
- `GET /api/runs/{run_id}/events`

## Frontend

The frontend is an operations console rather than a landing page. It should show:

- Business question input and selectable table-domain agents.
- Run summary and supervisor routing decision.
- Task cards with status, progress, SQL/evidence, metrics, result, update, and cancel controls.
- Live event stream for lifecycle visibility.

## Verification

Backend tests cover DeepAgents runtime invocation, OpenAI-key failure behavior, graph construction, and HTTP endpoints. Frontend tests cover API mapping and utility behavior, with a production build check for the UI.

## Environment

Use the `agent-pilot` conda environment from `environment.yml`. It includes Python 3.11, Node.js 22, and editable backend dependencies.
