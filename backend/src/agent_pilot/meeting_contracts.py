from __future__ import annotations

from typing import Any

EXTERNAL_SERVICE_BOUNDARY = (
    "外部触达服务边界：钉钉/飞书/微信/邮件等消息发送、定时调度、卡片渲染、文件上传、"
    "会议创建和回调处理不由当前 Agent 后端直接执行；当前后端只生成可被外部服务消费的"
    "任务、卡片、通知、物料和跟踪数据契约。"
)

MEETING_ASSET_PACKAGE_INSTRUCTION = (
    "如需生成定价会议物料资产包，必须输出业务可用的结构化内容，至少包括："
    "meeting_overview_card、interview_cards、key_customer_list、price_execution_summary、"
    "competitor_moves、risk_warning_list、five_minute_preview_payload、task_tracking_seed。"
    "不得编造未提供的价格、销量、收入、毛利或客户事实；缺失时必须明确列出缺口。"
)


def get_interview_state_machine() -> dict[str, Any]:
    return {
        "view": "workspace_interview_collection",
        "states": [
            "not_started",
            "question_generated",
            "waiting_for_reply",
            "replied",
            "needs_followup",
            "confirmed",
            "materialized",
        ],
        "transitions": [
            {"from": "not_started", "to": "question_generated", "owner": "pricing_meeting_agent"},
            {"from": "question_generated", "to": "waiting_for_reply", "owner": "pricing_meeting_agent"},
            {"from": "waiting_for_reply", "to": "replied", "owner": "user_or_external_channel"},
            {"from": "replied", "to": "needs_followup", "owner": "pre_meeting_interview_agent"},
            {"from": "replied", "to": "confirmed", "owner": "pricing_meeting_agent"},
            {"from": "confirmed", "to": "materialized", "owner": "material_asset_agent"},
        ],
        "notes": [EXTERNAL_SERVICE_BOUNDARY],
    }


def get_interview_card_schema() -> dict[str, Any]:
    return {
        "card_type": "pre_meeting_interview_card",
        "required_fields": [
            "meeting_id",
            "interviewee",
            "role",
            "region",
            "pricing_topic",
            "questions",
            "collected_facts",
            "missing_fields",
            "followup_questions",
            "confirmation_status",
        ],
        "optional_fields": [
            "customer_cases",
            "competitor_moves",
            "inventory_pressure",
            "policy_constraints",
            "risk_flags",
            "suggested_agenda_items",
        ],
    }


def get_material_asset_catalog() -> dict[str, Any]:
    return {
        "package_type": "pricing_meeting_asset_package",
        "assets": [
            "meeting_overview_card",
            "interview_cards",
            "region_analysis_cards",
            "key_customer_and_project_list",
            "pricing_strategy_discussion",
            "risk_warning_list",
            "agenda_and_owner_list",
            "five_minute_preview_payload",
            "post_meeting_task_tracking_seed",
        ],
        "output_formats": ["json", "markdown", "workspace_cards", "external_payload_manifest"],
        "notes": [EXTERNAL_SERVICE_BOUNDARY],
    }


def get_external_service_contracts() -> dict[str, Any]:
    return {
        "owned_by_agent_backend": [
            "agent orchestration",
            "interview question generation",
            "interview reply completeness assessment",
            "structured interview card generation",
            "meeting material package generation",
            "notification/task payload contract generation",
        ],
        "owned_by_external_services": [
            "scheduled trigger",
            "message send and recall",
            "card rendering and interaction callback",
            "meeting lifecycle handling",
            "file upload and distribution",
        ],
        "boundary_statement": EXTERNAL_SERVICE_BOUNDARY,
    }


def get_default_pricing_interview_questions() -> list[str]:
    return [
        "请补充近 3 个月销量、收入和毛利率趋势，并说明是否存在异常波动。",
        "请说明重点客户当前官方价与实际成交价的偏差，尤其是大客户或战略客户。",
        "请补充竞品近期降价、促销或渠道动作，以及对我方客户的影响。",
        "请识别本次定价会议需要重点讨论的风险点，如客户流失、渠道冲突、库存压力等。",
        "请给出下季度需求、价格策略和重点客户维护建议。",
    ]
