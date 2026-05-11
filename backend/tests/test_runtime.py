import asyncio

from agent_pilot.deepagents_runtime import DeepAgentsRuntime
from agent_pilot.models import AgentName, TaskStatus


class FakeDeepAgentsGraph:
    def __init__(self) -> None:
        self.inputs = []

    async def ainvoke(self, payload):
        self.inputs.append(payload)
        return {"messages": [{"role": "assistant", "content": "综合财务分析报告：来自 DeepAgents"}]}


def test_deepagents_runtime_invokes_supervisor_graph_and_populates_report():
    async def scenario():
        graph = FakeDeepAgentsGraph()
        runtime = DeepAgentsRuntime(graph=graph)

        run = await runtime.create_run("Analyze latest finance performance", [])
        await runtime.wait_for_run(run.run_id)
        completed = await runtime.get_run(run.run_id)

        assert graph.inputs
        assert completed is not None
        assert {task.status for task in completed.tasks} == {TaskStatus.SUCCEEDED}
        report = next(task for task in completed.tasks if task.agent == AgentName.FINANCE_REPORT)
        assert report.result == "综合财务分析报告：来自 DeepAgents"
        assert "DeepAgents" in completed.supervisor_note

    asyncio.run(scenario())


def test_deepagents_runtime_appends_report_agent_to_selected_table_agents():
    async def scenario():
        runtime = DeepAgentsRuntime(graph=FakeDeepAgentsGraph())

        run = await runtime.create_run(
            "Only analyze aging risk",
            [AgentName.PARTNER_AGING],
        )

        assert [task.agent for task in run.tasks] == [
            AgentName.PARTNER_AGING,
            AgentName.FINANCE_REPORT,
        ]

    asyncio.run(scenario())


def test_deepagents_runtime_marks_tasks_error_when_model_config_missing(monkeypatch):
    async def scenario():
        monkeypatch.setenv("AGENT_PILOT_MODEL", "openai:gpt-5.4")
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
        runtime = DeepAgentsRuntime()

        run = await runtime.create_run("Analyze latest finance performance", [AgentName.MAIN_METRIC])
        await runtime.wait_for_run(run.run_id)
        completed = await runtime.get_run(run.run_id)

        assert completed is not None
        assert {task.status for task in completed.tasks} == {TaskStatus.ERROR}
        assert all("OPENAI_API_KEY is required" in (task.error or "") for task in completed.tasks)

    asyncio.run(scenario())
