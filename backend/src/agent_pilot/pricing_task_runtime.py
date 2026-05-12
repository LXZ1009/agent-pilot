from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from agent_pilot.deepagents_factory import (
    MEETING_ASSET_PACKAGE_INSTRUCTION,
    create_pricing_meeting_supervisor_graph,
)
from agent_pilot.deepagents_runtime import DeepAgentsModelConfig, _message_requests_material
from agent_pilot.meeting_agents import EXTERNAL_SERVICE_BOUNDARY, TASK_AGENT_NAMES
from agent_pilot.models import (
    AgentName,
    Interviewee,
    MeetingContext,
    PricingMeetingAsyncJob,
    PricingMeetingRun,
    PricingMeetingRunStatus,
    utc_now,
)

ASYNC_JOB_MARKER = "ASYNC_JOB_JSON:"


class PricingTaskRuntime:
    """FastAPI adapter around the DeepAgents async pricing meeting supervisor."""

    def __init__(
        self,
        graph: Any | None = None,
        model_config: DeepAgentsModelConfig | None = None,
    ) -> None:
        self._graph = graph
        self._model_config = model_config
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
            pending_agents=[agent.value for agent in TASK_AGENT_NAMES],
            blocked_by=[],
            coordinator_note="PricingMeetingAgent 将通过 DeepAgents async subagents 启动或检查后台任务。",
            timeline=[
                {
                    "type": "user_command",
                    "agent": "User",
                    "content": command,
                }
            ],
        )
        self._pricing_runs[run.run_id] = run
        return await self._invoke_pricing_meeting_agent(
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
        return await self._invoke_pricing_meeting_agent(run, user_input=content, interviewees=[])

    async def _invoke_pricing_meeting_agent(
        self,
        run: PricingMeetingRun,
        user_input: str,
        interviewees: list[Interviewee],
    ) -> PricingMeetingRun:
        try:
            content = await self._invoke_graph(
                self._build_prompt(
                    run=run,
                    command=user_input,
                    interviewees=interviewees,
                )
            )
            async_jobs = _async_jobs_from_agent_content(content)
            run.coordinator_note = _content_without_markers(content)
            run.timeline.append(
                {
                    "type": "agent_message",
                    "agent": "PricingMeetingAgent",
                    "content": run.coordinator_note,
                }
            )
            for job in async_jobs:
                _upsert_async_job(run, job)
                run.timeline.append(
                    {
                        "type": "async_job",
                        "agent": job.agent.value,
                        "content": job.summary,
                        "job_id": job.job_id,
                        "status": job.status,
                        "action": job.action,
                    }
                )

            run.status = _status_from_async_jobs_or_content(run.async_jobs, content)
            run.active_agent = "PricingMeetingAgent"
            run.pending_agents = _pending_agents_from_jobs(run.async_jobs)
            run.blocked_by = _blocked_by_from_agent_content(content, run.async_jobs)
            run.asset_package = _asset_package_from_agent_content(content)
            run.updated_at = utc_now()
            return run
        except Exception as exc:
            run.status = PricingMeetingRunStatus.ERROR
            run.coordinator_note = str(exc)
            run.timeline.append(
                {
                    "type": "error",
                    "agent": "PricingMeetingAgent",
                    "content": str(exc),
                }
            )
            run.updated_at = utc_now()
            return run

    async def _invoke_graph(self, prompt: str) -> str:
        graph = self._graph
        if graph is None:
            model_config = self._model_config or DeepAgentsModelConfig.from_env()
            graph = create_pricing_meeting_supervisor_graph(
                model=model_config.to_deepagents_model()
            )
        result = await graph.ainvoke({"messages": [{"role": "user", "content": prompt}]})
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
        jobs_json = json.dumps(
            [job.model_dump(mode="json") for job in run.async_jobs],
            ensure_ascii=False,
            indent=2,
        )
        material_requested = _message_requests_material(command) or _user_timeline_requests_material(
            run.timeline
        )

        sections = [
            "你是 PricingMeetingAgent，必须使用 DeepAgents async subagents 协同体系执行任务。",
            "你的职责是决定启动哪些异步子 Agent、检查哪些已启动任务、汇总当前状态，并把控制权还给用户。",
            "不要在一次响应里同步跑完整条链路；启动子 Agent 后应返回 job_id 和当前状态。",
            "如果需要多个独立子任务，可以并行启动多个 async subagents；如果存在依赖，必须等待上游 job 完成后再启动下游。",
            f"run_id: {run.run_id}",
            f"原始用户目标：{run.command}",
            f"本轮用户输入：{command}",
            f"会议上下文 JSON：\n{context_json}",
            f"本轮外部触发的访谈对象 JSON：\n{interviewees_json}",
            f"当前 async jobs JSON：\n{jobs_json}",
            f"历史 timeline JSON：\n{timeline_json}",
            f"可用子 Agent：{', '.join(agent.value for agent in TASK_AGENT_NAMES)}。",
            "如果只是会前访谈任务，只启动或检查 pre_meeting_interview_agent。"
            "访谈是否完成、缺哪些信息、是否需要继续追问，应由 pre_meeting_interview_agent 读取上下文后判断。",
            "只有用户目标明确要求物料、资产包、预览、通知或任务跟踪，并且访谈信息已经足够，"
            "才启动 material_asset_agent、notification_agent 或 task_tracking_agent。",
            "每次启动或检查异步任务后，必须在回复中输出一行 ASYNC_JOB_JSON: 后跟 JSON，"
            "字段为 job_id、agent、status、action、summary。",
            "status 使用 running、completed、failed 或 needs_input；action 使用 started、checked 或 failed。",
            "如果需要等待外部用户回复，请让相关 async job status=running 或 needs_input，并在 summary 中说明等待谁、等待什么信息。",
            EXTERNAL_SERVICE_BOUNDARY,
        ]

        if material_requested:
            sections.append(MEETING_ASSET_PACKAGE_INSTRUCTION)
        else:
            sections.append(
                "本轮用户目标未要求物料资产包时，不要启动 material_asset_agent、notification_agent "
                "或 task_tracking_agent，不要把访谈任务推进到物料整理阶段。"
            )

        return "\n".join(sections)

    def _require_pricing_run(self, run_id: str) -> PricingMeetingRun:
        run = self._pricing_runs.get(run_id)
        if run is None:
            raise KeyError(f"Pricing meeting run {run_id} not found")
        return run


def _user_timeline_requests_material(timeline: list[dict[str, Any]]) -> bool:
    return any(
        _message_requests_material(str(item.get("content", "")))
        for item in timeline
        if item.get("type") == "user_command" or item.get("agent") == "User"
    )


def _async_jobs_from_agent_content(content: str) -> list[PricingMeetingAsyncJob]:
    jobs: list[PricingMeetingAsyncJob] = []
    for line in content.splitlines():
        if ASYNC_JOB_MARKER not in line:
            continue
        raw = line.split(ASYNC_JOB_MARKER, 1)[1].strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            jobs.append(PricingMeetingAsyncJob.model_validate(parsed))
        elif isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, dict):
                    jobs.append(PricingMeetingAsyncJob.model_validate(item))
    return jobs


