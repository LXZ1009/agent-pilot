from __future__ import annotations

from langchain.agents import create_agent
from langchain_core.tools import tool

from agent_pilot.meeting_contracts import get_interview_card_schema
from agent_pilot.model_config import get_model

SYSTEM_PROMPT = """\
你是访谈结构化子 Agent（InterviewStructuringAgent）。

你不直接面对最终用户，你服务于 PricingMeetingAgent。
你的职责是把主 Agent 提供的访谈回复、补充说明和上下文整理成标准访谈卡片。

规则：
1. 必须区分“已收集事实”“缺失字段”“追问建议”“风险标记”；
2. 不得补写用户没有提供的事实；
3. 结构化结果要便于主 Agent 汇总给业务用户，也要便于后续物料整理 Agent 使用；
4. 如果信息不足，明确指出缺口，不要强行确认完成。
"""


@tool
def inspect_interview_card_schema() -> dict:
    """查看访谈结构化卡片 schema。"""
    return get_interview_card_schema()


model = get_model()

graph = create_agent(
    model=model,
    tools=[inspect_interview_card_schema],
    system_prompt=SYSTEM_PROMPT,
    name="interview_structuring_agent",
)
