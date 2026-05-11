from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from agent_pilot.deepagents_runtime import DeepAgentsRuntime
from agent_pilot.models import (
    AgentInfo,
    AgentTask,
    EventRecord,
    ReportFileInfo,
    RunCreateRequest,
    RunRecord,
    TaskUpdateRequest,
)


load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def _resolve_virtual_report_path(report_path: str | None) -> Path | None:
    if not report_path:
        return None
    if ".." in Path(report_path).parts:
        return None
    report_file = (PROJECT_ROOT / report_path.lstrip("/")).resolve()
    try:
        report_file.relative_to(PROJECT_ROOT)
    except ValueError:
        return None
    return report_file


def _report_file_info(run: RunRecord) -> ReportFileInfo:
    report_file = _resolve_virtual_report_path(run.report_path)
    content_url = f"/api/runs/{run.run_id}/reports/finance/content"
    if report_file is None or not report_file.exists() or not report_file.is_file():
        return ReportFileInfo(
            exists=False,
            name="financial-report.html",
            display_path=run.report_path or "",
            content_url=None,
        )

    stat = report_file.stat()
    return ReportFileInfo(
        exists=True,
        name=report_file.name,
        display_path=run.report_path or report_file.name,
        content_url=content_url,
        size_bytes=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime, timezone.utc),
    )


def create_app(
    runtime: DeepAgentsRuntime | None = None,
) -> FastAPI:
    app = FastAPI(
        title="Agent Pilot API",
        description="DeepAgents async subagents POC backend",
        version="0.1.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.runtime = runtime or DeepAgentsRuntime()

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/runs/{run_id}/reports/finance", response_model=ReportFileInfo)
    async def get_financial_report_info(run_id: str) -> ReportFileInfo:
        run = await app.state.runtime.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return _report_file_info(run)

    @app.get("/api/runs/{run_id}/reports/finance/content")
    async def get_financial_report_content(run_id: str) -> FileResponse:
        run = await app.state.runtime.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        report_file = _resolve_virtual_report_path(run.report_path)
        if report_file is None or not report_file.exists() or not report_file.is_file():
            raise HTTPException(status_code=404, detail="Financial report file not found")
        return FileResponse(
            report_file,
            media_type="text/html",
            headers={
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    @app.get("/api/agents", response_model=list[AgentInfo])
    async def list_agents() -> list[AgentInfo]:
        return app.state.runtime.agents

    @app.post("/api/runs", response_model=RunRecord, status_code=status.HTTP_201_CREATED)
    async def create_run(payload: RunCreateRequest) -> RunRecord:
        return await app.state.runtime.create_run(payload.message, payload.agents)

    @app.get("/api/runs", response_model=list[RunRecord])
    async def list_runs() -> list[RunRecord]:
        return await app.state.runtime.list_runs()

    @app.get("/api/runs/{run_id}", response_model=RunRecord)
    async def get_run(run_id: str) -> RunRecord:
        run = await app.state.runtime.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return run

    @app.get("/api/runs/{run_id}/events", response_model=list[EventRecord])
    async def get_events(run_id: str) -> list[EventRecord]:
        events = await app.state.runtime.list_events(run_id)
        if events is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return events

    @app.post("/api/runs/{run_id}/tasks/{task_id}/updates", response_model=AgentTask)
    async def update_task(
        run_id: str,
        task_id: str,
        payload: TaskUpdateRequest,
    ) -> AgentTask:
        try:
            return await app.state.runtime.update_task(run_id, task_id, payload.instruction)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.post("/api/runs/{run_id}/tasks/{task_id}/cancel", response_model=AgentTask)
    async def cancel_task(run_id: str, task_id: str) -> AgentTask:
        try:
            return await app.state.runtime.cancel_task(run_id, task_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    return app


app = create_app()
