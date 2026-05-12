from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_api_import_does_not_require_openai_key() -> None:
    env = os.environ.copy()
    env.pop("OPENAI_API_KEY", None)
    env.pop("OPENAI_BASE_URL", None)
    env["AGENT_PILOT_MODEL"] = "openai:gpt-5.4"
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1] / "src")

    result = subprocess.run(
        [sys.executable, "-c", "import agent_pilot.api; print('import ok')"],
        capture_output=True,
        cwd=Path(__file__).resolve().parents[2],
        env=env,
        text=True,
        timeout=20,
    )

    assert result.returncode == 0, result.stderr
    assert "import ok" in result.stdout
