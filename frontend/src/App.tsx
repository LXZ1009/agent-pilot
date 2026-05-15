import { useMessages, useStream, type AnyStream, type SubagentDiscoverySnapshot } from '@langchain/react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  FolderKanban,
  Layers3,
  Loader2,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Send,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  createAgentTransport,
  fetchArtifactContent,
  fetchArtifacts,
  fetchThreadEvidence
} from './api';
import {
  buildExecutionTraceModel,
  buildRunInspectorModel,
  buildStreamErrorMessage,
  buildSubagentProcessCard,
  deriveTaskTitle,
  mergeArtifactDescriptors,
  mergeConversationRows,
  normalizeStreamMessages,
  resolveEvidenceRefreshInterval,
  sortArtifactsForWorkspace,
  type ArtifactDescriptor,
  type ConversationRow,
  type DiagnosticItem,
  type ExecutionEvidence,
  type ExecutionItemStatus,
  type ExecutionTraceModel,
  type ExecutionTraceNode,
  type InteractionRun,
  type ProgressItem,
  type ResultCitation,
  type RunInspectorModel
} from './workspaceView';

type AgentState = {
  messages?: unknown[];
};

type InspectorTab = 'progress' | 'trace' | 'artifacts' | 'citations' | 'diagnostics';

function createThreadId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `thread_${Date.now()}`;
}

