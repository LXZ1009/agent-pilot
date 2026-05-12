import asyncio

from httpx import ASGITransport, AsyncClient

from agent_pilot.api import PROJECT_ROOT, create_app
from agent_pilot.deepagents_runtime import DeepAgentsRuntime
from agent_pilot.pricing_task_runtime import PricingTaskRuntime


class FakeDeepAgentsGraph:
    def __init__(self) -> None:
        self.inputs = []

    async def ainvoke(self, payload):
        self.inputs.append(payload)
        return {"messages": [{"role": "assistant", "content": "定价会议物料资产包：API DeepAgents"}]}


class FakeAsyncPricingSupervisorGraph:
    def __init__(self) -> None:
        self.inputs = []

    async def ainvoke(self, payload):
        self.inputs.append(payload)
        prompt = payload["messages"][0]["content"]
        current_input = prompt.split("本轮用户输入：", 1)[1].splitlines()[0]
        if "@张三" in current_input and "并在完成后生成会议物料" in prompt:
            return {
                "messages": [
                    {
                        "role": "assistant",
                        "content": (
                            "已收到张三回复，先检查访谈完整性，然后启动物料整理异步任务。\n"
                            'ASYNC_JOB_JSON: {"job_id":"job_material_001","agent":"material_asset_agent",'
                            '"status":"running","action":"started","summary":"物料整理已启动"}'
                        ),
                    }
                ]
            }
        if "@张三" in current_input:
            return {
                "messages": [
                    {
                        "role": "assistant",
                        "content": (
                            "PreMeetingInterviewAgent 已完成本次单人会前访谈。\n"
                            'ASYNC_JOB_JSON: {"job_id":"job_interview_001",'
                            '"agent":"pre_meeting_interview_agent","status":"completed",'
                            '"action":"checked","summary":"访谈已完成"}'
                        ),
                    }
                ]
            }
        return {
            "messages": [
                {
                    "role": "assistant",
                    "content": (
                        "已启动会前访谈异步任务，等待外部用户张三回复。\n"
                        'ASYNC_JOB_JSON: {"job_id":"job_interview_001",'
                        '"agent":"pre_meeting_interview_agent","status":"running",'
                        '"action":"started","summary":"等待张三回复会前访谈"}'
                    ),
                }
            ]
        }


def test_pricing_meeting_run_starts_async_interview_job_without_materializing_immediately():
    async def scenario():
        graph = FakeAsyncPricingSupervisorGraph()
        app = create_app(
            runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()),
            pricing_task_runtime=PricingTaskRuntime(graph=graph),
        )
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/pricing-meeting/runs",
                json={
                    "command": "开始华东大区定价会会前访谈，并在完成后生成会议物料",
                    "meeting_context": {
                        "meeting_id": "meeting_001",
                        "meeting_title": "华东大区定价会",
                        "business_payload": {"region": "华东大区"},
                    },
                    "interviewees": [
                        {"interviewee_id": "u1", "name": "张三", "role": "大区负责人", "region": "华东"},
                    ],
                },
            )
            created = response.json()

        assert response.status_code == 201
        assert created["status"] == "waiting_for_input"
        assert created["asset_package"] is None
        assert created["async_jobs"] == [
            {
                "job_id": "job_interview_001",
                "agent": "pre_meeting_interview_agent",
                "status": "running",
                "action": "started",
                "summary": "等待张三回复会前访谈",
            }
        ]
        assert created["timeline"][-1]["type"] == "async_job"
        assert "MaterialAssetAgent" not in created["coordinator_note"]

    asyncio.run(scenario())


def test_pricing_meeting_continue_launches_material_job_only_after_user_reply_when_requested():
    async def scenario():
        graph = FakeAsyncPricingSupervisorGraph()
        app = create_app(
            runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()),
            pricing_task_runtime=PricingTaskRuntime(graph=graph),
        )
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/pricing-meeting/runs",
                json={
                    "command": "开始华东大区定价会会前访谈，并在完成后生成会议物料",
                    "meeting_context": {
                        "meeting_id": "meeting_001",
                        "meeting_title": "华东大区定价会",
                    },
                    "interviewees": [
                        {"interviewee_id": "u1", "name": "张三", "role": "大区负责人", "region": "华东"},
                    ],
                },
            )
            created = create_response.json()
            continue_response = await client.post(
                f"/api/pricing-meeting/runs/{created['run_id']}/continue",
                json={"content": "@张三 重点风险是客户涨价敏感，需要明确审批例外。"},
            )
            continued = continue_response.json()

        assert continue_response.status_code == 200
        assert continued["status"] == "running"
        assert continued["async_jobs"][-1]["job_id"] == "job_material_001"
        assert continued["async_jobs"][-1]["agent"] == "material_asset_agent"
        assert continued["asset_package"] is None
        assert "最终产物必须是定价会议物料资产包" in graph.inputs[1]["messages"][0]["content"]

    asyncio.run(scenario())


