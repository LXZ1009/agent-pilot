from __future__ import annotations

import asyncio

from deepagents.backends import FilesystemBackend
from deepagents.middleware.skills import _list_skills_with_errors

from agent_pilot.subagents.material_asset.skill_loader import (
    SKILL_SOURCES as MATERIAL_SKILL_SOURCES,
    load_skill_files as load_material_skill_files,
)
from agent_pilot.subagents.pre_meeting_interview.skill_loader import (
    SKILL_SOURCES as INTERVIEW_SKILL_SOURCES,
    load_skill_files as load_interview_skill_files,
)


def test_pre_meeting_interview_skill_files_match_deepagents_source_root() -> None:
    files = load_interview_skill_files()

    assert INTERVIEW_SKILL_SOURCES == ["/skills/pre_meeting_interview/"]
    assert "/skills/pre_meeting_interview/pricing-meeting-interview/SKILL.md" in files
    assert files[
        "/skills/pre_meeting_interview/pricing-meeting-interview/SKILL.md"
    ]["content"].startswith("---\nname: pricing-meeting-interview\n")
    assert "/skills/pre_meeting_interview/pricing-meeting-interview/examples.md" in files


def test_material_asset_skill_files_match_deepagents_source_root() -> None:
    files = load_material_skill_files()

    assert MATERIAL_SKILL_SOURCES == ["/skills/material_asset/"]
    assert "/skills/material_asset/material-asset/SKILL.md" in files
    assert files["/skills/material_asset/material-asset/SKILL.md"]["content"].startswith(
        "---\nname: material-asset\n"
    )


def test_pricing_runtime_injects_skill_files_into_langgraph_run(monkeypatch) -> None:
    from agent_pilot.pricing_task_runtime import PricingTaskRuntime

    captured: dict = {}

    class FakeThreads:
        async def create(self) -> dict[str, str]:
            return {"thread_id": "thread_001"}

    class FakeRuns:
        async def wait(self, **kwargs):
            captured.update(kwargs)
            return {"messages": [{"role": "assistant", "content": "ok"}]}

    class FakeClient:
        threads = FakeThreads()
        runs = FakeRuns()

    monkeypatch.setattr(
        "agent_pilot.pricing_task_runtime.get_client",
        lambda url: FakeClient(),
    )

    async def scenario() -> None:
        runtime = PricingTaskRuntime(langgraph_url="http://test", assistant_id="supervisor")
        result = await runtime._invoke_langgraph_supervisor("hello")

        assert result == "ok"
        input_payload = captured["input"]
        assert "files" in input_payload
        assert "/skills/pre_meeting_interview/pricing-meeting-interview/SKILL.md" in input_payload["files"]
        assert "/skills/material_asset/material-asset/SKILL.md" in input_payload["files"]

    asyncio.run(scenario())


def test_standalone_subagent_graphs_can_load_local_skill_directories() -> None:
    interview_backend = FilesystemBackend(
        root_dir="backend/src/agent_pilot/subagents/pre_meeting_interview",
        virtual_mode=True,
    )
    material_backend = FilesystemBackend(
        root_dir="backend/src/agent_pilot/subagents/material_asset",
        virtual_mode=True,
    )

    interview_skills, interview_error = _list_skills_with_errors(interview_backend, "/skills/")
    material_skills, material_error = _list_skills_with_errors(material_backend, "/skills/")

    assert interview_error is None
    assert material_error is None
    assert [skill["name"] for skill in interview_skills] == ["pricing-meeting-interview"]
    assert [skill["name"] for skill in material_skills] == ["material-asset"]
