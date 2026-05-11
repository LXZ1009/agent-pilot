import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Eye,
  ExternalLink,
  FileText,
  Play,
  RefreshCw,
  Search,
  Square,
  X,
  XCircle
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  AgentInfo,
  AgentName,
  AgentTask,
  EventRecord,
  ReportFileInfo,
  RunRecord,
  buildCreateRunPayload,
  cancelTask,
  createRun,
  getEvents,
  getRun,
  getRunReport,
  listAgents,
  reportContentUrl,
  summarizeRun
} from './api';

const SAMPLE_PROMPT =
  '请基于最新期间分析整体财务表现、往来账龄风险和合作伙伴余额情况，输出综合经营分析报告。';

const AGENT_LABELS: Record<AgentName, string> = {
  main_metric_agent: '财务主指标',
  partner_aging_agent: '往来账龄',
  partner_balance_agent: '往来余额',
  finance_report_agent: '综合报告'
};

const AGENT_TABLES: Record<AgentName, string> = {
  main_metric_agent: 'ods_fin_main_metric_raw',
  partner_aging_agent: 'ods_fin_partner_aging_raw',
  partner_balance_agent: 'ods_fin_partner_balance_raw',
  finance_report_agent: '综合分析'
};

const STATUS_LABELS: Record<AgentTask['status'], string> = {
  queued: '等待中',
  running: '分析中',
  succeeded: '已完成',
  cancelled: '已取消',
  error: '失败'
};

function statusIcon(status: AgentTask['status']) {
  if (status === 'succeeded') return <CheckCircle2 size={17} />;
  if (status === 'error') return <AlertTriangle size={17} />;
  if (status === 'cancelled') return <XCircle size={17} />;
  if (status === 'running') return <RefreshCw size={17} className="spin" />;
  return <Clock3 size={17} />;
}

function formatTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatBytes(value: number | null): string {
  if (value === null) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getAnswerTask(run: RunRecord | null): AgentTask | null {
  if (!run) return null;
  return run.tasks.find((task) => task.agent === 'finance_report_agent') ?? null;
}

function getAnswerText(run: RunRecord | null): string {
  const answerTask = getAnswerTask(run);
  if (!run || !answerTask) {
    return '输入一个财务问题，系统会调用对应业务域子代理查询真实数据，并在这里生成综合回答。';
  }
  if (answerTask.error) return localizeMessage(answerTask.error);
  if (answerTask.result) return answerTask.result;
  if (run.tasks.some((task) => task.status === 'running' || task.status === 'queued')) {
    return '正在调度业务域子代理查询数据，综合报告生成后会显示在这里。';
  }
  return '暂无回答结果。';
}

function getAnswerState(run: RunRecord | null): AgentTask['status'] | 'empty' {
  const answerTask = getAnswerTask(run);
  if (!answerTask) return 'empty';
  return answerTask.status;
}

function latestTaskEvent(events: EventRecord[], task: AgentTask): EventRecord | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.task_id === task.task_id || event.agent === task.agent) {
      return event;
    }
  }
  return null;
}

function localizeMessage(message: string): string {
  if (message.includes('OPENAI_API_KEY is required')) {
    return '缺少 OPENAI_API_KEY，当前无法发起真实 OpenAI 模型请求。请在 .env 中配置后重启后端。';
  }
  if (message.includes('DeepAgents run created')) return '已创建问数任务。';
  if (message.includes('delegated through DeepAgents')) return '已交给 DeepAgents 子代理执行。';
  if (message.includes('completed via DeepAgents')) return '子代理分析已完成。';
  if (message.includes('failed:')) return message.replace('failed:', '执行失败：');
  return message;
}

