import asyncio

from agent_pilot.deepagents_runtime import DeepAgentsRuntime
from agent_pilot.models import AgentName, MeetingContext, TaskStatus


class FakeDeepAgentsGraph:
    def __init__(self) -> None:
        self.inputs = []

    async def ainvoke(self, payload):
        self.inputs.append(payload)
        return {"messages": [{"role": "assistant", "content": "定价会议物料资产包：来自 DeepAgents"}]}


def test_deepagents_runtime_invokes_supervisor_graph_and_populates_meeting_asset_package():
    async def scenario():
        graph = FakeDeepAgentsGraph()
        runtime = DeepAgentsRuntime(graph=graph)
        context = MeetingContext(
            meeting_id="meeting_001",
            meeting_title="华东大区定价会",
            host_name="主持人A",
            participant_name="大区负责人B",
            business_topic="重点客户价格策略",
        )

        run = await runtime.create_run("生成会前访谈卡片和会议物料资产包", [], context)
        await runtime.wait_for_run(run.run_id)
        completed = await runtime.get_run(run.run_id)

        assert graph.inputs
        assert completed is not None
        assert completed.auto_route is True
        assert {task.status for task in completed.tasks} == {TaskStatus.SUCCEEDED}
        report = next(task for task in completed.tasks if task.agent == AgentName.PRICING_MEETING)
        assert report.result == "定价会议物料资产包：来自 DeepAgents"
        assert completed.report_path.endswith("/meeting-asset-package.json")
        assert "pricing meeting" in completed.supervisor_note
        prompt = graph.inputs[0]["messages"][0]["content"]
        assert "meeting_001" in prompt
        assert "根据任务场景自动选择必要的定价会议 agents" in prompt
        assert "不要机械调用所有 Agent" in prompt
        assert "钉钉服务逻辑不在本项目中" in prompt

    asyncio.run(scenario())


def test_deepagents_runtime_prompt_does_not_force_material_for_interview_only_task():
    async def scenario():
        graph = FakeDeepAgentsGraph()
        runtime = DeepAgentsRuntime(graph=graph)
        context = MeetingContext(
            meeting_id="meeting_001",
            meeting_title="华东大区定价会",
            participant_name="张三",
        )

        run = await runtime.create_run("开始华东大区定价会会前访谈", [], context)
        await runtime.wait_for_run(run.run_id)

        prompt = graph.inputs[0]["messages"][0]["content"]
        assert "最终产物必须是定价会议物料资产包" not in prompt
        assert "最后由 pricing_meeting_agent 生成中文摘要和可被外部钉钉服务消费的会议物料资产包" not in prompt
        assert "本次会议物料资产包路径" not in prompt
        assert "根据任务场景自动选择必要的定价会议 agents" in prompt

    asyncio.run(scenario())


def test_deepagents_runtime_appends_pricing_meeting_agent_to_selected_task_agents():
    async def scenario():
        runtime = DeepAgentsRuntime(graph=FakeDeepAgentsGraph())

        run = await runtime.create_run(
            "只整理访谈内容",
            [AgentName.PRE_MEETING_INTERVIEW],
        )

        assert [task.agent for task in run.tasks] == [
            AgentName.PRE_MEETING_INTERVIEW,
            AgentName.PRICING_MEETING,
        ]
        assert run.auto_route is False

    asyncio.run(scenario())


def test_deepagents_runtime_marks_tasks_error_when_model_config_missing(monkeypatch):
    async def scenario():
        monkeypatch.setenv("AGENT_PILOT_MODEL", "openai:gpt-5.4")
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
        runtime = DeepAgentsRuntime()

        run = await runtime.create_run(
            "生成定价会议物料资产包",
            [AgentName.MATERIAL_ASSET],
        )
        await runtime.wait_for_run(run.run_id)
        completed = await runtime.get_run(run.run_id)

        assert completed is not None
        assert {task.status for task in completed.tasks} == {TaskStatus.ERROR}
        assert all("OPENAI_API_KEY is required" in (task.error or "") for task in completed.tasks)

    asyncio.run(scenario())
