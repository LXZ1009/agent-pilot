import asyncio

from agent_pilot.agent_gateway import LangGraphAgentGateway


class FakeThreads:
    def __init__(self) -> None:
        self.created = []

    async def create(self, **kwargs):
        self.created.append(kwargs)
        return {"thread_id": kwargs["thread_id"]}


class FakeRuns:
    def __init__(self) -> None:
        self.stream_calls = []
        self.parts = [
            {
                "type": "values",
                "data": {"messages": [{"role": "assistant", "content": "ok"}]},
            }
        ]

    async def stream(self, thread_id, assistant_id, **kwargs):
        self.stream_calls.append((thread_id, assistant_id, kwargs))
        for part in self.parts:
            yield part


class FakeLangGraphClient:
    def __init__(self) -> None:
        self.threads = FakeThreads()
        self.runs = FakeRuns()


def test_langgraph_gateway_translates_run_start_to_sdk_stream():
    async def scenario():
        client = FakeLangGraphClient()
        gateway = LangGraphAgentGateway("http://test", client=client)

        response = await gateway.handle_command(
            "11111111-1111-4111-8111-111111111111",
            {
                "id": 7,
                "method": "run.start",
                "params": {
                    "assistant_id": "supervisor",
                    "input": {"messages": [{"role": "user", "content": "hello"}]},
                },
            },
        )

        event = await asyncio.wait_for(
            anext(gateway.stream("11111111-1111-4111-8111-111111111111", {"channels": ["values"]})),
            timeout=1,
        )

        assert response == {"type": "success", "id": 7, "result": {}}
        assert client.threads.created == [
            {"thread_id": "11111111-1111-4111-8111-111111111111", "if_exists": "do_nothing"}
        ]
        assert client.runs.stream_calls[0][0] == "11111111-1111-4111-8111-111111111111"
        assert client.runs.stream_calls[0][1] == "supervisor"
        assert client.runs.stream_calls[0][2]["stream_mode"] == [
            "values",
            "updates",
            "messages",
            "custom",
            "tasks",
            "debug",
        ]
        assert event["method"] == "values"
        assert event["params"]["data"]["messages"][0]["content"] == "ok"

    asyncio.run(scenario())


def test_langgraph_gateway_projects_message_chunks_to_protocol_events():
    async def scenario():
        client = FakeLangGraphClient()
        client.runs.parts = [
            {
                "type": "messages",
                "data": (
                    {"type": "AIMessageChunk", "id": "msg_001", "content": "hel"},
                    {"langgraph_node": "model"},
                ),
            },
            {
                "type": "messages",
                "data": (
                    {"type": "AIMessageChunk", "id": "msg_001", "content": "lo"},
                    {"langgraph_node": "model"},
                ),
            },
        ]
        gateway = LangGraphAgentGateway("http://test", client=client)

        await gateway.handle_command(
            "11111111-1111-4111-8111-111111111111",
            {
                "id": 8,
                "method": "run.start",
                "params": {
                    "assistant_id": "supervisor",
                    "input": {"messages": [{"role": "user", "content": "hello"}]},
                },
            },
        )

        stream = gateway.stream(
            "11111111-1111-4111-8111-111111111111",
            {"channels": ["messages"]},
        )
        start_event = await asyncio.wait_for(anext(stream), timeout=1)
        block_event = await asyncio.wait_for(anext(stream), timeout=1)
        first_delta_event = await asyncio.wait_for(anext(stream), timeout=1)
        second_delta_event = await asyncio.wait_for(anext(stream), timeout=1)

        assert start_event["method"] == "messages"
        assert start_event["params"]["data"] == {
            "event": "message-start",
            "role": "ai",
            "id": "msg_001",
        }
        assert block_event["params"]["data"] == {
            "event": "content-block-start",
            "index": 0,
            "content": {"type": "text", "text": ""},
        }
        assert first_delta_event["params"]["data"] == {
            "event": "content-block-delta",
            "index": 0,
            "delta": {"type": "text-delta", "text": "hel"},
        }
        assert second_delta_event["params"]["data"] == {
            "event": "content-block-delta",
            "index": 0,
            "delta": {"type": "text-delta", "text": "lo"},
        }
        assert start_event["params"]["namespace"] == []

    asyncio.run(scenario())
