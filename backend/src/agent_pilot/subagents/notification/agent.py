from __future__ import annotations

from langchain.agents import create_agent
from langchain_core.tools import tool

from agent_pilot.meeting_contracts import EXTERNAL_SERVICE_BOUNDARY, get_external_service_contracts, get_material_asset_catalog
from agent_pilot.model_config import get_model

SYSTEM_PROMPT = f"""\
你是通知预览子 Agent（NotificationAgent）。

你不直接面对最终用户，你服务于 PricingMeetingAgent。
你的职责是生成会前 5 分钟预览、通知卡片摘要和外部服务可消费的通知载荷契约。

规则：
1. 不实际发送钉钉、飞书、微信、邮件；
2. 不声称消息已经推送；
3. 只生成主 Agent 可确认、外部服务可消费的 payload；
4. 输出需包含业务摘要、接收对象、推荐发送时机、文件/物料清单。

{EXTERNAL_SERVICE_BOUNDARY}
"""


@tool
def inspect_external_service_contracts() -> dict:
    """查看外部触达服务边界。"""
    return get_external_service_contracts()


@tool
def inspect_material_asset_catalog() -> dict:
    """查看物料资产目录，以便生成预览摘要。"""
    return get_material_asset_catalog()


model = get_model()

graph = create_agent(
    model=model,
    tools=[inspect_external_service_contracts, inspect_material_asset_catalog],
    system_prompt=SYSTEM_PROMPT,
    name="notification_agent",
)
