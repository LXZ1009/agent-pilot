from __future__ import annotations

from pathlib import Path
from typing import Any

from agent_pilot.finance_agents import MySqlConfig, MySqlFinanceRepository

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SKILL_SOURCES = ["/.agents/skills"]
KAMI_HTML_REPORT_INSTRUCTION = (
    "最终报告必须先读取 `/.agents/skills/kami/SKILL.md`，然后使用 DeepAgents 文件工具生成完整 Kami HTML 研报，"
    "写入用户消息中提供的“本次 HTML 研报产物路径”；不要使用全局固定报告路径。"
    "如果文件已存在，先读取再编辑覆盖为最新报告。最终回复保留一份简明 Markdown 摘要，并明确写出实际报告路径。"
)


def query_main_metric_latest_summary() -> dict[str, Any]:
    """Query real MySQL data from ods_fin_main_metric_raw for latest-period finance metrics."""
    repo = _live_repo()
    return repo._analyze_main_metric_sync([]).model_dump()


def query_partner_aging_latest_summary() -> dict[str, Any]:
    """Query real MySQL data from ods_fin_partner_aging_raw for latest-period aging risk."""
    repo = _live_repo()
    return repo._analyze_partner_aging_sync([]).model_dump()


def query_partner_balance_latest_summary() -> dict[str, Any]:
    """Query real MySQL data from ods_fin_partner_balance_raw for latest-period partner balances."""
    repo = _live_repo()
    return repo._analyze_partner_balance_sync([]).model_dump()


def create_finance_async_supervisor_graph(model, url: str | None = None):
    """Create the official DeepAgents async-subagent supervisor graph.

    This graph is intended for `langgraph dev` or a LangGraph Platform/Agent
    Protocol deployment where each `graph_id` below is registered.
    """
    from deepagents import AsyncSubAgent, create_deep_agent

    def async_subagent(name: str, description: str, graph_id: str) -> AsyncSubAgent:
        spec: dict[str, Any] = {
            "name": name,
            "description": description,
            "graph_id": graph_id,
        }
        if url:
            spec["url"] = url
        return AsyncSubAgent(**spec)

    return create_deep_agent(
        model=model,
        backend=_deepagents_backend(),
        skills=SKILL_SOURCES,
        subagents=[
            async_subagent(
                "main_metric_agent",
                (
                    "财务主指标业务域 Agent。必须查询真实 MySQL 表 ods_fin_main_metric_raw，"
                    "分析营业收入、净利润、现金流、应收应付、预收预付等主指标。"
                ),
                "main_metric_agent",
            ),
            async_subagent(
                "partner_aging_agent",
                (
                    "往来账龄业务域 Agent。必须查询真实 MySQL 表 ods_fin_partner_aging_raw，"
                    "分析账龄、长账龄、逾期、呆账、内外部客户风险。"
                ),
                "partner_aging_agent",
            ),
            async_subagent(
                "partner_balance_agent",
                (
                    "往来余额业务域 Agent。必须查询真实 MySQL 表 ods_fin_partner_balance_raw；"
                    "如果无数据，明确返回 no_data。"
                ),
                "partner_balance_agent",
            ),
        ],
        system_prompt=(
            "你是财务问数 DeepAgents async supervisor。必须使用 start_async_task "
            "为相关业务域 subagents 发起后台任务，并使用 check_async_task 检查结果。"
            "每个业务域 subagent 必须访问自己的真实 MySQL 只读工具。"
            "生成最终报告前，必须读取 `/.agents/skills/kami/SKILL.md`，并按 Kami 的中文长文档/研报排版"
            "原则组织 Markdown：暖纸感、墨蓝强调、清晰标题层级、数据优先、不要空泛形容。"
            "最后输出中文综合财务分析报告，包含总体结论、分领域证据、关键数据、"
            "风险限制、建议动作。不要在没有工具证据的情况下编造数据。"
            + KAMI_HTML_REPORT_INSTRUCTION
        ),
    )


