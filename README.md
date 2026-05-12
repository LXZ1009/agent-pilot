# Agent Pilot

基于 DeepAgents 的定价会议多 Agent 后端 POC。当前改造重点是后端 agent 实现，为外部钉钉服务提供可调用的任务、状态、物料和产物接口；钉钉定时调度、消息发送、卡片交互、会议生命周期和文件分发逻辑不在本项目中。

## 架构

- `backend/src/agent_pilot/api.py`: FastAPI API，`POST /api/runs` 创建后台 agent 运行，外部服务可轮询运行、任务、事件和物料产物。
- `backend/src/agent_pilot/deepagents_runtime.py`: FastAPI runtime，调用真实 DeepAgents supervisor graph；缺少 `OPENAI_API_KEY` 时直接把任务标记为错误，不走本地模拟结果。
- `backend/src/agent_pilot/deepagents_factory.py`: DeepAgents 图工厂，包含 FastAPI 单次请求使用的 embedded subagents supervisor，以及 LangGraph/Agent Protocol 使用的 `AsyncSubAgent` supervisor。
- `backend/src/agent_pilot/meeting_agents.py`: 定价会议 agent 元数据、访谈状态机、访谈卡片 schema、物料资产目录和外部服务边界说明。
- `backend/src/agent_pilot/deepagents_graphs.py`: `langgraph dev` 图入口，`supervisor` 使用 async subagents，子图 ID 对应各定价会议 agent。
- `frontend`: 仍是临时控制台，尚未按定价会议场景优先改造。

## 定价会议 Agent

- `pre_meeting_interview_agent`: 会前访谈 Agent，负责单人访谈问答、追问、超时状态解释和完整性校验。
- `interview_structuring_agent`: 访谈结构化 Agent，负责把访谈内容整理成标准访谈卡片。
- `material_asset_agent`: 物料整理 Agent，负责融合访谈与业务输入，生成定价会议物料资产包。
- `notification_agent`: 通知推送 Agent，只生成会前 5 分钟预览所需的通知载荷、卡片摘要和文件清单，不实际调用钉钉。
- `task_tracking_agent`: 任务跟踪 Agent，只生成会后任务清单、责任人、截止时间建议和复盘结构，不实际创建钉钉任务。
- `pricing_meeting_agent`: 定价会议主控 Agent，负责任务编排、状态监控、结果汇聚和资产包输出。

## 环境

```powershell
conda env create -f environment.yml
conda activate agent-pilot
```

如果环境已存在：

```powershell
conda env update -f environment.yml --prune
conda activate agent-pilot
```

安装前端依赖：

```powershell
cd frontend
npm install
```

## 配置

复制 `.env.example` 为 `.env`，填入 OpenAI 配置。

```powershell
Copy-Item .env.example .env
```

关键变量：

```dotenv
AGENT_PILOT_MODEL=openai:gpt-5.4
OPENAI_API_KEY=replace-me
# OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
# AGENT_PILOT_OPENAI_EXTRA_BODY_JSON={"enable_thinking":false}
```

## 运行 FastAPI + 前端

后端：

```powershell
conda activate agent-pilot
uvicorn agent_pilot.api:app --host 127.0.0.1 --port 8000
```

前端：

```powershell
conda activate agent-pilot
cd frontend
npm run dev
```

打开 `http://127.0.0.1:5173`。前端文案仍有旧场景痕迹，当前以后端接口和 agent 逻辑为准。

## DeepAgents Async SubAgents

官方 async subagents 入口由 `langgraph.json` 注册：

- `supervisor`
- `pre_meeting_interview_agent`
- `interview_structuring_agent`
- `material_asset_agent`
- `notification_agent`
- `task_tracking_agent`
- `pricing_meeting_agent`

本地启动：

```powershell
conda activate agent-pilot
langgraph dev --n-jobs-per-worker 10
```

如果 supervisor 要调用远端 Agent Protocol 服务，可设置：

```dotenv
DEEPAGENTS_ASYNC_SUBAGENT_URL=https://your-langgraph-server
```

## API

- `GET /api/health`
- `GET /api/agents`
- `POST /api/pricing-meeting/agent/execute`
- `POST /api/runs`
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/artifacts/meeting-assets`
- `GET /api/runs/{run_id}/artifacts/meeting-assets/content`
- `POST /api/runs/{run_id}/tasks/{task_id}/updates`
- `POST /api/runs/{run_id}/tasks/{task_id}/cancel`

`POST /api/runs` 支持可选 `meeting_context`，用于外部钉钉服务把会议 ID、会议标题、主持人、访谈对象和业务载荷传给 agent。

验证版前端优先调用统一入口 `POST /api/pricing-meeting/agent/execute`，请求体包含 `meeting_id`、`task_type` 和 `payload`。后端统一进入 `PricingMeetingAgent`，由它识别 `start_interview`、`interview_reply`、`generate_material`、`pre_meeting_preview` 并调度对应专业 Agent，响应会返回 `root_agent`、`called_agents`、`result` 和 `trace`，用于前端展示多 Agent 协同链路。

## 验证

```powershell
conda activate agent-pilot
python -m pytest -q
python -m ruff check .
```
