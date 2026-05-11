import asyncio

from httpx import ASGITransport, AsyncClient

from agent_pilot.api import PROJECT_ROOT, create_app
from agent_pilot.deepagents_runtime import DeepAgentsRuntime


class FakeDeepAgentsGraph:
    async def ainvoke(self, payload):
        return {"messages": [{"role": "assistant", "content": "综合财务分析报告：API DeepAgents"}]}


def test_create_finance_run_uses_deepagents_runtime():
    async def scenario():
        app = create_app(runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()))
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/runs",
                json={
                    "message": "Analyze latest finance performance",
                    "agents": ["main_metric_agent", "partner_aging_agent"],
                },
            )
            run_id = response.json()["run_id"]
            await app.state.runtime.wait_for_run(run_id)
            completed = await client.get(f"/api/runs/{run_id}")

        assert response.status_code == 201
        payload = completed.json()
        assert [task["agent"] for task in payload["tasks"]] == [
            "main_metric_agent",
            "partner_aging_agent",
            "finance_report_agent",
        ]
        assert payload["tasks"][-1]["result"] == "综合财务分析报告：API DeepAgents"

    asyncio.run(scenario())


def test_agents_endpoint_describes_table_domains():
    async def scenario():
        app = create_app(runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()))
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/agents")

        assert response.status_code == 200
        payload = response.json()
        assert {agent["name"] for agent in payload} == {
            "main_metric_agent",
            "partner_aging_agent",
            "partner_balance_agent",
            "finance_report_agent",
        }
        assert any("ods_fin_main_metric_raw" in agent["description"] for agent in payload)

    asyncio.run(scenario())


def test_financial_report_endpoint_serves_run_artifact_file():
    async def scenario():
        app = create_app(runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()))
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/runs",
                json={
                    "message": "Analyze latest finance performance",
                    "agents": ["main_metric_agent"],
                },
            )
            payload = create_response.json()
            report_file = PROJECT_ROOT / payload["report_path"].lstrip("/")
            report_file.parent.mkdir(parents=True, exist_ok=True)
            report_file.write_text(
                "<html><body><h1>Kami Report</h1></body></html>",
                encoding="utf-8",
            )
            try:
                info_response = await client.get(f"/api/runs/{payload['run_id']}/reports/finance")
                content_response = await client.get(
                    f"/api/runs/{payload['run_id']}/reports/finance/content"
                )
            finally:
                report_file.unlink(missing_ok=True)

        assert info_response.status_code == 200
        assert info_response.json()["exists"] is True
        assert info_response.json()["name"] == "financial-report.html"
        assert info_response.json()["display_path"].startswith("/tmp/reports/run_")
        assert info_response.json()["content_url"].endswith("/reports/finance/content")
        assert content_response.status_code == 200
        assert "Kami Report" in content_response.text

    asyncio.run(scenario())
