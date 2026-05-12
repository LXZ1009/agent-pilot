from __future__ import annotations

from typing import Any

from agent_pilot.models import AgentInfo, AgentName


TASK_AGENT_NAMES = [
    AgentName.PRE_MEETING_INTERVIEW,
    AgentName.INTERVIEW_STRUCTURING,
    AgentName.MATERIAL_ASSET,
    AgentName.NOTIFICATION,
    AgentName.TASK_TRACKING,
]


EXTERNAL_SERVICE_BOUNDARY = (
    "钉钉服务逻辑不在本项目中；本项目只生成可被钉钉服务消费的任务、卡片、通知、"
    "物料和跟踪数据契约，不负责定时调度、消息发送、会议创建、文件上传或回调处理。"
)


AGENTS: dict[AgentName, AgentInfo] = {
    AgentName.PRE_MEETING_INTERVIEW: AgentInfo(
        name=AgentName.PRE_MEETING_INTERVIEW,
        title="会前访谈 Agent",
        description="负责单人访谈任务中的智能问答、追问、超时状态解释和完整性校验。",
        capabilities=["访谈问答", "追问建议", "完整性校验", "状态判断"],
        table_name=None,
        business_domain="会前访谈",
    ),
    AgentName.INTERVIEW_STRUCTURING: AgentInfo(
        name=AgentName.INTERVIEW_STRUCTURING,
        title="访谈结构化 Agent",
        description="负责把访谈内容整理成结构化访谈卡片，供会议物料整理调用。",
        capabilities=["访谈卡片", "关键信息抽取", "缺口识别", "字段规范化"],
        table_name=None,
        business_domain="访谈结构化",
    ),
    AgentName.MATERIAL_ASSET: AgentInfo(
        name=AgentName.MATERIAL_ASSET,
        title="物料整理 Agent",
        description="负责融合访谈与业务数据，生成定价会议物料资产包和主持人预览内容。",
        capabilities=["资产包生成", "议题卡片", "风险提示", "主持人预览"],
        table_name=None,
        business_domain="会议物料",
    ),
    AgentName.NOTIFICATION: AgentInfo(
        name=AgentName.NOTIFICATION,
        title="通知推送 Agent",
        description=(
            "负责生成会前5分钟自动推送所需的通知载荷、卡片摘要和文件清单。"
            f"{EXTERNAL_SERVICE_BOUNDARY}"
        ),
        capabilities=["通知载荷", "卡片摘要", "文件清单", "外部服务边界"],
        table_name=None,
        business_domain="通知契约",
    ),
    AgentName.TASK_TRACKING: AgentInfo(
        name=AgentName.TASK_TRACKING,
        title="任务跟踪 Agent",
        description="负责生成会后任务清单、跟踪字段和执行复盘结构，不直接触发钉钉任务。",
        capabilities=["任务清单", "责任人字段", "截止时间建议", "复盘结构"],
        table_name=None,
        business_domain="任务跟踪",
    ),
    AgentName.PRICING_MEETING: AgentInfo(
        name=AgentName.PRICING_MEETING,
        title="定价会议主控 Agent",
        description=(
            "负责任务编排、状态监控、结果汇聚和会议物料资产包输出。"
            f"{EXTERNAL_SERVICE_BOUNDARY}"
        ),
        capabilities=["Agent编排", "状态监控", "结果汇聚", "资产包输出"],
        table_name=None,
        business_domain="定价会议主控",
    ),
}


def get_interview_state_machine() -> dict[str, Any]:
    """Return the supported pre-meeting interview states and legal transitions."""
    return {
        "view": "single_person_task",
        "states": [
            "pending",
            "sent",
            "replied",
            "completeness_check",
            "confirming",
            "confirmed",
            "materialized",
            "timeout_unreplied",
            "reminded",
            "editing",
        ],
        "transitions": [
            {"from": "pending", "to": "sent", "owner": "external_dingtalk_service"},
            {"from": "sent", "to": "timeout_unreplied", "owner": "pricing_meeting_agent"},
            {"from": "sent", "to": "replied", "owner": "external_dingtalk_service"},
            {"from": "timeout_unreplied", "to": "reminded", "owner": "external_dingtalk_service"},
            {"from": "reminded", "to": "replied", "owner": "external_dingtalk_service"},
            {"from": "replied", "to": "completeness_check", "owner": "pre_meeting_interview_agent"},
            {"from": "completeness_check", "to": "confirming", "owner": "pre_meeting_interview_agent"},
            {"from": "confirming", "to": "editing", "owner": "external_dingtalk_service"},
            {"from": "confirming", "to": "confirmed", "owner": "external_dingtalk_service"},
            {"from": "confirmed", "to": "materialized", "owner": "material_asset_agent"},
        ],
        "notes": [EXTERNAL_SERVICE_BOUNDARY],
    }


def get_interview_card_schema() -> dict[str, Any]:
    """Return the structured card schema generated from interview answers."""
    return {
        "card_type": "pre_meeting_interview_card",
        "required_fields": [
            "meeting_id",
            "interviewee",
            "region",
            "pricing_topic",
            "key_facts",
            "open_questions",
            "risk_flags",
            "confirmation_status",
        ],
        "optional_fields": [
            "customer_cases",
            "competitor_moves",
            "inventory_pressure",
            "policy_constraints",
            "suggested_agenda_items",
        ],
    }


def get_material_asset_catalog() -> dict[str, Any]:
    """Return the asset package catalog expected by the DingTalk-facing service."""
    return {
        "package_type": "pricing_meeting_asset_package",
        "primary_artifact": "meeting-asset-package.json",
        "assets": [
            "meeting_overview_card",
            "region_analysis_cards",
            "key_customer_and_project_list",
            "pricing_strategy_discussion",
            "risk_warning_list",
            "agenda_and_owner_list",
            "five_minute_preview_payload",
            "post_meeting_task_tracking_seed",
        ],
        "output_formats": ["json", "dingtalk_card_text", "markdown", "file_manifest"],
        "notes": [EXTERNAL_SERVICE_BOUNDARY],
    }


def get_external_service_contracts() -> dict[str, Any]:
    """Return boundaries for services that call this agent backend."""
    return {
        "owned_by_this_project": [
            "agent orchestration",
            "interview state interpretation",
            "structured card generation",
            "meeting asset package generation",
            "notification/task payload contract generation",
        ],
        "owned_by_external_dingtalk_service": [
            "scheduled task trigger",
            "message send and recall",
            "card rendering and interaction callback",
            "meeting lifecycle handling",
            "file upload and distribution",
        ],
        "boundary_statement": EXTERNAL_SERVICE_BOUNDARY,
    }
