from __future__ import annotations

from pathlib import Path
from typing import Any

from deepagents.backends.utils import create_file_data

SKILL_SOURCES = ["/skills/pre_meeting_interview/"]

_LOCAL_SKILL_DIR = Path(__file__).resolve().parent / "skills" / "pricing-meeting-interview"
_LOCAL_SKILL_MD = _LOCAL_SKILL_DIR / "SKILL.md"
_LOCAL_EXAMPLES_MD = _LOCAL_SKILL_DIR / "examples.md"


def load_skill_files() -> dict[str, Any]:
    """Load local skill files into DeepAgents' StateBackend virtual filesystem.

    The virtual paths must match SKILL_SOURCES:
        /skills/pre_meeting_interview/pricing-meeting-interview/SKILL.md
        /skills/pre_meeting_interview/pricing-meeting-interview/examples.md
    """
    files: dict[str, Any] = {}

    if _LOCAL_SKILL_MD.exists():
        files[
            "/skills/pre_meeting_interview/pricing-meeting-interview/SKILL.md"
        ] = create_file_data(_LOCAL_SKILL_MD.read_text(encoding="utf-8"))

    if _LOCAL_EXAMPLES_MD.exists():
        files[
            "/skills/pre_meeting_interview/pricing-meeting-interview/examples.md"
        ] = create_file_data(_LOCAL_EXAMPLES_MD.read_text(encoding="utf-8"))

    return files
