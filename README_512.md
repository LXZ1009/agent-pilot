# Agent Pilot 子 Agent 目录化重构包

本包按照官方 `async-deep-agents` 示例的设计思路重构，同时保留你确认的当前阶段约束：

> 一个子 Agent = 一个目录 = 一个 `agent.py` = 一个 `skills/` 目录。

暂时不把 `graph.py / prompt.py / tools.py / schema.py` 拆开，避免过早工程化。

## 目录结构

```text
backend/src/agent_pilot/
├── agent.py                              # Supervisor，只负责 async subagent 编排
├── model_config.py                       # 统一模型配置
├── meeting_contracts.py                  # 共享会议契约与工具
├── pricing_task_runtime.py               # FastAPI 业务适配层
├── api.py                                # FastAPI API
├── middleware/
│   └── completion_notifier.py
└── subagents/
    ├── pre_meeting_interview/
    │   ├── agent.py
    │   └── skills/
    ├── interview_structuring/
    │   ├── agent.py
    │   └── skills/
    ├── material_asset/
    │   ├── agent.py
    │   └── skills/
    ├── notification/
    │   ├── agent.py
    │   └── skills/
    └── task_tracking/
        ├── agent.py
        └── skills/
```

## 关键设计

1. `agent_pilot/agent.py` 对齐官方示例：只声明 `ASYNC_SUBAGENTS` 和 `graph = create_deep_agent(...)`。
2. 每个子 Agent 自己维护 prompt、tools、model、graph，全部先放在各自的 `agent.py` 中。
3. `langgraph.json` 直接注册每个子 Agent 的 `agent.py:graph`。
4. `deepagents_factory.py` 和 `deepagents_graphs.py` 仅保留兼容作用，后续可以删除。
5. `pricing_task_runtime.py` 只作为 FastAPI 适配层，不再负责伪造多 Agent 执行链。

## 覆盖方式

将本包内容复制到项目根目录，覆盖同名文件即可。建议先在新分支操作：

```bash
git checkout -b refactor/subagent-directory
cp -r agent-pilot-subagent-refactor/* /path/to/agent-pilot/
```

然后运行：

```bash
cd backend
uvicorn agent_pilot.api:app --reload --host 127.0.0.1 --port 8000
```

如使用 LangGraph dev：

```bash
langgraph dev
```

## 后续演进建议

当某个子 Agent 的 `agent.py` 超过 300-500 行，再拆分为：

```text
graph.py
prompt.py
tools.py
schema.py
```

当前阶段不建议提前拆分。
