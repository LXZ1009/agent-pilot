import {
  Bot,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Loader2,
  MessageSquareText,
  Play,
  RefreshCw,
  Send,
  Settings2,
  UserRound,
  Workflow,
  XCircle
} from 'lucide-react';
import { FormEvent, ReactNode, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  Interviewee,
  MeetingContext,
  PricingMeetingRun,
  buildPricingMeetingRunCreatePayload,
  continuePricingMeetingRun,
  createPricingMeetingRun
} from './api';
import {
  COMMAND_TEMPLATES,
  WorkspaceCardView,
  WorkspaceMessage,
  actionPrompt,
  buildErrorMessage,
  buildUserMessage,
  buildWorkspaceView,
  defaultInterviewees,
  defaultMeetingContext
} from './workspace';

function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function statusText(status: string): string {
  if (status === 'idle') return '待开始';
  if (status === 'running') return '运行中';
  if (status === 'waiting_for_input') return '等待补充';
  if (status === 'completed') return '已完成';
  if (status === 'error') return '异常';
  return status;
}

function statusIcon(status: string | undefined): ReactNode {
  if (status === 'completed' || status === 'ready' || status === 'confirmed') return <CheckCircle2 size={16} />;
  if (status === 'error' || status === 'failed') return <XCircle size={16} />;
  if (status === 'running') return <Loader2 size={16} className="spin" />;
  return <RefreshCw size={16} />;
}

