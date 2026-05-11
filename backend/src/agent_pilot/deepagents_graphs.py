from __future__ import annotations

import os

from agent_pilot.deepagents_runtime import DeepAgentsModelConfig
from agent_pilot.deepagents_factory import (
    create_finance_async_supervisor_graph,
    create_finance_report_graph,
    create_main_metric_graph,
    create_partner_aging_graph,
    create_partner_balance_graph,
)


def _model():
    return DeepAgentsModelConfig.from_env().to_deepagents_model()


def _async_subagent_url() -> str | None:
    return os.getenv("DEEPAGENTS_ASYNC_SUBAGENT_URL") or None
supervisor = create_finance_async_supervisor_graph(_model(), url=_async_subagent_url())
main_metric_agent = create_main_metric_graph(_model())
partner_aging_agent = create_partner_aging_graph(_model())
partner_balance_agent = create_partner_balance_graph(_model())
finance_report_agent = create_finance_report_graph(_model())
