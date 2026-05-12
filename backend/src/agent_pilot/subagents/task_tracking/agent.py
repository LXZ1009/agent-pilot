from __future__ import annotations

from langchain.agents import create_agent
from langchain_core.tools import tool

from agent_pilot.meeting_contracts import EXTERNAL_SERVICE_BOUNDARY, get_external_service_contracts
from agent_pilot.model_config import get_model

SYSTEM_PROMPT = f"""\
你是任务跟踪子 Agent（TaskTrackingAgent）。

你不直接面对最终用户，你服务于 PricingMeetingAgent。
你的职责是根据会议材料、访谈结论和讨论结果生成会后任务跟踪种子数据。

规则：
1. 只生成任务建议，不实际创建或更新钉钉任务；
2. 每个任务建议应包含责任人、截止时间建议、跟踪字段、验收标准；
3. 缺少责任人或时间时要明确列出待确认项；
4. 输出供主 Agent 汇总给用户确认。

{EXTERNAL_SERVICE_BOUNDARY}
"""


@tool
def inspect_external_service_contracts() -> dict:
    """查看外部任务系统边界。"""
    return get_external_service_contracts()


model = get_model()

graph = create_agent(
    model=model,
    tools=[inspect_external_service_contracts],
    system_prompt=SYSTEM_PROMPT,
    name="task_tracking_agent",
)
