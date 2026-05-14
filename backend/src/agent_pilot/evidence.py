from __future__ import annotations

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
        event_ids = [
            str(event.get("event_id") or event.get("id") or index)
            for index, event in enumerate(events)
        ]
        unique_event_ids = set(event_ids)
        return {
            "thread_id": thread_id,
            "technical_events": events,
            "event_stats": {
                "raw_count": len(events),
                "unique_count": len(unique_event_ids),
                "duplicate_count": len(events) - len(unique_event_ids),
            },
        }
