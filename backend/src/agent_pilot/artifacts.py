from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from agent_pilot.evidence import EvidenceArchive


class ArtifactError(Exception):
    status_code = 400
    detail = "Artifact error"


class ArtifactNotFoundError(ArtifactError):
    status_code = 404
    detail = "Artifact not found"


class ArtifactAccessError(ArtifactError):
    status_code = 403
    detail = "Artifact path is not accessible"


class ArtifactTooLargeError(ArtifactError):
    status_code = 413
    detail = "Artifact is too large to preview"


@dataclass(frozen=True)
class ArtifactRecord:
    descriptor: dict[str, Any]
    content: Any = None
    workspace_path: str | None = None


class ArtifactRegistry:
    INLINE_LIMIT_BYTES = 64 * 1024
    PREVIEW_LIMIT_BYTES = 256 * 1024

    def __init__(
        self,
        evidence_archive: EvidenceArchive,
        *,
        workspace_roots: list[Path] | None = None,
    ) -> None:
        self.evidence_archive = evidence_archive
        self.workspace_roots = [root.resolve() for root in (workspace_roots or [])]

    def list_for_run(self, thread_id: str, run_id: str | None = None) -> list[dict[str, Any]]:
        records = self._records_for_thread(thread_id)
        return [
            record.descriptor
            for record in records
            if run_id is None or record.descriptor["runId"] == run_id
        ]

    def read_content(self, thread_id: str, artifact_id: str) -> dict[str, Any]:
        record = next(
            (
                item
                for item in self._records_for_thread(thread_id)
                if item.descriptor["id"] == artifact_id
            ),
            None,
        )
        if record is None:
            raise ArtifactNotFoundError

        if record.descriptor["source"] == "inline":
            serialized = _serialize_content(record.content)
            if len(serialized.encode("utf-8")) > self.INLINE_LIMIT_BYTES:
                raise ArtifactTooLargeError
            return {"artifact": record.descriptor, "content": record.content}

        path = self._resolve_workspace_path(record.workspace_path)
        if not path.exists() or not path.is_file():
            raise ArtifactNotFoundError
        if path.stat().st_size > self.PREVIEW_LIMIT_BYTES:
            raise ArtifactTooLargeError
        return {"artifact": record.descriptor, "content": path.read_text(encoding="utf-8")}

    def _records_for_thread(self, thread_id: str) -> list[ArtifactRecord]:
        records: list[ArtifactRecord] = []
        for event in self.evidence_archive.list_events(thread_id):
            envelope = _as_dict(event)
            params = _as_dict(envelope.get("params"))
            data = _as_dict(params.get("data"))
            method = envelope.get("method")
            if method == "custom" and data.get("type") in {"artifact.created", "artifact.updated"}:
                records.extend(self._records_from_artifact(data, _as_dict(data.get("artifact"))))
                continue
            if method == "tools" and data.get("event") == "tool-finished":
                for artifact in _declared_artifacts_from_output(data.get("output")):
                    records.extend(self._records_from_artifact(data, artifact))
        return records

    def _records_from_artifact(
        self,
        data: dict[str, Any],
        artifact: dict[str, Any],
    ) -> list[ArtifactRecord]:
        record = self._to_record(data, artifact)
        return [record, *self._expand_manifest_records(record)]

    def _expand_manifest_records(self, record: ArtifactRecord) -> list[ArtifactRecord]:
        if record.descriptor["role"] != "manifest":
            return []
        content = _as_dict(record.content)
        children = content.get("artifacts")
        if not isinstance(children, list):
            return []
        data = {"run_id": record.descriptor["runId"]}
        return [
            self._to_record(data, child)
            for child in children
            if isinstance(child, dict)
        ]

    def _to_record(self, data: dict[str, Any], artifact: dict[str, Any]) -> ArtifactRecord:
        content = artifact.get("content")
        source = _normalize_source(artifact.get("source"), content)
        metadata = _as_dict(artifact.get("metadata"))
        workspace_path = metadata.get("workspace_path")
        descriptor = {
            "id": str(artifact.get("id") or ""),
            "runId": str(artifact.get("run_id") or data.get("run_id") or ""),
            "title": str(artifact.get("title") or data.get("title") or artifact.get("uri") or "Artifact"),
            "kind": _infer_kind(str(artifact.get("mime_type") or artifact.get("mimeType") or ""), str(artifact.get("uri") or ""), content),
            "role": _normalize_role(artifact.get("role")),
            "source": source,
            "uri": artifact.get("uri"),
            "mimeType": artifact.get("mime_type") or artifact.get("mimeType"),
            "schemaRef": artifact.get("schema_ref") or artifact.get("schemaRef"),
            "summary": artifact.get("summary") or data.get("summary"),
            "producerNodeId": artifact.get("producer_node_id") or artifact.get("producerNodeId"),
            "createdAt": artifact.get("created_at") or artifact.get("createdAt"),
            "updatedAt": artifact.get("updated_at") or artifact.get("updatedAt"),
            "metadata": {
                key: value
                for key, value in metadata.items()
                if key not in {"workspace_path", "local_path"}
            },
        }
        return ArtifactRecord(
            descriptor=descriptor,
            content=content,
            workspace_path=str(workspace_path) if isinstance(workspace_path, str) else None,
        )

    def _resolve_workspace_path(self, workspace_path: str | None) -> Path:
        if not workspace_path or not self.workspace_roots:
            raise ArtifactNotFoundError
        candidate = Path(workspace_path)
        if candidate.is_absolute() or "~" in candidate.parts:
            raise ArtifactAccessError

        for root in self.workspace_roots:
            resolved = (root / candidate).resolve()
            if _is_relative_to(resolved, root):
                return resolved
        raise ArtifactAccessError


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_role(value: Any) -> str:
    if value in {"deliverable", "workspace_file", "manifest", "preview"}:
        return str(value)
    return "deliverable"


def _normalize_source(value: Any, content: Any) -> str:
    if value in {"inline", "workspace"}:
        return str(value)
    return "workspace" if content is None else "inline"


def _infer_kind(mime_type: str, uri: str, content: Any) -> str:
    if "markdown" in mime_type or uri.endswith(".md"):
        return "document"
    if "json" in mime_type or uri.endswith(".json"):
        return "table" if _has_table_shape(content) else "data"
    if mime_type.startswith("text/"):
        return "document"
    if uri.startswith("http://") or uri.startswith("https://"):
        return "link"
    if isinstance(content, dict):
        return "table" if _has_table_shape(content) else "data"
    if isinstance(content, list) and _has_table_shape(content):
        return "table"
    return "unknown"


def _has_table_shape(content: Any) -> bool:
    if isinstance(content, list):
        return all(isinstance(item, dict) for item in content)
    if isinstance(content, dict):
        rows = content.get("rows") or content.get("data") or content.get("records")
        return isinstance(rows, list) and all(isinstance(item, dict) for item in rows)
    return False


def _serialize_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    return json.dumps(content, ensure_ascii=False)


def _declared_artifacts_from_output(output: Any) -> list[dict[str, Any]]:
    payload = _as_dict(output)
    artifacts = payload.get("artifacts")
    if isinstance(artifacts, list):
        return [item for item in artifacts if isinstance(item, dict)]
    artifact = payload.get("artifact")
    if isinstance(artifact, dict):
        return [artifact]
    return []


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True
