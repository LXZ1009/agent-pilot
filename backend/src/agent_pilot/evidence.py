from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any


@dataclass
class EvidenceArchive:
    events_by_thread: dict[str, list[dict[str, Any]]] = field(
        default_factory=lambda: defaultdict(list)
    )

    def append(self, thread_id: str, event: dict[str, Any]) -> None:
        self.events_by_thread[thread_id].append(event)

    def list_events(self, thread_id: str) -> list[dict[str, Any]]:
        return list(self.events_by_thread.get(thread_id, []))

    def build_business_evidence(self, thread_id: str) -> dict[str, Any]:
        events = self.list_events(thread_id)
        summary_cards: list[dict[str, str]] = []
        seen_ids: set[str] = set()
        for event in events:
            for card in _to_summary_cards(event):
                if card["id"] in seen_ids:
                    continue
                summary_cards.append(card)
                seen_ids.add(card["id"])
        return {
            "thread_id": thread_id,
            "summary_cards": summary_cards,
            "technical_events": events,
        }


def _to_summary_card(event: dict[str, Any]) -> dict[str, str]:
    return _to_summary_cards(event)[0]


def _to_summary_cards(event: dict[str, Any]) -> list[dict[str, str]]:
    method = str(event.get("method") or event.get("type") or "")
    params = event.get("params", {})
    data = params.get("data", {})
    namespace = [str(item) for item in params.get("namespace") or []]
    event_id = str(event.get("event_id") or event.get("id") or f"event_{method}")

    message_cards = _message_cards(event_id, data)
    if message_cards:
        return message_cards

    if method == "tools":
        return [_tool_event_card(event_id, data)]
    if method == "custom":
        return [_custom_event_card(event_id, data)]
    if namespace:
        return [_namespace_event_card(event_id, method, namespace)]
    if method == "lifecycle":
        return [_lifecycle_card(event_id, data)]
    if method in {"updates", "tasks"}:
        return [_generic_card(event_id, "过程事件", f"通道 {method} 记录到一次执行过程变化。", "process")]
    if method in {"messages", "values"}:
        return [_generic_card(event_id, "内容事件", f"通道 {method} 记录到一次消息或状态变化。", "source")]
    if method == "debug":
        return [_generic_card(event_id, "调试事件", "系统记录到一条调试级流式事件。", "technical")]
    return [_generic_card(event_id, "协议事件", f"系统记录到 {method or 'unknown'} 通道事件。", "technical")]


def _lifecycle_card(event_id: str, data: Any) -> dict[str, str]:
    lifecycle_event = data.get("event") if isinstance(data, dict) else None
    graph_name = data.get("graph_name") if isinstance(data, dict) else None
    if lifecycle_event == "running":
        return _generic_card(
            event_id,
            "运行开始",
            f"{_display_name(graph_name) or 'Agent'} 开始处理本次任务。",
            "process",
        )
    if lifecycle_event == "completed":
        return _generic_card(
            event_id,
            "运行完成",
            f"{_display_name(graph_name) or 'Agent'} 完成本次任务处理。",
            "process",
        )
    if lifecycle_event == "failed":
        return _generic_card(
            event_id,
            "运行异常",
            _with_excerpt("运行失败", data.get("error") if isinstance(data, dict) else None),
            "missing",
        )
    return _generic_card(event_id, "运行事件", _with_excerpt("系统记录到运行状态变化", data), "process")


def _namespace_event_card(event_id: str, method: str, namespace: list[str]) -> dict[str, str]:
    leaf = namespace[-1]
    return _generic_card(
        event_id,
        f"子流程事件：{_display_name(leaf)}",
        f"通道 {method} 记录到 {leaf} 的过程事件。",
        "process",
    )


def _custom_event_card(event_id: str, data: Any) -> dict[str, str]:
    if isinstance(data, dict):
        title = data.get("title") or data.get("name") or data.get("event") or "自定义进度"
        description = data.get("description") or data.get("message") or data.get("status") or data
        category = str(data.get("category") or "process")
        return _generic_card(event_id, f"自定义事件：{title}", _excerpt(description), category)
    return _generic_card(event_id, "自定义事件", _excerpt(data), "process")