function messageIcon(message: WorkspaceMessage): ReactNode {
  if (message.role === 'user') return <UserRound size={18} />;
  if (message.role === 'system') return <XCircle size={18} />;
  return <Bot size={18} />;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function localizeError(message: string): string {
  if (message.includes('OPENAI_API_KEY is required')) return '缺少 OPENAI_API_KEY，请在后端 .env 中配置后重启服务。';
  if (message.includes('Failed to fetch')) return '无法连接后端 API，请确认 FastAPI 已启动并且 Vite 代理配置正确。';
  return message;
}

export default function App() {
  const [meetingContext, setMeetingContext] = useState<Partial<MeetingContext>>(defaultMeetingContext());
  const [interviewees] = useState<Interviewee[]>(defaultInterviewees());
  const [pricingRun, setPricingRun] = useState<PricingMeetingRun | null>(null);
  const [localMessages, setLocalMessages] = useState<WorkspaceMessage[]>([]);
  const [composer, setComposer] = useState(COMMAND_TEMPLATES[0].prompt);
  const [loading, setLoading] = useState(false);
  const [rightTab, setRightTab] = useState<'context' | 'execution' | 'artifacts' | 'debug'>('context');
  const [selectedCard, setSelectedCard] = useState<WorkspaceCardView | null>(null);

  const view = useMemo(
    () => buildWorkspaceView(pricingRun, meetingContext, interviewees, localMessages),
    [interviewees, localMessages, meetingContext, pricingRun]
  );

  async function sendPrompt(prompt: string) {
    const content = prompt.trim();
    if (!content || loading) return;

    const userMessage = buildUserMessage(content);
    setLocalMessages((current) => [...current, userMessage]);
    setComposer('');
    setLoading(true);

    try {
      const run = pricingRun
        ? await continuePricingMeetingRun(pricingRun.run_id, { content })
        : await createPricingMeetingRun(
            buildPricingMeetingRunCreatePayload(content, meetingContext, interviewees)
          );
      setPricingRun(run);
      setLocalMessages([]);
    } catch (err) {
      setLocalMessages((current) => [
        ...current,
        buildErrorMessage(localizeError(err instanceof Error ? err.message : '执行失败'))
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendPrompt(composer);
  }

  function applyTemplate(prompt: string) {
    setComposer(prompt);
  }

  async function runCardAction(action: string, card?: WorkspaceCardView) {
    await sendPrompt(actionPrompt(action, card));
  }

  return (
    <main className="workspace-shell">
      <aside className="session-sidebar">
        <div className="brand">
          <Boxes size={24} />
          <div>
            <strong>Agent Pilot</strong>
            <span>多 Agent 协同工作区</span>
          </div>
        </div>

        <section className="panel compact-panel">
          <span className="label">当前验证场景</span>
          <h2>{view.scenarioLabel}</h2>
          <p>{view.title}</p>
          <div className={`status-pill ${view.status}`}>{statusIcon(view.status)}{statusText(view.status)}</div>
        </section>

        <section className="panel">
          <span className="label">快捷模板</span>
          <div className="template-list">
            {COMMAND_TEMPLATES.map((template) => (
              <button key={template.id} type="button" onClick={() => applyTemplate(template.prompt)}>
                <strong>{template.label}</strong>
                <small>{template.description}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="panel compact-panel">
          <span className="label">工作区原则</span>
          <ul className="plain-list">
            <li>用户只和主 Agent 交互</li>
            <li>子 Agent 只为主 Agent 工作</li>
            <li>同步任务进入主回复</li>
            <li>异步任务进入执行详情</li>
          </ul>
        </section>
      </aside>

      <section className="conversation-area">
        <header className="workspace-header">
          <div>
            <span className="label">统一问答工作区</span>
            <h1>{view.title}</h1>
            <p>所有任务都从这里发起、补充和确认；主 Agent 负责汇总子 Agent 的工作结果。</p>
          </div>
          <div className="stage-card">
            <span>当前阶段</span>
            <strong>{view.currentStage}</strong>
          </div>
        </header>

        <div className="conversation-scroll">
          {view.messages.length === 0 && (
            <div className="empty-state">
              <MessageSquareText size={42} />
              <h2>从一个业务问题开始</h2>
              <p>例如：开始华东大区定价会的会前访谈，先访谈张三。</p>
            </div>
          )}

          {view.messages.map((message) => (
            <article key={message.id} className={`message-card ${message.role}`}>
              <div className="message-avatar">{messageIcon(message)}</div>
              <div className="message-content">
                <header>
                  <strong>{message.actor}</strong>
                  <small>{message.createdAt}</small>
                </header>
                <Markdown content={message.content} />
                {message.cards.length > 0 && (
                  <div className="card-grid">
                    {message.cards.map((card) => (
                      <BusinessCard
                        key={card.id}
                        card={card}
                        onSelect={() => setSelectedCard(card)}
                        onAction={(action) => runCardAction(action, card)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={onSubmit}>
          <textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            placeholder="直接输入任务、访谈回复或补充信息，例如：张三回复：..."
            rows={3}
          />
          <button type="submit" disabled={loading || !composer.trim()}>
            {loading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            <span>{loading ? '处理中' : '发送'}</span>
          </button>
        </form>
      </section>

      <aside className="right-panel">
        <div className="tabs">
          <button className={rightTab === 'context' ? 'active' : ''} type="button" onClick={() => setRightTab('context')}>上下文</button>
          <button className={rightTab === 'execution' ? 'active' : ''} type="button" onClick={() => setRightTab('execution')}>执行链路</button>
          <button className={rightTab === 'artifacts' ? 'active' : ''} type="button" onClick={() => setRightTab('artifacts')}>产物</button>
          <button className={rightTab === 'debug' ? 'active' : ''} type="button" onClick={() => setRightTab('debug')}>调试</button>
        </div>

        {rightTab === 'context' && (
          <section className="panel right-section">
            <span className="label">业务上下文</span>
            <dl className="context-list">
              <div><dt>会议</dt><dd>{view.context.title}</dd></div>
              <div><dt>时间</dt><dd>{view.context.scheduledStart}</dd></div>
              <div><dt>主持人</dt><dd>{view.context.hostName}</dd></div>
              <div><dt>主题</dt><dd>{view.context.topic}</dd></div>
            </dl>
            <span className="label spaced">访谈对象</span>
            {view.context.interviewees.map((item) => (
              <div className="person-item" key={item.interviewee_id ?? item.name}>
                <UserRound size={16} />
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.role} · {item.region}</small>
                </div>
              </div>
            ))}
          </section>
        )}

        {rightTab === 'execution' && (
          <section className="panel right-section">
            <span className="label">Agent 执行透明层</span>
            <div className="agent-stack">
              <div className="agent-node active"><Bot size={16} /><span>PricingMeetingAgent</span><em>用户交互入口</em></div>
              <div className="agent-node"><Workflow size={16} /><span>PreMeetingInterviewAgent</span><em>同步专项工作</em></div>
              <div className="agent-node"><Workflow size={16} /><span>MaterialAssetAgent</span><em>异步长任务</em></div>
            </div>
            <span className="label spaced">异步 Jobs</span>
            {view.jobs.length > 0 ? (
              <ol className="job-list">
                {view.jobs.map((job) => (
                  <li key={job.job_id}>
                    <strong>{job.agent}</strong>
                    <small>{job.status} · {job.job_id}</small>
                    <p>{job.summary}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">当前没有后台异步任务。同步子 Agent 的结果会被主 Agent 汇总到对话中。</p>
            )}
          </section>
        )}

        {rightTab === 'artifacts' && (
          <section className="panel right-section">
            <span className="label">业务产物</span>
            {[...view.cards, ...view.artifacts].length > 0 ? (
              <div className="artifact-list">
                {[...view.cards, ...view.artifacts].map((card) => (
                  <button type="button" key={card.id} onClick={() => setSelectedCard(card)}>
                    <FileText size={16} />
                    <span>{card.title}</span>
                    <em>{card.status ?? '-'}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted">主 Agent 汇总出访谈问题、追问建议或物料后，会在这里沉淀为业务产物。</p>
            )}
            {selectedCard && (
              <div className="selected-card-detail">
                <h3>{selectedCard.title}</h3>
                <pre>{prettyJson(selectedCard.data ?? selectedCard)}</pre>
              </div>
            )}
          </section>
        )}

        {rightTab === 'debug' && (
          <section className="panel right-section">
            <span className="label">Raw Run JSON</span>
            <pre className="raw-json">{prettyJson(view.rawRun ?? { status: 'idle' })}</pre>
          </section>
        )}
      </aside>
    </main>
  );
}

function BusinessCard({
  card,
  onSelect,
  onAction
}: {
  card: WorkspaceCardView;
  onSelect: () => void;
  onAction: (action: string) => void;
}) {
  return (
    <div className="business-card">
      <header>
        <div>
          <span>{card.type}</span>
          <h3>{card.title}</h3>
        </div>
        {card.status && <em>{card.status}</em>}
      </header>
      {card.summary && <p>{card.summary}</p>}
      {card.questions.length > 0 && (
        <section>
          <strong><ClipboardList size={15} /> 访谈/处理问题</strong>
          <ol>{card.questions.map((item) => <li key={item}>{item}</li>)}</ol>
        </section>
      )}
      {card.missingFields.length > 0 && (
        <section>
          <strong>仍缺失</strong>
          <ul>{card.missingFields.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      )}
      {card.nextActions.length > 0 && (
        <section>
          <strong>下一步</strong>
          <ul>{card.nextActions.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      )}
      <footer>
        <button type="button" onClick={onSelect}><Settings2 size={15} />详情</button>
        <button type="button" onClick={() => onAction('followup')}><ChevronRight size={15} />继续追问</button>
        <button type="button" onClick={() => onAction('confirm-interview')}><Play size={15} />确认推进</button>
      </footer>
    </div>
  );
}
