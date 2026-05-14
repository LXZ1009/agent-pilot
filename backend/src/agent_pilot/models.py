from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class AgentName(StrEnum):
    PRICING_MEETING = "pricing_meeting_agent"
    PRE_MEETING_INTERVIEW = "pre_meeting_interview_agent"
    INTERVIEW_STRUCTURING = "interview_structuring_agent"
    MATERIAL_ASSET = "material_asset_agent"
    NOTIFICATION = "notification_agent"
    TASK_TRACKING = "task_tracking_agent"


class AgentInfo(BaseModel):
    name: AgentName
    title: str
    description: str
    capabilities: list[str]
    business_domain: str
