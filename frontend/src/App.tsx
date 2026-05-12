import {
  AlertTriangle,
  Bot,
  Box,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  FileJson,
  MessageSquareText,
  RefreshCw,
  Send,
  TerminalSquare,
  UserRound,
  Workflow
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
  TimelineBlock,
  buildArtifactBlocks,
  buildErrorBlock,
  buildTimelineFromPricingRun,
  buildUserCommandBlock,
  parseWorkbenchCommand
} from './workbench';

interface WorkbenchContextState {
  meetingId: string;
  task: string;
  meetingTitle: string;
  scheduledStart: string;
  hostName: string;
  businessTopic: string;
  intervieweesText: string;
}

const INITIAL_CONTEXT: WorkbenchContextState = {
  meetingId: 'meeting_20260511_001',
  task: '15:30 每日会前访谈',
  meetingTitle: '华东大区定价会',
  scheduledStart: '2026-05-11 15:30',
  hostName: '主持人A',
  businessTopic: '重点客户价格策略与风险提示',
  intervieweesText: 'u1,张三,大区负责人,华东大区'
};

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function parseInterviewees(text: string): Interviewee[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [id, name, role, region] = line.split(',').map((part) => part.trim());
      return {
        interviewee_id: id || `u${index + 1}`,
        name: name || id || `访谈人${index + 1}`,
        role: role || '访谈对象',
        region: region || ''
      };
    });
}

