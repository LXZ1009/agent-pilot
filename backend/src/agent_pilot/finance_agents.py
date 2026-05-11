from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from agent_pilot.models import AgentInfo, AgentName, DomainAnalysis, MetricValue


TABLE_AGENT_NAMES = [
    AgentName.MAIN_METRIC,
    AgentName.PARTNER_AGING,
    AgentName.PARTNER_BALANCE,
]


AGENTS: dict[AgentName, AgentInfo] = {
    AgentName.MAIN_METRIC: AgentInfo(
        name=AgentName.MAIN_METRIC,
        title="财务主指标 Agent",
        description="负责 ods_fin_main_metric_raw：营业收入、净利润、现金流、应收应付等主指标。",
        capabilities=["主指标趋势", "期间对比", "组织维度汇总", "指标枚举解释"],
        table_name="ods_fin_main_metric_raw",
        business_domain="财务主指标",
    ),
    AgentName.PARTNER_AGING: AgentInfo(
        name=AgentName.PARTNER_AGING,
        title="往来账龄 Agent",
        description="负责 ods_fin_partner_aging_raw：客户/供应商往来账龄、逾期、呆账、内外部往来。",
        capabilities=["账龄结构", "长账龄风险", "呆账识别", "客户/供应商穿透"],
        table_name="ods_fin_partner_aging_raw",
        business_domain="往来账龄",
    ),
    AgentName.PARTNER_BALANCE: AgentInfo(
        name=AgentName.PARTNER_BALANCE,
        title="往来余额 Agent",
        description="负责 ods_fin_partner_balance_raw：合作伙伴余额和本年累计指标。当前表可能为空。",
        capabilities=["余额汇总", "合作伙伴维度", "指标余额检查", "无数据说明"],
        table_name="ods_fin_partner_balance_raw",
        business_domain="往来余额",
    ),
    AgentName.FINANCE_REPORT: AgentInfo(
        name=AgentName.FINANCE_REPORT,
        title="综合财务报告 Agent",
        description="汇总各业务域 Agent 的结构化结果，生成综合分析报告，不直接查询数据库。",
        capabilities=["综合结论", "跨域关联", "风险提示", "报告生成"],
        table_name=None,
        business_domain="综合财务分析",
    ),
}


class FinanceRepository:
    async def analyze_main_metric(self, question: str, updates: list[str]) -> DomainAnalysis:
        raise NotImplementedError

    async def analyze_partner_aging(self, question: str, updates: list[str]) -> DomainAnalysis:
        raise NotImplementedError

    async def analyze_partner_balance(self, question: str, updates: list[str]) -> DomainAnalysis:
        raise NotImplementedError