export default function App() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<AgentName[]>([
    'main_metric_agent',
    'partner_aging_agent',
    'partner_balance_agent'
  ]);
  const [message, setMessage] = useState(SAMPLE_PROMPT);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportInfo, setReportInfo] = useState<ReportFileInfo | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportVersion, setReportVersion] = useState(Date.now());
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);

  const summary = useMemo(() => (run ? summarizeRun(run) : null), [run]);
  const answerText = useMemo(() => getAnswerText(run), [run]);
  const answerState = useMemo(() => getAnswerState(run), [run]);
  const reportUrl = useMemo(
    () => (reportInfo ? reportContentUrl(reportInfo, reportVersion) : null),
    [reportInfo, reportVersion]
  );
  const selectableAgents = agents.filter((agent) => agent.name !== 'finance_report_agent');
  const canCancel = run?.tasks.some((task) => ['queued', 'running'].includes(task.status)) ?? false;

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((err: Error) => setError(localizeMessage(err.message)));
  }, []);

  useEffect(() => {
    if (!run) {
      setReportInfo(null);
      setReportPreviewOpen(false);
      return;
    }
    refreshReportFile(run.run_id);
  }, [run?.run_id]);

  useEffect(() => {
    if (!run) return undefined;
    const interval = window.setInterval(() => {
      refreshRun(run.run_id);
    }, 1200);
    return () => window.clearInterval(interval);
  }, [run?.run_id]);

  useEffect(() => {
    if (answerState === 'succeeded') {
      refreshReportFile(run?.run_id);
    }
  }, [answerState, run?.updated_at]);

  async function refreshRun(runId = run?.run_id) {
    if (!runId) return;
    try {
      const [freshRun, freshEvents] = await Promise.all([getRun(runId), getEvents(runId)]);
      setRun(freshRun);
      setEvents(freshEvents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? localizeMessage(err.message) : '刷新运行状态失败');
    }
  }

  async function refreshReportFile(runId = run?.run_id) {
    if (!runId) return;
    setReportLoading(true);
    try {
      const info = await getRunReport(runId);
      setReportInfo(info);
      setReportVersion(Date.now());
      setReportError(null);
    } catch (err) {
      setReportError(err instanceof Error ? localizeMessage(err.message) : '刷新报告文件失败');
    } finally {
      setReportLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setReportInfo(null);
      setReportPreviewOpen(false);
      const created = await createRun(buildCreateRunPayload(message, selectedAgents));
      setRun(created);
      setEvents(created.events);
    } catch (err) {
      setError(err instanceof Error ? localizeMessage(err.message) : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  function toggleAgent(agent: AgentName) {
    setSelectedAgents((current) =>
      current.includes(agent) ? current.filter((item) => item !== agent) : [...current, agent]
    );
  }

  async function cancelActiveTasks() {
    if (!run) return;
    const activeTasks = run.tasks.filter((task) => ['queued', 'running'].includes(task.status));
    await Promise.all(activeTasks.map((task) => cancelTask(task.run_id, task.task_id)));
    await refreshRun(run.run_id);
  }

  return (
    <main className="app-shell">
      <section className="ask-panel">
        <div className="brand-block">
          <span className="eyebrow">财务问数助手</span>
          <h1>多Agent架构</h1>
        </div>

        <form onSubmit={handleSubmit} className="question-form">
          <label htmlFor="message">你的问题</label>
          <textarea
            id="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={9}
            placeholder="例如：请分析最新期间收入、利润、现金流与往来账龄风险。"
          />

          <div className="agent-selector" aria-label="选择参与分析的业务域">
            <span>选择数据域</span>
            <div>
              {selectableAgents.map((agent) => (
                <button
                  type="button"
                  key={agent.name}
                  className={
                    selectedAgents.includes(agent.name) ? 'agent-toggle selected' : 'agent-toggle'
                  }
                  onClick={() => toggleAgent(agent.name)}
                  title={agent.description}
                >
                  <BarChart3 size={16} aria-hidden="true" />
                  {AGENT_LABELS[agent.name]}
                </button>
              ))}
            </div>
          </div>

          <button className="primary-action" disabled={loading || !message.trim()} type="submit">
            <Play size={18} aria-hidden="true" />
            <span>{loading ? '正在提交' : '开始问数'}</span>
          </button>
        </form>

        {error && <div className="error-line">{error}</div>}
      </section>

      <section className={`answer-panel answer-${answerState}`}>
        <div className="answer-toolbar">
          <div>
            <span className="eyebrow">综合回答</span>
            <h2>{run ? '基于子代理的分析结果' : '等待提问'}</h2>
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="icon-button"
              title="刷新回答"
              disabled={!run}
              onClick={() => refreshRun()}
            >
              <RefreshCw size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button danger"
              title="停止当前分析"
              disabled={!canCancel}
              onClick={cancelActiveTasks}
            >
              <Square size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        {run && (
          <div className="answer-meta">
            <span>运行编号：{run.run_id}</span>
            <span>问题：{run.message}</span>
          </div>
        )}

        {run && (
          <section className="execution-strip" aria-label="子代理执行情况">
            <div className="execution-heading">
              <div>
                <span className="eyebrow">执行情况</span>
                <h3>子代理链路</h3>
              </div>
              {summary && (
                <span className="execution-summary">
                  {summary.running > 0 ? '执行中' : '当前状态'} · 完成 {summary.succeeded} /{' '}
                  {run.tasks.length}
                </span>
              )}
            </div>

            <div className="execution-grid">
              {run.tasks.map((task) => {
                const event = latestTaskEvent(events, task);
                return (
                  <article className={`execution-step execution-${task.status}`} key={task.task_id}>
                    <div className="execution-step-top">
                      <strong>{AGENT_LABELS[task.agent]}</strong>
                      <span className="status-pill compact">
                        {statusIcon(task.status)}
                        {STATUS_LABELS[task.status]}
                      </span>
                    </div>
                    <span className="execution-source">
                      {task.analysis?.table_name ?? AGENT_TABLES[task.agent]}
                    </span>
                    <div className="progress-track" aria-hidden="true">
                      <span style={{ width: `${task.progress}%` }} />
                    </div>
                    <p>{localizeMessage(event?.message ?? '等待调度器更新状态')}</p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <article className="answer-card">
          <header>
            <span className="answer-state">
              {answerState === 'empty' ? <Search size={18} /> : statusIcon(answerState)}
              {answerState === 'empty' ? '可提问' : STATUS_LABELS[answerState]}
            </span>
            {summary && (
              <span>
                已完成 {summary.succeeded} / {run?.tasks.length ?? 0}，失败 {summary.error}
              </span>
            )}
          </header>
          <div className="markdown-report">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{answerText}</ReactMarkdown>
          </div>
        </article>
      </section>

      <aside className="side-panel">
        <section className="domain-panel">
          <div className="side-heading">
            <span className="eyebrow">业务域状态</span>
            <h2>子代理</h2>
          </div>
          <div className="domain-list">
            {(run?.tasks ?? [])
              .filter((task) => task.agent !== 'finance_report_agent')
              .map((task) => (
                <article className={`domain-item domain-${task.status}`} key={task.task_id}>
                  <div>
                    <strong>{AGENT_LABELS[task.agent]}</strong>
                    <span>{task.analysis?.table_name ?? AGENT_TABLES[task.agent]}</span>
                  </div>
                  <span className="status-pill">
                    {statusIcon(task.status)}
                    {STATUS_LABELS[task.status]}
                  </span>
                </article>
              ))}
            {!run && <p className="muted-text">提交问题后，这里只显示必要的业务域进度。</p>}
          </div>
        </section>

        <section className="artifact-panel">
          <div className="side-heading">
            <span className="eyebrow">产物</span>
            <h2>报告</h2>
          </div>

          <article className={reportInfo?.exists ? 'artifact-item ready' : 'artifact-item'}>
            <div className="artifact-file-icon">
              <FileText size={20} aria-hidden="true" />
            </div>
            <div className="artifact-body">
              <strong>{reportInfo?.name ?? 'financial-report.html'}</strong>
              <span>
                {reportInfo?.exists ? '已生成' : run ? '等待生成' : '暂无运行'} ·{' '}
                {formatBytes(reportInfo?.size_bytes ?? null)} ·{' '}
                {formatDateTime(reportInfo?.modified_at ?? null)}
              </span>
              <small title={reportInfo?.display_path || run?.report_path || ''}>
                {reportInfo?.display_path || run?.report_path || '提交问题后生成报告产物'}
              </small>
            </div>
          </article>

          <div className="artifact-actions">
            <button
              type="button"
              className="text-action"
              disabled={!reportUrl}
              onClick={() => setReportPreviewOpen(true)}
            >
              <Eye size={16} aria-hidden="true" />
              预览
            </button>
            {reportUrl && (
              <a className="text-action" href={reportUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} aria-hidden="true" />
                打开
              </a>
            )}
            <button
              type="button"
              className="icon-button compact"
              title="刷新产物"
              onClick={() => refreshReportFile()}
              disabled={!run || reportLoading}
            >
              <RefreshCw size={16} className={reportLoading ? 'spin' : undefined} />
            </button>
          </div>

          {reportError && <div className="error-line compact">{reportError}</div>}
        </section>

        <section className="event-panel">
          <div className="side-heading">
            <span className="eyebrow">最近事件</span>
            <h2>{events.length}</h2>
          </div>
          <ol className="event-list">
            {events.slice(-6).map((event) => (
              <li key={event.event_id}>
                <time>{formatTime(event.created_at)}</time>
                <span>{event.agent ? AGENT_LABELS[event.agent] : '调度器'}</span>
                <p>{localizeMessage(event.message)}</p>
              </li>
            ))}
          </ol>
        </section>
      </aside>

      {reportPreviewOpen && reportUrl && (
        <div className="report-preview-shell" role="dialog" aria-modal="true" aria-label="Kami 报告预览">
          <button
            type="button"
            className="report-preview-backdrop"
            aria-label="关闭报告预览"
            onClick={() => setReportPreviewOpen(false)}
          />
          <section className="report-preview-drawer">
            <header>
              <div>
                <span className="eyebrow">产物预览</span>
                <h2>{reportInfo?.name ?? 'financial-report.html'}</h2>
              </div>
              <div className="toolbar-actions">
                <a className="icon-button" href={reportUrl} target="_blank" rel="noreferrer" title="新窗口打开">
                  <ExternalLink size={18} aria-hidden="true" />
                </a>
                <button
                  type="button"
                  className="icon-button"
                  title="关闭预览"
                  onClick={() => setReportPreviewOpen(false)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            </header>
            <div className="preview-report-meta">
              <span>{reportInfo?.display_path}</span>
              <span>{formatBytes(reportInfo?.size_bytes ?? null)}</span>
              <span>{formatDateTime(reportInfo?.modified_at ?? null)}</span>
            </div>
            <iframe
              className="report-preview-frame"
              src={reportUrl}
              title="Kami HTML 财务分析报告"
              sandbox=""
            />
          </section>
        </div>
      )}
    </main>
  );
}