def create_finance_supervisor_graph(model):
    from deepagents import SubAgent, create_deep_agent

    subagents = [
        SubAgent(
            name="main_metric_agent",
            description=(
                "财务主指标业务域 Agent。必须调用 query_main_metric_latest_summary 访问真实 MySQL 表 "
                "ods_fin_main_metric_raw，分析营业收入、净利润、现金流、应收应付、预收预付等主指标。"
            ),
            system_prompt=(
                "你是 main_metric_agent，只负责 ods_fin_main_metric_raw。"
                "必须调用 query_main_metric_latest_summary 获取真实数据库结果后再回答。"
                "输出：查询证据、关键指标、领域发现、风险限制。"
            ),
            tools=[query_main_metric_latest_summary],
            model=model,
        ),
        SubAgent(
            name="partner_aging_agent",
            description=(
                "往来账龄业务域 Agent。必须调用 query_partner_aging_latest_summary 访问真实 MySQL 表 "
                "ods_fin_partner_aging_raw，分析账龄、长账龄、逾期、呆账、内外部客户风险。"
            ),
            system_prompt=(
                "你是 partner_aging_agent，只负责 ods_fin_partner_aging_raw。"
                "必须调用 query_partner_aging_latest_summary 获取真实数据库结果后再回答。"
                "输出：查询证据、关键指标、领域发现、风险限制。"
            ),
            tools=[query_partner_aging_latest_summary],
            model=model,
        ),
        SubAgent(
            name="partner_balance_agent",
            description=(
                "往来余额业务域 Agent。必须调用 query_partner_balance_latest_summary 访问真实 MySQL 表 "
                "ods_fin_partner_balance_raw；如果无数据，明确返回 no_data。"
            ),
            system_prompt=(
                "你是 partner_balance_agent，只负责 ods_fin_partner_balance_raw。"
                "必须调用 query_partner_balance_latest_summary 获取真实数据库结果。"
                "如果工具返回 no_data，不能编造余额结论。"
            ),
            tools=[query_partner_balance_latest_summary],
            model=model,
        ),
    ]
    return create_deep_agent(
        model=model,
        backend=_deepagents_backend(),
        skills=SKILL_SOURCES,
        subagents=subagents,
        system_prompt=(
            "你是财务问数 DeepAgents supervisor。必须使用 task 工具委派给相关业务域 subagents，"
            "每个 subagent 必须调用自己的 MySQL 查询工具访问真实数据。"
            "生成最终报告前，必须读取 `/.agents/skills/kami/SKILL.md`，并按 Kami 的中文长文档/研报排版"
            "原则组织 Markdown：暖纸感、墨蓝强调、清晰标题层级、数据优先、不要空泛形容。"
            "最后输出中文综合财务分析报告，包含总体结论、分领域证据、关键数据、风险限制、建议动作。"
            "不要在没有工具证据的情况下编造数据。"
            + KAMI_HTML_REPORT_INSTRUCTION
        ),
    )


def create_main_metric_graph(model):
    from deepagents import create_deep_agent

    return create_deep_agent(
        model=model,
        backend=_deepagents_backend(),
        tools=[query_main_metric_latest_summary],
        system_prompt=(
            "你是 main_metric_agent，只负责 ods_fin_main_metric_raw。"
            "必须调用 query_main_metric_latest_summary 访问真实 MySQL 数据。"
        ),
    )


def create_partner_aging_graph(model):
    from deepagents import create_deep_agent

    return create_deep_agent(
        model=model,
        backend=_deepagents_backend(),
        tools=[query_partner_aging_latest_summary],
        system_prompt=(
            "你是 partner_aging_agent，只负责 ods_fin_partner_aging_raw。"
            "必须调用 query_partner_aging_latest_summary 访问真实 MySQL 数据。"
        ),
    )


def create_partner_balance_graph(model):
    from deepagents import create_deep_agent

    return create_deep_agent(
        model=model,
        backend=_deepagents_backend(),
        tools=[query_partner_balance_latest_summary],
        system_prompt=(
            "你是 partner_balance_agent，只负责 ods_fin_partner_balance_raw。"
            "必须调用 query_partner_balance_latest_summary 访问真实 MySQL 数据。"
        ),
    )


def create_finance_report_graph(model):
    from deepagents import create_deep_agent

    return create_deep_agent(
        model=model,
        backend=_deepagents_backend(),
        skills=SKILL_SOURCES,
        system_prompt=(
            "你是 finance_report_agent。综合各业务域 Agent 的真实数据证据，生成中文财务分析报告。"
            "生成报告前必须读取 `/.agents/skills/kami/SKILL.md`，按 Kami 中文长文档/研报风格组织正式报告内容。"
            "不得直接编造数据。"
            + KAMI_HTML_REPORT_INSTRUCTION
        ),
    )


def _live_repo() -> MySqlFinanceRepository:
    config = MySqlConfig.from_env()
    if config is None:
        raise RuntimeError(
            "MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE "
            "are required for real database access."
        )
    return MySqlFinanceRepository(config)


def _deepagents_backend():
    from deepagents.backends import FilesystemBackend

    return FilesystemBackend(root_dir=PROJECT_ROOT, virtual_mode=True)
