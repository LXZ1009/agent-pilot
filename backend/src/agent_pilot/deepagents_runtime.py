from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from agent_pilot.deepagents_factory import (
    MEETING_ASSET_PACKAGE_INSTRUCTION,
    create_pricing_meeting_supervisor_graph,
)
from agent_pilot.meeting_agents import AGENTS, EXTERNAL_SERVICE_BOUNDARY, TASK_AGENT_NAMES
from agent_pilot.models import (
    AgentInfo,
    AgentName,
    AgentTask,
    EventRecord,
    EventType,
    MeetingContext,
    RunRecord,
    TaskStatus,
    utc_now,
)

REPORT_ARTIFACT_FILENAME = "meeting-asset-package.json"

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


@dataclass(frozen=True)
class DeepAgentsModelConfig:
    model: str
    api_key: str | None = None
    base_url: str | None = None
    temperature: float = 0.2
    extra_body: dict[str, Any] | None = None
    disable_streaming: str | bool | None = None
    parallel_tool_calls: bool | None = None

    @classmethod
    def from_env(cls) -> "DeepAgentsModelConfig":
        model = os.getenv("AGENT_PILOT_MODEL", "openai:gpt-5.4")
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL") or None
        if (model.startswith("openai:") or base_url) and not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for real DeepAgents OpenAI execution.")
        return cls(
            model=model,
            api_key=api_key,
            base_url=base_url,
            temperature=float(os.getenv("AGENT_PILOT_TEMPERATURE", "0.2")),
            extra_body=_json_env("AGENT_PILOT_OPENAI_EXTRA_BODY_JSON"),
            disable_streaming=(
                "tool_calling"
                if os.getenv("AGENT_PILOT_DISABLE_STREAMING_TOOL_CALLING", "true").lower()
                in {"1", "true", "yes"}
                else None
            ),
            parallel_tool_calls=_optional_bool_env("AGENT_PILOT_PARALLEL_TOOL_CALLS"),
        )

    def to_deepagents_model(self) -> str | ChatOpenAI:
        if not self.base_url:
            return self.model

        kwargs: dict[str, Any] = {
            "model": self.model.removeprefix("openai:"),
            "api_key": SecretStr(self.api_key or ""),
            "base_url": self.base_url,
            "temperature": self.temperature,
        }
        if self.extra_body is not None:
            kwargs["extra_body"] = self.extra_body
        if self.disable_streaming is not None:
            kwargs["disable_streaming"] = self.disable_streaming
        if self.parallel_tool_calls is not None:
            kwargs["parallel_tool_calls"] = self.parallel_tool_calls
        return ChatOpenAI(**kwargs)


