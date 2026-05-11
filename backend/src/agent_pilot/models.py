from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AgentName(StrEnum):
    MAIN_METRIC = "main_metric_agent"
    PARTNER_AGING = "partner_aging_agent"
    PARTNER_BALANCE = "partner_balance_agent"
    FINANCE_REPORT = "finance_report_agent"


class TaskStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    CANCELLED = "cancelled"
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


class RunCreateRequest(BaseModel):
    message: Annotated[str, Field(min_length=1, max_length=4000)]
    agents: list[AgentName] = Field(default_factory=list)


class TaskUpdateRequest(BaseModel):
    instruction: Annotated[str, Field(min_length=1, max_length=1000)]


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
    analysis: "DomainAnalysis | None" = None
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
    requested_agents: list[AgentName]
    supervisor_note: str
    report_path: str | None = None
    tasks: list[AgentTask]
    events: list[EventRecord] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class MetricValue(BaseModel):
    name: str
    value: str
    unit: str | None = None
    note: str | None = None


class DomainAnalysis(BaseModel):
    domain: str
    table_name: str
    status: str
    period: str | None = None
    sql: str | None = None
    row_count: int | None = None
    metrics: list[MetricValue] = Field(default_factory=list)
    findings: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


AgentTask.model_rebuild()
