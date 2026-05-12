from agent_pilot.deepagents_factory import (
    MATERIAL_ASSET_AGENT_PROMPT,
    PRICING_MEETING_SUPERVISOR_PROMPT,
    create_pricing_meeting_async_supervisor_graph,
    create_pricing_meeting_supervisor_graph,
)


def test_embedded_pricing_meeting_supervisor_graph_builds_with_openai_model(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    graph = create_pricing_meeting_supervisor_graph("openai:gpt-5.4")

    assert type(graph).__name__ == "CompiledStateGraph"


def test_async_pricing_meeting_supervisor_graph_builds_with_graph_ids(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    graph = create_pricing_meeting_async_supervisor_graph("openai:gpt-5.4")

    assert type(graph).__name__ == "CompiledStateGraph"


def test_pricing_meeting_supervisor_prompt_does_not_force_material_assets():
    prompt = PRICING_MEETING_SUPERVISOR_PROMPT

    assert "根据用户目标选择必要子 Agent" in prompt
    assert "不要机械调用所有 Agent" in prompt
    assert "钉钉服务逻辑不在本项目中" in prompt
    assert "最终产物必须是定价会议物料资产包" not in prompt


def test_material_asset_prompt_owns_material_package_requirements():
    assert "最终产物必须是定价会议物料资产包" in MATERIAL_ASSET_AGENT_PROMPT
    assert "只在主 Agent 明确委派物料整理任务时执行" in MATERIAL_ASSET_AGENT_PROMPT
