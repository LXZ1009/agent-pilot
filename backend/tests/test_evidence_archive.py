from agent_pilot.evidence import EvidenceArchive


def test_evidence_archive_returns_projection_first_event_payload() -> None:
    archive = EvidenceArchive()
    event = {
        "event_id": "thread_1:1",
        "method": "lifecycle",
        "params": {
            "namespace": [],
            "data": {"event": "running", "graph_name": "supervisor"},
        },
    }
    archive.append("thread_1", event)
    archive.append("thread_1", event)

    payload = archive.build_business_evidence("thread_1")

    assert payload["thread_id"] == "thread_1"
    assert payload["technical_events"] == [event, event]
    assert payload["event_stats"] == {
        "raw_count": 2,
        "unique_count": 1,
        "duplicate_count": 1,
    }
    assert "summary_cards" not in payload
