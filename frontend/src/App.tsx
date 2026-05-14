import {
  useMessages,
  useStream,
  type AnyStream,
  type SubagentDiscoverySnapshot
} from '@langchain/react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
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
  Search,
  Send,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { createAgentTransport, fetchThreadEvidence, type EvidenceCard } from './api';
import {
  buildExecutionDetailModel,
  buildExecutionTraceModel,
  buildEvidenceGroups,
  buildStreamErrorMessage,
  buildSubagentProcessCard,
  buildTaskProgress,
  deriveTaskTitle,
  mergeConversationRows,
  normalizeStreamMessages,
  resolveEvidenceRefreshInterval,
  type ConversationRow,
  type ExecutionDetailItem,
  type ExecutionDetailModel,
  type ExecutionEvidence,
  type ExecutionTraceModel,
  type ExecutionTraceNode
} from './workspaceView';

type AgentState = {
  messages?: unknown[];
};

type EvidenceTab = 'process' | 'source' | 'missing' | 'technical';

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
  const [evidence, setEvidence] = useState<EvidenceCard[]>([]);
  const [technicalEvents, setTechnicalEvents] = useState<unknown[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>('process');
  const [openEvidenceId, setOpenEvidenceId] = useState<string | null>(null);
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
  const evidenceGroups = useMemo(() => buildEvidenceGroups(evidence), [evidence]);
  const subagents = useMemo(() => [...stream.subagents.values()], [stream.subagents]);
  const executionDetails = useMemo(() => buildExecutionDetailModel(technicalEvents), [technicalEvents]);
  const executionTrace = useMemo(() => buildExecutionTraceModel(technicalEvents), [technicalEvents]);
  const progress = useMemo(
    () => buildTaskProgress({ evidenceCards: evidence, isLoading: stream.isLoading }),
    [evidence, stream.isLoading]
  );
  const streamErrorMessage = useMemo(
    () => buildStreamErrorMessage(stream.error, hasStartedRun),
    [hasStartedRun, stream.error]
  );

  const refreshEvidence = useCallback(async () => {
    const next = await fetchThreadEvidence(threadId);
    setEvidence(next.summary_cards);
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
        actor: '你',
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

  const visibleEvidence = evidenceTab === 'technical' ? [] : evidenceGroups[evidenceTab];

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
            <p>用户用自然语言发起任务，主控 Agent 根据意图调度既有协同能力；前端只展示执行状态、结果和依据。</p>
          </div>
          <div className="header-actions">
            <StatusPill loading={stream.isLoading} label={progress.label} />
            <button
              className="ghost-button"
              type="button"
              onClick={() => setPanelOpen((value) => !value)}
              aria-label={panelOpen ? '收起生成依据' : '展开生成依据'}
            >
              {panelOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
              生成依据
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

      <EvidencePanel
        open={panelOpen}
        setOpen={setPanelOpen}
        activeTab={evidenceTab}
        setActiveTab={setEvidenceTab}
        visibleEvidence={visibleEvidence}
        stream={stream}
        subagents={subagents}
        executionDetails={executionDetails}
        executionTrace={executionTrace}
        technicalEvents={technicalEvents}
        openEvidenceId={openEvidenceId}
        setOpenEvidenceId={setOpenEvidenceId}
      />
    </div>
  );
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
            className={`rail-button ${index === 0 ? 'active' : ''}`}
            type="button"
            aria-label={`导航 ${index + 1}`}
          >
            <Icon size={19} />
          </button>
        ))}
      </div>

      <div className="task-list-pane">
        <div className="nav-heading">
          <strong>多 Agent 协同任务工作台</strong>
          <span>Agent Pilot</span>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input placeholder="搜索任务或会话" />
        </label>

        <div className="segment-control" aria-label="任务筛选">
          <button className="active" type="button">全部</button>
          <button type="button">我创建的</button>
          <button type="button">收藏</button>
        </div>

        <section className="current-task-card">
          <div className="task-card-header">
            <div>
              <span>当前任务</span>
              <strong>{taskTitle}</strong>
            </div>
            <span className="progress-number">{progress}%</span>
          </div>
          <div className="progress-track">
            <div style={{ width: `${progress}%` }} />
          </div>
          <small>Thread: {threadId.slice(0, 18)}</small>
        </section>

        <section className="guidance-list">
          <div className="section-title">平台工作方式</div>
          <div>
            <strong>自然语言触发</strong>
            <span>平台不要求用户先选择任务类型，任务意图由主控 Agent 理解。</span>
          </div>
          <div>
            <strong>协同过程可追溯</strong>
            <span>执行链路、阶段结果和证据摘要按任务运行过程沉淀。</span>
          </div>
          <div>
            <strong>结果优先展示</strong>
            <span>依据面板默认作为辅助信息，用户需要时再查看。</span>
          </div>
        </section>
      </div>
    </aside>
  );
}

