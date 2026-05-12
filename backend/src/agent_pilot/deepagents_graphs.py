from __future__ import annotations

import os

from agent_pilot.deepagents_factory import (
    create_interview_structuring_graph,
    create_material_asset_graph,
    create_notification_graph,
    create_pre_meeting_interview_graph,
    create_pricing_meeting_async_supervisor_graph,
    create_pricing_meeting_graph,
    create_task_tracking_graph,
)
from agent_pilot.deepagents_runtime import DeepAgentsModelConfig


def _model():
    return DeepAgentsModelConfig.from_env().to_deepagents_model()


def _async_subagent_url() -> str | None:
    return os.getenv("DEEPAGENTS_ASYNC_SUBAGENT_URL") or None


supervisor = create_pricing_meeting_async_supervisor_graph(_model(), url=_async_subagent_url())
pre_meeting_interview_agent = create_pre_meeting_interview_graph(_model())
interview_structuring_agent = create_interview_structuring_graph(_model())
material_asset_agent = create_material_asset_graph(_model())
notification_agent = create_notification_graph(_model())
task_tracking_agent = create_task_tracking_graph(_model())
pricing_meeting_agent = create_pricing_meeting_graph(_model())