def _upsert_async_job(run: PricingMeetingRun, job: PricingMeetingAsyncJob) -> None:
    for index, current in enumerate(run.async_jobs):
        if current.job_id == job.job_id:
            run.async_jobs[index] = job
            return
    run.async_jobs.append(job)


def _status_from_async_jobs_or_content(
    jobs: list[PricingMeetingAsyncJob],
    content: str,
) -> PricingMeetingRunStatus:
    if any(
        job.agent != AgentName.PRE_MEETING_INTERVIEW and job.status in {"running", "needs_input"}
        for job in jobs
    ):
        return PricingMeetingRunStatus.RUNNING
    if any(job.status in {"running", "needs_input"} for job in jobs):
        if any(
            job.agent == AgentName.PRE_MEETING_INTERVIEW
            and job.status in {"running", "needs_input"}
            for job in jobs
        ):
            return PricingMeetingRunStatus.WAITING_FOR_INPUT
        return PricingMeetingRunStatus.RUNNING
    if jobs and all(job.status == "completed" for job in jobs):
        return PricingMeetingRunStatus.COMPLETED

    upper = content.upper()
    if "WAITING_FOR_INPUT" in upper:
        return PricingMeetingRunStatus.WAITING_FOR_INPUT
    if "ERROR" in upper or "FAILED" in upper:
        return PricingMeetingRunStatus.ERROR
    return PricingMeetingRunStatus.COMPLETED


def _pending_agents_from_jobs(jobs: list[PricingMeetingAsyncJob]) -> list[str]:
    return [
        job.agent.value
        for job in jobs
        if job.status in {"running", "needs_input"}
    ]


def _blocked_by_from_agent_content(
    content: str,
    jobs: list[PricingMeetingAsyncJob],
) -> list[str]:
    marker = "BLOCKED_BY:"
    if marker in content:
        tail = content.split(marker, 1)[1].splitlines()[0]
        return [item.strip() for item in tail.split(",") if item.strip()]
    blocked: list[str] = []
    for job in jobs:
        if job.agent == AgentName.PRE_MEETING_INTERVIEW and job.status in {"running", "needs_input"}:
            summary = job.summary
            for name in ("张三", "李四", "王五"):
                if name in summary and name not in blocked:
                    blocked.append(name)
    return blocked


def _asset_package_from_agent_content(content: str) -> dict[str, Any] | None:
    marker = "MATERIAL_ASSET_PACKAGE_JSON:"
    if marker not in content:
        return None
    raw = content.split(marker, 1)[1].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def _content_without_markers(content: str) -> str:
    lines = [
        line
        for line in content.splitlines()
        if ASYNC_JOB_MARKER not in line and "MATERIAL_ASSET_PACKAGE_JSON:" not in line
    ]
    return "\n".join(lines).strip()


def _last_message_content(result: dict[str, Any]) -> str:
    messages = result.get("messages", [])
    if not messages:
        return ""
    last = messages[-1]
    if isinstance(last, dict):
        return str(last.get("content", ""))
    return str(getattr(last, "content", ""))
