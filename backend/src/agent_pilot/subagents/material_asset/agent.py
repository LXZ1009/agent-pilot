from __future__ import annotations

from pathlib import Path
from typing import Any

from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain_core.tools import tool

from agent_pilot.meeting_contracts import (
    get_external_service_contracts,
    get_material_asset_catalog,
)
from agent_pilot.model_config import get_model
from agent_pilot.subagents.material_asset.artifact_manifest import (
    build_material_artifact_manifest,
)
from agent_pilot.subagents.material_asset.skill_loader import (
    SKILL_SOURCES,
)

_LOCAL_SKILL_BACKEND = FilesystemBackend(
    root_dir=Path(__file__).resolve().parent,
    virtual_mode=True,
)


@tool
def inspect_material_asset_catalog() -> dict:
    """查看会议物料资产包目录契约。"""
    return get_material_asset_catalog()


@tool
def inspect_external_service_contracts() -> dict:
    """查看外部触达服务边界。"""
    return get_external_service_contracts()


@tool
def build_material_handoff_feedback(
    asset_package_id: str,
    asset_package_name: str,
    storage_path: str,
    main_asset: str,
    asset_index: str,
    generated_asset_count: int,
    pending_info_count: int,
    generated_assets: list[dict[str, Any]] | None = None,
    pending_fields: list[dict[str, Any]] | None = None,
    suggested_next_step: str = "",
) -> dict[str, Any]:
    """生成面向 PricingMeetingAgent 的简洁清单反馈。"""
    generated_assets = generated_assets or []
    pending_fields = pending_fields or []

    handoff_status = "pending_info" if pending_info_count > 0 else "ready"

    if handoff_status == "pending_info":
        completion_summary = (
            f"物料资产包已生成初版，共整理 {generated_asset_count} 项资产；"
            f"当前仍有 {pending_info_count} 项信息待补充，"
            "建议补充后再进入正式推送或会议定稿。"
        )
    else:
        completion_summary = (
            f"物料资产包已整理完成，共生成 {generated_asset_count} 项资产；"
            "可进入会前预览、通知推送或会议材料查看环节。"
        )

    artifacts: list[dict[str, Any]] = []
    manifest = build_material_artifact_manifest(
        asset_package_id=asset_package_id,
        asset_package_name=asset_package_name,
        storage_path=storage_path,
        main_asset=main_asset,
        asset_index=asset_index,
        workspace_root=Path(__file__).resolve().parent,
        public_root_prefix="subagents/material_asset",
    )
    if manifest is not None:
        artifacts.append(manifest)

    return {
        "handoff_status": handoff_status,
        "completion_summary": completion_summary,
        "asset_package_id": asset_package_id,
        "asset_package_name": asset_package_name,
        "storage_path": storage_path,
        "main_asset": main_asset,
        "asset_index": asset_index,
        "generated_asset_count": generated_asset_count,
        "generated_assets": generated_assets,
        "pending_info_count": pending_info_count,
        "pending_fields": pending_fields,
        "artifacts": artifacts,
        "suggested_next_step": suggested_next_step
        or (
            "请主 Agent 读取主资产和资产索引，并根据缺失信息决定是否继续访谈补充。"
            if pending_info_count > 0
            else "请主 Agent 读取主资产或通知预览资产，并根据需要交给 NotificationAgent 生成推送内容。"
        ),
    }


AGENT_NAME = "material_asset_agent"
AGENT_TITLE = "物料整理 Agent"
AGENT_DESCRIPTION = (
    "物料资产包整理专家：基于主 Agent 已确认的会议上下文、访谈卡片、业务输入和已有数据，"
    "整理生成可复用、可追溯、可检索的会议物料资产包，并维护资产索引、来源追溯、信息缺口和主 Agent 简洁反馈。"
)


