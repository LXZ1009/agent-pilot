from __future__ import annotations

import json
import os
import re
from typing import Any
from uuid import uuid4

from langgraph_sdk import get_client

from agent_pilot.meeting_contracts import EXTERNAL_SERVICE_BOUNDARY, MEETING_ASSET_PACKAGE_INSTRUCTION
from agent_pilot.models import (
    Interviewee,
    MeetingContext,
    PricingMeetingRun,
    PricingMeetingRunStatus,
    WorkspaceCard,
    utc_now,
)

from agent_pilot.subagents.pre_meeting_interview.agent import (
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
    ``langgraph_sdk``. The supervisor is the only user-facing agent. Short,
    interaction-dependent tasks are handled by synchronous subagents through the
    DeepAgents ``task`` tool; long-running tasks are launched as AsyncSubAgent jobs.
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
            timeline=[{"type": "user_command", "agent": "User", "content": command}],
        )
        self._pricing_runs[run.run_id] = run

        return await self._invoke_supervisor(run, user_input=command, interviewees=interviewees)

    async def continue_pricing_meeting_run(self, run_id: str, content: str) -> PricingMeetingRun:
        run = self._require_pricing_run(run_id)
        run.timeline.append({"type": "user_command", "agent": "User", "content": content})
        run.status = PricingMeetingRunStatus.RUNNING
        run.updated_at = utc_now()
        return await self._invoke_supervisor(run, user_input=content, interviewees=[])

    async def get_pricing_meeting_run(self, run_id: str) -> PricingMeetingRun:
        return self._require_pricing_run(run_id)

    async def list_pricing_meeting_runs(self) -> list[PricingMeetingRun]:
        return sorted(self._pricing_runs.values(), key=lambda run: run.created_at, reverse=True)

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
            run.blocked_by = _derive_blocked_by(content, run)
            run.pending_agents = _derive_pending_agents(content)
            run.updated_at = utc_now()
            return run
        except Exception as exc:
            run.status = PricingMeetingRunStatus.ERROR
            run.coordinator_note = _format_runtime_error(exc)
            run.timeline.append(
                {
                    "type": "error",
                    "agent": "PricingMeetingAgent",
                    "content": _format_runtime_error(exc),
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

        skill_files = {}
        skill_files.update(load_pre_meeting_interview_skill_files())

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
            [interviewee.model_dump(mode="json", exclude_none=True) for interviewee in interviewees],
            ensure_ascii=False,
            indent=2,
        )
        timeline_json = json.dumps(run.timeline, ensure_ascii=False, indent=2)

        sections = [
            "你是 PricingMeetingAgent，是唯一面向用户的主 Agent。",
            "用户只和你交互；子 Agent 只为你执行专项工作。",
            "不要把子 Agent 原始回复、工具返回或 job_id 当作业务主回复直接抛给用户。",
            "短任务必须同步获取子 Agent 结果后汇总给用户：会前访谈问题、回复完整性判断、追问建议、访谈结构化、会前预览。",
            "长任务可以异步启动：会议物料资产包生成、会后任务跟踪种子生成。",
            "当用户要求开始会前访谈时，必须同步调用 pre_meeting_interview_agent 生成访谈问题，并直接以业务语言返回问题清单。",
            "当用户补充访谈回复时，必须判断已收集事实、缺失字段和追问建议。",
            "只有物料生成或任务跟踪等长任务，才把 async job 作为辅助状态展示；业务主回复仍要解释下一步。",
            f"run_id: {run.run_id}",
            f"原始用户目标：{run.command}",
            f"本轮用户输入：{command}",
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
    cards: list[WorkspaceCard] = []
    text = run.coordinator_note or ""
    if "访谈" in text or "追问" in text or "请补充" in text:
        questions = _extract_numbered_lines(text)
        cards.append(
            WorkspaceCard(
                type="interview_task",
                title="会前访谈",
                status=run.status.value,
                summary="主 Agent 已汇总会前访谈问题、缺失信息或追问建议。",
                content={
                    "questions_or_followups": questions,
                    "raw_summary": text,
                },
                actions=[
                    {"label": "补充访谈回复", "prompt": "张三回复："},
                    {"label": "继续追问", "prompt": "请根据当前缺失信息继续生成追问建议。"},
                    {"label": "确认访谈完成", "prompt": "确认当前访谈信息已完成，并结构化访谈卡片。"},
                ],
            )
        )
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


def _extract_numbered_lines(text: str) -> list[str]:
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^(\d+[.、]|[-*])\s*", stripped):
            lines.append(re.sub(r"^(\d+[.、]|[-*])\s*", "", stripped).strip())
    return lines


def _derive_blocked_by(content: str, run: PricingMeetingRun) -> list[str]:
    blocked: list[str] = []
    for event in run.timeline:
        raw = str(event.get("content", ""))
        for name in ("张三", "李四", "王五"):
            if name in raw and name not in blocked and any(k in content for k in _WAITING_KEYWORDS):
                blocked.append(name)
    return blocked


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
