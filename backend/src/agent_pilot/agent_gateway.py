from __future__ import annotations

import asyncio
import os
from collections import defaultdict
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any, Protocol

from langgraph_sdk import get_client


class AgentGateway(Protocol):
    async def handle_command(self, thread_id: str, command: dict[str, Any]) -> dict[str, Any]:
        ...

    def stream(self, thread_id: str, params: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        ...


class LangGraphAgentGateway:
    """Agent Streaming Protocol facade backed by a LangGraph Server graph."""

    def __init__(
        self,
        base_url: str,
        *,
        assistant_id: str = "supervisor",
        client: Any | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.assistant_id = assistant_id
        self.client = client or get_client(url=self.base_url)
        self._events: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._seq: dict[str, int] = defaultdict(int)
        self._running_tasks: set[asyncio.Task[None]] = set()
        self._message_projector = MessageStreamProjector()

    @classmethod
    def from_env(cls) -> "LangGraphAgentGateway":
        return cls(
            os.getenv("LANGGRAPH_SERVER_URL", "http://127.0.0.1:2024"),
            assistant_id=os.getenv("LANGGRAPH_ASSISTANT_ID", "supervisor"),
        )

    async def handle_command(self, thread_id: str, command: dict[str, Any]) -> dict[str, Any]:
        command_id = command.get("id")
        method = command.get("method")
        if method != "run.start":
            return {
                "type": "error",
                "id": command_id,
                "error": {"code": "unknown_command", "message": f"Unsupported command: {method}"},
            }

        params = command.get("params") or {}
        await self.client.threads.create(thread_id=thread_id, if_exists="do_nothing")

        task = asyncio.create_task(self._run_graph(thread_id, params))
        self._running_tasks.add(task)
        task.add_done_callback(self._running_tasks.discard)

        return {"type": "success", "id": command_id, "result": {}}

    async def stream(self, thread_id: str, params: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        since = int(params.get("since") or 0)
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers[thread_id].add(queue)
        try:
            for event in self._events.get(thread_id, []):
                if event.get("seq", 0) > since and _matches_subscription(event, params):
                    yield event
            while True:
                event = await queue.get()
                if _matches_subscription(event, params):
                    yield event
        finally:
            self._subscribers[thread_id].discard(queue)

    async def _run_graph(self, thread_id: str, params: dict[str, Any]) -> None:
        assistant_id = _resolve_assistant_id(params.get("assistant_id"), self.assistant_id)
        await self._publish(
            thread_id,
            "lifecycle",
            {"event": "running", "graph_name": assistant_id},
        )
        try:
            async for part in self.client.runs.stream(
                thread_id,
                assistant_id,
                input=params.get("input"),
                config=params.get("config"),
                metadata=params.get("metadata"),
                stream_mode=["values", "updates", "messages", "custom", "tasks", "debug"],
                stream_subgraphs=True,
                version="v2",
            ):
                for method, data, namespace in _stream_part_to_events(part):
                    if method == "messages":
                        for projected in self._message_projector.project(thread_id, data, namespace):
                            await self._publish(thread_id, "messages", projected, namespace)
                        continue
                    await self._publish(thread_id, method, data, namespace)
            await self._publish(
                thread_id,
                "lifecycle",
                {"event": "completed", "graph_name": assistant_id},
            )
        except Exception as exc:
            await self._publish(
                thread_id,
                "lifecycle",
                {"event": "failed", "graph_name": assistant_id, "error": str(exc)},
            )

    async def _publish(
        self,
        thread_id: str,
        method: str,
        data: Any,
        namespace: list[str] | None = None,
    ) -> dict[str, Any]:
        self._seq[thread_id] += 1
        seq = self._seq[thread_id]
        event = {
            "type": "event",
            "event_id": f"{thread_id}:{seq}",
            "seq": seq,
            "method": method,
            "params": {
                "namespace": namespace or [],
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": data,
            },
        }
        self._events[thread_id].append(event)
        for queue in list(self._subscribers.get(thread_id, set())):
            queue.put_nowait(event)
        return event


class MessageStreamProjector:
    """Translate LangGraph message chunks into Agent Streaming Protocol events."""

    def __init__(self) -> None:
        self._started_messages: set[tuple[str, tuple[str, ...], str, str]] = set()
        self._started_blocks: set[tuple[str, tuple[str, ...], str, str, int]] = set()

    def project(
        self,
        thread_id: str,
        data: Any,
        namespace: list[str],
    ) -> list[dict[str, Any]]:
        if _is_protocol_message_event(data):
            return [data]

        chunk, metadata = _extract_langgraph_message_chunk(data)
        if chunk is None:
            return [data]

        chunk_data = _to_mapping(chunk)
        metadata_data = _as_mapping(metadata)
        message_id = _resolve_chunk_message_id(thread_id, namespace, chunk_data, metadata_data)
        role = _resolve_chunk_role(chunk_data)
        text_deltas = _extract_text_deltas(chunk_data)
        if not text_deltas:
            return []

        namespace_key = tuple(namespace)
        node = str(metadata_data.get("langgraph_node") or metadata_data.get("node") or "")
        message_key = (thread_id, namespace_key, node, message_id)

        events: list[dict[str, Any]] = []
        if message_key not in self._started_messages:
            self._started_messages.add(message_key)
            events.append({"event": "message-start", "role": role, "id": message_id})

        for index, text in text_deltas:
            block_key = (*message_key, index)
            if block_key not in self._started_blocks:
                self._started_blocks.add(block_key)
                events.append(
                    {
                        "event": "content-block-start",
                        "index": index,
                        "content": {"type": "text", "text": ""},
                    }
                )
            events.append(
                {
                    "event": "content-block-delta",
                    "index": index,
                    "delta": {"type": "text-delta", "text": text},
                }
            )
        return events


def _matches_subscription(event: dict[str, Any], params: dict[str, Any]) -> bool:
    channels = set(params.get("channels") or [])
    if not _matches_channel(event, channels):
        return False
    namespaces = params.get("namespaces") or []
    if not namespaces:
        return True
    event_namespace = [str(item) for item in event.get("params", {}).get("namespace") or []]
    depth = params.get("depth")
    return any(_namespace_matches(prefix, event_namespace, depth) for prefix in namespaces)


def _matches_channel(event: dict[str, Any], channels: set[str]) -> bool:
    if not channels:
        return True
    channel = _event_channel(event)
    return channel in channels or (channel.startswith("custom:") and "custom" in channels)


def _event_channel(event: dict[str, Any]) -> str:
    method = str(event.get("method") or "")
    if method != "custom":
        return method
    data = event.get("params", {}).get("data", {})
    if isinstance(data, dict) and isinstance(data.get("name"), str):
        return f"custom:{data['name']}"
    return "custom"


def _namespace_matches(prefix: Any, namespace: list[str], depth: Any) -> bool:
    if not isinstance(prefix, list):
        return False
    prefix_items = [str(item) for item in prefix]
    if len(prefix_items) > len(namespace):
        return False
    for expected, actual in zip(prefix_items, namespace):
        if not _namespace_segment_matches(expected, actual):
            return False
    if isinstance(depth, int) and len(namespace) - len(prefix_items) > depth:
        return False
    return True


def _namespace_segment_matches(expected: str, actual: str) -> bool:
    if ":" in expected:
        return expected == actual
    return expected == actual.split(":", 1)[0]


def _resolve_assistant_id(candidate: Any, fallback: str) -> str:
    if isinstance(candidate, str) and candidate and candidate != "_":
        return candidate
    return fallback


def _stream_part_to_events(part: Any) -> list[tuple[str, Any, list[str]]]:
    payload = _to_mapping(part)
    namespace = _normalise_namespace(payload.get("ns") or payload.get("namespace"))
    event_type = payload.get("type") or payload.get("event")
    data = payload.get("data", payload)

    if event_type in {"values", "updates", "messages", "custom", "tasks", "debug"}:
        protocol_event = _debug_event_to_protocol_event(data, namespace)
        if protocol_event:
            return [protocol_event]
        return [(str(event_type), data, namespace)]
    if isinstance(part, tuple) and len(part) >= 2:
        mode, value = part[0], part[1]
        if mode in {"values", "updates", "messages", "custom", "tasks", "debug"}:
            protocol_event = _debug_event_to_protocol_event(value, namespace)
            if protocol_event:
                return [protocol_event]
            return [(str(mode), value, namespace)]
    return [("custom", data, namespace)]


def _debug_event_to_protocol_event(data: Any, namespace: list[str]) -> tuple[str, Any, list[str]] | None:
    if not isinstance(data, dict):
        return None
    event = str(data.get("event") or data.get("type") or "")
    name = str(data.get("name") or data.get("tool_name") or data.get("run_name") or "")
    tool_call_id = str(data.get("tool_call_id") or data.get("id") or "")

    if event in {"on_tool_start", "tool_start", "tool-started"}:
        return (
            "tools",
            {
                "event": "tool-started",
                "tool_name": name,
                "tool_call_id": tool_call_id,
                "input": data.get("data", {}).get("input") if isinstance(data.get("data"), dict) else data.get("input"),
            },
            namespace,
        )
    if event in {"on_tool_end", "tool_end", "tool-finished"}:
        return (
            "tools",
            {
                "event": "tool-finished",
                "tool_name": name,
                "tool_call_id": tool_call_id,
                "output": data.get("data", {}).get("output") if isinstance(data.get("data"), dict) else data.get("output"),
            },
            namespace,
        )
    if event in {"on_tool_error", "tool_error", "tool-error"}:
        return (
            "tools",
            {
                "event": "tool-error",
                "tool_name": name,
                "tool_call_id": tool_call_id,
                "error": data.get("error"),
            },
            namespace,
        )
    return None


def _to_mapping(part: Any) -> dict[str, Any]:
    if isinstance(part, dict):
        return part
    if hasattr(part, "model_dump"):
        return part.model_dump()
    if hasattr(part, "_asdict"):
        return part._asdict()
    if isinstance(part, tuple) and len(part) >= 2:
        return {"type": part[0], "data": part[1]}
    return {"type": "custom", "data": part}


def _normalise_namespace(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, tuple):
        return [str(item) for item in value]
    if isinstance(value, str):
        return [value]
    return []


def _is_protocol_message_event(data: Any) -> bool:
    return (
        isinstance(data, dict)
        and data.get("event")
        in {
            "message-start",
            "content-block-start",
            "content-block-delta",
            "content-block-finish",
            "message-finish",
            "error",
        }
    )


def _extract_langgraph_message_chunk(data: Any) -> tuple[Any | None, Any | None]:
    if isinstance(data, (list, tuple)) and data:
        chunk = data[0]
        metadata = data[1] if len(data) > 1 else None
        return chunk, metadata
    if isinstance(data, dict):
        if "chunk" in data:
            return data.get("chunk"), data.get("metadata")
        if "message" in data:
            return data.get("message"), data.get("metadata")
    return data, None


def _as_mapping(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        return dumped if isinstance(dumped, dict) else {}
    if hasattr(value, "_asdict"):
        dumped = value._asdict()
        return dumped if isinstance(dumped, dict) else {}
    return {}


def _resolve_chunk_message_id(
    thread_id: str,
    namespace: list[str],
    chunk: dict[str, Any],
    metadata: dict[str, Any],
) -> str:
    for candidate in (
        chunk.get("id"),
        metadata.get("message_id"),
        metadata.get("run_id"),
        metadata.get("langgraph_run_id"),
    ):
        if isinstance(candidate, str) and candidate:
            return candidate
    namespace_key = "/".join(namespace)
    node = str(metadata.get("langgraph_node") or metadata.get("node") or "root")
    return f"{thread_id}:{namespace_key}:{node}:message"


def _resolve_chunk_role(chunk: dict[str, Any]) -> str:
    kind = str(chunk.get("type") or chunk.get("role") or "").lower()
    if "human" in kind or kind == "user":
        return "human"
    if "system" in kind:
        return "system"
    return "ai"


def _extract_text_deltas(chunk: dict[str, Any]) -> list[tuple[int, str]]:
    content = chunk.get("content")
    if isinstance(content, str):
        return [(0, content)] if content else []
    if not isinstance(content, list):
        return []

    deltas: list[tuple[int, str]] = []
    for index, item in enumerate(content):
        if isinstance(item, str):
            if item:
                deltas.append((index, item))
            continue
        if not isinstance(item, dict):
            continue
        if item.get("type") in {"text", "text_delta"} and isinstance(item.get("text"), str):
            deltas.append((index, item["text"]))
    return deltas
