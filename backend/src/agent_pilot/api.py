from __future__ import annotations

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from agent_pilot.models import (
    AgentInfo,
    AgentName,
    PricingMeetingRun,
    PricingMeetingRunContinueRequest,
    PricingMeetingRunCreateRequest,
)
from agent_pilot.pricing_task_runtime import PricingTaskRuntime

load_dotenv()

AGENTS = [
    AgentInfo(
        name=AgentName.PRICING_MEETING,
        title="定价会议主控 Agent",
        description="唯一面向用户交互的主 Agent，负责理解、委派、汇总、追问和流程推进。",
        capabilities=["用户交互", "任务编排", "结果汇总", "业务追问", "流程推进"],
        business_domain="多 Agent 主控",
    ),
    AgentInfo(
        name=AgentName.PRE_MEETING_INTERVIEW,
        title="会前访谈 Agent",
        description="同步子 Agent，负责生成访谈问题、完整性判断和追问建议。",
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


def create_app(pricing_task_runtime: PricingTaskRuntime | None = None) -> FastAPI:
    app = FastAPI(
        title="Agent Pilot API",
        description="Multi-agent collaboration platform backend; pricing meeting is the validation scenario.",
        version="0.2.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.pricing_task_runtime = pricing_task_runtime or PricingTaskRuntime()

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/agents", response_model=list[AgentInfo])
    async def list_agents() -> list[AgentInfo]:
        return AGENTS

    @app.post(
        "/api/pricing-meeting/runs",
        response_model=PricingMeetingRun,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_pricing_meeting_run(
        payload: PricingMeetingRunCreateRequest,
    ) -> PricingMeetingRun:
        return await app.state.pricing_task_runtime.create_pricing_meeting_run(
            payload.command,
            payload.meeting_context,
            payload.interviewees,
        )

    @app.post(
        "/api/pricing-meeting/runs/{run_id}/continue",
        response_model=PricingMeetingRun,
    )
    async def continue_pricing_meeting_run(
        run_id: str,
        payload: PricingMeetingRunContinueRequest,
    ) -> PricingMeetingRun:
        try:
            return await app.state.pricing_task_runtime.continue_pricing_meeting_run(
                run_id,
                payload.content,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/pricing-meeting/runs/{run_id}", response_model=PricingMeetingRun)
    async def get_pricing_meeting_run(run_id: str) -> PricingMeetingRun:
        try:
            return await app.state.pricing_task_runtime.get_pricing_meeting_run(run_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/pricing-meeting/runs", response_model=list[PricingMeetingRun])
    async def list_pricing_meeting_runs() -> list[PricingMeetingRun]:
        return await app.state.pricing_task_runtime.list_pricing_meeting_runs()

    return app


app = create_app()
