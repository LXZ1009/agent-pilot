from __future__ import annotations

import json
import os
from typing import Any
from uuid import uuid4

from langgraph_sdk import get_client

from agent_pilot.meeting_contracts import (
    EXTERNAL_SERVICE_BOUNDARY,
    MEETING_ASSET_PACKAGE_INSTRUCTION,
)
from agent_pilot.models import (
    Interviewee,
    MeetingContext,
    PricingMeetingRun,
    PricingMeetingRunStatus,
    WorkspaceCard,
    utc_now,
)
from agent_pilot.subagents.material_asset.skill_loader import (
    load_skill_files as load_material_asset_skill_files,
)
from agent_pilot.subagents.pre_meeting_interview.skill_loader import (
    load_skill_files as load_pre_meeting_interview_skill_files,
)

_MATERIAL_INTENT_KEYWORDS = (
    "物料",
    "材料",
    "资产包",
    "预览",
    "通知",
    "会前5分钟",
    "会前五分钟",
    "任务跟踪",
    "行动项",
    "material",
    "asset",
    "package",
    "preview",
    "notification",
)

_WAITING_KEYWORDS = (
    "WAITING_FOR_INPUT",
    "NEEDS_INPUT",
    "needs_input",
    "等待",
    "缺失",
    "补充",
    "追问",
    "请补充",
)

_COMPLETED_KEYWORDS = (
    "已完成",
    "完成访谈",
    "确认完成",
    "COMPLETED",
    "completed",
)


