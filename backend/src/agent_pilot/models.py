from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AgentName(StrEnum):
    PRE_MEETING_INTERVIEW = "pre_meeting_interview_agent"
    INTERVIEW_STRUCTURING = "interview_structuring_agent"
    MATERIAL_ASSET = "material_asset_agent"
    NOTIFICATION = "notification_agent"
    TASK_TRACKING = "task_tracking_agent"
    PRICING_MEETING = "pricing_meeting_agent"


class TaskStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    CANCELLED = "cancelled"
    ERROR = "error"


class PricingMeetingRunStatus(StrEnum):
    RUNNING = "running"
    WAITING_FOR_INPUT = "waiting_for_input"
    COMPLETED = "completed"
    ERROR = "error"


class EventType(StrEnum):
    RUN_CREATED = "run_created"
    TASK_STARTED = "task_started"
    TASK_PROGRESS = "task_progress"
    TASK_UPDATED = "task_updated"
    TASK_CANCELLED = "task_cancelled"
    TASK_SUCCEEDED = "task_succeeded"
    TASK_FAILED = "task_failed"


class AgentInfo(BaseModel):
    name: AgentName
    title: str
    description: str
    capabilities: list[str]
    table_name: str | None = None
    business_domain: str | None = None


class MeetingContext(BaseModel):
    meeting_id: str | None = None
    meeting_title: str | None = None
    scheduled_start: str | None = None
    host_name: str | None = None
    participant_name: str | None = None
    business_topic: str | None = None
    source: str | None = None
    business_payload: dict[str, Any] = Field(default_factory=dict)


class RunCreateRequest(BaseModel):
    message: Annotated[str, Field(min_length=1, max_length=4000)]
    agents: list[AgentName] = Field(default_factory=list)
    meeting_context: MeetingContext | None = None


class TaskUpdateRequest(BaseModel):
    instruction: Annotated[str, Field(min_length=1, max_length=1000)]


class Interviewee(BaseModel):
    interviewee_id: str | None = None
    name: Annotated[str, Field(min_length=1, max_length=100)]
    role: str | None = None
    region: str | None = None


class PricingMeetingRunCreateRequest(BaseModel):
    command: Annotated[str, Field(min_length=1, max_length=4000)]
    meeting_context: MeetingContext
    interviewees: list[Interviewee] = Field(min_length=1, max_length=20)


class PricingMeetingRunContinueRequest(BaseModel):
    content: Annotated[str, Field(min_length=1, max_length=4000)]


class PricingMeetingAsyncJob(BaseModel):
    job_id: str
    agent: AgentName
    status: str
    action: str
    summary: str


class PricingMeetingRun(BaseModel):
    run_id: str
    command: str
    meeting_context: MeetingContext
    status: PricingMeetingRunStatus
    active_agent: str
    pending_agents: list[str] = Field(default_factory=list)
    blocked_by: list[str] = Field(default_factory=list)
    coordinator_note: str
    async_jobs: list[PricingMeetingAsyncJob] = Field(default_factory=list)
    asset_package: dict[str, Any] | None = None
    preview_card: dict[str, Any] | None = None
    timeline: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ReportFileInfo(BaseModel):
    exists: bool
    name: str
    display_path: str
    content_url: str | None = None
    size_bytes: int | None = None
    modified_at: datetime | None = None


class AgentTask(BaseModel):
    task_id: str
    run_id: str
    agent: AgentName
    input: str
    status: TaskStatus = TaskStatus.QUEUED
    progress: int = 0
    result: str | None = None
    error: str | None = None
    updates: list[str] = Field(default_factory=list)
    analysis: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=utc_now)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    last_updated_at: datetime | None = None


class EventRecord(BaseModel):
    event_id: str
    run_id: str
    task_id: str | None = None
    agent: AgentName | None = None
    type: EventType
    message: str
    created_at: datetime = Field(default_factory=utc_now)


class RunRecord(BaseModel):
    run_id: str
    message: str
    meeting_context: MeetingContext | None = None
    requested_agents: list[AgentName]
    auto_route: bool = False
    supervisor_note: str
    report_path: str | None = None
    tasks: list[AgentTask]
    events: list[EventRecord] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


AgentTask.model_rebuild()