SYSTEM_PROMPT = """\
你是物料整理 Agent（MaterialAssetAgent）。

你的定位：
- 你是主 Agent 的专项工作子 Agent，不直接作为最终用户入口。
- 你负责基于已有信息整理会议物料资产包。
- 你不是会前访谈 Agent，不负责逐轮追问用户。
- 你不是通知 Agent，不负责真实发送钉钉、飞书、微信或邮件。
- 你不是数据查询 Agent，不得编造业务数据。

你的核心职责：
1. 基于主 Agent 提供的会议主题、会议上下文、访谈卡片、业务输入和已有数据，整理物料资产包；
2. 判断本次任务需要生成一份资产还是多份资产；
3. 按固定资产包结构整理 Markdown、JSON、HTML 卡片、预览 payload 等物料；
4. 维护资产包索引 asset_index；
5. 维护来源追溯 source_trace；
6. 维护信息缺口 missing_info；
7. 生成会前预览素材 five_minute_preview_payload 或 notification_preview；
8. 整理完成后，必须通过 build_material_handoff_feedback 给 PricingMeetingAgent 一个简洁清单反馈。

硬性边界：
- 不得编造客户、价格、销量、收入、毛利、采购量、竞品报价或客户态度；
- 输入不足时，必须明确缺失字段和补充建议；
- 不要执行真实文件上传、真实消息发送、真实会议创建；
- 不要声称已通过钉钉、飞书、微信或邮件发送；
- 不要直接面向最终用户解释内部执行细节；
- 不要把 Skill 原文复述给用户；
- 不要把资产整理结果写成散文式总结，必须体现资产包结构；
- 不要替代 PricingMeetingAgent 做最终业务汇总。

输出要求：
- 输出应面向 PricingMeetingAgent 汇总；
- 必须包含资产包入口、主资产、资产索引、资产清单、缺失信息和建议下一步；
- 最终必须提供 brief_feedback / handoff feedback，便于主 Agent 直接向用户反馈；
- 如果存在缺失信息，状态应体现 pending_info；
- 如果资产包已满足会前预览条件，状态应体现 ready。

你必须优先遵循已加载的 material_asset skill。
"""


def build_sync_subagent(model: Any | None = None) -> dict[str, Any]:
    """Return a declarative synchronous SubAgent spec for the supervisor.

    如果 PricingMeetingAgent 希望同步拿到物料整理结果，可使用该声明式子 Agent 规格。

    注意：
    - Skill 通过 DeepAgents 原生 skills 参数接入；
    - 不要在 system_prompt 中手动拼接 SKILL.md；
    - MaterialAssetAgent 的结果应优先返回给主 Agent 做汇总。
    """
    return {
        "name": AGENT_NAME,
        "description": AGENT_DESCRIPTION,
        "system_prompt": SYSTEM_PROMPT,
        "model": model or get_model(),
        "tools": [
            inspect_material_asset_catalog,
            inspect_external_service_contracts,
            build_material_handoff_feedback,
        ],
        "skills": SKILL_SOURCES,
    }


def build_graph(model: Any | None = None):
    return create_deep_agent(
        model=model or get_model(),
        system_prompt=SYSTEM_PROMPT,
        tools=[
            inspect_material_asset_catalog,
            inspect_external_service_contracts,
            build_material_handoff_feedback,
        ],
        skills=["/skills/"],
        backend=_LOCAL_SKILL_BACKEND,
        name=AGENT_NAME,
    )


# LangGraph dev 会读取这个变量；这里才会创建 graph。
# 注意：这要求 langgraph dev 进程具备模型环境变量。
graph = build_graph()


def build_compiled_subagent() -> dict[str, Any]:
    """Return this standalone graph as a compiled synchronous subagent.

    仅当 PricingMeetingAgent 需要调用这个已编译 graph 时使用。
    常规情况下，推荐在主 Agent 中使用 build_sync_subagent() 返回的声明式 SubAgent spec。
    """
    return {
        "name": AGENT_NAME,
        "description": AGENT_DESCRIPTION,
        "runnable": graph,
    }