class PricingTaskRuntime:
    """FastAPI adapter for the multi-agent collaboration workspace.

    FastAPI does not directly import and invoke ``agent_pilot.agent:graph``.
    Instead, it calls the LangGraph Server assistant named ``supervisor`` through
    ``langgraph_sdk``.

    Important design note:
    - Runtime must not rewrite or clean model output.
    - The supervisor's final message is returned directly as ``coordinator_note``.
    - Message format and person/recipient correctness must be controlled by
      PricingMeetingAgent prompt and scenario skills.
    """

    def __init__(
        self,
        langgraph_url: str | None = None,
        assistant_id: str | None = None,
    ) -> None:
        self._langgraph_url = (
            langgraph_url
            or os.getenv("LANGGRAPH_SERVER_URL")
            or "http://127.0.0.1:2024"
        )
        self._assistant_id = (
            assistant_id
            or os.getenv("LANGGRAPH_SUPERVISOR_ASSISTANT_ID")
            or "supervisor"
        )
        self._pricing_runs: dict[str, PricingMeetingRun] = {}

    async def create_pricing_meeting_run(
        self,
        command: str,
        meeting_context: MeetingContext,
        interviewees: list[Interviewee],
    ) -> PricingMeetingRun:
        run = PricingMeetingRun(
            run_id=f"pm_run_{uuid4().hex[:12]}",
            command=command,
            meeting_context=meeting_context,
            status=PricingMeetingRunStatus.RUNNING,
            active_agent="PricingMeetingAgent",
            coordinator_note="PricingMeetingAgent 正在处理请求。",
            pending_agents=[],
            blocked_by=[],
            async_jobs=[],
            workspace_cards=[],
            timeline=[
                {
                    "type": "user_command",
                    "agent": "User",
                    "content": command,
                }
            ],
        )
        self._pricing_runs[run.run_id] = run

        return await self._invoke_supervisor(
            run,
            user_input=command,
            interviewees=interviewees,
        )

    async def continue_pricing_meeting_run(
        self,
        run_id: str,
        content: str,
    ) -> PricingMeetingRun:
        run = self._require_pricing_run(run_id)
        run.timeline.append(
            {
                "type": "user_command",
                "agent": "User",
                "content": content,
            }
        )
        run.status = PricingMeetingRunStatus.RUNNING
        run.updated_at = utc_now()

        return await self._invoke_supervisor(
            run,
            user_input=content,
            interviewees=[],
        )

    async def get_pricing_meeting_run(self, run_id: str) -> PricingMeetingRun:
        return self._require_pricing_run(run_id)

    async def list_pricing_meeting_runs(self) -> list[PricingMeetingRun]:
        return sorted(
            self._pricing_runs.values(),
            key=lambda run: run.created_at,
            reverse=True,
        )

    async def _invoke_supervisor(
        self,
        run: PricingMeetingRun,
        user_input: str,
        interviewees: list[Interviewee],
    ) -> PricingMeetingRun:
        try:
            content = await self._invoke_langgraph_supervisor(
                self._build_prompt(run, user_input, interviewees)
            )

            # Do not clean, rewrite, truncate, or post-process model output.
            # Whatever the supervisor returns is exposed to the frontend directly.
            run.coordinator_note = content
            run.timeline.append(
                {
                    "type": "agent_message",
                    "agent": "PricingMeetingAgent",
                    "content": content,
                }
            )

            run.status = _status_from_content(content)
            run.workspace_cards = _derive_workspace_cards(run)
            run.blocked_by = _derive_blocked_by(run)
            run.pending_agents = _derive_pending_agents(content)
            run.updated_at = utc_now()

            return run

        except Exception as exc:
            error_message = _format_runtime_error(exc)

            run.status = PricingMeetingRunStatus.ERROR
            run.coordinator_note = error_message
            run.timeline.append(
                {
                    "type": "error",
                    "agent": "PricingMeetingAgent",
                    "content": error_message,
                }
            )
            run.workspace_cards = _derive_workspace_cards(run)
            run.updated_at = utc_now()

            return run

    async def _invoke_langgraph_supervisor(self, prompt: str) -> str:
        print(
            "[PricingTaskRuntime] invoking LangGraph Server: "
            f"{self._langgraph_url}, assistant={self._assistant_id}"
        )

        skill_files: dict[str, Any] = {}
        skill_files.update(load_pre_meeting_interview_skill_files())
        skill_files.update(load_material_asset_skill_files())

        client = get_client(url=self._langgraph_url)
        thread = await client.threads.create()
        thread_id = _get_required_id(thread, "thread_id")

        result = await client.runs.wait(
            thread_id=thread_id,
            assistant_id=self._assistant_id,
            input={
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                "files": skill_files,
            },
        )

        return _last_message_content(result).strip()

    def _build_prompt(
        self,
        run: PricingMeetingRun,
        command: str,
        interviewees: list[Interviewee],
    ) -> str:
        context_json = json.dumps(
            run.meeting_context.model_dump(mode="json", exclude_none=True),
            ensure_ascii=False,
            indent=2,
        )
        interviewees_json = json.dumps(
            [
                interviewee.model_dump(mode="json", exclude_none=True)
                for interviewee in interviewees
            ],
            ensure_ascii=False,
            indent=2,
        )
        timeline_json = json.dumps(
            run.timeline,
            ensure_ascii=False,
            indent=2,
        )

        current_interviewee_name = _get_current_interviewee_name(
            interviewees=interviewees,
            meeting_context=run.meeting_context,
            command=command,
        )

        sections = [
            "你是 PricingMeetingAgent，是唯一面向用户的主 Agent。",
            "用户只和你交互；子 Agent 只为你执行专项工作。",
            "不要把子 Agent 原始回复、工具返回或 job_id 当作业务主回复直接抛给用户。",
            "",
            "## 核心输出原则",
            "你的最终回复会由后端直接返回给前端展示，运行时不会对你的输出做任何清洗、截断、改写或格式转换。",
            "因此，你必须一次性输出适合前端直接展示的最终文本。",
            "不要把内部说明、执行状态、工具痕迹、子 Agent 名称、workspace card 类型、按钮文案混入最终回复。",
            "",
            "## 会前访谈消息投递规则",
            "当流程进入会前访谈阶段时，你输出的主消息会被系统直接推送给当前被访谈人。",
            "因此，主消息必须是一条可以直接发送给被访谈人的自然对话消息，而不是任务卡、会议卡片或内部执行记录。",
            "如果知道被访谈人姓名，可以在开头称呼一次，例如“张总好”或“张三，我们先确认一个问题”。",
            "后续必须直接使用第二人称，例如“请你补充”“你可以重点说明”“你回复后我会继续追问”。",
            "不要说“请张三回复”“等待张三补充”“访谈对象需要说明”。",
            "",
            "## 会前访谈主消息格式约束",
            "会前访谈每轮只提出一个主要问题，不要返回问题清单。",
            "主消息只能包含：简短问候或承接、一个核心问题、必要的回答提示。",
            "回答提示最多 1-3 条，并且必须是给被访谈人看的提示，不是内部追问策略。",
            "主消息禁止包含：",
            "- 标题，例如“📋 华东大区定价会 · 会前访谈（张三）”；",
            "- 会议时间、访谈对象、议题、会议编号等元信息字段；",
            "- “第一轮问题”“优先级：高”“问题 1”等任务卡标签；",
            "- “追问提示”“供参考”“内部提示”等内部访谈策略；",
            "- “如果提到具体月份波动，追问原因”这类给 Agent 使用的追问规则；",
            "- workspace card 类型、状态、详情、按钮文案；",
            "- 子 Agent 名称、工具调用、job_id、执行状态。",
            "",
            "## 子 Agent 使用规则",
            "短任务必须同步获取子 Agent 结果后汇总给用户：会前访谈问题、回复完整性判断、追问建议、访谈结构化、会前预览。",
            "长任务可以异步启动：会议物料资产包生成、会后任务跟踪种子生成。",
            "当用户补充访谈回复时，必须判断已收集事实、缺失字段和追问建议。",
            "只有物料生成或任务跟踪等长任务，才把 async job 作为辅助状态展示；业务主回复仍要解释下一步。",
            "",
            f"run_id: {run.run_id}",
            f"原始用户目标：{run.command}",
            f"本轮用户输入：{command}",
            f"当前本轮访谈对象：{current_interviewee_name or '未明确'}",
            f"会议上下文 JSON：\n{context_json}",
            f"本轮外部触发的访谈对象 JSON：\n{interviewees_json}",
            f"历史 timeline JSON：\n{timeline_json}",
            EXTERNAL_SERVICE_BOUNDARY,
        ]

        if _message_requests_material(command) or _user_timeline_requests_material(run.timeline):
            sections.append(MEETING_ASSET_PACKAGE_INSTRUCTION)

        return "\n".join(sections)

    def _require_pricing_run(self, run_id: str) -> PricingMeetingRun:
        run = self._pricing_runs.get(run_id)
        if run is None:
            raise KeyError(f"Pricing meeting run {run_id} not found")
        return run


