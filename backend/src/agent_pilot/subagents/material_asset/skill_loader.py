from __future__ import annotations

from pathlib import Path
from typing import Any

from deepagents.backends.utils import create_file_data


CURRENT_DIR = Path(__file__).resolve().parent

# 推荐将 Skill 放在当前 material_asset 模块下，便于模块内聚。
# 如果你已有统一 skills 目录，也可以把这里改为统一目录。
SKILL_DIR = CURRENT_DIR / "skills" / "material-asset"



SKILL_SOURCES = ["/skills/material_asset/"]



_LOCAL_SKILL_MD = SKILL_DIR / "SKILL.md"


def load_skill_files() -> dict[str, Any]:
    """Load local skill files into DeepAgents' StateBackend virtual filesystem."""
    files: dict[str, Any] = {}

    if _LOCAL_SKILL_MD.exists():
        files["/skills/material_asset/material-asset/SKILL.md"] = create_file_data(
            _LOCAL_SKILL_MD.read_text(encoding="utf-8")
        )

    return files
