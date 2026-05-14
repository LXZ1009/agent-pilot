import asyncio
import json

from httpx import ASGITransport, AsyncClient

from agent_pilot.api import create_app


class FakeAgentGateway:
    def __init__(self) -> None:
        self.commands = []
        self.stream_requests = []

    async def handle_command(self, thread_id, command):
        self.commands.append((thread_id, command))
        return {
            "type": "success",
            "id": command["id"],
            "result": {"run_id": "run_test_001"},
        }

    async def stream(self, thread_id, params):
        self.stream_requests.append((thread_id, params))
        yield {
            "type": "event",
            "event_id": "evt_001",
            "seq": 1,
            "method": "lifecycle",
            "params": {
                "namespace": [],
                "data": {"event": "running", "graph_name": "supervisor"},
            },
        }


def test_agent_gateway_command_endpoint_uses_protocol_shape():
    async def scenario():
        gateway = FakeAgentGateway()
        app = create_app(agent_gateway=gateway)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/threads/thread_001/commands",
                json={
                    "id": 1,
                    "method": "run.start",
                    "params": {
                        "assistant_id": "supervisor",
                        "input": {"messages": [{"role": "user", "content": "生成物料"}]},
                    },
                },
            )

        assert response.status_code == 200
        assert response.json() == {
            "type": "success",
            "id": 1,
            "result": {"run_id": "run_test_001"},
        }
        assert gateway.commands[0][0] == "thread_001"
        assert gateway.commands[0][1]["method"] == "run.start"

    asyncio.run(scenario())


def test_agent_gateway_stream_endpoint_returns_sse_events():
    async def scenario():
        gateway = FakeAgentGateway()
        app = create_app(agent_gateway=gateway)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/threads/thread_001/stream/events",
                json={"channels": ["messages", "lifecycle"], "namespaces": [[]]},
            )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert "id: evt_001" in response.text
        assert "event: message" in response.text
        assert f"data: {json.dumps({'type': 'event', 'event_id': 'evt_001', 'seq': 1, 'method': 'lifecycle', 'params': {'namespace': [], 'data': {'event': 'running', 'graph_name': 'supervisor'}}}, ensure_ascii=False)}" in response.text
        assert gateway.stream_requests[0][0] == "thread_001"

    asyncio.run(scenario())


def test_agent_gateway_archives_business_evidence_from_stream():
    async def scenario():
        gateway = FakeAgentGateway()
        app = create_app(agent_gateway=gateway)
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/threads/thread_001/stream/events",
                json={"channels": ["messages", "lifecycle"], "namespaces": [[]]},
            )
            response = await client.get("/api/threads/thread_001/evidence")

        assert response.status_code == 200
        assert response.json()["thread_id"] == "thread_001"
        assert response.json()["summary_cards"] == [
            {
                "id": "evt_001",
                "title": "运行开始",
                "description": "supervisor 开始处理本次任务。",
                "category": "process",
                "confidence": "recorded",
            }
        ]

    asyncio.run(scenario())


def test_evidence_projects_protocol_events_without_fixed_name_mappings():
    async def scenario():
        class EvidenceGateway(FakeAgentGateway):
            async def stream(self, thread_id, params):
                yield {
                    "type": "event",
                    "event_id": "evt_subagent",
                    "seq": 1,
                    "method": "updates",
                    "params": {
                        "namespace": ["arbitrary_research_agent:run-123"],
                        "data": {"status": "running"},
                    },
                }
                yield {
                    "type": "event",
                    "event_id": "evt_tool_call",
                    "seq": 2,
                    "method": "values",
                    "params": {
                        "namespace": [],
                        "data": {
                            "messages": [
                                {
                                    "role": "assistant",
                                    "content": "",
                                    "tool_calls": [
                                        {
                                            "name": "load_skill_manifest",
                                            "args": {"skill": "meeting-interview"},
                                        }
                                    ],
                                }
                            ]
                        },
                    },
                }
                yield {
                    "type": "event",
                    "event_id": "evt_tool_result",
                    "seq": 3,
                    "method": "values",
                    "params": {
                        "namespace": [],
                        "data": {
                            "messages": [
                                {
                                    "type": "tool",
                                    "name": "load_skill_manifest",
                                    "content": "{\"files\":[\"SKILL.md\"]}",
                                }
                            ]
                        },
                    },
                }

        app = create_app(agent_gateway=EvidenceGateway())
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/threads/thread_002/stream/events",
                json={"channels": ["updates", "values"], "namespaces": [[]]},
            )
            response = await client.get("/api/threads/thread_002/evidence")

        assert response.status_code == 200
        assert response.json()["summary_cards"] == [
            {
                "id": "evt_subagent",
                "title": "子流程事件：arbitrary_research_agent",
                "description": "通道 updates 记录到 arbitrary_research_agent:run-123 的过程事件。",
                "category": "process",
                "confidence": "recorded",
            },
            {
                "id": "evt_tool_call:load_skill_manifest",
                "title": "工具调用：load_skill_manifest",
                "description": "参数：{\"skill\": \"meeting-interview\"}",
                "category": "process",
                "confidence": "recorded",
            },
            {
                "id": "evt_tool_result:load_skill_manifest",
                "title": "工具返回：load_skill_manifest",
                "description": "返回：{\"files\":[\"SKILL.md\"]}",
                "category": "source",
                "confidence": "recorded",
            },
        ]

    asyncio.run(scenario())
