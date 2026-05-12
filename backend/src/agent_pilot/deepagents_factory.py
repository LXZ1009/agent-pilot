from __future__ import annotations

from pathlib import Path
from typing import Any

from agent_pilot.meeting_agents import (
    EXTERNAL_SERVICE_BOUNDARY,
    TASK_AGENT_NAMES,
    get_external_service_contracts,
    get_interview_card_schema,
    get_interview_state_machine,
    get_material_asset_catalog,
)
from agent_pilot.models import AgentName

PROJECT_ROOT = Path(__file__).resolve().parents[3]

MEETING_ASSET_PACKAGE_INSTRUCTION = (
    "最终产物必须是定价会议物料资产包，写入用户消息中提供的“本次会议物料资产包路径”。"
    "资产包应优先使用 JSON 结构，至少包含 meeting_overview_card、interview_cards、"
    "region_analysis_cards、risk_warning_list、five_minute_preview_payload、"
    "task_tracking_seed 和 file_manifest。最终回复保留简明中文摘要，并明确写出实际产物路径。"
    f"{EXTERNAL_SERVICE_BOUNDARY}"
)

PRICING_MEETING_SUPERVISOR_PROMPT = (
    "你是定价会议主控 Agent（PricingMeetingAgent）。你的职责是理解用户目标、维护执行上下文、"
    "根据用户目标选择必要子 Agent、汇总子 Agent 输出，并把当前状态透明说明给前端工作台。"
    "你初始化时已经拥有全部定价会议子 Agent，但不要机械调用所有 Agent；只委派与当前目标直接相关的 Agent。"
    "如果用户只是要求开始会议或开始会前访谈，应优先委派 pre_meeting_interview_agent，"
    "并在需要外部人员回复时输出 WAITING_FOR_INPUT、等待对象和缺失信息。"
    "只有用户目标明确要求物料整理、资产包、会前预览、通知载荷或会后任务跟踪时，"
    "才继续委派 material_asset_agent、notification_agent 或 task_tracking_agent。"
    "不要把所有任务默认推进到会议物料资产包。"
    f"{EXTERNAL_SERVICE_BOUNDARY}"
)

PRE_MEETING_INTERVIEW_AGENT_PROMPT = (
    "你是会前访谈 Agent。只处理单人会前访谈任务，包括生成访谈问题、读取访谈回复、"
    "追问缺口、判断完整性、解释等待状态和确认动作。必须调用 get_interview_state_machine "
    "理解状态边界。不要生成会议物料资产包；如果访谈尚未完成，返回 needs_input 或 WAITING_FOR_INPUT。"
    f"{EXTERNAL_SERVICE_BOUNDARY}"
)

INTERVIEW_STRUCTURING_AGENT_PROMPT = (
    "你是访谈结构化 Agent。只负责把已确认或足够完整的访谈内容整理成结构化访谈卡片。"
    "必须调用 get_interview_card_schema 后再组织输出。若访谈内容不足，应说明缺失字段，"
    "不要补写事实，也不要触发物料整理。"
)

MATERIAL_ASSET_AGENT_PROMPT = (
    "你是物料整理 Agent。只在主 Agent 明确委派物料整理任务时执行。"
    "你的职责是读取已确认的访谈卡片、会议上下文和业务输入，判断是否足以生成会议物料资产包。"
    "如果输入不足，返回 needs_input 和具体缺口；不要伪造客户、价格、风险或任务信息。"
    "必须调用 get_material_asset_catalog 理解资产目录。"
    f"{MEETING_ASSET_PACKAGE_INSTRUCTION}"
)

NOTIFICATION_AGENT_PROMPT = (
    "你是通知推送 Agent。只在主 Agent 明确委派通知或会前预览任务时执行。"
    "你只生成可供外部钉钉服务消费的通知载荷、卡片摘要和文件清单，不实际发送消息，"
    "也不得声称已经完成钉钉推送。"
    f"{EXTERNAL_SERVICE_BOUNDARY}"
)

TASK_TRACKING_AGENT_PROMPT = (
    "你是任务跟踪 Agent。只在主 Agent 明确委派会后跟踪或行动项任务时执行。"
    "你只生成任务清单、责任人、截止时间建议和复盘结构，不实际创建或更新钉钉任务。"
    f"{EXTERNAL_SERVICE_BOUNDARY}"
)


def create_pricing_meeting_async_supervisor_graph(model, url: str | None = None):
    """Create an AsyncSubAgent supervisor graph for LangGraph/Agent Protocol deployments."""
    from deepagents import AsyncSubAgent, create_deep_agent

    def async_subagent(name: AgentName, description: str) -> AsyncSubAgent:
        spec: dict[str, Any] = {
            "name": name.value,
            "description": description,
            "graph_id": name.value,
        }
        if url:
            spec["url"] = url
        return AsyncSubAgent(**spec)

    return create_deep_agent(
        model=model,
        backend=_deepagents_backend(),
        subagents=[
            async_subagent(
                AgentName.PRE_MEETING_INTERVIEW,
                "会前访谈 Agent：处理单人访谈问题、追问、等待状态和完整性判断。",
            ),
            async_subagent(
                AgentName.INTERVIEW_STRUCTURING,
                "访谈结构化 Agent：把已确认访谈内容整理为标准访谈卡片，不触发物料整理。",
            ),
            async_subagent(
                AgentName.MATERIAL_ASSET,
                "物料整理 Agent：仅在主 Agent 明确委派物料整理时，读取访谈和业务输入生成资产包或返回缺口。",
            ),
            async_subagent(
                AgentName.NOTIFICATION,
                "通知推送 Agent：仅生成通知载荷和预览卡片契约，不实际调用钉钉。",
            ),
            async_subagent(
                AgentName.TASK_TRACKING,
                "任务跟踪 Agent：仅生成会后任务跟踪种子数据，不实际创建钉钉任务。",
            ),
        ],
        system_prompt=_supervisor_prompt(async_mode=True),
    )


