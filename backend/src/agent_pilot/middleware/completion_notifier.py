from __future__ import annotations

"""Optional completion notifier for future async-subagent push callbacks.

The current workspace path keeps user interaction through PricingMeetingAgent.
Async jobs are used only for long-running tasks. This middleware is provided as
an extension point; it is not required for the default local dev flow.
"""

from typing import Any

from langchain.agents.middleware.types import AgentMiddleware, Runtime


class CompletionNotifierMiddleware(AgentMiddleware):
    def __init__(self, subagent_name: str = "subagent") -> None:
        self.subagent_name = subagent_name

    async def aafter_agent(self, state: dict[str, Any], runtime: Runtime) -> dict[str, Any] | None:
        return None