function App() {
  const [threadId] = useState(createThreadId);
  const transport = useMemo(() => createAgentTransport(threadId), [threadId]);
  const stream = useStream<AgentState>({
    threadId,
    transport,
    messagesKey: 'messages'
  });

  const [composer, setComposer] = useState('');
  const [localMessages, setLocalMessages] = useState<ConversationRow[]>([]);
  const [technicalEvents, setTechnicalEvents] = useState<unknown[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('progress');
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [hasStartedRun, setHasStartedRun] = useState(false);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);

  const streamMessages = useMemo(() => {
    const projectedMessages = stream.messages.length > 0 ? stream.messages : stream.values.messages ?? [];
    return normalizeStreamMessages(projectedMessages);
  }, [stream.messages, stream.values.messages]);
  const messages = useMemo(
    () => mergeConversationRows(localMessages, streamMessages),
    [localMessages, streamMessages]
  );
  const taskTitle = useMemo(() => deriveTaskTitle(messages), [messages]);
  const subagents = useMemo(() => [...stream.subagents.values()], [stream.subagents]);
  const runInspector = useMemo(() => buildRunInspectorModel(technicalEvents), [technicalEvents]);
  useEffect(() => {
    const fallbackRunId = runInspector.activeRunId ?? runInspector.runs.at(-1)?.id;
    if (!fallbackRunId) {
      if (selectedRunId) setSelectedRunId(undefined);
      return;
    }
    if (!selectedRunId || !runInspector.runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(fallbackRunId);
    }
  }, [runInspector, selectedRunId]);
  const activeRun = useMemo(
    () =>
      runInspector.runs.find((run) => run.id === selectedRunId) ??
      runInspector.runs.find((run) => run.id === runInspector.activeRunId) ??
      runInspector.runs.at(-1),
    [runInspector, selectedRunId]
  );
  const activeTrace = useMemo(
    () => (activeRun ? runInspector.traceByRunId[activeRun.id] : buildExecutionTraceModel([])),
    [activeRun, runInspector]
  );
  const progress = useMemo(() => buildHeaderProgress(activeRun, stream.isLoading), [activeRun, stream.isLoading]);
  const streamErrorMessage = useMemo(
    () => buildStreamErrorMessage(stream.error, hasStartedRun),
    [hasStartedRun, stream.error]
  );

  const refreshEvidence = useCallback(async () => {
    const next = await fetchThreadEvidence(threadId);
    setTechnicalEvents(next.technical_events);
  }, [threadId]);

  useEffect(() => {
    const intervalMs = resolveEvidenceRefreshInterval(stream.isLoading);
    void refreshEvidence().catch(() => undefined);
    if (intervalMs === null) return undefined;

    const intervalId = window.setInterval(() => {
      void refreshEvidence().catch(() => undefined);
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [refreshEvidence, stream.isLoading]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, stream.isLoading]);

  async function submitPrompt(content: string) {
    const prompt = content.trim();
    if (!prompt || stream.isLoading) return;
    const localId = `local_${Date.now()}`;
    setHasStartedRun(true);
    setLocalMessages((current) => [
      ...current,
      {
        id: localId,
        role: 'user',
        actor: '用户',
        content: prompt
      }
    ]);
    setComposer('');
    try {
      await stream.submit({ messages: [{ type: 'human', content: prompt }] });
      await refreshEvidence().catch(() => undefined);
    } catch (error) {
      setLocalMessages((current) => [
        ...current,
        {
          id: `${localId}_error`,
          role: 'system',
          actor: '系统',
          content: `任务发送失败：${resolveErrorMessage(error)}`
        }
      ]);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPrompt(composer);
  }

  return (
    <div className="agent-workspace">
      <LeftNav threadId={threadId} taskTitle={taskTitle} progress={progress.percent} />

      <main className="task-stage">
        <header className="task-header">
          <button className="icon-button" type="button" aria-label="返回任务列表">
            <ChevronLeft size={18} />
          </button>
          <div className="task-title">
            <div className="eyebrow">统一协同任务</div>
            <h1>{taskTitle}</h1>
            <p>用户以自然语言发起任务，平台按本轮交互展示进度、链路、产物、依据和诊断。</p>
          </div>
          <div className="header-actions">
            <StatusPill loading={stream.isLoading} label={progress.label} />
            <button
              className="ghost-button"
              type="button"
              onClick={() => setPanelOpen((value) => !value)}
              aria-label={panelOpen ? '收起当前任务' : '展开当前任务'}
            >
              {panelOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
              当前任务
            </button>
          </div>
        </header>

        <section className="stage-scroll">
          <div className="conversation-frame">
            {messages.length === 0 ? (
              <EmptyConversation />
            ) : (
              messages.map((message) => <MessageRow key={message.id} message={message} />)
            )}
            {stream.isLoading && <ProcessingMessage />}
            {streamErrorMessage ? <SystemNotice message={streamErrorMessage} /> : null}
            <div ref={conversationEndRef} aria-hidden="true" />
          </div>
        </section>

        <form className="workspace-composer" onSubmit={onSubmit}>
          <button className="icon-button" type="button" aria-label="选择上下文资料">
            <Database size={18} />
          </button>
          <textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            placeholder="输入你要交给多 Agent 协同完成的任务"
            rows={2}
            aria-label="任务输入"
          />
          <button className="send-button" type="submit" disabled={stream.isLoading || !composer.trim()} aria-label="发送任务">
            {stream.isLoading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          </button>
        </form>
      </main>

      <RunInspectorPanel
        threadId={threadId}
        open={panelOpen}
        setOpen={setPanelOpen}
        activeTab={inspectorTab}
        setActiveTab={setInspectorTab}
        runInspector={runInspector}
        activeRun={activeRun}
        selectedRunId={activeRun?.id}
        setSelectedRunId={setSelectedRunId}
        activeTrace={activeTrace}
        stream={stream}
        subagents={subagents}
        technicalEvents={technicalEvents}
      />
    </div>
  );
}

function buildHeaderProgress(run: InteractionRun | undefined, isLoading: boolean): { percent: number; label: string } {
  if (run?.metrics.todoTotal) {
    const percent = Math.round((run.metrics.todoCompleted / run.metrics.todoTotal) * 100);
    return { percent, label: isLoading ? '运行中' : runStatusLabel(run.status) };
  }
  if (isLoading || run?.status === 'running') return { percent: 45, label: '运行中' };
  if (run?.status === 'complete') return { percent: 100, label: '已完成' };
  if (run?.status === 'error') return { percent: 100, label: '异常' };
  return { percent: 0, label: '待开始' };
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '请检查后端服务或 Agent Server 是否可用';
}

function LeftNav({
  threadId,
  taskTitle,
  progress
}: {
  threadId: string;
  taskTitle: string;
  progress: number;
}) {
  return (
    <aside className="left-nav">
      <div className="product-rail">
        <div className="logo-mark">
          <Network size={21} />
        </div>
        {[FolderKanban, Layers3, ShieldCheck, Database].map((Icon, index) => (
          <button
            key={index}
            className={`rail-button${index === 0 ? ' active' : ''}`}
            type="button"
            aria-label={`导航 ${index + 1}`}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <div className="task-list-pane">
        <div className="nav-heading">
          <strong>Agent Pilot</strong>
          <span>Run Inspector</span>
        </div>
        <div className="current-task-card">
          <div className="task-card-header">
            <div>
              <span>Thread</span>
              <strong>{threadId.slice(0, 8)}</strong>
            </div>
            <span className="progress-number">{progress}%</span>
          </div>
          <small>{taskTitle}</small>
          <div className="progress-track">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="guidance-list">
          <div className="section-title">工作区</div>
          <div>
            <strong>当前任务</strong>
            <span>按本轮对话聚合执行状态</span>
          </div>
          <div>
            <strong>平台投影</strong>
            <span>基于事件协议生成进度、链路和产物</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function StatusPill({ loading, label }: { loading: boolean; label: string }) {
  return (
    <div className={`status-pill ${loading ? 'loading' : ''}`}>
      {loading ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
      {label}
    </div>
  );
}

function EmptyConversation() {
  return (
    <div className="empty-conversation">
      <div className="empty-icon">
        <Bot size={27} />
      </div>
      <h2>开始一个多 Agent 协同任务</h2>
      <p>输入目标后，右侧会按本轮任务展示进度、执行链路、产物、依据和诊断。</p>
    </div>
  );
}

function MessageRow({ message }: { message: ConversationRow }) {
  return (
    <article className={`message-row ${message.role}`}>
      <div className="message-avatar">
        {message.role === 'user' ? <UserRound size={17} /> : <Bot size={17} />}
      </div>
      <div className="message-bubble">
        <div className="message-meta">
          <strong>{message.actor}</strong>
        </div>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
    </article>
  );
}

function ProcessingMessage() {
  return (
    <article className="message-row assistant processing">
      <div className="message-avatar">
        <Bot size={17} />
      </div>
      <div className="message-bubble">
        <div className="message-meta">
          <strong>Agent</strong>
        </div>
        <div className="typing-line">
          <Loader2 className="spin" size={15} />
          正在协同处理
        </div>
      </div>
    </article>
  );
}

function SystemNotice({ message }: { message: string }) {
  return (
    <article className="system-notice">
      <AlertCircle size={18} />
      <div>
        <strong>系统</strong>
        <p>{message}</p>
      </div>
    </article>
  );
}

function RunInspectorPanel({
  threadId,
  open,
  setOpen,
  activeTab,
  setActiveTab,
  runInspector,
  activeRun,
  selectedRunId,
  setSelectedRunId,
  activeTrace,
  stream,
  subagents,
  technicalEvents
}: {
  threadId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  activeTab: InspectorTab;
  setActiveTab: (tab: InspectorTab) => void;
  runInspector: RunInspectorModel;
  activeRun?: InteractionRun;
  selectedRunId?: string;
  setSelectedRunId: (runId: string) => void;
  activeTrace: ExecutionTraceModel;
  stream: AnyStream;
  subagents: SubagentDiscoverySnapshot[];
  technicalEvents: unknown[];
}) {
  const activeRunId = activeRun?.id;
  const progressItems = activeRunId ? runInspector.progressByRunId[activeRunId] ?? [] : [];
  const artifacts = activeRunId ? runInspector.artifactsByRunId[activeRunId] ?? [] : [];
  const citations = activeRunId ? runInspector.citationsByRunId[activeRunId] ?? [] : [];
  const diagnostics = activeRunId ? runInspector.diagnosticsByRunId[activeRunId] ?? [] : [];
  const rawEvents = activeRunId ? runInspector.rawEventsByRunId[activeRunId] ?? [] : technicalEvents;
  const liveSubagents = activeRunId === runInspector.activeRunId ? subagents : [];

  if (!open) {
    return (
      <aside className="evidence-closed">
        <button type="button" onClick={() => setOpen(true)} aria-label="展开当前任务">
          <ShieldCheck size={19} />
        </button>
        <span>当前任务</span>
      </aside>
    );
  }

  return (
    <aside className="evidence-drawer">
      <header className="evidence-header">
        <div>
          <div className="evidence-title">
            <ShieldCheck size={19} />
            <h2>当前任务</h2>
          </div>
          <p>按本轮交互查看进度、链路、产物、依据和诊断。</p>
        </div>
        <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="收起当前任务">
          <ChevronRight size={18} />
        </button>
      </header>

      <RunInspectorHeader run={activeRun} runIndex={resolveRunIndex(runInspector.runs, activeRun?.id)} totalRuns={runInspector.runs.length} />

      <RunSelector runs={runInspector.runs} selectedRunId={selectedRunId} onSelect={setSelectedRunId} />

      <nav className="evidence-tabs" aria-label="当前任务视图">
        <TabButton active={activeTab === 'progress'} onClick={() => setActiveTab('progress')} label="进度" />
        <TabButton active={activeTab === 'trace'} onClick={() => setActiveTab('trace')} label="链路" />
        <TabButton active={activeTab === 'artifacts'} onClick={() => setActiveTab('artifacts')} label="产物" />
        <TabButton active={activeTab === 'citations'} onClick={() => setActiveTab('citations')} label="依据" />
        <TabButton active={activeTab === 'diagnostics'} onClick={() => setActiveTab('diagnostics')} label="诊断" />
      </nav>

      <div className="evidence-scroll">
        {activeTab === 'progress' && (
          <ProgressTab items={progressItems} trace={activeTrace} stream={stream} subagents={liveSubagents} />
        )}
        {activeTab === 'trace' && <ExecutionTraceContent trace={activeTrace} />}
        {activeTab === 'artifacts' && <ArtifactsTab threadId={threadId} runId={activeRunId} artifacts={artifacts} />}
        {activeTab === 'citations' && <CitationsTab citations={citations} trace={activeTrace} />}
        {activeTab === 'diagnostics' && <DiagnosticsTab diagnostics={diagnostics} rawEvents={rawEvents} />}
      </div>
    </aside>
  );
}

function RunInspectorHeader({
  run,
  runIndex,
  totalRuns
}: {
  run?: InteractionRun;
  runIndex: number;
  totalRuns: number;
}) {
  if (!run) {
    return (
      <section className="run-inspector-summary">
        <div>
          <strong>等待任务事件</strong>
          <span>本轮任务开始后会生成运行检查视图</span>
        </div>
      </section>
    );
  }

  return (
    <section className="run-inspector-summary">
      <div>
        <span>{totalRuns > 0 ? `第 ${runIndex + 1} 轮交互` : '当前交互'}</span>
        <strong>{run.title}</strong>
        <div className="run-inspector-meta">
          <span>{runStatusLabel(run.status)}</span>
          <span>{formatTraceTime(run.startedAt)} - {formatTraceTime(run.completedAt)}</span>
        </div>
      </div>
    </section>
  );
}

function RunSelector({
  runs,
  selectedRunId,
  onSelect
}: {
  runs: InteractionRun[];
  selectedRunId?: string;
  onSelect: (runId: string) => void;
}) {
  return (
    <nav className="run-selector" aria-label="交互轮次">
      {runs.map((run, index) => (
        <button
          key={run.id}
          className={run.id === selectedRunId ? 'active' : ''}
          type="button"
          onClick={() => onSelect(run.id)}
        >
          <strong>{index + 1}</strong>
          <span>{runStatusLabel(run.status)}</span>
        </button>
      ))}
    </nav>
  );
}

function ProgressTab({
  items,
  trace,
  stream,
  subagents
}: {
  items: ProgressItem[];
  trace: ExecutionTraceModel;
  stream: AnyStream;
  subagents: SubagentDiscoverySnapshot[];
}) {
  const activeNodes = trace.nodes.filter((node) => node.status === 'running');
  if (items.length === 0 && activeNodes.length === 0 && subagents.length === 0) {
    return <EmptyPanel title="暂无进度" description="任务开始后会显示计划、待办和实时状态。" />;
  }

  return (
    <>
      {subagents.length > 0 && <SubagentProcessList stream={stream} subagents={subagents} />}
      {(items.length > 0 || activeNodes.length > 0) && (
        <section className="progress-step-list">
          {items.map((item) => (
            <ProgressItemCard key={item.id} item={item} />
          ))}
          {activeNodes.map((node) => (
            <div key={node.id} className={`progress-step ${node.status}`}>
              <span />
              <div>
                <strong>{node.title}</strong>
                <em>{traceNodeKindLabel(node.kind)}</em>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function ProgressItemCard({ item }: { item: ProgressItem }) {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const taskId = typeof metadata.task_id === 'string' ? metadata.task_id : '';
  const runId = typeof metadata.run_id === 'string' ? metadata.run_id : '';
  const updatedAt =
    typeof metadata.last_updated_at === 'string'
      ? metadata.last_updated_at
      : typeof metadata.last_updated === 'string'
        ? metadata.last_updated
        : item.timestamp;
  const description = [
    taskId ? `task ${taskId.slice(0, 8)}` : '',
    runId ? `run ${runId.slice(0, 8)}` : '',
    updatedAt ? formatTraceTime(updatedAt) : ''
  ].filter(Boolean);

  return (
    <div className={`progress-step ${item.status}`}>
      <span />
      <div>
        <strong>{item.title}</strong>
        <em>{executionStatusLabel(item.status)}</em>
        {description.length > 0 && <small>{description.join(' / ')}</small>}
      </div>
    </div>
  );
}

function SubagentProcessList({
  stream,
  subagents
}: {
  stream: AnyStream;
  subagents: SubagentDiscoverySnapshot[];
}) {
  const completed = subagents.filter((subagent) => subagent.status === 'complete').length;
  const total = subagents.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <section className="subagent-process">
      <div className="subagent-process-header">
        <div>
          <strong>子 Agent 执行</strong>
          <span>{completed}/{total} 已完成</span>
        </div>
        <div className="subagent-progress-track" aria-hidden="true">
          <div style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="subagent-card-list">
        {subagents.map((subagent) => (
          <SubagentProcessItem key={subagent.id} stream={stream} subagent={subagent} />
        ))}
      </div>
    </section>
  );
}

function SubagentProcessItem({
  stream,
  subagent
}: {
  stream: AnyStream;
  subagent: SubagentDiscoverySnapshot;
}) {
  const messages = useMessages(stream, subagent);
  const card = buildSubagentProcessCard(subagent, messages);

  return (
    <article className={`subagent-card ${card.status}`}>
      <div className="subagent-card-top">
        <div className="subagent-status-icon">
          {card.status === 'running' ? (
            <Loader2 className="spin" size={15} />
          ) : card.status === 'complete' ? (
            <CheckCircle2 size={15} />
          ) : (
            <AlertCircle size={15} />
          )}
        </div>
        <div>
          <strong>{card.title}</strong>
          <span>{card.description}</span>
        </div>
        <span className="subagent-status-badge">{card.statusLabel}</span>
      </div>
      <div className="subagent-preview">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.preview}</ReactMarkdown>
      </div>
      {card.elapsedLabel && <div className="subagent-elapsed">耗时 {card.elapsedLabel}</div>}
    </article>
  );
}
type ArtifactContentState =
  | { status: 'loading' }
  | { status: 'loaded'; content: unknown }
  | { status: 'error'; message: string };

function ArtifactsTab({
  threadId,
  runId,
  artifacts
}: {
  threadId: string;
  runId?: string;
  artifacts: ArtifactDescriptor[];
}) {
  const [remoteArtifacts, setRemoteArtifacts] = useState<ArtifactDescriptor[]>([]);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [contentById, setContentById] = useState<Record<string, ArtifactContentState>>({});
  const mergedArtifacts = useMemo(
    () => mergeArtifactDescriptors(artifacts, remoteArtifacts),
    [artifacts, remoteArtifacts]
  );
  const selected = mergedArtifacts.find((artifact) => artifact.id === selectedId) ?? mergedArtifacts[0];

  useEffect(() => {
    if (!threadId || !runId) {
      setRemoteArtifacts([]);
      setListError('');
      return;
    }
    let cancelled = false;
    void fetchArtifacts(threadId, runId)
      .then((response) => {
        if (cancelled) return;
        setRemoteArtifacts(response.artifacts as ArtifactDescriptor[]);
        setListError('');
      })
      .catch(() => {
        if (!cancelled) setListError('Artifact list request failed; showing event-projected artifacts.');
      });
    return () => {
      cancelled = true;
    };
  }, [runId, threadId]);

  useEffect(() => {
    const preferred = mergedArtifacts.find((artifact) => artifact.role === 'deliverable') ?? mergedArtifacts[0];
    if (!preferred) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!selectedId || !mergedArtifacts.some((artifact) => artifact.id === selectedId)) {
      setSelectedId(preferred.id);
    }
  }, [mergedArtifacts, selectedId]);

  useEffect(() => {
    if (!selected || selected.content !== undefined || selected.source !== 'workspace' || !threadId) return;
    if (contentById[selected.id]) return;
    let cancelled = false;
    setContentById((current) => ({ ...current, [selected.id]: { status: 'loading' } }));
    void fetchArtifactContent(threadId, selected.id)
      .then((response) => {
        if (cancelled) return;
        setContentById((current) => ({
          ...current,
          [selected.id]: { status: 'loaded', content: response.content }
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        setContentById((current) => ({
          ...current,
          [selected.id]: { status: 'error', message: resolveErrorMessage(error) }
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [contentById, selected, threadId]);

  if (mergedArtifacts.length === 0) {
    return <EmptyPanel title="暂无产物" description="本轮任务生成文件或结构化结果后会显示在这里。" />;
  }

  return (
    <section className="artifact-viewer">
      {listError && <div className="artifact-warning">{listError}</div>}
      <div className="artifact-list">
        {sortArtifactsForWorkspace(mergedArtifacts).map((artifact) => (
          <button
            key={artifact.id}
            className={artifact.id === selected?.id ? 'active' : ''}
            type="button"
            onClick={() => setSelectedId(artifact.id)}
            aria-current={artifact.id === selected?.id}
          >
            <strong>{artifact.title}</strong>
            <span>{artifactLabel(artifact)}</span>
          </button>
        ))}
      </div>
      {selected && (
        <>
          <ArtifactPreview artifact={selected} state={contentById[selected.id]} />
          <ArtifactMetadata artifact={selected} />
        </>
      )}
    </section>
  );
}

function ArtifactPreview({ artifact, state }: { artifact: ArtifactDescriptor; state?: ArtifactContentState }) {
  const content =
    artifact.content !== undefined
      ? artifact.content
      : state?.status === 'loaded'
        ? state.content
        : undefined;

  if (state?.status === 'loading') {
    return <div className="artifact-preview-state">浜х墿鍐呭鍔犺浇涓?..</div>;
  }
  if (state?.status === 'error') {
    return <div className="artifact-preview-state error">{state.message}</div>;
  }
  if (content !== undefined && artifact.kind === 'table') {
    return <EvidenceTable content={content} />;
  }
  if (typeof content === 'string' && artifact.kind === 'document') {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }
  if (content !== undefined) {
    return <pre className="evidence-code json">{JSON.stringify(content, null, 2)}</pre>;
  }
  return (
    <div className="artifact-preview-empty">
      <strong>{artifact.title}</strong>
      <span>{artifact.uri || artifact.summary || '产物内容需要通过后端 artifact API 获取。'}</span>
    </div>
  );
}

function ArtifactMetadata({ artifact }: { artifact: ArtifactDescriptor }) {
  return (
    <dl className="artifact-metadata">
      <div>
        <dt>鏉ユ簮</dt>
        <dd>{artifact.source}</dd>
      </div>
      <div>
        <dt>瑙掕壊</dt>
        <dd>{artifact.role}</dd>
      </div>
      <div>
        <dt>绫诲瀷</dt>
        <dd>{artifact.mimeType || artifact.kind}</dd>
      </div>
      {artifact.uri && (
        <div>
          <dt>URI</dt>
          <dd>{artifact.uri}</dd>
        </div>
      )}
      {artifact.producerNodeId && (
        <div>
          <dt>杈撳嚭鑺傜偣</dt>
          <dd>{artifact.producerNodeId}</dd>
        </div>
      )}
    </dl>
  );
}

function artifactLabel(artifact: ArtifactDescriptor): string {
  return `${artifact.role} / ${artifact.source} / ${artifact.mimeType || artifact.kind}`;
}

function CitationsTab({ citations, trace }: { citations: ResultCitation[]; trace: ExecutionTraceModel }) {
  if (citations.length === 0) {
    return <EmptyPanel title="暂无依据映射" description="产物或最终结论声明引用后，会在这里关联到过程证据。" />;
  }
  return (
    <section className="citation-list">
      {citations.map((citation) => {
        const evidence = trace.evidence.find((item) => item.id === citation.evidenceId);
        return (
          <article key={citation.id} className="citation-item">
            <strong>{citation.claimId}</strong>
            <span>{evidence?.summary || citation.evidenceId}</span>
          </article>
        );
      })}
    </section>
  );
}

function DiagnosticsTab({ diagnostics, rawEvents }: { diagnostics: DiagnosticItem[]; rawEvents: unknown[] }) {
  if (diagnostics.length === 0 && rawEvents.length === 0) {
    return <EmptyPanel title="暂无诊断" description="异常、缺失字段、警告和技术事件会显示在这里。" />;
  }
  return (
    <section className="diagnostic-list">
      {diagnostics.map((item) => (
        <details key={item.id} className={`diagnostic-item ${item.severity}`}>
          <summary>
            <strong>{item.title}</strong>
            <span>{item.summary}</span>
          </summary>
          {item.content !== undefined && <pre className="evidence-code json">{JSON.stringify(item.content, null, 2)}</pre>}
        </details>
      ))}
      <details className="technical-panel">
        <summary>协议事件</summary>
        <pre>{JSON.stringify(rawEvents, null, 2)}</pre>
      </details>
    </section>
  );
}

function ExecutionTraceContent({ trace }: { trace: ExecutionTraceModel }) {
  const [selectedNodeId, setSelectedNodeId] = useState(() => selectDefaultTraceNode(trace));
  const selectedNode = trace.nodesById[selectedNodeId] ?? trace.nodes[0];
  const selectedEvidence = selectedNode ? trace.evidenceByNodeId[selectedNode.id] ?? [] : [];

  useEffect(() => {
    if (!selectedNodeId || !trace.nodesById[selectedNodeId]) {
      setSelectedNodeId(selectDefaultTraceNode(trace));
    }
  }, [selectedNodeId, trace]);

  if (trace.nodes.length === 0) {
    return <EmptyPanel title="暂无链路" description="本轮任务产生执行节点后会显示在这里。" />;
  }

  return (
    <section className="trace-detail">
      <div className="trace-header">
        <div>
          <strong>执行链路</strong>
          <span>按 namespace、工具调用和产物归属组织</span>
        </div>
        <div className={`execution-error-count ${trace.summary.errorCount > 0 ? 'active' : ''}`}>
          <AlertCircle size={14} />
          {trace.summary.errorCount}
        </div>
      </div>

      <div className="execution-summary-grid">
        <ExecutionMetric label="节点" value={trace.summary.nodeCount} />
        <ExecutionMetric label="证据" value={trace.summary.evidenceCount} />
        <ExecutionMetric label="产物" value={trace.summary.artifactCount} />
        <ExecutionMetric label="异常" value={trace.summary.errorCount} />
        <ExecutionMetric label="引用" value={trace.citations.length} />
      </div>

      <div className="trace-node-list">
        {trace.nodes.map((node) => (
          <TraceNodeButton
            key={node.id}
            node={node}
            active={selectedNode?.id === node.id}
            depth={traceNodeDepth(trace, node)}
            onSelect={() => setSelectedNodeId(node.id)}
          />
        ))}
      </div>

      {selectedNode && (
        <TraceNodeDetail
          node={selectedNode}
          evidence={selectedEvidence}
          childNodes={selectedNode.children.map((id) => trace.nodesById[id]).filter(Boolean)}
        />
      )}
    </section>
  );
}

function TraceNodeButton({
  node,
  active,
  depth,
  onSelect
}: {
  node: ExecutionTraceNode;
  active: boolean;
  depth: number;
  onSelect: () => void;
}) {
  return (
    <button
      className={`trace-node-button ${active ? 'active' : ''} ${node.status}`}
      type="button"
      style={{ paddingLeft: `${10 + depth * 18}px` }}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className="trace-node-icon">{renderTraceNodeIcon(node)}</span>
      <span>
        <strong>{node.title}</strong>
        <small>{traceNodeMeta(node)}</small>
      </span>
      <em>{executionStatusLabel(node.status)}</em>
    </button>
  );
}

function TraceNodeDetail({
  node,
  evidence,
  childNodes
}: {
  node: ExecutionTraceNode;
  evidence: ExecutionEvidence[];
  childNodes: ExecutionTraceNode[];
}) {
  return (
    <section className="trace-node-detail">
      <header>
        <div className="trace-node-icon large">{renderTraceNodeIcon(node)}</div>
        <div>
          <strong>{node.title}</strong>
          <span>{traceNodeKindLabel(node.kind)} / {executionStatusLabel(node.status)}</span>
        </div>
      </header>

      <div className="trace-detail-grid">
        <ExecutionMetric label="工具" value={node.metrics.toolCallCount} />
        <ExecutionMetric label="证据" value={node.metrics.evidenceCount} />
        <ExecutionMetric label="产物" value={node.metrics.artifactCount} />
      </div>

      {node.summary && <p className="trace-node-summary">{node.summary}</p>}
      {node.kind === 'tool' && <ToolCallDetail node={node} evidence={evidence} />}
      {node.kind === 'task' && <TaskNodeDetail node={node} />}

      {childNodes.length > 0 && (
        <div className="trace-child-list">
          <div className="execution-section-title">下游节点</div>
          {childNodes.map((child) => (
            <div key={child.id} className={`trace-child ${child.status}`}>
              {renderTraceNodeIcon(child)}
              <span>{child.title}</span>
              <em>{executionStatusLabel(child.status)}</em>
            </div>
          ))}
        </div>
      )}

      <EvidenceList evidence={evidence} />
    </section>
  );
}

function TaskNodeDetail({ node }: { node: ExecutionTraceNode }) {
  const taskId = readNodeMetaString(node, 'taskId') || readNodeMetaString(node, 'task_id') || node.id.replace(/^task:/, '');
  const runId = readNodeMetaString(node, 'run_id');
  const threadId = readNodeMetaString(node, 'thread_id');
  const agentName = readNodeMetaString(node, 'agent_name') || readNodeMetaString(node, 'name') || node.title;

  return (
    <section className="tool-call-detail">
      <div className="execution-section-title">Async task detail</div>
      <dl className="tool-call-grid">
        <div>
          <dt>Agent</dt>
          <dd>{agentName}</dd>
        </div>
        <div>
          <dt>Task ID</dt>
          <dd>{taskId}</dd>
        </div>
        <div>
          <dt>Run ID</dt>
          <dd>{runId || '-'}</dd>
        </div>
        <div>
          <dt>Thread</dt>
          <dd>{threadId || '-'}</dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd>{formatTraceTime(node.startedAt)}</dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>{formatTraceTime(node.completedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}

function ToolCallDetail({ node, evidence }: { node: ExecutionTraceNode; evidence: ExecutionEvidence[] }) {
  const inputEvidence = evidence.filter((item) => item.title.toLowerCase().includes('input'));
  const outputEvidence = evidence.filter((item) => item.title.toLowerCase().includes('output'));
  const errorEvidence = evidence.filter((item) => item.kind === 'error');
  const toolCallId = readNodeMetaString(node, 'toolCallId') || node.id.replace(/^tool:/, '');
  const toolName = readNodeMetaString(node, 'toolName') || node.title;

  return (
    <section className="tool-call-detail">
      <div className="execution-section-title">工具调用详情</div>
      <dl className="tool-call-grid">
        <div>
          <dt>工具</dt>
          <dd>{toolName}</dd>
        </div>
        <div>
          <dt>调用 ID</dt>
          <dd>{toolCallId}</dd>
        </div>
        <div>
          <dt>归属</dt>
          <dd>{node.namespace.join(' / ') || 'root'}</dd>
        </div>
        <div>
          <dt>开始</dt>
          <dd>{formatTraceTime(node.startedAt)}</dd>
        </div>
        <div>
          <dt>结束</dt>
          <dd>{formatTraceTime(node.completedAt)}</dd>
        </div>
        <div>
          <dt>耗时</dt>
          <dd>{formatTraceDuration(node.startedAt, node.completedAt)}</dd>
        </div>
      </dl>
      <div className="tool-call-evidence-strip">
        <span>入参 {inputEvidence.length}</span>
        <span>返回 {outputEvidence.length}</span>
        <span className={errorEvidence.length > 0 ? 'danger' : ''}>异常 {errorEvidence.length}</span>
      </div>
    </section>
  );
}

function EvidenceList({ evidence }: { evidence: ExecutionEvidence[] }) {
  if (evidence.length === 0) {
    return (
      <div className="trace-empty-evidence">
        <ShieldCheck size={18} />
        <span>该节点暂无结构化过程证据</span>
      </div>
    );
  }

  return (
    <div className="trace-evidence-list">
      <div className="execution-section-title">过程证据</div>
      {evidence.map((item) => (
        <details key={item.id} className={`trace-evidence ${item.kind}`}>
          <summary>
            <span>{evidenceKindLabel(item.kind)}</span>
            <strong>{item.title}</strong>
            <em>{item.summary}</em>
          </summary>
          <EvidenceContent evidence={item} />
        </details>
      ))}
    </div>
  );
}

function EvidenceContent({ evidence }: { evidence: ExecutionEvidence }) {
  if (evidence.kind === 'table') {
    return <EvidenceTable content={evidence.content} />;
  }

  const text =
    typeof evidence.content === 'string'
      ? evidence.content
      : JSON.stringify(evidence.content, null, 2);
  return <pre className={`evidence-code ${evidence.language ?? 'text'}`}>{text}</pre>;
}

function EvidenceTable({ content }: { content: unknown }) {
  const rows = normalizeEvidenceRows(content);
  if (rows.length === 0) {
    return <pre className="evidence-code json">{JSON.stringify(content, null, 2)}</pre>;
  }
  const columns = Object.keys(rows[0]).slice(0, 8);
  return (
    <div className="evidence-table-wrap">
      <table className="evidence-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-evidence">
      <ShieldCheck size={28} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function selectDefaultTraceNode(trace: ExecutionTraceModel): string {
  const errorNode = trace.nodes.find((node) => node.status === 'error');
  if (errorNode) return errorNode.id;
  const runningNode = trace.nodes.find((node) => node.status === 'running');
  if (runningNode) return runningNode.id;
  return trace.nodes[0]?.id ?? '';
}

function traceNodeDepth(trace: ExecutionTraceModel, node: ExecutionTraceNode): number {
  let depth = 0;
  let current = node.parentId ? trace.nodesById[node.parentId] : undefined;
  while (current) {
    depth += 1;
    current = current.parentId ? trace.nodesById[current.parentId] : undefined;
  }
  return depth;
}

function traceNodeMeta(node: ExecutionTraceNode): string {
  const parts = [
    traceNodeKindLabel(node.kind),
    node.metrics.toolCallCount > 0 ? `${node.metrics.toolCallCount} 工具` : '',
    node.metrics.evidenceCount > 0 ? `${node.metrics.evidenceCount} 证据` : '',
    node.metrics.artifactCount > 0 ? `${node.metrics.artifactCount} 产物` : ''
  ].filter(Boolean);
  return parts.join(' / ');
}

function traceNodeKindLabel(kind: ExecutionTraceNode['kind']): string {
  if (kind === 'supervisor') return '主控 Agent';
  if (kind === 'agent') return 'Agent';
  if (kind === 'tool') return '工具';
  if (kind === 'task') return '任务';
  if (kind === 'artifact') return '产物';
  if (kind === 'user') return '用户';
  return '系统';
}

function evidenceKindLabel(kind: ExecutionEvidence['kind']): string {
  if (kind === 'sql') return 'SQL';
  if (kind === 'table') return '表格';
  if (kind === 'tool_input') return '输入';
  if (kind === 'tool_output') return '输出';
  if (kind === 'artifact') return '产物';
  if (kind === 'error') return '异常';
  if (kind === 'message') return '消息';
  if (kind === 'json') return 'JSON';
  return '记录';
}

function renderTraceNodeIcon(node: ExecutionTraceNode) {
  if (node.status === 'error') return <AlertCircle size={14} />;
  if (node.kind === 'agent' || node.kind === 'supervisor') return <Bot size={14} />;
  if (node.kind === 'tool') return <Database size={14} />;
  if (node.kind === 'artifact') return <FileText size={14} />;
  if (node.kind === 'task') return <Clock3 size={14} />;
  if (node.kind === 'user') return <UserRound size={14} />;
  return <ShieldCheck size={14} />;
}

function normalizeEvidenceRows(content: unknown): Record<string, unknown>[] {
  if (Array.isArray(content)) {
    return content.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  }
  if (!content || typeof content !== 'object') return [];
  const record = content as Record<string, unknown>;
  const rows = record.rows ?? record.data ?? record.records;
  if (!Array.isArray(rows)) return [];
  return rows.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}

function formatCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function resolveRunIndex(runs: InteractionRun[], runId?: string): number {
  const index = runs.findIndex((run) => run.id === runId);
  return index >= 0 ? index : Math.max(0, runs.length - 1);
}

function readNodeMetaString(node: ExecutionTraceNode, key: string): string {
  const value = node.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function formatTraceTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTraceDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt || !completedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return '-';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function ExecutionMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="execution-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function executionStatusLabel(status: ExecutionItemStatus): string {
  if (status === 'pending') return '待执行';
  if (status === 'running') return '运行中';
  if (status === 'complete') return '已完成';
  if (status === 'error') return '异常';
  return '已记录';
}

function runStatusLabel(status: InteractionRun['status']): string {
  if (status === 'running') return '运行中';
  if (status === 'complete') return '已完成';
  if (status === 'error') return '异常';
  if (status === 'waiting') return '等待用户';
  return '已记录';
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={active ? 'active' : ''} type="button" onClick={onClick}>
      {label}
    </button>
  );
}

export default App;