def test_pricing_meeting_continue_completes_interview_without_material_when_user_did_not_request_material():
    async def scenario():
        graph = FakeAsyncPricingSupervisorGraph()
        app = create_app(
            runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()),
            pricing_task_runtime=PricingTaskRuntime(graph=graph),
        )
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/pricing-meeting/runs",
                json={
                    "command": "开始华东大区定价会会前访谈",
                    "meeting_context": {
                        "meeting_id": "meeting_001",
                        "meeting_title": "华东大区定价会",
                    },
                    "interviewees": [
                        {"interviewee_id": "u1", "name": "张三", "role": "大区负责人", "region": "华东"},
                    ],
                },
            )
            created = create_response.json()
            continue_response = await client.post(
                f"/api/pricing-meeting/runs/{created['run_id']}/continue",
                json={"content": "@张三 重点风险是客户涨价敏感，需要明确审批例外。"},
            )
            continued = continue_response.json()

        assert continued["status"] == "completed"
        assert continued["async_jobs"][-1]["agent"] == "pre_meeting_interview_agent"
        assert continued["asset_package"] is None
        assert "最终产物必须是定价会议物料资产包" not in graph.inputs[1]["messages"][0]["content"]

    asyncio.run(scenario())


def test_legacy_pricing_meeting_endpoints_are_removed():
    async def scenario():
        app = create_app(
            runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()),
            pricing_task_runtime=PricingTaskRuntime(graph=FakeAsyncPricingSupervisorGraph()),
        )
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            batch_response = await client.post(
                "/api/pricing-meeting/pre-meeting-interviews",
                json={
                    "task": "旧批量访谈",
                    "meeting_context": {"meeting_id": "meeting_001"},
                    "interviewees": [{"name": "张三"}],
                },
            )
            execute_response = await client.post(
                "/api/pricing-meeting/agent/execute",
                json={
                    "meeting_id": "meeting_001",
                    "task_type": "start_interview",
                    "payload": {},
                },
            )
            interview_response = await client.post(
                "/api/interviews",
                json={"meeting_context": {"meeting_id": "meeting_001"}},
            )

        assert batch_response.status_code == 404
        assert execute_response.status_code == 404
        assert interview_response.status_code == 404

    asyncio.run(scenario())


def test_create_pricing_meeting_run_uses_deepagents_runtime():
    async def scenario():
        app = create_app(runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()))
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/runs",
                json={
                    "message": "生成会前访谈卡片和会议物料资产包",
                    "agents": ["pre_meeting_interview_agent", "material_asset_agent"],
                    "meeting_context": {
                        "meeting_id": "meeting_001",
                        "meeting_title": "华东大区定价会",
                        "host_name": "主持人A",
                        "participant_name": "大区负责人B",
                    },
                },
            )
            run_id = response.json()["run_id"]
            await app.state.runtime.wait_for_run(run_id)
            completed = await client.get(f"/api/runs/{run_id}")

        assert response.status_code == 201
        payload = completed.json()
        assert [task["agent"] for task in payload["tasks"]] == [
            "pre_meeting_interview_agent",
            "material_asset_agent",
            "pricing_meeting_agent",
        ]
        assert payload["meeting_context"]["meeting_id"] == "meeting_001"
        assert payload["tasks"][-1]["result"] == "定价会议物料资产包：API DeepAgents"

    asyncio.run(scenario())


def test_agents_endpoint_describes_pricing_meeting_agents_and_external_boundaries():
    async def scenario():
        app = create_app(runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()))
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/agents")

        assert response.status_code == 200
        payload = response.json()
        assert {agent["name"] for agent in payload} == {
            "pre_meeting_interview_agent",
            "interview_structuring_agent",
            "material_asset_agent",
            "notification_agent",
            "task_tracking_agent",
            "pricing_meeting_agent",
        }
        assert any("钉钉服务逻辑不在本项目中" in agent["description"] for agent in payload)

    asyncio.run(scenario())


def test_meeting_asset_endpoint_serves_run_artifact_file():
    async def scenario():
        app = create_app(runtime=DeepAgentsRuntime(graph=FakeDeepAgentsGraph()))
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/runs",
                json={
                    "message": "生成定价会议物料资产包",
                    "agents": ["material_asset_agent"],
                },
            )
            payload = create_response.json()
            report_file = PROJECT_ROOT / payload["report_path"].lstrip("/")
            report_file.parent.mkdir(parents=True, exist_ok=True)
            report_file.write_text(
                '{"package_name":"定价会议物料资产包"}',
                encoding="utf-8",
            )
            try:
                info_response = await client.get(
                    f"/api/runs/{payload['run_id']}/artifacts/meeting-assets"
                )
                content_response = await client.get(
                    f"/api/runs/{payload['run_id']}/artifacts/meeting-assets/content"
                )
            finally:
                report_file.unlink(missing_ok=True)

        assert info_response.status_code == 200
        assert info_response.json()["exists"] is True
        assert info_response.json()["name"] == "meeting-asset-package.json"
        assert info_response.json()["display_path"].startswith("/tmp/reports/run_")
        assert info_response.json()["content_url"].endswith("/artifacts/meeting-assets/content")
        assert content_response.status_code == 200
        assert "定价会议物料资产包" in content_response.text

    asyncio.run(scenario())