class DeepAgentsRuntime:
    """FastAPI-facing runtime that invokes a real DeepAgents supervisor graph."""

    def __init__(
        self,
        graph: Any | None = None,
        model_config: DeepAgentsModelConfig | None = None,
    ) -> None:
        self._graph = graph
        self._model_config = model_config
        self._runs: dict[str, RunRecord] = {}
        self._workers: dict[str, asyncio.Task[None]] = {}
        self._lock = asyncio.Lock()

    @property
    def agents(self) -> list[AgentInfo]:
        return list(AGENTS.values())

    async def create_run(
        self,
        message: str,
        requested_agents: Iterable[AgentName],
        meeting_context: MeetingContext | None = None,
    ) -> RunRecord:
        requested = list(dict.fromkeys(requested_agents))
        auto_route = not requested
        selected_agents = self._select_agents(requested)
        run_id = f"run_{uuid4().hex[:12]}"
        tasks = [
            AgentTask(
                task_id=f"task_{uuid4().hex[:12]}",
                run_id=run_id,
                agent=agent,
                input=message,
            )
            for agent in selected_agents
        ]
        run = RunRecord(
            run_id=run_id,
            message=message,
            meeting_context=meeting_context,
            requested_agents=selected_agents,
            auto_route=auto_route,
            supervisor_note=(
                "Real DeepAgents pricing meeting supervisor will use OpenAI tool-calling and "
                f"{'auto-route across available' if auto_route else 'explicitly requested'} "
                f"meeting subagents: {', '.join(agent.value for agent in selected_agents)}. "
                "DingTalk scheduling, sending, card callbacks, meetings, and files are external."
            ),
            report_path=_report_artifact_path(run_id),
            tasks=tasks,
        )

        async with self._lock:
            self._runs[run_id] = run
            self._append_event_locked(
                run,
                EventType.RUN_CREATED,
                "DeepAgents run created.",
            )
            self._workers[run_id] = asyncio.create_task(self._invoke_deepagents(run_id))

        await asyncio.sleep(0)
        return run

    async def get_run(self, run_id: str) -> RunRecord | None:
        async with self._lock:
            return self._runs.get(run_id)

    async def list_runs(self) -> list[RunRecord]:
        async with self._lock:
            return sorted(self._runs.values(), key=lambda run: run.created_at, reverse=True)

    async def list_events(self, run_id: str) -> list[EventRecord] | None:
        async with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                return None
            return list(run.events)

    async def update_task(self, run_id: str, task_id: str, instruction: str) -> AgentTask:
        async with self._lock:
            run, task = self._require_task_locked(run_id, task_id)
            if task.status in _TERMINAL_STATUSES:
                raise RuntimeError(f"Task {task_id} is already terminal: {task.status}")
            task.updates.append(instruction)
            task.last_updated_at = utc_now()
            run.updated_at = utc_now()
            self._append_event_locked(
                run,
                EventType.TASK_UPDATED,
                f"{task.agent.value} received update: {instruction}",
                task,
            )
            return task

    async def cancel_task(self, run_id: str, task_id: str) -> AgentTask:
        async with self._lock:
            run, task = self._require_task_locked(run_id, task_id)
            if task.status not in _TERMINAL_STATUSES:
                task.status = TaskStatus.CANCELLED
                task.completed_at = utc_now()
                task.result = "Cancelled before DeepAgents completed."
                run.updated_at = utc_now()
                self._append_event_locked(run, EventType.TASK_CANCELLED, "Task cancelled.", task)
            worker = self._workers.get(run_id)
            if worker and not worker.done():
                worker.cancel()
            return task

    async def wait_for_run(self, run_id: str) -> None:
        worker = self._workers.get(run_id)
        if worker:
            await asyncio.gather(worker, return_exceptions=True)

    async def _invoke_deepagents(self, run_id: str) -> None:
        try:
            if self._graph is not None:
                graph = self._graph
            else:
                model_config = self._model_config or DeepAgentsModelConfig.from_env()
                graph = create_pricing_meeting_supervisor_graph(
                    model=model_config.to_deepagents_model()
                )
            async with self._lock:
                run = self._runs[run_id]
                for task in run.tasks:
                    task.status = TaskStatus.RUNNING
                    task.started_at = utc_now()
                    task.progress = 20
                    self._append_event_locked(
                        run,
                        EventType.TASK_STARTED,
                        f"{task.agent.value} delegated through DeepAgents.",
                        task,
                    )

            result = await graph.ainvoke(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": self._build_prompt(run_id),
                        }
                    ]
                }
            )
            content = _last_message_content(result)

            async with self._lock:
                run = self._runs[run_id]
                for task in run.tasks:
                    task.status = TaskStatus.SUCCEEDED
                    task.progress = 100
                    task.completed_at = utc_now()
                    if task.agent == AgentName.PRICING_MEETING:
                        task.result = content
                    else:
                        task.result = (
                            "DeepAgents supervisor delegated this meeting subtask through model "
                            "tool-calling. See pricing_meeting_agent for the synthesized result."
                        )
                    self._append_event_locked(
                        run,
                        EventType.TASK_SUCCEEDED,
                        f"{task.agent.value} completed via DeepAgents.",
                        task,
                    )
                run.updated_at = utc_now()
        except asyncio.CancelledError:
            await self._mark_run_cancelled(run_id)
            raise
        except Exception as exc:
            await self._mark_run_failed(run_id, exc)

    def _build_prompt(self, run_id: str) -> str:
        run = self._runs[run_id]
        selected = [
            agent.value for agent in run.requested_agents if agent != AgentName.PRICING_MEETING
        ]
        if run.auto_route:
            routing_instruction = (
                f"可用定价会议 agents：{', '.join(selected)}。\n"
                "请根据任务场景自动选择必要的定价会议 agents 协同完成，"
                "不要机械调用所有 Agent；只调用与当前任务直接相关的 Agent。"
            )
        else:
            routing_instruction = f"本次必须使用的定价会议 agents：{', '.join(selected)}。"

        context_json = (
            json.dumps(
                run.meeting_context.model_dump(mode="json", exclude_none=True),
                ensure_ascii=False,
                indent=2,
            )
            if run.meeting_context
            else "{}"
        )
        sections = [
            "你必须使用 DeepAgents 的定价会议 subagents 完成本次任务，而不是自己凭空回答。",
            f"用户问题：{run.message}",
            f"会议上下文 JSON：\n{context_json}",
            routing_instruction,
            "钉钉服务逻辑不在本项目中；不要实现或声称已经执行钉钉定时调度、消息发送、"
            "卡片回调、会议开始检测或文件上传。",
            "如果当前目标只是会议启动或会前访谈，请停留在访谈卡片/访谈等待状态，"
            "不要默认进入物料整理、通知或会后任务跟踪。",
        ]

        if _message_requests_material(run.message):
            sections.extend(
                [
                    f"本次会议物料资产包路径：`{run.report_path}`。",
                    "用户目标包含物料、资产包、预览、通知或任务跟踪意图时，"
                    "由 pricing_meeting_agent 委派相关子 Agent 并生成中文摘要和可被外部钉钉服务消费的会议物料资产包。",
                    MEETING_ASSET_PACKAGE_INSTRUCTION,
                ]
            )

        return "\n".join(sections)

    async def _mark_run_cancelled(self, run_id: str) -> None:
        async with self._lock:
            run = self._runs[run_id]
            for task in run.tasks:
                if task.status not in _TERMINAL_STATUSES:
                    task.status = TaskStatus.CANCELLED
                    task.completed_at = utc_now()
                    task.result = "Cancelled before DeepAgents completed."
            run.updated_at = utc_now()

    async def _mark_run_failed(self, run_id: str, exc: Exception) -> None:
        async with self._lock:
            run = self._runs[run_id]
            for task in run.tasks:
                if task.status not in _TERMINAL_STATUSES:
                    task.status = TaskStatus.ERROR
                    task.error = str(exc)
                    task.completed_at = utc_now()
                    self._append_event_locked(
                        run,
                        EventType.TASK_FAILED,
                        f"{task.agent.value} failed: {exc}",
                        task,
                    )
            run.updated_at = utc_now()

    def _select_agents(self, requested_agents: Iterable[AgentName]) -> list[AgentName]:
        requested = list(dict.fromkeys(requested_agents))
        task_agents = [agent for agent in requested if agent in TASK_AGENT_NAMES]
        if not task_agents:
            task_agents = list(TASK_AGENT_NAMES)
        return [*task_agents, AgentName.PRICING_MEETING]

    def _require_task_locked(self, run_id: str, task_id: str) -> tuple[RunRecord, AgentTask]:
        run = self._runs.get(run_id)
        if run is None:
            raise KeyError(f"Run {run_id} not found")
        for task in run.tasks:
            if task.task_id == task_id:
                return run, task
        raise KeyError(f"Task {task_id} not found")

    def _append_event_locked(
        self,
        run: RunRecord,
        event_type: EventType,
        message: str,
        task: AgentTask | None = None,
    ) -> None:
        run.events.append(
            EventRecord(
                event_id=f"evt_{uuid4().hex[:12]}",
                run_id=run.run_id,
                task_id=task.task_id if task else None,
                agent=task.agent if task else None,
                type=event_type,
                message=message,
            )
        )


def _message_requests_material(message: str) -> bool:
    normalized = message.lower()
    return any(keyword.lower() in normalized for keyword in _MATERIAL_INTENT_KEYWORDS)


def _last_message_content(result: dict[str, Any]) -> str:
    messages = result.get("messages", [])
    if not messages:
        return ""
    last = messages[-1]
    if isinstance(last, dict):
        return str(last.get("content", ""))
    return str(getattr(last, "content", ""))


def _json_env(name: str) -> dict[str, Any] | None:
    value = os.getenv(name)
    if not value:
        return None
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise RuntimeError(f"{name} must be a JSON object.")
    return parsed


def _optional_bool_env(name: str) -> bool | None:
    value = os.getenv(name)
    if value is None:
        return None
    return value.lower() in {"1", "true", "yes"}


def _report_artifact_path(run_id: str) -> str:
    return f"/tmp/reports/{run_id}/{REPORT_ARTIFACT_FILENAME}"


_TERMINAL_STATUSES = {TaskStatus.SUCCEEDED, TaskStatus.CANCELLED, TaskStatus.ERROR}
