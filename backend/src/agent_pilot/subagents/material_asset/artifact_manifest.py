from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def build_material_artifact_manifest(
    *,
    asset_package_id: str,
    asset_package_name: str,
    storage_path: str,
    main_asset: str,
    asset_index: str,
    workspace_root: Path,
    public_root_prefix: str,
) -> dict[str, Any] | None:
    index_path = workspace_root / storage_path / asset_index
    if not index_path.exists() or not index_path.is_file():
        return None

    payload = json.loads(index_path.read_text(encoding="utf-8"))
    raw_assets = payload.get("assets")
    if not isinstance(raw_assets, list):
        return None

    artifacts: list[dict[str, Any]] = []
    for raw_asset in raw_assets:
        if not isinstance(raw_asset, dict):
            continue
        file_path = raw_asset.get("file_path")
        if not isinstance(file_path, str) or not file_path:
            continue

        asset_id = str(raw_asset.get("asset_id") or file_path)
        normalized_path = Path(file_path).as_posix()
        title = str(raw_asset.get("asset_name") or normalized_path)
        artifacts.append(
            {
                "id": f"{asset_package_id}:{asset_id}",
                "title": title,
                "role": "deliverable" if normalized_path == main_asset else "workspace_file",
                "source": "workspace",
                "uri": f"/artifacts/{asset_package_id}/{normalized_path}",
                "mime_type": _mime_type_for_path(normalized_path),
                "metadata": {
                    "workspace_path": (
                        Path(public_root_prefix) / storage_path / normalized_path
                    ).as_posix(),
                    "asset_id": asset_id,
                },
            }
        )

    if not artifacts:
        return None

    return {
        "id": f"{asset_package_id}:manifest",
        "title": asset_package_name,
        "role": "manifest",
        "source": "inline",
        "mime_type": "application/json",
        "content": {"artifacts": artifacts},
    }


def _mime_type_for_path(file_path: str) -> str:
    suffix = Path(file_path).suffix.lower()
    if suffix == ".md":
        return "text/markdown"
    if suffix == ".json":
        return "application/json"
    if suffix == ".html":
        return "text/html"
    if suffix == ".txt":
        return "text/plain"
    return "application/octet-stream"
