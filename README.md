# Agent Pilot

基于 DeepAgents 的财务问数多 Agent POC。后端使用 Python/FastAPI，前端使用 Vite + React + TypeScript，用来验证三张业务表各自建 Agent、真实查库、真实请求 OpenAI 模型，并由 supervisor 汇总生成中文综合分析报告。

## 架构

- `backend/src/agent_pilot/api.py`: FastAPI API，`POST /api/runs` 会启动后台执行。
- `backend/src/agent_pilot/deepagents_runtime.py`: FastAPI runtime，调用真实 DeepAgents supervisor graph；缺少 `OPENAI_API_KEY` 时直接把任务标记为错误，不走本地模拟结果。
- `backend/src/agent_pilot/deepagents_factory.py`: DeepAgents 图工厂，包含 FastAPI 单次请求使用的 embedded subagents supervisor，以及 LangGraph/Agent Protocol 使用的 official `AsyncSubAgent` supervisor。
- `backend/src/agent_pilot/finance_agents.py`: 三张表的业务域 Agent 元数据和只读 MySQL 查询工具。
- `backend/src/agent_pilot/deepagents_graphs.py`: `langgraph dev` 图入口，`supervisor` 使用官方 `AsyncSubAgent`，子图 ID 分别是三张表 Agent。
- `.agents/skills/kami`: 项目级 DeepAgents skill，来自 `tw93/Kami`，用于约束最终 Markdown 报告的中文长文档/研报风格。
- `frontend`: 财务问数控制台，可选择业务域 Agent、发起分析，并用 Markdown + GFM 渲染最终报告。

## 业务域 Agent

- `main_metric_agent`: 负责 `ods_fin_main_metric_raw`，分析营业收入、净利润、现金流、应收应付、预收预付等主指标。
- `partner_aging_agent`: 负责 `ods_fin_partner_aging_raw`，分析往来账龄、逾期、长账龄、呆账、内外部客户风险。
- `partner_balance_agent`: 负责 `ods_fin_partner_balance_raw`，分析合作伙伴余额；表为空时返回 `no_data`，不编造结论。
- `finance_report_agent`: 综合各业务域 Agent 的工具证据，生成中文财务分析报告。

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

复制 `.env.example` 为 `.env`，填入 OpenAI 和 MySQL 信息。建议把数据库账号换成只读账号。

```powershell
Copy-Item .env.example .env
```

关键变量：

```dotenv
AGENT_PILOT_MODEL=openai:gpt-5.4
OPENAI_API_KEY=replace-me
# OPENAI_BASE_URL=https://your-openai-compatible-endpoint/v1
# AGENT_PILOT_OPENAI_EXTRA_BODY_JSON={"enable_thinking":false}
MYSQL_HOST=replace-me
MYSQL_PORT=3306
MYSQL_USER=readonly_user
MYSQL_PASSWORD=replace-me
MYSQL_DATABASE=zhin_info_market
```

## 运行 FastAPI + 前端

后端：

```powershell
conda activate agent-pilot
uvicorn agent_pilot.api:app --reload --host 127.0.0.1 --port 8000
```

前端：

```powershell
conda activate agent-pilot
cd frontend
npm run dev
```

打开 `http://127.0.0.1:5173`。没有 `OPENAI_API_KEY` 时，页面可以打开，但发起分析会得到明确的模型配置错误。

最终报告是 Markdown，前端使用 `react-markdown` 和 `remark-gfm` 渲染标题、列表、表格、代码块等结构，并用 Kami 的暖纸色、墨蓝强调和中文 serif 层级做阅读样式。

## DeepAgents Async SubAgents

官方 async subagents 入口由 `langgraph.json` 注册：

- `supervisor`
- `main_metric_agent`
- `partner_aging_agent`
- `partner_balance_agent`
- `finance_report_agent`

本地启动：

```powershell
conda activate agent-pilot
langgraph dev --n-jobs-per-worker 10
```

如果 supervisor 要调用远端 Agent Protocol 服务，可设置：

```dotenv
DEEPAGENTS_ASYNC_SUBAGENT_URL=https://your-langgraph-server
```

## 验证

```powershell
conda activate agent-pilot
python -m pytest -q
python -m ruff check .
cd frontend
npm test
npm run build
```

## API

- `GET /api/health`
- `GET /api/agents`
- `POST /api/runs`
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `POST /api/runs/{run_id}/tasks/{task_id}/updates`
- `POST /api/runs/{run_id}/tasks/{task_id}/cancel`