function StatusPill({ loading, label }: { loading: boolean; label: string }) {
  return (
    <span className={`status-pill ${loading ? 'running' : 'ready'}`}>
      {loading ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
      {label}
    </span>
  );
}

function EmptyConversation() {
  return (
    <section className="empty-conversation">
      <div className="empty-icon">
        <FileText size={30} />
      </div>
      <h2>发起一个协同任务</h2>
      <p>直接描述目标、上下文和期望结果即可。平台会把任务交给主控 Agent，由它判断需要哪些协同能力。</p>
    </section>
  );
}

function MessageRow({ message }: { message: ConversationRow }) {
  return (
    <article className={`message-row ${message.role}`}>
      <div className="message-avatar">
        {message.role === 'user' ? <UserRound size={18} /> : message.role === 'system' ? <ShieldCheck size={18} /> : <Bot size={18} />}
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
        <Bot size={18} />
      </div>
      <div className="message-bubble">
        <div className="message-meta">
          <strong>PricingMeetingAgent</strong>
        </div>
        <div className="typing-line">
          <span />
          <span />
          <span />
          正在理解任务并调度协同能力
        </div>
      </div>
    </article>
  );
}

function SystemNotice({ message }: { message: string }) {
  return (
    <article className="message-row system">
      <div className="message-avatar">
        <ShieldCheck size={18} />
      </div>
      <div className="message-bubble">
        <div className="message-meta">
          <strong>系统</strong>
        </div>
        <p>{message}</p>
      </div>
    </article>
  );
}

function EvidencePanel({
  open,
  setOpen,
  activeTab,
  setActiveTab,
  visibleEvidence,
  stream,
  subagents,
  executionDetails,
  executionTrace,
  technicalEvents,
  openEvidenceId,
  setOpenEvidenceId
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  activeTab: EvidenceTab;
  setActiveTab: (tab: EvidenceTab) => void;
  visibleEvidence: EvidenceCard[];
  stream: AnyStream;
  subagents: SubagentDiscoverySnapshot[];
  executionDetails: ExecutionDetailModel;
  executionTrace: ExecutionTraceModel;
  technicalEvents: unknown[];
  openEvidenceId: string | null;
  setOpenEvidenceId: (id: string | null) => void;
}) {
  if (!open) {
    return (
      <aside className="evidence-closed">
        <button type="button" onClick={() => setOpen(true)} aria-label="展开生成依据">
          <ShieldCheck size={19} />
        </button>
        <span>生成依据</span>
      </aside>
    );
  }

  return (
    <aside className="evidence-drawer">
      <header className="evidence-header">
        <div>
          <div className="evidence-title">
            <ShieldCheck size={19} />
            <h2>生成依据</h2>
          </div>
          <p>当用户对结果有疑问时，可查看过程摘要、引用来源和缺失信息。</p>
        </div>
        <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="收起生成依据">
          <ChevronRight size={18} />
        </button>
      </header>

      <nav className="evidence-tabs" aria-label="生成依据分类">
        <TabButton active={activeTab === 'process'} onClick={() => setActiveTab('process')} label="处理过程" />
        <TabButton active={activeTab === 'source'} onClick={() => setActiveTab('source')} label="引用来源" />
        <TabButton active={activeTab === 'missing'} onClick={() => setActiveTab('missing')} label="缺失信息" />
        <TabButton active={activeTab === 'technical'} onClick={() => setActiveTab('technical')} label="技术详情" />
      </nav>

      <div className="evidence-scroll">
        {activeTab === 'technical' ? (
          <section className="technical-panel">
            <div className="section-title">协议事件</div>
            <pre>{JSON.stringify(technicalEvents, null, 2)}</pre>
          </section>
        ) : activeTab === 'process' ? (
          <ProcessEvidenceContent
            stream={stream}
            subagents={subagents}
            executionDetails={executionDetails}
            executionTrace={executionTrace}
            visibleEvidence={visibleEvidence}
            openEvidenceId={openEvidenceId}
            setOpenEvidenceId={setOpenEvidenceId}
          />
        ) : visibleEvidence.length > 0 ? (
          <div className="timeline-list">
            {visibleEvidence.map((item) => {
              const expanded = openEvidenceId === item.id;
              return (
                <article key={item.id} className="timeline-node">
                  <div className="timeline-dot">
                    <Clock3 size={15} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenEvidenceId(expanded ? null : item.id)}
                    aria-expanded={expanded}
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                    {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                  </button>
                  {expanded && (
                    <div className="timeline-detail">
                      <span>可信度：系统记录</span>
                      <span>展示层级：用户可选查看</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-evidence">
            <ShieldCheck size={28} />
            <strong>暂无此类依据</strong>
            <p>任务执行后会自动沉淀到这里。</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function ProcessEvidenceContent({
  stream,
  subagents,
  executionDetails,
  executionTrace,
  visibleEvidence,
  openEvidenceId,
  setOpenEvidenceId
}: {
  stream: AnyStream;
  subagents: SubagentDiscoverySnapshot[];
  executionDetails: ExecutionDetailModel;
  executionTrace: ExecutionTraceModel;
  visibleEvidence: EvidenceCard[];
  openEvidenceId: string | null;
  setOpenEvidenceId: (id: string | null) => void;
}) {
  const hasExecutionTrace = executionTrace.nodes.length > 0;
  const hasExecutionDetails =
    !hasExecutionTrace &&
    (executionDetails.plan.length > 0 ||
      executionDetails.subagents.length > 0 ||
      executionDetails.tools.length > 0 ||
      executionDetails.tasks.length > 0 ||
      executionDetails.artifacts.length > 0 ||
      executionDetails.errors.length > 0 ||
      executionDetails.rawEvents.length > 0);

  if (subagents.length === 0 && visibleEvidence.length === 0 && !hasExecutionTrace && !hasExecutionDetails) {
    return (
      <div className="empty-evidence">
        <ShieldCheck size={28} />
        <strong>暂无处理过程</strong>
        <p>任务执行后会在这里显示子 Agent 进度和过程证据。</p>
      </div>
    );
  }

  return (
    <>
      {hasExecutionTrace ? <ExecutionTraceContent trace={executionTrace} /> : null}
      {hasExecutionDetails && <ExecutionDetailContent details={executionDetails} />}
      {subagents.length > 0 && <SubagentProcessList stream={stream} subagents={subagents} />}
      {visibleEvidence.length > 0 && (
        <EvidenceTimelineList
          visibleEvidence={visibleEvidence}
          openEvidenceId={openEvidenceId}
          setOpenEvidenceId={setOpenEvidenceId}
        />
      )}
    </>
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

  return (
    <section className="trace-detail">
      <div className="trace-header">
        <div>
          <strong>执行链路</strong>
          <span>按 namespace 和工具调用归属组织</span>
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
          <span>{traceNodeKindLabel(node.kind)} · {executionStatusLabel(node.status)}</span>
        </div>
      </header>

      <div className="trace-detail-grid">
        <ExecutionMetric label="工具" value={node.metrics.toolCallCount} />
        <ExecutionMetric label="证据" value={node.metrics.evidenceCount} />
        <ExecutionMetric label="产物" value={node.metrics.artifactCount} />
      </div>

      {node.summary && <p className="trace-node-summary">{node.summary}</p>}

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
  return parts.join(' · ');
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

function ExecutionDetailContent({ details }: { details: ExecutionDetailModel }) {
  return (
    <section className="execution-detail">
      <div className="execution-detail-header">
        <div>
          <strong>执行详情</strong>
          <span>按通用事件模型汇总</span>
        </div>
        <div className={`execution-error-count ${details.errors.length > 0 ? 'active' : ''}`}>
          <AlertCircle size={14} />
          {details.errors.length}
        </div>
      </div>

      <div className="execution-summary-grid">
        <ExecutionMetric label="计划" value={details.plan.length} />
        <ExecutionMetric label="子 Agent" value={details.subagents.length} />
        <ExecutionMetric label="工具" value={details.tools.length} />
        <ExecutionMetric label="任务" value={details.tasks.length} />
        <ExecutionMetric label="产物" value={details.artifacts.length} />
      </div>

      <ExecutionSection title="执行计划" items={details.plan} />
      <ExecutionSection title="子 Agent 事件" items={details.subagents} />
      <ExecutionSection title="工具调用" items={details.tools} />
      <ExecutionSection title="异步任务" items={details.tasks} />
      <ExecutionSection title="产物" items={details.artifacts} />
      <ExecutionSection title="异常" items={details.errors} tone="danger" />
      <ExecutionSection title="原始事件摘要" items={details.rawEvents.slice(0, 8)} compact />
    </section>
  );
}

function ExecutionMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="execution-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExecutionSection({
  title,
  items,
  tone = 'default',
  compact = false
}: {
  title: string;
  items: ExecutionDetailItem[];
  tone?: 'default' | 'danger';
  compact?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className={`execution-section ${tone} ${compact ? 'compact' : ''}`}>
      <div className="execution-section-title">{title}</div>
      <div className="execution-item-list">
        {items.map((item) => (
          <article key={`${item.kind}:${item.id}`} className={`execution-item ${item.status}`}>
            <div className="execution-item-icon">{renderExecutionIcon(item)}</div>
            <div>
              <div className="execution-item-line">
                <strong>{item.title}</strong>
                <span>{executionStatusLabel(item.status)}</span>
              </div>
              {item.description && <p>{item.description}</p>}
              {item.namespaceLabel && <small>{item.namespaceLabel}</small>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function renderExecutionIcon(item: ExecutionDetailItem) {
  if (item.status === 'error') return <AlertCircle size={14} />;
  if (item.status === 'complete') return <CheckCircle2 size={14} />;
  if (item.kind === 'artifact') return <FileText size={14} />;
  if (item.kind === 'subagent') return <Bot size={14} />;
  if (item.kind === 'task') return <Clock3 size={14} />;
  if (item.kind === 'tool') return <Database size={14} />;
  return <Clock3 size={14} />;
}

function executionStatusLabel(status: ExecutionDetailItem['status']): string {
  if (status === 'pending') return '待执行';
  if (status === 'running') return '运行中';
  if (status === 'complete') return '已完成';
  if (status === 'error') return '异常';
  return '已记录';
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
          <strong>子 Agent 执行详情</strong>
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

function EvidenceTimelineList({
  visibleEvidence,
  openEvidenceId,
  setOpenEvidenceId
}: {
  visibleEvidence: EvidenceCard[];
  openEvidenceId: string | null;
  setOpenEvidenceId: (id: string | null) => void;
}) {
  return (
    <div className="timeline-list">
      {visibleEvidence.map((item) => {
        const expanded = openEvidenceId === item.id;
        return (
          <article key={item.id} className="timeline-node">
            <div className="timeline-dot">
              <Clock3 size={15} />
            </div>
            <button
              type="button"
              onClick={() => setOpenEvidenceId(expanded ? null : item.id)}
              aria-expanded={expanded}
            >
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
              {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            </button>
            {expanded && (
              <div className="timeline-detail">
                <span>可信度：系统记录</span>
                <span>展示层级：用户可选查看</span>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={active ? 'active' : ''} type="button" onClick={onClick}>
      {label}
    </button>
  );
}

export default App;