function buildMeetingContext(context: WorkbenchContextState): Partial<MeetingContext> {
  return {
    meeting_id: context.meetingId,
    meeting_title: context.meetingTitle,
    scheduled_start: context.scheduledStart,
    host_name: context.hostName,
    business_topic: context.businessTopic,
    source: 'transparent_agent_workbench',
    business_payload: {
      trigger: 'command_composer',
      expected_flow:
        'PricingMeetingAgent receives command intent, then coordinates interview, material and preview agents.'
    }
  };
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function localizeError(message: string): string {
  if (message.includes('OPENAI_API_KEY is required')) {
    return '缺少 OPENAI_API_KEY，当前无法发起真实模型请求。请在 .env 中配置后重启后端。';
  }
  return message;
}

function blockIcon(block: TimelineBlock): ReactNode {
  if (block.type === 'user_command' || block.type === 'interview_reply') return <UserRound size={18} />;
  if (block.type === 'artifact') return <FileJson size={18} />;
  if (block.type === 'async_job') return <Workflow size={18} />;
  if (block.type === 'error') return <AlertTriangle size={18} />;
  return <Bot size={18} />;
}

function statusIcon(status: string | undefined) {
  if (status === 'completed' || status === 'succeeded') return <CheckCircle2 size={16} />;
  if (status === 'error' || status === 'failed') return <AlertTriangle size={16} />;
  if (status === 'running' || status === 'in_progress') return <RefreshCw size={16} className="spin" />;
  return <Clock3 size={16} />;
}

function sessionStatusText(status: string): string {
  if (status === 'completed') return '完成';
  if (status === 'error') return '异常';
  if (status === 'running') return '运行中';
  return '等待回复';
}

function resolveArtifactTitle(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'artifact';
  const record = value as Record<string, unknown>;
  return String(record.asset_package_id ?? record.title ?? record.preview_id ?? 'artifact');
}

export default function App() {
  const [context, setContext] = useState<WorkbenchContextState>(INITIAL_CONTEXT);
  const [pricingRun, setPricingRun] = useState<PricingMeetingRun | null>(null);
  const [assetPackage, setAssetPackage] = useState<Record<string, unknown> | null>(null);
  const [previewCard, setPreviewCard] = useState<Record<string, unknown> | null>(null);
  const [userBlocks, setUserBlocks] = useState<TimelineBlock[]>([]);
  const [errorBlocks, setErrorBlocks] = useState<TimelineBlock[]>([]);
  const [composer, setComposer] = useState('/prepare meeting_20260511_001 @张三');
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const meetingContext = useMemo(() => buildMeetingContext(context), [context]);
  const interviewees = useMemo(() => parseInterviewees(context.intervieweesText), [context.intervieweesText]);
  const runEventBlocks = useMemo<TimelineBlock[]>(
    () => (pricingRun ? buildTimelineFromPricingRun(pricingRun) : []),
    [pricingRun]
  );
  const runBlocks = useMemo(
    () => [
      ...runEventBlocks,
      ...buildArtifactBlocks(assetPackage, previewCard),
      ...errorBlocks
    ],
    [assetPackage, errorBlocks, previewCard, runEventBlocks]
  );
  const timelineBlocks = useMemo(() => [...userBlocks, ...runBlocks], [runBlocks, userBlocks]);
  const selectedBlock = timelineBlocks.find((block) => block.id === selectedBlockId) ?? timelineBlocks.at(-1) ?? null;

  function updateContext<Key extends keyof WorkbenchContextState>(key: Key, value: WorkbenchContextState[Key]) {
    setContext((current) => ({ ...current, [key]: value }));
  }

  function pushError(message: string) {
    setErrorBlocks((current) => [...current, buildErrorBlock(localizeError(message))]);
  }

  function applyPricingRun(run: PricingMeetingRun) {
    setPricingRun(run);
    setAssetPackage(run.asset_package);
    setPreviewCard(run.preview_card);
    setErrorBlocks([]);
    setActiveTarget(run.blocked_by[0] ?? null);
  }

  async function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawCommand = composer.trim();
    if (!rawCommand || loading) return;

    const parsed = parseWorkbenchCommand(rawCommand);
    const userBlock = buildUserCommandBlock(rawCommand);
    setUserBlocks((current) => [...current, userBlock]);
    setSelectedBlockId(userBlock.id);
    setComposer('');
    setLoading(true);

    try {
      if (parsed.kind === 'trace') {
        if (!pricingRun?.async_jobs.length) pushError('当前还没有可展开的异步任务。');
        return;
      }

      if (parsed.kind === 'retry') {
        pushError('当前前端只记录 retry 意图，具体重试策略需要后端提供幂等 run/task 标识。');
        return;
      }

      if (!pricingRun || parsed.kind === 'prepare') {
        await createAgentRun(rawCommand, parsed.targets);
        return;
      }

      await continueAgentRun(rawCommand);
    } catch (err) {
      pushError(err instanceof Error ? err.message : '命令执行失败');
    } finally {
      setLoading(false);
    }
  }

  async function createAgentRun(command: string, targets: string[]) {
    const primaryTarget = targets[0];
    const selectedInterviewees = [
      primaryTarget
        ? (interviewees.find((interviewee) => interviewee.name === primaryTarget) ?? {
            interviewee_id: 'target_1',
            name: primaryTarget,
            role: '访谈对象',
            region: ''
          })
        : interviewees[0]
    ].filter(Boolean);

    if (!selectedInterviewees.length) {
      throw new Error('请先在右侧配置一个访谈对象。');
    }

    const run = await createPricingMeetingRun(
      buildPricingMeetingRunCreatePayload(
        command || context.task,
        { ...meetingContext, meeting_id: context.meetingId },
        selectedInterviewees
      )
    );

    applyPricingRun(run);
  }

  async function continueAgentRun(content: string) {
    if (!pricingRun) throw new Error('请先创建 PricingMeetingAgent run。');
    const run = await continuePricingMeetingRun(pricingRun.run_id, { content });
    applyPricingRun(run);
  }

  function quickCommand(command: string) {
    setComposer(command);
  }

  function setReplyTarget(target: string) {
    setActiveTarget(target);
    setComposer(`@${target} `);
  }

  return (
    <main className="workbench-shell">
      <aside className="thread-rail">
        <div className="brand-block">
          <TerminalSquare size={22} />
          <div>
            <span>Agent Pilot</span>
            <strong>透明执行工作台</strong>
          </div>
        </div>

        <section className="rail-section">
          <span className="section-label">Current Thread</span>
          <button className="thread-item active" type="button">
            <span>{pricingRun?.status ?? 'idle'}</span>
            <strong>{context.meetingTitle}</strong>
            <small>
              {pricingRun?.async_jobs.length ?? 0} async jobs
            </small>
          </button>
        </section>

        <section className="rail-section">
          <span className="section-label">Commands</span>
          <button type="button" className="command-chip" onClick={() => quickCommand('/prepare meeting_20260511_001 @张三')}>
            /prepare
          </button>
          <button type="button" className="command-chip" onClick={() => quickCommand('/material 生成会议物料')}>
            /material check
          </button>
          <button type="button" className="command-chip" onClick={() => quickCommand('/preview 生成会前 5 分钟预览')}>
            /preview
          </button>
          <button type="button" className="command-chip" onClick={() => quickCommand('/trace last')}>
            /trace
          </button>
        </section>
      </aside>

      <section className="timeline-workspace">
        <header className="workspace-topbar">
          <div>
            <span className="section-label">PricingMeetingAgent</span>
            <h1>{context.meetingTitle}</h1>
          </div>
          <div className="run-status">
            {statusIcon(pricingRun?.status)}
            <span>{pricingRun?.status ?? 'idle'}</span>
          </div>
        </header>

        <section className="timeline-surface">
          {!timelineBlocks.length && (
            <div className="empty-timeline">
              <Code2 size={34} />
              <h2>从一个命令开始</h2>
              <p>输入自然语言、slash command 或 @访谈对象 回复。当前工作台按单人访谈 run 跑通闭环，多人触发交给外部服务。</p>
            </div>
          )}

          {timelineBlocks.map((block) => (
            <article
              key={block.id}
              className={`timeline-block ${block.type} ${selectedBlock?.id === block.id ? 'selected' : ''}`}
              onClick={() => setSelectedBlockId(block.id)}
            >
              <div className="block-avatar">{blockIcon(block)}</div>
              <div className="block-body">
                <header>
                  <div>
                    <strong>{block.actor}</strong>
                    {block.target && (
                      <>
                        <ChevronRight size={14} />
                        <span>{block.target}</span>
                      </>
                    )}
                  </div>
                  {block.status && <em>{block.status}</em>}
                </header>

                {block.title && <h3>{block.title}</h3>}
                {block.type === 'artifact' ? (
                  <ArtifactBlock block={block} />
                ) : (
                  <MarkdownBlock content={block.content} />
                )}
              </div>
            </article>
          ))}
        </section>

        <form className="command-composer" onSubmit={submitCommand}>
          {activeTarget && (
            <div className="reply-target">
              <MessageSquareText size={15} />
              Replying context: <strong>{activeTarget}</strong>
            </div>
          )}
          <textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            placeholder="/prepare meeting_001 @张三，或 @张三 补充访谈回答..."
            rows={3}
          />
          <button type="submit" disabled={loading || !composer.trim()}>
            {loading ? <RefreshCw size={18} className="spin" /> : <Send size={18} />}
            <span>{loading ? '执行中' : '发送命令'}</span>
          </button>
        </form>
      </section>

      <aside className="inspector-panel workbench-inspector">
        <section>
          <div className="side-heading">
            <span className="section-label">Context</span>
            <h2>meeting</h2>
          </div>
          <div className="context-editor">
            <label>
              Meeting ID
              <input value={context.meetingId} onChange={(event) => updateContext('meetingId', event.target.value)} />
            </label>
            <label>
              Title
              <input value={context.meetingTitle} onChange={(event) => updateContext('meetingTitle', event.target.value)} />
            </label>
            <label>
              Topic
              <input value={context.businessTopic} onChange={(event) => updateContext('businessTopic', event.target.value)} />
            </label>
            <label>
              Interviewee
              <textarea
                value={context.intervieweesText}
                onChange={(event) => updateContext('intervieweesText', event.target.value)}
                rows={3}
              />
            </label>
          </div>
        </section>

        <section>
          <div className="side-heading">
            <span className="section-label">Targets</span>
            <button className="icon-button" type="button" disabled={!pricingRun || loading} onClick={() => quickCommand('/trace last')}>
              <RefreshCw size={17} />
            </button>
          </div>
          <div className="target-list">
            {interviewees.map((item) => {
              const name = item.name;
              const job = pricingRun?.async_jobs.find((candidate) => candidate.agent === 'pre_meeting_interview_agent');
              const status = pricingRun?.blocked_by.includes(name) ? 'waiting_for_input' : (job?.status ?? 'queued');
              return (
                <button
                  className={name === activeTarget ? 'target-item active' : 'target-item'}
                  key={item.interviewee_id ?? item.name}
                  type="button"
                  onClick={() => setReplyTarget(name)}
                >
                  <span>{statusIcon(status)}</span>
                  <strong>{name}</strong>
                  <small>{sessionStatusText(status)}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="side-heading">
            <span className="section-label">Selected Block</span>
            <h2>{selectedBlock?.type ?? '-'}</h2>
          </div>
          <pre className="json-preview compact">{prettyJson(selectedBlock ?? { status: 'no_selection' })}</pre>
        </section>

        <section>
          <div className="side-heading">
            <span className="section-label">Async Jobs</span>
            <h2>{pricingRun?.async_jobs.length ?? 0}</h2>
          </div>
          {pricingRun?.async_jobs.length ? (
            <ol className="flow-list">
              {pricingRun.async_jobs.map((job) => (
                <li key={job.job_id}>
                  <strong>{job.job_id}</strong>
                  {` · ${job.agent} · ${job.status} · ${job.summary}`}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted-text">执行命令后，这里展示 DeepAgents async subagent job。</p>
          )}
        </section>

        <section>
          <div className="side-heading">
            <span className="section-label">Artifacts</span>
            <h2>{assetPackage || previewCard ? 'ready' : '-'}</h2>
          </div>
          <div className="artifact-list">
            {assetPackage && (
              <div>
                <Box size={16} />
                <span>{resolveArtifactTitle(assetPackage)}</span>
              </div>
            )}
            {previewCard && (
              <div>
                <FileJson size={16} />
                <span>{resolveArtifactTitle(previewCard)}</span>
              </div>
            )}
            {!assetPackage && !previewCard && <p className="muted-text">暂无产物。</p>}
          </div>
        </section>
      </aside>
    </main>
  );
}

function ArtifactBlock({ block }: { block: TimelineBlock }) {
  return (
    <div className="artifact-block">
      <MarkdownBlock content={block.content} />
      <details>
        <summary>查看 artifact JSON</summary>
        <pre className="inline-json">{prettyJson(block.data)}</pre>
      </details>
    </div>
  );
}
