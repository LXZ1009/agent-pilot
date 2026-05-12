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


class PricingMeetingRunStatus(StrEnum):
    RUNNING = "running"
    WAITING_FOR_INPUT = "waiting_for_input"
    COMPLETED = "completed"
    ERROR = "error"


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


class Interviewee(BaseModel):
    interviewee_id: str | None = None
    name: Annotated[str, Field(min_length=1, max_length=100)]
    role: str | None = None
    region: str | None = None


class PricingMeetingRunCreateRequest(BaseModel):
    command: Annotated[str, Field(min_length=1, max_length=4000)]
    meeting_context: MeetingContext
    interviewees: list[Interviewee] = Field(default_factory=list, max_length=50)


class PricingMeetingRunContinueRequest(BaseModel):
    content: Annotated[str, Field(min_length=1, max_length=4000)]


class PricingMeetingAsyncJob(BaseModel):
    job_id: str
    agent: AgentName
    status: str
    action: str
    summary: str


class WorkspaceCard(BaseModel):
    """Business-facing card rendered inside the unified workspace."""

    card_id: str = Field(default_factory=lambda: f"card_{utc_now().timestamp():.0f}")
    type: str
    title: str
    status: str | None = None
    summary: str | None = None
    content: dict[str, Any] = Field(default_factory=dict)
    actions: list[dict[str, Any]] = Field(default_factory=list)


class PricingMeetingRun(BaseModel):
    run_id: str
    command: str
    meeting_context: MeetingContext
    status: PricingMeetingRunStatus
    active_agent: str = "PricingMeetingAgent"
    pending_agents: list[str] = Field(default_factory=list)
    blocked_by: list[str] = Field(default_factory=list)
    coordinator_note: str = ""
    async_jobs: list[PricingMeetingAsyncJob] = Field(default_factory=list)
    workspace_cards: list[WorkspaceCard] = Field(default_factory=list)
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
