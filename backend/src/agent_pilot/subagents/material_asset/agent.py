from __future__ import annotations

from langchain.agents import create_agent
from langchain_core.tools import tool

from agent_pilot.meeting_contracts import (
    EXTERNAL_SERVICE_BOUNDARY,
    MEETING_ASSET_PACKAGE_INSTRUCTION,
    get_external_service_contracts,
    get_material_asset_catalog,
)
from agent_pilot.model_config import get_model

SYSTEM_PROMPT = f"""\
你是物料整理子 Agent（MaterialAssetAgent）。

你不直接面对最终用户，你服务于 PricingMeetingAgent。
你的职责是融合主 Agent 已确认的访谈卡片、会议上下文和业务输入，生成定价会议物料资产包。

规则：
1. 只有主 Agent 明确委派物料生成任务时才执行；
2. 不得编造客户、价格、销量、收入、毛利、竞品事实；
3. 输入不足时返回缺失字段和补充建议；
4. 输出应面向主 Agent 汇总，包含业务摘要和结构化资产包。

{MEETING_ASSET_PACKAGE_INSTRUCTION}

{EXTERNAL_SERVICE_BOUNDARY}
"""


@tool
def inspect_material_asset_catalog() -> dict:
    """查看会议物料资产包目录。"""
    return get_material_asset_catalog()


@tool
def inspect_external_service_contracts() -> dict:
    """查看外部服务边界。"""
    return get_external_service_contracts()


model = get_model()

graph = create_agent(
    model=model,
    tools=[inspect_material_asset_catalog, inspect_external_service_contracts],
    system_prompt=SYSTEM_PROMPT,
    name="material_asset_agent",
)
