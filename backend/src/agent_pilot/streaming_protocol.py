from __future__ import annotations

import json
from typing import Any


def encode_sse_event(event: dict[str, Any]) -> str:
    """Encode one Agent Streaming Protocol event as an SSE frame."""
    event_id = str(event.get("event_id") or event.get("seq") or "")
    id_line = f"id: {event_id}\n" if event_id else ""
    payload = json.dumps(event, ensure_ascii=False)
    return f"{id_line}event: message\ndata: {payload}\n\n"
