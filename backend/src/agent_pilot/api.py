from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from agent_pilot.agent_gateway import AgentGateway, LangGraphAgentGateway
from agent_pilot.artifacts import ArtifactError, ArtifactRegistry
from agent_pilot.evidence import EvidenceArchive
from agent_pilot.models import AgentInfo, AgentName
from agent_pilot.streaming_protocol import encode_sse_event

load_dotenv()

AGENTS = [
    AgentInfo(
        name=AgentName.PRICING_MEETING,
        title="定价会议主控 Agent",
        description="唯一面向用户交互的主 Agent，负责理解目标、调度子 Agent、汇总结果和推进流程。",
        capabilities=["用户交互", "任务编排", "结果汇总", "业务追问", "流程推进"],
        business_domain="多 Agent 主控",
    ),
    AgentInfo(
        name=AgentName.PRE_MEETING_INTERVIEW,
        title="会前访谈 Agent",
        description="同步子 Agent，负责生成访谈问题、判断信息完整性并给出追问建议。",
        capabilities=["访谈问题", "完整性判断", "追问建议", "缺失字段识别"],
        business_domain="会前访谈",
    ),
    AgentInfo(
        name=AgentName.INTERVIEW_STRUCTURING,
        title="访谈结构化 Agent",
        description="同步子 Agent，负责把访谈回复整理成标准访谈卡片。",
        capabilities=["访谈卡片", "事实提炼", "风险标记", "字段规范化"],
        business_domain="访谈结构化",
    ),
    AgentInfo(
        name=AgentName.MATERIAL_ASSET,
        title="物料整理 Agent",
        description="异步子 Agent，负责长耗时会议物料资产包生成。",
        capabilities=["资产包生成", "风险清单", "客户摘要", "主持人预览素材"],
        business_domain="会议物料",
    ),
    AgentInfo(
        name=AgentName.NOTIFICATION,
        title="通知预览 Agent",
        description="同步子 Agent，负责生成会前预览和外部通知载荷契约。",
        capabilities=["会前预览", "通知载荷", "卡片摘要", "外部服务契约"],
        business_domain="通知预览",
    ),
    AgentInfo(
        name=AgentName.TASK_TRACKING,
        title="任务跟踪 Agent",
        description="异步子 Agent，负责生成会后任务跟踪种子数据。",
        capabilities=["行动项", "责任人建议", "截止时间建议", "复盘结构"],
        business_domain="任务跟踪",
    ),
]


def create_app(
    agent_gateway: AgentGateway | None = None,
    evidence_archive: EvidenceArchive | None = None,
    artifact_registry: ArtifactRegistry | None = None,
) -> FastAPI:
    app = FastAPI(
        title="Agent Pilot API",
        description="Multi-agent collaboration platform gateway for DeepAgents and LangGraph.",
        version="0.3.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.agent_gateway = agent_gateway or LangGraphAgentGateway.from_env()
    app.state.evidence_archive = evidence_archive or EvidenceArchive()
    app.state.artifact_registry = artifact_registry or ArtifactRegistry(app.state.evidence_archive)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/agents", response_model=list[AgentInfo])
    async def list_agents() -> list[AgentInfo]:
        return AGENTS

    @app.post("/api/threads/{thread_id}/commands")
    async def handle_agent_command(thread_id: str, command: dict[str, Any]) -> dict[str, Any]:
        return await app.state.agent_gateway.handle_command(thread_id, command)

    @app.post("/api/threads/{thread_id}/stream/events")
    async def stream_agent_events(thread_id: str, params: dict[str, Any]) -> StreamingResponse:
        async def event_frames() -> AsyncIterator[str]:
            async for event in app.state.agent_gateway.stream(thread_id, params):
                app.state.evidence_archive.append(thread_id, event)
                yield encode_sse_event(event)

        return StreamingResponse(
            event_frames(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    @app.get("/api/threads/{thread_id}/evidence")
    async def get_thread_evidence(thread_id: str) -> dict[str, Any]:
        return app.state.evidence_archive.build_business_evidence(thread_id)

    @app.get("/api/threads/{thread_id}/artifacts")
    async def list_thread_artifacts(thread_id: str, run_id: str | None = None) -> dict[str, Any]:
        return {
            "thread_id": thread_id,
            "run_id": run_id,
            "artifacts": app.state.artifact_registry.list_for_run(thread_id, run_id),
        }

    @app.get("/api/threads/{thread_id}/artifacts/{artifact_id}")
    async def get_thread_artifact(thread_id: str, artifact_id: str) -> dict[str, Any]:
        try:
            return app.state.artifact_registry.read_content(thread_id, artifact_id)
        except ArtifactError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return app


app = create_app()
