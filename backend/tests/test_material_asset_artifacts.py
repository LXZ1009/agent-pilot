import json
from pathlib import Path

from agent_pilot.subagents.material_asset.artifact_manifest import (
    build_material_artifact_manifest,
)


def test_build_material_artifact_manifest_declares_workspace_files_from_index(tmp_path: Path) -> None:
    package_dir = tmp_path / "workspace" / "material_assets" / "pkg_1"
    (package_dir / "markdown").mkdir(parents=True)
    (package_dir / "json").mkdir()
    (package_dir / "markdown" / "brief.md").write_text("# Brief", encoding="utf-8")
    (package_dir / "json" / "overview.json").write_text("{}", encoding="utf-8")
    (package_dir / "asset_index.json").write_text(
        json.dumps(
            {
                "assets": [
                    {
                        "asset_id": "brief_md",
                        "asset_name": "Meeting brief",
                        "asset_type": "markdown",
                        "file_path": "markdown/brief.md",
                    },
                    {
                        "asset_id": "overview_json",
                        "asset_name": "Overview",
                        "asset_type": "json",
                        "file_path": "json/overview.json",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    manifest = build_material_artifact_manifest(
        asset_package_id="pkg_1",
        asset_package_name="Package 1",
        storage_path="workspace/material_assets/pkg_1",
        main_asset="markdown/brief.md",
        asset_index="asset_index.json",
        workspace_root=tmp_path,
        public_root_prefix="subagents/material_asset",
    )

    assert manifest == {
        "id": "pkg_1:manifest",
        "title": "Package 1",
        "role": "manifest",
        "source": "inline",
        "mime_type": "application/json",
        "content": {
            "artifacts": [
                {
                    "id": "pkg_1:brief_md",
                    "title": "Meeting brief",
                    "role": "deliverable",
                    "source": "workspace",
                    "uri": "/artifacts/pkg_1/markdown/brief.md",
                    "mime_type": "text/markdown",
                    "metadata": {
                        "workspace_path": "subagents/material_asset/workspace/material_assets/pkg_1/markdown/brief.md",
                        "asset_id": "brief_md",
                    },
                },
                {
                    "id": "pkg_1:overview_json",
                    "title": "Overview",
                    "role": "workspace_file",
                    "source": "workspace",
                    "uri": "/artifacts/pkg_1/json/overview.json",
                    "mime_type": "application/json",
                    "metadata": {
                        "workspace_path": "subagents/material_asset/workspace/material_assets/pkg_1/json/overview.json",
                        "asset_id": "overview_json",
                    },
                },
            ]
        },
    }
