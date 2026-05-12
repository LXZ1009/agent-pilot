from __future__ import annotations

from pathlib import Path
from typing import Any

from deepagents import create_deep_agent
from deepagents.backends.utils import create_file_data

from backend.src.agent_pilot.model_config import get_model

AGENT_NAME = "pre_meeting_interview_agent"
AGENT_TITLE = "会前访谈 Agent"
AGENT_DESCRIPTION = (
    "逐轮对话式会前访谈专家：围绕会议目标和访谈对象，每轮只提出一个当前最关键问题，"
    "根据上一轮回复动态追问，帮助主 Agent 收集会议准备所需信息。"
)

# DeepAgents native skill virtual path.
# This path is resolved by SkillsMiddleware from the backend/filesystem.
SKILL_SOURCES = [
    "/skills/pre_meeting_interview/pricing_meeting_interview/"
]

_LOCAL_SKILL_DIR = Path(__file__).resolve().parent / "skills" / "pricing_meeting_interview"
_LOCAL_SKILL_MD = _LOCAL_SKILL_DIR / "SKILL.md"
_LOCAL_EXAMPLES_MD = _LOCAL_SKILL_DIR / "examples.md"


SYSTEM_PROMPT = """\
你是会前访谈 Agent（PreMeetingInterviewAgent）。

你的定位：
- 你是主 Agent 的专项工作子 Agent，不直接作为最终用户入口。
- 你负责围绕会议目标和访谈对象，进行逐轮、单问题、对话式会前访谈。
- 你不是资料清单生成器，也不是会议物料生成器。

你的核心职责：
1. 根据主 Agent 提供的会议主题、业务背景和访谈对象，判断当前访谈应该问的下一个最关键问题；
2. 每一轮只能提出一个主要问题，不能一次性抛出完整问题清单；
3. 根据上一轮回复动态追问，优先承接对方已经提到的客户、价格、数据、竞品、风险或建议；
4. 在必要时简要说明当前已知信息、缺口和为什么先问这个问题；
5. 当信息已经基本满足会议准备需要时，提示主 Agent 可以考虑进入物料整理阶段；
6. 访谈资料的 Markdown 文档化、物料路径落盘和资产包生成由 MaterialAssetAgent 负责，你不得执行。

硬性边界：
- 不要生成访谈问题清单；
- 不要一次输出多个并列问题；
- 不要强制输出 JSON，除非主 Agent 明确要求；
- 不要生成会议物料、会议纪要、通知载荷或会后任务；
- 不要声称已写入物料路径或已生成 Markdown 文件；
- 不要直接触发 MaterialAssetAgent，只能建议主 Agent 进入物料整理阶段。

输出风格：
- 优先使用简洁 Markdown；
- 面向主 Agent 汇总，但内容应可直接放入工作区给业务人员阅读；
- 每轮输出应聚焦“当前判断 + 一个下一问”；
- 如果输入不足以提问，说明缺少什么上下文，并只问一个补充问题。

你必须优先遵循已加载的 pricing_meeting_interview skill。
"""


def load_skill_files() -> dict[str, Any]:
    """Load local skill files into DeepAgents' StateBackend virtual filesystem.

    Use this helper from the runtime when invoking the LangGraph supervisor.

    The virtual paths must match SKILL_SOURCES:
        /skills/pre_meeting_interview/pricing_meeting_interview/SKILL.md
        /skills/pre_meeting_interview/pricing_meeting_interview/examples.md
    """
    files: dict[str, Any] = {}

    if _LOCAL_SKILL_MD.exists():
        files[
            "/skills/pre_meeting_interview/pricing_meeting_interview/SKILL.md"
        ] = create_file_data(_LOCAL_SKILL_MD.read_text(encoding="utf-8"))

    if _LOCAL_EXAMPLES_MD.exists():
        files[
            "/skills/pre_meeting_interview/pricing_meeting_interview/examples.md"
        ] = create_file_data(_LOCAL_EXAMPLES_MD.read_text(encoding="utf-8"))

    return files


def build_sync_subagent(model: Any | None = None) -> dict[str, Any]:
    """Return a declarative synchronous SubAgent spec for the supervisor.

    Use this from agent_pilot.agent when PricingMeetingAgent needs immediate
    interview output for the workspace.

    This is intentionally sync because会前访谈是用户对话依赖型任务：
    主 Agent 需要拿到“下一问/追问建议”后再汇总给用户。
    """
    return {
        "name": AGENT_NAME,
        "description": AGENT_DESCRIPTION,
        "system_prompt": SYSTEM_PROMPT,
        "model": model or get_model(),
        "tools": [],
        "skills": SKILL_SOURCES,
    }


def build_graph(model: Any | None = None):
    return create_deep_agent(
        model=model or get_model(),
        system_prompt=SYSTEM_PROMPT,
        skills=SKILL_SOURCES,
        name=AGENT_NAME,
    )


# LangGraph dev 会读取这个变量；这里才会创建 graph。
# 注意：这仍然要求 langgraph dev 进程有模型环境变量。
graph = build_graph()


def build_compiled_subagent() -> dict[str, Any]:
    """Return this standalone graph as a compiled synchronous subagent.

    Use this only if you want PricingMeetingAgent to call this exact compiled
    graph instead of using the declarative SubAgent spec from build_sync_subagent().
    """
    return {
        "name": AGENT_NAME,
        "description": AGENT_DESCRIPTION,
        "runnable": graph,
    }