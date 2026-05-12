from __future__ import annotations

import os
from typing import Any

from deepagents import create_deep_agent

from agent_pilot.meeting_contracts import EXTERNAL_SERVICE_BOUNDARY
from agent_pilot.model_config import get_model
from agent_pilot.subagents.interview_structuring.agent import (
    SYSTEM_PROMPT as INTERVIEW_STRUCTURING_PROMPT,
    inspect_interview_card_schema,
)
from agent_pilot.subagents.notification.agent import (
    SYSTEM_PROMPT as NOTIFICATION_PROMPT,
    inspect_external_service_contracts as notification_external_contracts,
    inspect_material_asset_catalog as notification_material_catalog,
)
from agent_pilot.subagents.pre_meeting_interview.agent import (
    SYSTEM_PROMPT as PRE_MEETING_INTERVIEW_PROMPT,
    get_default_interview_questions,
    inspect_external_service_contracts as interview_external_contracts,
    inspect_interview_card_schema as interview_card_schema,
    inspect_interview_state_machine,
)
from agent_pilot.subagents.pre_meeting_interview.skill_loader import (
    SKILL_SOURCES as PRE_MEETING_INTERVIEW_SKILL_SOURCES,
)

SYSTEM_PROMPT = f"""\
你是定价会议主控 Agent（PricingMeetingAgent），也是唯一面向用户交互的 Agent。

核心定位：
1. 用户只和你交互；子 Agent 不直接面向用户。
2. 子 Agent 只是为你完成专项工作，你必须汇总、解释、追问并推进流程。
3. 不要把子 Agent 的原始运行细节作为业务主回复，除非用户要求查看执行详情。
4. 对话工作区里应呈现业务可用结果，例如访谈问题、缺失信息、追问建议、物料摘要、预览内容。
5. job_id、子 Agent 名称、tool trace 等技术信息只作为执行详情或简短辅助信息，不作为主叙事。

子 Agent 使用策略：
- 会前访谈问题生成、回复完整性判断、追问建议：同步调用 pre_meeting_interview_agent，并将结果汇总给用户。
- 访谈回复结构化：同步调用 interview_structuring_agent，并将访谈卡片结果汇总给用户。
- 会前预览/通知载荷生成：同步调用 notification_agent，并将预览内容给用户确认。
- 会议物料资产包生成：长任务，异步启动 material_asset_agent；启动后说明任务已开始，可在执行详情查看 job_id。
- 会后任务跟踪种子：长任务，异步启动 task_tracking_agent；启动后说明任务已开始。

强制交互规则：
1. 当用户要求“开始会前访谈”时，必须同步调用 pre_meeting_interview_agent 生成访谈问题，并直接把问题汇总给用户。
2. 不要只回复“已启动子 Agent / job_id”，除非是物料生成、任务跟踪等长任务。
3. 当用户补充“张三回复：...”时，必须判断信息完整性，并给出已收集事实、缺失字段和追问建议。
4. 不得编造价格、销量、收入、毛利、客户、竞品事实；缺失时必须明确追问。
5. 外部钉钉/飞书/微信/邮件服务只作为契约边界，不得声称已真实发送。

{EXTERNAL_SERVICE_BOUNDARY}
"""

model = get_model()


def _sync_subagent(
    name: str,
    description: str,
    system_prompt: str,
    tools: list[Any],
    skills: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "system_prompt": system_prompt,
        "tools": tools,
        "model": model,
        **({"skills": skills} if skills else {}),
    }


def _async_subagent(name: str, description: str) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "name": name,
        "description": description,
        "graph_id": name,
    }
    url = os.getenv("DEEPAGENTS_ASYNC_SUBAGENT_URL") or None
    if url:
        spec["url"] = url
    return spec


SYNC_SUBAGENTS: list[dict[str, Any]] = [
    _sync_subagent(
        "pre_meeting_interview_agent",
        "同步子 Agent：生成会前访谈问题、判断回复完整性、提炼缺失字段和追问建议。",
        PRE_MEETING_INTERVIEW_PROMPT,
        [
            inspect_interview_state_machine,
            interview_card_schema,
            interview_external_contracts,
            get_default_interview_questions,
        ],
        PRE_MEETING_INTERVIEW_SKILL_SOURCES,
    ),
    _sync_subagent(
        "interview_structuring_agent",
        "同步子 Agent：把访谈回复和补充信息整理成标准访谈卡片。",
        INTERVIEW_STRUCTURING_PROMPT,
        [inspect_interview_card_schema],
    ),
    _sync_subagent(
        "notification_agent",
        "同步子 Agent：生成会前预览、通知卡片摘要和外部服务 payload 契约。",
        NOTIFICATION_PROMPT,
        [notification_external_contracts, notification_material_catalog],
    ),
]

ASYNC_SUBAGENTS: list[dict[str, Any]] = [
    _async_subagent(
        "material_asset_agent",
        "异步子 Agent：长任务，生成定价会议物料资产包、风险提示、主持人预览素材和文件清单。",
    ),
    _async_subagent(
        "task_tracking_agent",
        "异步子 Agent：长任务，生成会后任务跟踪种子数据和复盘结构。",
    ),
]

graph = create_deep_agent(
    model=model,
    system_prompt=SYSTEM_PROMPT,
    subagents=[*SYNC_SUBAGENTS, *ASYNC_SUBAGENTS],
    name="pricing_meeting_agent",
)