def _get_current_interviewee_name(
    interviewees: list[Interviewee],
    meeting_context: MeetingContext,
    command: str,
) -> str | None:
    """Infer the current interviewee name for prompt context only.

    This does not change model output. It only gives the supervisor clearer
    recipient context so it can use the right person and tone.
    """
    if interviewees:
        return interviewees[0].name

    business_payload = meeting_context.business_payload or {}
    delivery_context = business_payload.get("delivery_context")
    if isinstance(delivery_context, dict):
        recipient_name = delivery_context.get("recipient_name")
        if recipient_name:
            return str(recipient_name)

    for name in ("张三", "李四", "王五"):
        if name in command:
            return name

    return None


def _message_requests_material(message: str) -> bool:
    normalized = message.lower()
    return any(keyword.lower() in normalized for keyword in _MATERIAL_INTENT_KEYWORDS)


def _user_timeline_requests_material(timeline: list[dict[str, Any]]) -> bool:
    return any(
        _message_requests_material(str(item.get("content", "")))
        for item in timeline
        if item.get("type") == "user_command" or item.get("agent") == "User"
    )


def _status_from_content(content: str) -> PricingMeetingRunStatus:
    if any(keyword in content for keyword in _WAITING_KEYWORDS):
        return PricingMeetingRunStatus.WAITING_FOR_INPUT
    if any(keyword in content for keyword in _COMPLETED_KEYWORDS):
        return PricingMeetingRunStatus.COMPLETED
    return PricingMeetingRunStatus.RUNNING


def _derive_workspace_cards(run: PricingMeetingRun) -> list[WorkspaceCard]:
    """Derive workspace cards that are not model-output transformations.

    Important:
    - Do not automatically create an interview_task card from coordinator_note.
    - The frontend should display run.coordinator_note as the main conversation output.
    - This function only exposes explicit structured artifacts already present on the run.
    """
    cards: list[WorkspaceCard] = []

    if run.asset_package:
        cards.append(
            WorkspaceCard(
                type="material_asset",
                title="会议物料资产包",
                status="ready",
                summary="会议物料资产包已生成。",
                content=run.asset_package,
            )
        )

    if run.preview_card:
        cards.append(
            WorkspaceCard(
                type="preview_card",
                title="会前预览",
                status="ready",
                summary="会前预览内容已生成。",
                content=run.preview_card,
            )
        )

    return cards


def _derive_blocked_by(run: PricingMeetingRun) -> list[str]:
    """Infer blocked_by from explicit meeting context when available.

    Avoid deriving blocked users from model output text, because model output is
    recipient-facing and should not be used as a control-plane protocol.
    """
    business_payload = run.meeting_context.business_payload or {}
    delivery_context = business_payload.get("delivery_context")

    if isinstance(delivery_context, dict):
        recipient_name = delivery_context.get("recipient_name")
        if recipient_name:
            return [str(recipient_name)]

    return []


def _derive_pending_agents(content: str) -> list[str]:
    pending: list[str] = []

    if "material_asset_agent" in content:
        pending.append("material_asset_agent")

    if "task_tracking_agent" in content:
        pending.append("task_tracking_agent")

    return pending


def _last_message_content(result: Any) -> str:
    if not isinstance(result, dict):
        return str(result)

    messages = result.get("messages", [])
    if not messages:
        return ""

    last = messages[-1]

    if isinstance(last, dict):
        return str(last.get("content", ""))

    return str(getattr(last, "content", ""))


def _get_required_id(value: Any, key: str) -> str:
    if not isinstance(value, dict):
        raise RuntimeError(f"LangGraph response is not a dict: {value!r}")

    raw = value.get(key)
    if not raw:
        raise RuntimeError(f"LangGraph response missing {key}: {value!r}")

    return str(raw)


def _format_runtime_error(exc: Exception) -> str:
    return (
        "**PricingMeetingAgent 调用失败。**\n\n"
        f"**错误信息：** `{exc}`\n\n"
        "请检查 LangGraph Server 是否已启动、assistant_id 是否为 supervisor、"
        "langgraph.json 是否注册了 supervisor 和对应子 Agent graph。"
    )
