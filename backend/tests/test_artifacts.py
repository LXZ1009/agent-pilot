import asyncio
from pathlib import Path

from httpx import ASGITransport, AsyncClient

from agent_pilot.api import create_app
from agent_pilot.artifacts import ArtifactRegistry
from agent_pilot.evidence import EvidenceArchive


def test_artifact_list_api_returns_declared_descriptors_for_selected_run() -> None:
    async def scenario():
        archive = EvidenceArchive()
        archive.append("thread_1", lifecycle("evt_1", "running", "run_1"))
        archive.append("thread_1", artifact_event("evt_2", "run_1", artifact_id="inline_1"))
        archive.append("thread_1", lifecycle("evt_3", "completed", "run_1"))
        archive.append("thread_1", lifecycle("evt_4", "running", "run_2"))
        archive.append("thread_1", artifact_event("evt_5", "run_2", artifact_id="inline_2"))

        app = create_app(
            evidence_archive=archive,
            artifact_registry=ArtifactRegistry(archive),
        )
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/threads/thread_1/artifacts", params={"run_id": "run_1"})

        assert response.status_code == 200
        assert response.json() == {
            "thread_id": "thread_1",
            "run_id": "run_1",
            "artifacts": [
                {
                    "id": "inline_1",
                    "runId": "run_1",
                    "title": "Run report",
                    "kind": "document",
                    "role": "deliverable",
                    "source": "inline",
                    "uri": None,
                    "mimeType": "text/markdown",
                    "schemaRef": None,
                    "summary": None,
                    "producerNodeId": None,
                    "createdAt": None,
                    "updatedAt": None,
                    "metadata": {},
                }
            ],
        }

    asyncio.run(scenario())


def test_artifact_content_api_reads_workspace_content_by_backend_issued_id(tmp_path: Path) -> None:
    async def scenario():
        report = tmp_path / "reports" / "run-report.md"
        report.parent.mkdir(parents=True)
        report.write_text("# Report", encoding="utf-8")

        archive = EvidenceArchive()
        archive.append("thread_1", lifecycle("evt_1", "running", "run_1"))
        archive.append(
            "thread_1",
            artifact_event(
                "evt_2",
                "run_1",
                artifact_id="workspace_1",
                artifact={
                    "source": "workspace",
                    "uri": "/artifacts/run_1/report.md",
                    "mime_type": "text/markdown",
                    "metadata": {"workspace_path": "reports/run-report.md"},
                },
            ),
        )

        app = create_app(
            evidence_archive=archive,
            artifact_registry=ArtifactRegistry(archive, workspace_roots=[tmp_path]),
        )
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/threads/thread_1/artifacts/workspace_1")

        assert response.status_code == 200
        assert response.json()["artifact"]["id"] == "workspace_1"
        assert response.json()["content"] == "# Report"

    asyncio.run(scenario())


def test_artifact_content_api_rejects_workspace_path_traversal(tmp_path: Path) -> None:
    async def scenario():
        archive = EvidenceArchive()
        archive.append("thread_1", lifecycle("evt_1", "running", "run_1"))
        archive.append(
            "thread_1",
            artifact_event(
                "evt_2",
                "run_1",
                artifact_id="workspace_escape",
                artifact={
                    "source": "workspace",
                    "uri": "/artifacts/run_1/secret.md",
                    "mime_type": "text/markdown",
                    "metadata": {"workspace_path": "../secret.md"},
                },
            ),
        )

        app = create_app(
            evidence_archive=archive,
            artifact_registry=ArtifactRegistry(archive, workspace_roots=[tmp_path]),
        )
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/threads/thread_1/artifacts/workspace_escape")

        assert response.status_code == 403
        assert response.json()["detail"] == "Artifact path is not accessible"

    asyncio.run(scenario())


def test_artifact_content_api_rejects_oversized_inline_content() -> None:
    async def scenario():
        archive = EvidenceArchive()
        archive.append("thread_1", lifecycle("evt_1", "running", "run_1"))
        archive.append(
            "thread_1",
            artifact_event(
                "evt_2",
                "run_1",
                artifact_id="inline_large",
                artifact={"content": "x" * (64 * 1024 + 1)},
            ),
        )

        app = create_app(
            evidence_archive=archive,
            artifact_registry=ArtifactRegistry(archive),
        )
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/threads/thread_1/artifacts/inline_large")

        assert response.status_code == 413
        assert response.json()["detail"] == "Artifact is too large to preview"

    asyncio.run(scenario())


def test_artifact_list_api_expands_declared_tool_output_manifest_children(tmp_path: Path) -> None:
    async def scenario():
        brief = tmp_path / "brief.md"
        brief.write_text("# Brief", encoding="utf-8")

        archive = EvidenceArchive()
        archive.append("thread_1", lifecycle("evt_1", "running", "run_1"))
        archive.append(
            "thread_1",
            tool_finished_event(
                "evt_2",
                "run_1",
                output={
                    "artifacts": [
                        {
                            "id": "manifest_1",
                            "title": "Material package",
                            "role": "manifest",
                            "source": "inline",
                            "mime_type": "application/json",
                            "content": {
                                "artifacts": [
                                    {
                                        "id": "brief_1",
                                        "title": "Meeting brief",
                                        "role": "deliverable",
                                        "source": "workspace",
                                        "uri": "/artifacts/material-package/brief.md",
                                        "mime_type": "text/markdown",
                                        "metadata": {"workspace_path": "brief.md"},
                                    }
                                ]
                            },
                        }
                    ]
                },
            ),
        )

        app = create_app(
            evidence_archive=archive,
            artifact_registry=ArtifactRegistry(archive, workspace_roots=[tmp_path]),
        )
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            list_response = await client.get("/api/threads/thread_1/artifacts", params={"run_id": "run_1"})
            content_response = await client.get("/api/threads/thread_1/artifacts/brief_1")

        assert list_response.status_code == 200
        assert [artifact["id"] for artifact in list_response.json()["artifacts"]] == [
            "manifest_1",
            "brief_1",
        ]
        assert content_response.status_code == 200
        assert content_response.json()["content"] == "# Brief"

    asyncio.run(scenario())


def lifecycle(event_id: str, event: str, run_id: str) -> dict:
    return {
        "type": "event",
        "event_id": event_id,
        "method": "lifecycle",
        "params": {
            "namespace": [],
            "data": {"event": event, "graph_name": "supervisor", "run_id": run_id},
        },
    }


def artifact_event(
    event_id: str,
    run_id: str,
    *,
    artifact_id: str,
    artifact: dict | None = None,
) -> dict:
    payload = {
        "id": artifact_id,
        "title": "Run report",
        "role": "deliverable",
        "source": "inline",
        "mime_type": "text/markdown",
        "content": "# Report",
        **(artifact or {}),
    }
    return {
        "type": "event",
        "event_id": event_id,
        "method": "custom",
        "params": {
            "namespace": [],
            "data": {
                "type": "artifact.created",
                "run_id": run_id,
                "artifact": payload,
            },
        },
    }


def tool_finished_event(event_id: str, run_id: str, *, output: dict) -> dict:
    return {
        "type": "event",
        "event_id": event_id,
        "method": "tools",
        "params": {
            "namespace": [],
            "data": {
                "event": "tool-finished",
                "tool_name": "build_material_handoff_feedback",
                "run_id": run_id,
                "output": output,
            },
        },
    }
