# pre_meeting_interview_agent

## 定位

会前访谈 Agent 是一个逐轮对话式访谈专家。它为主 Agent 提供专项访谈能力，围绕会议目标和访谈对象，每轮只提出一个当前最关键问题，并根据对方回复动态追问。

## 边界

负责：

- 判断当前最关键访谈问题；
- 逐轮追问；
- 识别已收集信息和缺口；
- 建议是否进入物料整理阶段。

不负责：

- 一次性生成完整访谈问题清单；
- 生成会议材料；
- 写入 Markdown 文件；
- 落盘到物料路径；
- 触发 MaterialAssetAgent。

## 使用方式

Supervisor 中建议以同步 SubAgent 方式调用：

```python
from agent_pilot.subagents.pre_meeting_interview.agent import build_sync_subagent

subagents = [
    build_sync_subagent(model=model),
    # other sync / async subagents...
]
```

该目录下 `graph` 仅用于 LangGraph Studio 单独调试。
