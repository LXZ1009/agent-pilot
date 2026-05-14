import React, { useState } from 'react'

const iconMap = {
  Search: '⌕', Plus: '+', MessageSquare: '☰', Grid: '▦', Database: '◉', Chart: '▥', Settings: '⚙',
  Left: '‹', Right: '›', Down: '⌄', Up: '⌃', Check: '✓', Circle: '○', Loading: '◌', File: '◫',
  Download: '⇩', Send: '➤', Paperclip: '⌘', Bot: '⌾', User: '●', Zap: 'ϟ', Briefcase: '▣', Star: '☆',
  Share: '⌯', More: '…', Copy: '⧉', Link: '↗', Close: '×', Pin: '⌖', Branch: '◇', Shield: '◆', Clock: '◷'
}

function Icon({ name, className = 'h-4 w-4' }) {
  return <span className={`inline-flex items-center justify-center leading-none ${className}`}>{iconMap[name] || '•'}</span>
}

const statusClass = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  running: 'bg-blue-50 text-blue-700 border-blue-100',
  waiting: 'bg-slate-100 text-slate-500 border-slate-200',
  waiting_for_input: 'bg-amber-50 text-amber-700 border-amber-100',
  error: 'bg-red-50 text-red-700 border-red-100',
}

function StatusBadge({ status, label }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass[status] || statusClass.waiting}`}>{label || status}</span>
}

const tasks = [
  ['生成华东大区定价会物料资产包', '进行中', 'PricingMeetingAgent', '10:24', true],
  ['华东大区竞品动态更新', '已完成', 'MarketInsightAgent', '昨天'],
  ['客户风险评估报告', '已完成', 'RiskAnalysisAgent', '昨天'],
  ['五月价格执行复盘报告', '已完成', 'PricingReviewAgent', '5-18'],
  ['客户访谈纪要结构化', '已完成', 'InterviewStructuringAgent', '5-17'],
  ['Q2 重点客户清单', '已取消', 'CustomerListAgent', '5-16'],
  ['渠道政策影响分析', '草稿', 'ChannelPolicyAgent', '5-15'],
]

const assets = [
  ['会议概览卡', 'completed'], ['重点客户清单', 'completed'], ['价格执行摘要', 'completed'], ['风险预警清单', 'completed'],
  ['缺失信息清单', 'completed'], ['竞品动态', 'running'], ['来源追溯文件', 'running'], ['审批例外清单', 'waiting'],
]

const timeline = [
  { id: 'user', actor: 'User', title: '提交任务：生成会议物料资产包', status: 'completed', time: '10:23', icon: 'User', tone: 'bg-blue-600', input: '用户在问答工作区提交物料资产包生成任务。', output: '任务进入 PricingMeetingAgent 主控流程。', artifacts: ['task_request.json'] },
  { id: 'pricing-understand', actor: 'PricingMeetingAgent', title: '理解任务，拆解所需信息并判断需要启动物料整理专项 Agent', status: 'completed', time: '10:23', icon: 'Bot', tone: 'bg-violet-600', input: '接收用户任务、会议上下文和已有会前访谈卡片。', output: '判断任务属于长耗时物料整理，需要异步启动 MaterialAssetAgent。', artifacts: ['meeting_context.json', 'interview_cards.json'] },
  { id: 'async-subagent', actor: 'DeepAgents Async SubAgent', title: 'launch_async_subagent(material_asset_agent)', status: 'completed', time: '10:23', icon: 'Zap', tone: 'bg-cyan-600', input: '主控 Agent 发起异步子代理任务。', output: '创建 material_asset_agent job，并开始收集与整理基础数据。', artifacts: ['async_subagent_job.json'] },
  { id: 'material-context', actor: 'MaterialAssetAgent / 上下文整理', title: '整理会议上下文、访谈卡片和业务输入', status: 'completed', time: '10:24', icon: 'Briefcase', tone: 'bg-orange-500', input: '会议背景、客户信息、竞品线索、账期与审批条件。', output: '完成统一口径整理，形成资产包生成基础。', artifacts: ['meeting_overview_card.json', 'interview_cards.json'] },
  { id: 'material-generate', actor: 'MaterialAssetAgent / 资产包生成', title: '生成会议物料资产包、资产索引、来源追溯和缺失信息', status: 'running', time: '10:24', icon: 'Briefcase', tone: 'bg-orange-500', input: '结构化访谈卡片、会议上下文、价格执行信息、风险线索。', output: '已生成 5/8 项资产，source_trace.json 正在写入。', artifacts: ['price_execution_summary.json', 'risk_warning_list.json', 'source_trace.json'] },
  { id: 'return', actor: 'PricingMeetingAgent / 汇总返回', title: '汇总结果并返回给用户', status: 'waiting', time: '-', icon: 'Bot', tone: 'bg-slate-400', input: '等待 MaterialAssetAgent 完成全部产物。', output: '待汇总最终结果并返回问答工作区。', artifacts: [] },
]

const artifactFiles = [
  ['meeting_overview_card.json', '会议概览卡，包含会议主题、主持人、业务目标和关键风险。', 'completed'],
  ['interview_cards.json', '结构化访谈卡片，沉淀访谈对象、客户信息、竞品信息、价格诉求。', 'completed'],
  ['price_execution_summary.json', '价格执行摘要，整理报价、底线价、账期和审批条件。', 'completed'],
  ['risk_warning_list.json', '风险预警清单，标记竞品低价、客户流失、审批例外等风险。', 'completed'],
  ['missing_info.json', '缺失信息清单，记录仍需补充的字段。', 'completed'],
  ['source_trace.json', '来源追溯文件，记录关键结论与来源引用关系。', 'running'],
]

const claims = [
  { id: 'claim-1', title: '浙江建投是本次续约谈判重点客户。', confidence: 'High', source: ['张三会前访谈卡片', '会议上下文'], path: ['PreMeetingInterviewAgent', 'InterviewStructuringAgent', 'MaterialAssetAgent'], summary: '张三在访谈中明确提到浙江建投为本次续约谈判重点客户，并希望在价格与账期上获得更优条件。', artifacts: ['interview_cards.json', 'source_trace.json'] },
  { id: 'claim-2', title: '江苏交工存在 20%–30% 订单分流风险。', confidence: 'High', source: ['张三会前访谈卡片', '竞品动态摘要'], path: ['PreMeetingInterviewAgent', 'MarketInsightAgent', 'MaterialAssetAgent'], summary: '访谈卡片与竞品动态摘要均指向江苏交工受到低价竞品冲击，存在部分订单转移风险。', artifacts: ['interview_cards.json', 'competitive_summary.json', 'source_trace.json'] },
  { id: 'claim-3', title: '成本线保守测算为 3750 元/吨。', confidence: 'Medium', source: ['访谈卡片中的保守测算字段'], path: ['PreMeetingInterviewAgent', 'MaterialAssetAgent'], summary: '该成本线来自访谈卡片中的业务保守测算字段，仍建议由业务系统或财务数据进一步校验。', artifacts: ['price_execution_summary.json', 'source_trace.json'] },
]

const events = [
  ['10:24', '已生成 meeting_overview_card.json', 'completed'],
  ['10:24', 'price_execution_summary.json 处理完成', 'completed'],
  ['10:24', 'competitive_summary.json 处理中', 'running'],
  ['10:25', 'source_trace.json 等待写入', 'waiting'],
]

const dispatchSummary = [
  ['任务理解摘要', '用户要求基于当前已收集的访谈内容生成会议物料资产包。'],
  ['调度决策', 'PricingMeetingAgent 判断该任务属于长耗时物料整理任务，需要整理多个中间产物，并生成资产索引和来源追溯，因此通过 DeepAgents async subagent 机制启动 MaterialAssetAgent。'],
  ['调用方式', 'launch_async_subagent'],
  ['目标 Agent', 'material_asset_agent'],
  ['执行模式', '异步子代理任务'],
  ['回收方式', 'check_async_subagent / completion notifier'],
]

function AssetStatusIcon({ status }) {
  if (status === 'completed') return <Icon name="Check" className="h-4 w-4 text-emerald-600" />
  if (status === 'running') return <Icon name="Loading" className="h-4 w-4 animate-spin text-blue-600" />
  return <Icon name="Circle" className="h-4 w-4 text-slate-300" />
}

function LeftNav() {
  return <aside className="flex h-screen w-[300px] shrink-0 border-r border-slate-200 bg-white">
    <div className="flex w-14 flex-col items-center border-r border-slate-100 py-4">
      <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><Icon name="Branch" /></div>
      <div className="flex flex-1 flex-col gap-2 text-slate-500">
        {['MessageSquare', 'Grid', 'Database', 'Chart', 'Settings'].map((n, i) => <button key={n} className={`rounded-xl p-2 ${i === 0 ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-100'}`}><Icon name={n} className="h-5 w-5" /></button>)}
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-xs text-white">张</div>
    </div>
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-slate-100 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-950">多 Agent 协同任务工作台</h1>
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Icon name="Plus" /></button>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"><Icon name="Search" /><span>搜索任务或会话</span><span className="ml-auto text-xs">⌘K</span></div>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 text-xs text-slate-600">
          {['全部', '我创建的', '我参与的', '收藏'].map((t, i) => <button key={t} className={`rounded-lg px-2 py-1.5 ${i === 0 ? 'bg-white text-slate-950 shadow-sm' : ''}`}>{t}</button>)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between text-xs font-medium text-slate-500"><span>最近任务</span><button className="text-blue-600">+ 新建任务</button></div>
        <div className="space-y-3">
          {tasks.map(([title, status, agent, time, active]) => <div key={title} className={`rounded-xl border p-3 transition ${active ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <div className="mb-2 flex items-start justify-between gap-2"><div className="truncate text-sm font-semibold text-slate-900">{title}</div><span className="shrink-0 text-xs text-slate-500">{time}</span></div>
            <div className="flex items-center justify-between text-xs"><div className="flex items-center gap-1.5 text-slate-500"><span className={`h-2 w-2 rounded-full ${status === '进行中' ? 'bg-blue-500' : status === '已取消' ? 'bg-red-500' : status === '草稿' ? 'bg-slate-400' : 'bg-emerald-500'}`} />{status}</div><div className="text-slate-500">@ {agent}</div></div>
          </div>)}
        </div>
      </div>
      <div className="border-t border-slate-100 p-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm text-white">张</div><div><div className="text-sm font-semibold">张三</div><div className="text-xs text-slate-500">销售运营经理</div></div><Icon name="Settings" className="ml-auto text-slate-500" /></div></div>
    </div>
  </aside>
}

function MainWorkspace({ panelOpen, setPanelOpen }) {
  const completed = assets.filter(([, s]) => s === 'completed').length
  const pct = Math.round((completed / assets.length) * 100)
  return <main className="flex h-screen min-w-0 flex-1 flex-col bg-[#F8FAFC]">
    <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="min-w-0"><div className="flex items-center gap-3"><Icon name="Left" className="text-slate-500" /><h2 className="truncate text-xl font-semibold text-slate-950">生成华东大区定价会物料资产包</h2><StatusBadge status="running" label="进行中" /></div><p className="mt-1 text-sm text-slate-500">PricingMeetingAgent 已理解需求，并启动 MaterialAssetAgent 进行物料整理</p></div>
      <div className="flex items-center gap-1 text-slate-500">{['Star','Share','More'].map(n=><button key={n} className="rounded-lg p-2 hover:bg-slate-100"><Icon name={n} /></button>)}{!panelOpen && <button onClick={() => setPanelOpen(true)} className="ml-2 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"><Icon name="Shield" />可信面板</button>}</div>
    </header>
    <section className="flex-1 overflow-y-auto px-6 py-6"><div className="mx-auto max-w-5xl space-y-6">
      <div className="flex gap-4"><div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm text-white">张</div><div><div className="mb-1 flex items-center gap-2 text-sm"><span className="font-semibold">你</span><span className="text-slate-400">10:23</span></div><div className="text-[15px]">生成华东大区定价会物料资产包</div></div></div>
      <div className="flex gap-4"><div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white"><Icon name="Bot" /></div><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-2 text-sm"><span className="font-semibold">PricingMeetingAgent</span><span className="text-slate-400">10:24</span></div><div className="mb-4 text-[15px]">已理解你的需求，正在协调相关代理处理并生成会议物料资产包。</div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon name="File" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-4"><h3 className="text-lg font-semibold">会议物料资产包</h3><span className="text-sm font-medium text-slate-500">{pct}%</span></div><div className="mt-1 text-sm text-slate-500">已生成 {completed} / {assets.length} 项资产</div><div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${pct}%` }} /></div></div></div>
          <div className="grid grid-cols-[1fr_1px_1fr] gap-5 border-t border-slate-100 pt-4"><div><div className="mb-3 text-sm font-semibold">资产清单（部分完成）</div><div className="grid gap-2">{assets.map(([name,status])=><div key={name} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"><div className="flex items-center gap-2 text-sm text-slate-700"><AssetStatusIcon status={status}/>{name}</div><StatusBadge status={status} label={status==='completed'?'已完成':status==='running'?'生成中':'待生成'} /></div>)}</div></div><div className="bg-slate-100"/><div><div className="mb-3 text-sm font-semibold">主要结论（阶段性）</div><div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">浙江建投和江苏交工是本次会议的重点客户；当前需要重点关注竞品低价冲击、账期拉长和审批例外风险。</div><div className="mt-3 text-xs text-slate-500">基于截至 10:24 的中间结果</div></div></div>
          <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4"><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">查看资产包</button><button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">查看缺失信息</button><button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Icon name="Download" />导出摘要</button></div>
        </div>
      </div></div>
      <div className="flex gap-4"><div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white"><Icon name="Bot" /></div><div><div className="mb-1 flex items-center gap-2 text-sm"><span className="font-semibold">PricingMeetingAgent</span><span className="text-slate-400">10:24</span></div><div className="text-[15px] text-slate-700">资产包正在生成中，执行链路与来源追溯已同步写入右侧可信面板。</div><div className="mt-3 flex gap-3 text-slate-400"><Icon name="Copy"/><span className="text-xs">有疑问时，可从右侧可信面板追溯任务依据。</span></div></div></div>
    </div></section>
    <footer className="border-t border-slate-200 bg-white px-6 py-4"><div className="mx-auto flex max-w-5xl items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><button className="text-slate-500"><Icon name="Plus"/></button><button className="text-slate-500"><Icon name="Paperclip"/></button><input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="继续提问，或输入 @ 选择 Agent"/><button className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">选择 Agent</button><button className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700"><Icon name="Send"/></button></div></footer>
  </main>
}

function TimelineNode({ node, open, onToggle }) {
  return <div className="relative pl-9"><div className="absolute left-[15px] top-11 h-[calc(100%-20px)] w-px bg-slate-200"/><div className={`absolute left-0 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white ${node.tone}`}><Icon name={node.icon}/></div><button onClick={onToggle} className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-blue-200 hover:bg-blue-50/30"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{node.actor}</div><div className="mt-1 text-sm leading-5 text-slate-600">{node.title}</div></div><div className="flex shrink-0 flex-col items-end gap-1"><StatusBadge status={node.status}/><span className="text-xs text-slate-400">{node.time}</span></div></div><div className="mt-2 flex justify-end text-slate-400"><Icon name={open ? 'Up' : 'Down'} /></div></button>{open && <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"><div className="mb-2"><span className="font-semibold text-slate-800">输入摘要：</span>{node.input}</div><div className="mb-2"><span className="font-semibold text-slate-800">输出摘要：</span>{node.output}</div>{node.artifacts.length > 0 && <div><span className="font-semibold text-slate-800">关联产物：</span><div className="mt-2 flex flex-wrap gap-2">{node.artifacts.map(a=><span key={a} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-blue-700">{a}</span>)}</div></div>}</div>}</div>
}

function EvidencePanel({ open, setOpen }) {
  const [activeTab, setActiveTab] = useState('执行链路')
  const [openNode, setOpenNode] = useState('material-generate')
  const [selectedClaim, setSelectedClaim] = useState(claims[0])
  const [rawExpanded, setRawExpanded] = useState(false)
  const tabs = ['执行链路', '来源追溯', '原始执行引用']
  if (!open) return <aside className="flex h-screen w-14 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-4"><button onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100"><Icon name="Shield"/></button><div className="mt-3 h-2 w-2 rounded-full bg-blue-500"/><div className="mt-4 rotate-90 whitespace-nowrap text-xs font-medium text-slate-500">可信面板 · 实时追踪</div><button onClick={() => setOpen(true)} className="mt-auto rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><Icon name="Left"/></button></aside>
  return <aside className="flex h-screen w-[460px] shrink-0 flex-col border-l border-slate-200 bg-white"><div className="border-b border-slate-200 p-5"><div className="flex items-center justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">可信面板</h2><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">实时追踪</span></div><p className="mt-2 text-sm leading-5 text-slate-500">实时展示本次任务的执行链路、过程产物、来源追溯和原始执行引用。</p></div><div className="flex shrink-0 items-center gap-1 text-slate-500"><button className="rounded-lg p-1.5 hover:bg-slate-100"><Icon name="Pin"/></button><button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-slate-100"><Icon name="Right"/></button><button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-slate-100"><Icon name="Close"/></button></div></div><div className="mt-4 flex gap-4 overflow-x-auto border-b border-slate-100 text-sm">{tabs.map(tab=><button key={tab} onClick={()=>setActiveTab(tab)} className={`shrink-0 border-b-2 pb-3 font-medium ${activeTab===tab?'border-blue-600 text-blue-700':'border-transparent text-slate-500 hover:text-slate-900'}`}>{tab}</button>)}</div></div><div className="flex-1 overflow-y-auto p-5">
    {activeTab === '执行链路' && <div className="space-y-5"><div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-900"><Icon name="Shield"/>执行视图</div><div className="text-sm leading-6 text-blue-900/80">将协同链路、调度摘要和过程产物合并展示，按任务执行顺序组织，避免业务用户在多个 Tab 之间来回切换。</div></div><section><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">1. 协同执行链路</h3><span className="text-xs text-slate-400">实时更新</span></div><div className="space-y-4">{timeline.map(node=><TimelineNode key={node.id} node={node} open={openNode===node.id} onToggle={()=>setOpenNode(openNode===node.id?'':node.id)}/>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">2. 调度摘要</h3><span className="text-xs text-slate-400">非原始思维链</span></div><div className="space-y-3">{dispatchSummary.map(([k,v])=><div key={k} className="rounded-xl bg-slate-50 p-3"><div className="mb-1 text-xs font-semibold text-slate-500">{k}</div><div className="text-sm leading-6 text-slate-700">{v}</div></div>)}</div><div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-800">仅展示可审计的调度摘要，不展示模型原始思维链。</div></section><section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">3. 过程产物</h3><button className="text-xs font-medium text-blue-600">查看全部</button></div><div className="space-y-3">{artifactFiles.map(([name,desc,status])=><div key={name} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="mb-2 flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Icon name="File" className="h-4 w-4 shrink-0 text-blue-600"/><div className="truncate text-sm font-semibold">{name}</div></div><StatusBadge status={status}/></div><div className="text-xs leading-5 text-slate-600">{desc}</div><div className="mt-3 flex gap-2"><button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">摘要</button><button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">JSON</button><button onClick={()=>setActiveTab('来源追溯')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">关联来源</button></div></div>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">4. 实时事件</h3><button className="text-xs font-medium text-blue-600">查看全部</button></div><div className="space-y-3">{events.map(([time,text,status])=><div key={text} className="flex items-center gap-3 text-sm"><span className="w-10 shrink-0 text-slate-400">{time}</span><span className="min-w-0 flex-1 truncate text-slate-700">{text}</span><StatusBadge status={status}/></div>)}</div></section></div>}
    {activeTab === '来源追溯' && <div className="grid grid-cols-[160px_1fr] gap-4"><div className="space-y-2">{claims.map((claim,idx)=><button key={claim.id} onClick={()=>setSelectedClaim(claim)} className={`w-full rounded-xl border p-3 text-left ${selectedClaim.id===claim.id?'border-blue-300 bg-blue-50 shadow-sm':'border-slate-200 bg-white hover:bg-slate-50'}`}><div className="mb-2 text-xs font-semibold text-slate-500">结论 {idx+1}</div><div className="text-sm leading-5 text-slate-900">{claim.title}</div><div className="mt-2"><StatusBadge status={claim.confidence==='High'?'completed':'waiting_for_input'} label={claim.confidence}/></div></button>)}</div><div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">结论详情</h3><Icon name="Up" className="text-slate-400"/></div><div className="rounded-xl bg-slate-50 p-3 text-sm leading-6">{selectedClaim.title}</div><div className="mt-4 grid gap-4 text-sm"><div><div className="mb-1 font-semibold">置信度</div><StatusBadge status={selectedClaim.confidence==='High'?'completed':'waiting_for_input'} label={selectedClaim.confidence}/></div><div><div className="mb-1 font-semibold">生成链路</div><div className="space-y-1 text-slate-600">{selectedClaim.path.map((p,i)=><div key={p}>{i>0?'→ ':''}{p}</div>)}</div></div><div><div className="mb-1 font-semibold">来源</div><ul className="list-disc space-y-1 pl-5 text-slate-600">{selectedClaim.source.map(s=><li key={s}>{s}</li>)}</ul></div><div><div className="mb-1 font-semibold">证据摘要</div><div className="leading-6 text-slate-600">{selectedClaim.summary}</div></div><div><div className="mb-2 font-semibold">关联中间产物</div><div className="flex flex-wrap gap-2">{selectedClaim.artifacts.map(a=><span key={a} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-blue-700">{a}</span>)}</div></div><div className="border-t border-slate-100 pt-3"><button onClick={()=>setRawExpanded(!rawExpanded)} className="flex w-full items-center justify-between text-sm font-semibold">原始执行引用（节选）<Icon name={rawExpanded?'Up':'Down'}/></button>{rawExpanded&&<div className="mt-3 space-y-2 rounded-xl bg-slate-950 p-3 font-mono text-xs text-slate-100"><div>Supervisor Run ID: run_gd8a7f2b</div><div>SubAgent Job ID: job_2c4e1f9b</div><div>MaterialAssetAgent Run ID: run_b7a3e8c1</div></div>}<div className="mt-3 flex gap-2"><button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">复制引用</button><button className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">查看完整引用</button></div></div></div></div></div>}
    {activeTab === '原始执行引用' && <div className="space-y-4"><div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center gap-2 font-semibold"><Icon name="Clock"/>DeepAgents / LangGraph 原始引用</div><div className="space-y-3 text-sm">{[['Supervisor Thread ID','thread_xxx'],['Supervisor Run ID','run_xxx'],['SubAgent Job ID','job_xxx'],['SubAgent Graph ID','material_asset_agent'],['SubAgent Thread ID','thread_xxx'],['SubAgent Run ID','run_xxx']].map(([k,v])=><div key={k} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"><span className="text-slate-500">{k}</span><span className="font-mono text-xs">{v}</span></div>)}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-2 font-semibold">状态来源</div><ul className="list-disc space-y-1 pl-5 text-sm text-slate-600"><li>DeepAgents async_subagent_jobs state</li><li>LangGraph run state</li><li>LangGraph thread messages</li><li>MaterialAssetAgent output artifacts</li></ul></div><div className="flex gap-2"><button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">复制引用</button><button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">查看原始状态</button><button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">查看运行消息</button></div><div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">该区域用于审计和调试，不作为业务操作入口。</div></div>}
  </div></aside>
}

export default function App() {
  const [panelOpen, setPanelOpen] = useState(true)
  return <div className="flex h-screen w-full overflow-hidden bg-[#F8FAFC] text-slate-900"><LeftNav/><MainWorkspace panelOpen={panelOpen} setPanelOpen={setPanelOpen}/><EvidencePanel open={panelOpen} setOpen={setPanelOpen}/></div>
}