@dataclass(frozen=True)
class MySqlConfig:
    host: str
    port: int
    user: str
    password: str
    database: str

    @classmethod
    def from_env(cls) -> "MySqlConfig | None":
        required = ["MYSQL_HOST", "MYSQL_PORT", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"]
        if not all(os.getenv(name) for name in required):
            return None
        return cls(
            host=os.environ["MYSQL_HOST"],
            port=int(os.environ["MYSQL_PORT"]),
            user=os.environ["MYSQL_USER"],
            password=os.environ["MYSQL_PASSWORD"],
            database=os.environ["MYSQL_DATABASE"],
        )


class MySqlFinanceRepository(FinanceRepository):
    def __init__(self, config: MySqlConfig) -> None:
        self._config = config

    async def analyze_main_metric(self, question: str, updates: list[str]) -> DomainAnalysis:
        return await asyncio.to_thread(self._analyze_main_metric_sync, updates)

    async def analyze_partner_aging(self, question: str, updates: list[str]) -> DomainAnalysis:
        return await asyncio.to_thread(self._analyze_partner_aging_sync, updates)

    async def analyze_partner_balance(self, question: str, updates: list[str]) -> DomainAnalysis:
        return await asyncio.to_thread(self._analyze_partner_balance_sync, updates)

    def _analyze_main_metric_sync(self, updates: list[str]) -> DomainAnalysis:
        latest = self._fetch_one("SELECT MAX(period_id) AS period_id FROM ods_fin_main_metric_raw")
        period = latest["period_id"] if latest else None
        count = self._fetch_one("SELECT COUNT(*) AS row_count FROM ods_fin_main_metric_raw")
        rows = self._fetch_all(
            """
            SELECT metric_name, currency, SUM(metric_value) AS metric_value
            FROM ods_fin_main_metric_raw
            WHERE period_id = %s
            GROUP BY metric_name, currency
            ORDER BY metric_name, currency
            LIMIT 50
            """,
            [period],
        )
        return DomainAnalysis(
            domain="财务主指标",
            table_name="ods_fin_main_metric_raw",
            status="ok" if rows else "no_data",
            period=str(period) if period is not None else None,
            row_count=int(count["row_count"]) if count else None,
            sql=_compact_sql(
                """
                SELECT metric_name, currency, SUM(metric_value) AS metric_value
                FROM ods_fin_main_metric_raw
                WHERE period_id = <latest_period>
                GROUP BY metric_name, currency
                ORDER BY metric_name, currency
                LIMIT 50
                """
            ),
            metrics=[
                MetricValue(
                    name=str(row["metric_name"]),
                    value=_format_number(row["metric_value"]),
                    unit=str(row["currency"] or ""),
                    note=f"latest period {period}",
                )
                for row in rows
            ],
            findings=[
                f"最新主指标期间为 {period}，本轮按指标和币种汇总。",
                f"返回 {len(rows)} 条指标汇总，适合作为综合财务报告的主指标证据。",
            ],
            risks=[
                "主指标表 period_id 是年月格式，跨表对比前需要转换为月份口径。",
                *_update_risks(updates),
            ],
        )

    def _analyze_partner_aging_sync(self, updates: list[str]) -> DomainAnalysis:
        latest = self._fetch_one("SELECT MAX(period_id) AS period_id FROM ods_fin_partner_aging_raw")
        period = latest["period_id"] if latest else None
        count = self._fetch_one("SELECT COUNT(*) AS row_count FROM ods_fin_partner_aging_raw")
        rows = self._fetch_all(
            """
            SELECT hkont_txt,
                   currency_code,
                   SUM(total_amount) AS total_amount,
                   SUM(amount_91_180 + amount_181_365 + amount_1y_2y + amount_2y_3y + amount_3y_inf)
                     AS overdue_90_plus,
                   SUM(amount_1y_2y + amount_2y_3y + amount_3y_inf) AS long_1y_plus,
                   SUM(CASE WHEN bad_debt_flag = '呆账' THEN total_amount ELSE 0 END) AS bad_debt_amount
            FROM ods_fin_partner_aging_raw
            WHERE period_id = %s
            GROUP BY hkont_txt, currency_code
            ORDER BY ABS(SUM(total_amount)) DESC
            LIMIT 30
            """,
            [period],
        )
        metrics: list[MetricValue] = []
        for row in rows:
            prefix = f"{row['hkont_txt']} {row['currency_code']}"
            metrics.append(
                MetricValue(
                    name=f"{prefix} total_amount",
                    value=_format_number(row["total_amount"]),
                    unit=str(row["currency_code"] or ""),
                    note="账龄总金额",
                )
            )
            metrics.append(
                MetricValue(
                    name=f"{prefix} overdue_90_plus",
                    value=_format_number(row["overdue_90_plus"]),
                    unit=str(row["currency_code"] or ""),
                    note="91 天及以上金额",
                )
            )
        return DomainAnalysis(
            domain="往来账龄",
            table_name="ods_fin_partner_aging_raw",
            status="ok" if rows else "no_data",
            period=str(period) if period is not None else None,
            row_count=int(count["row_count"]) if count else None,
            sql=_compact_sql(
                """
                SELECT hkont_txt, currency_code, SUM(total_amount) AS total_amount,
                       SUM(amount_91_180 + amount_181_365 + amount_1y_2y + amount_2y_3y + amount_3y_inf)
                         AS overdue_90_plus
                FROM ods_fin_partner_aging_raw
                WHERE period_id = <latest_period>
                GROUP BY hkont_txt, currency_code
                ORDER BY ABS(SUM(total_amount)) DESC
                LIMIT 30
                """
            ),
            metrics=metrics,
            findings=[
                f"最新账龄期间为 {period}，本轮按科目和币种汇总总金额与 90 天以上金额。",
                f"返回 {len(rows)} 个科目/币种组合，可用于识别长账龄风险。",
            ],
            risks=[
                "账龄 period_id 是日期格式，和主指标表月份口径不同。",
                "ratio_* 字段为文本，报告中优先使用金额字段重新计算比例。",
                *_update_risks(updates),
            ],
        )

    def _analyze_partner_balance_sync(self, updates: list[str]) -> DomainAnalysis:
        count = self._fetch_one("SELECT COUNT(*) AS row_count FROM ods_fin_partner_balance_raw")
        row_count = int(count["row_count"]) if count else 0
        if row_count == 0:
            return DomainAnalysis(
                domain="往来余额",
                table_name="ods_fin_partner_balance_raw",
                status="no_data",
                row_count=0,
                sql="SELECT COUNT(*) AS row_count FROM ods_fin_partner_balance_raw;",
                findings=["当前表无数据，不能生成往来余额类实质结论。"],
                risks=[
                    "综合报告中只能说明余额表暂不可用。",
                    *_update_risks(updates),
                ],
            )

        latest = self._fetch_one("SELECT MAX(period_id) AS period_id FROM ods_fin_partner_balance_raw")
        period = latest["period_id"] if latest else None
        rows = self._fetch_all(
            """
            SELECT metric_name, currency, SUM(metric_value_current) AS current_value,
                   SUM(metric_value_year) AS year_value
            FROM ods_fin_partner_balance_raw
            WHERE period_id = %s
            GROUP BY metric_name, currency
            ORDER BY ABS(SUM(metric_value_current)) DESC
            LIMIT 30
            """,
            [period],
        )
        return DomainAnalysis(
            domain="往来余额",
            table_name="ods_fin_partner_balance_raw",
            status="ok",
            period=str(period),
            row_count=row_count,
            sql=_compact_sql(
                """
                SELECT metric_name, currency, SUM(metric_value_current) AS current_value,
                       SUM(metric_value_year) AS year_value
                FROM ods_fin_partner_balance_raw
                WHERE period_id = <latest_period>
                GROUP BY metric_name, currency
                ORDER BY ABS(SUM(metric_value_current)) DESC
                LIMIT 30
                """
            ),
            metrics=[
                MetricValue(
                    name=str(row["metric_name"]),
                    value=_format_number(row["current_value"]),
                    unit=str(row["currency"] or ""),
                    note="本期余额/发生额",
                )
                for row in rows
            ],
            findings=[f"最新往来余额期间为 {period}，返回 {len(rows)} 条指标汇总。"],
            risks=[*_update_risks(updates)],
        )

    def _fetch_one(self, sql: str, params: list[Any] | None = None) -> dict[str, Any] | None:
        rows = self._fetch_all(sql, params)
        return rows[0] if rows else None

    def _fetch_all(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        import pymysql
        import pymysql.cursors

        connection = pymysql.connect(
            host=self._config.host,
            port=self._config.port,
            user=self._config.user,
            password=self._config.password,
            database=self._config.database,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            read_timeout=20,
            write_timeout=20,
        )
        try:
            with connection.cursor() as cursor:
                cursor.execute(sql, params or [])
                return list(cursor.fetchall())
        finally:
            connection.close()


def _format_number(value: Any) -> str:
    if value is None:
        return "0"
    if isinstance(value, Decimal):
        return f"{value:,.2f}"
    if isinstance(value, (int, float)):
        return f"{value:,.2f}"
    return str(value)


def _compact_sql(sql: str) -> str:
    return " ".join(line.strip() for line in sql.strip().splitlines() if line.strip())


def _update_risks(updates: list[str]) -> list[str]:
    return [f"已接收追加指令：{update}" for update in updates]