def _message_cards(event_id: str, data: Any) -> list[dict[str, str]]:
    cards: list[dict[str, str]] = []
    for message in _iter_messages(data):
        for tool_call in _iter_tool_calls(message):
            tool_name = str(tool_call.get("name") or "unknown_tool")
            args = tool_call.get("args") or tool_call.get("arguments") or tool_call.get("input")
            cards.append(
                _generic_card(
                    f"{event_id}:{tool_name}",
                    f"工具调用：{tool_name}",
                    _with_excerpt("参数", args),
                    "process",
                )
            )
        tool_result_name = _tool_result_name(message)
        if tool_result_name:
            cards.append(
                _generic_card(
                    f"{event_id}:{tool_result_name}",
                    f"工具返回：{tool_result_name}",
                    _with_excerpt("返回", message.get("content")),
                    "source",
                )
            )
    return cards


def _tool_event_card(event_id: str, data: Any) -> dict[str, str]:
    if not isinstance(data, dict):
        return _generic_card(event_id, "工具事件", _excerpt(data), "process")

    event = str(data.get("event") or "tool-event")
    tool_name = str(data.get("tool_name") or data.get("name") or "unknown_tool")
    if event in {"tool-started", "tool_start", "on_tool_start"}:
        return _generic_card(
            f"{event_id}:{tool_name}:started",
            f"工具开始：{tool_name}",
            _with_excerpt("输入", data.get("input")),
            "process",
        )
    if event in {"tool-finished", "tool_end", "on_tool_end"}:
        return _generic_card(
            f"{event_id}:{tool_name}:finished",
            f"工具完成：{tool_name}",
            _with_excerpt("输出", data.get("output")),
            "source",
        )
    if event in {"tool-error", "tool_error", "on_tool_error"}:
        return _generic_card(
            f"{event_id}:{tool_name}:error",
            f"工具异常：{tool_name}",
            _with_excerpt("错误", data.get("error")),
            "missing",
        )
    return _generic_card(event_id, f"工具事件：{tool_name}", _with_excerpt("事件", data), "process")


def _iter_messages(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict):
        messages = data.get("messages")
        if isinstance(messages, list):
            return [message for message in messages if isinstance(message, dict)]
        if _looks_like_message(data):
            return [data]
    if isinstance(data, list):
        return [message for message in data if isinstance(message, dict) and _looks_like_message(message)]
    return []


def _looks_like_message(value: dict[str, Any]) -> bool:
    return any(key in value for key in ("role", "type", "content", "tool_calls", "toolCalls", "name"))


def _iter_tool_calls(message: dict[str, Any]) -> list[dict[str, Any]]:
    tool_calls = message.get("tool_calls") or message.get("toolCalls")
    if not isinstance(tool_calls, list):
        return []
    return [call for call in tool_calls if isinstance(call, dict)]


def _tool_result_name(message: dict[str, Any]) -> str | None:
    kind = str(message.get("type") or message.get("role") or "").lower()
    if "tool" not in kind and "function" not in kind:
        return None
    name = message.get("name") or message.get("tool_name") or message.get("tool_call_name")
    return str(name) if name else None


def _generic_card(
    event_id: str,
    title: str,
    description: str,
    category: str,
) -> dict[str, str]:
    return {
        "id": event_id,
        "title": title,
        "description": description,
        "category": category,
        "confidence": "recorded",
    }


def _display_name(value: Any) -> str:
    text = str(value or "").strip()
    return text.split(":", 1)[0] if ":" in text else text


def _with_excerpt(label: str, value: Any) -> str:
    excerpt = _excerpt(value)
    return f"{label}：{excerpt}" if excerpt else f"{label}：无结构化内容"


def _excerpt(value: Any, limit: int = 180) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value.strip()
    else:
        text = json.dumps(value, ensure_ascii=False)
    text = " ".join(text.split())
    return text if len(text) <= limit else f"{text[: limit - 3]}..."
