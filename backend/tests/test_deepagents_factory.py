from agent_pilot.deepagents_factory import (
    create_finance_async_supervisor_graph,
    create_finance_supervisor_graph,
)


def test_embedded_deepagents_supervisor_graph_builds_with_openai_model(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    graph = create_finance_supervisor_graph("openai:gpt-5.4")

    assert type(graph).__name__ == "CompiledStateGraph"


def test_async_deepagents_supervisor_graph_builds_with_graph_ids(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    graph = create_finance_async_supervisor_graph("openai:gpt-5.4")

    assert type(graph).__name__ == "CompiledStateGraph"