def create_pricing_meeting_supervisor_graph(model):
    from deepagents import SubAgent, create_deep_agent

    subagents = [
        SubAgent(
            name=AgentName.PRE_MEETING_INTERVIEW.value,
            description="会前访谈 Agent：判断单人访谈状态、追问缺口、完整性和确认动作。",
            system_prompt=PRE_MEETING_INTERVIEW_AGENT_PROMPT,
            tools=[get_interview_state_machine, get_external_service_contracts],
            model=model,
        ),
        SubAgent(
            name=AgentName.INTERVIEW_STRUCTURING.value,
            description="访谈结构化 Agent：把访谈回复转换为标准访谈卡片。",
            system_prompt=INTERVIEW_STRUCTURING_AGENT_PROMPT,
            tools=[get_interview_card_schema],
            model=model,
        ),
        SubAgent(
            name=AgentName.MATERIAL_ASSET.value,
            description="物料整理 Agent：仅在明确委派时生成会议物料资产包或返回缺口。",
            system_prompt=MATERIAL_ASSET_AGENT_PROMPT,
            tools=[get_material_asset_catalog, get_external_service_contracts],
            model=model,
        ),
        SubAgent(
            name=AgentName.NOTIFICATION.value,
            description="通知推送 Agent：生成会前预览和通知载荷契约。",
            system_prompt=NOTIFICATION_AGENT_PROMPT,
            tools=[get_material_asset_catalog, get_external_service_contracts],
            model=model,
        ),
        SubAgent(
            name=AgentName.TASK_TRACKING.value,
            description="任务跟踪 Agent：生成会后任务跟踪种子数据。",
            system_prompt=TASK_TRACKING_AGENT_PROMPT,
            tools=[get_interview_state_machine, get_external_service_contracts],
            model=model,
        ),
    ]
    return create_deep_agent(
        model=model,
        backend=_deepagents_backend(),
        subagents=subagents,
        tools=[
            get_interview_state_machine,
            get_interview_card_schema,
            get_material_asset_catalog,
            get_external_service_contracts,
        ],
        system_prompt=_supervisor_prompt(async_mode=False),
    )


def create_pre_meeting_interview_graph(model):
    return _create_single_agent_graph(
        model,
        PRE_MEETING_INTERVIEW_AGENT_PROMPT,
        [get_interview_state_machine, get_external_service_contracts],
    )


def create_interview_structuring_graph(model):
    return _create_single_agent_graph(
        model,
        INTERVIEW_STRUCTURING_AGENT_PROMPT,
        [get_interview_card_schema],
    )


def create_material_asset_graph(model):
    return _create_single_agent_graph(
        model,
        MATERIAL_ASSET_AGENT_PROMPT,
        [get_material_asset_catalog, get_external_service_contracts],
    )


def create_notification_graph(model):
    return _create_single_agent_graph(
        model,
        NOTIFICATION_AGENT_PROMPT,
        [get_material_asset_catalog, get_external_service_contracts],
    )


def create_task_tracking_graph(model):
    return _create_single_agent_graph(
        model,
        TASK_TRACKING_AGENT_PROMPT,
        [get_interview_state_machine, get_external_service_contracts],
    )


def create_pricing_meeting_graph(model):
    return _create_single_agent_graph(
        model,
        PRICING_MEETING_SUPERVISOR_PROMPT,
        [
            get_interview_state_machine,
            get_interview_card_schema,
            get_material_asset_catalog,
            get_external_service_contracts,
        ],
    )


def _create_single_agent_graph(model, system_prompt: str, tools: list[Any]):
    from deepagents import create_deep_agent

    return create_deep_agent(
        model=model,
        backend=_deepagents_backend(),
        tools=tools,
        system_prompt=system_prompt,
    )


def _supervisor_prompt(async_mode: bool) -> str:
    delegation_tool = "start_async_task/check_async_task" if async_mode else "task"
    subagents = ", ".join(agent.value for agent in TASK_AGENT_NAMES)
    return (
        f"{PRICING_MEETING_SUPERVISOR_PROMPT}"
        f"必须使用 DeepAgents 的 {delegation_tool} 工具委派给相关子 Agent：{subagents}。"
        "输出必须区分：Agent 已生成的数据契约、外部钉钉服务需要执行的动作、仍缺失的业务输入。"
    )


def _deepagents_backend():
    from deepagents.backends import FilesystemBackend

    return FilesystemBackend(root_dir=PROJECT_ROOT, virtual_mode=True)
