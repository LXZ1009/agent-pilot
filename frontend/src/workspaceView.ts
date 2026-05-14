import type { EvidenceCard } from './api';

export type ConversationRole = 'user' | 'assistant' | 'system';

export interface ConversationRow {
  id: string;
  role: ConversationRole;
  actor: string;
  content: string;
}

export interface EvidenceGroups {
  process: EvidenceCard[];
  source: EvidenceCard[];
  missing: EvidenceCard[];
  technical: EvidenceCard[];
}

export interface TaskProgressInput {
  evidenceCards: EvidenceCard[];
  isLoading: boolean;
}

export interface TaskProgress {
  percent: number;
  label: string;
  completedEvidenceCount: number;
}

export type SubagentProcessStatus = 'running' | 'complete' | 'error';

export interface SubagentProcessSnapshot {
  id: string;
  name: string;
  status: SubagentProcessStatus;
  taskInput?: string;
  output?: unknown;
  error?: string;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export interface SubagentProcessCard {
  id: string;
  title: string;
  description: string;
  status: SubagentProcessStatus;
  statusLabel: string;
  preview: string;
  elapsedLabel: string | null;
}

export type ExecutionItemKind = 'plan' | 'subagent' | 'tool' | 'task' | 'artifact' | 'error' | 'message' | 'raw';
export type ExecutionItemStatus = 'pending' | 'running' | 'complete' | 'error' | 'unknown';

export interface ExecutionDetailItem {
  id: string;
  kind: ExecutionItemKind;
  title: string;
  description: string;
  status: ExecutionItemStatus;
  timestamp?: string;
  namespaceLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionDetailModel {
  plan: ExecutionDetailItem[];
  subagents: ExecutionDetailItem[];
  tools: ExecutionDetailItem[];
  tasks: ExecutionDetailItem[];
  artifacts: ExecutionDetailItem[];
  errors: ExecutionDetailItem[];
  messages: ExecutionDetailItem[];
  rawEvents: ExecutionDetailItem[];
  counts: Record<'plan' | 'subagents' | 'tools' | 'tasks' | 'artifacts' | 'errors' | 'messages' | 'rawEvents', number>;
}

export type ExecutionTraceNodeKind = 'user' | 'supervisor' | 'agent' | 'tool' | 'task' | 'artifact' | 'system';
export type ExecutionEvidenceKind =
  | 'message'
  | 'tool_input'
  | 'tool_output'
  | 'sql'
  | 'table'
  | 'json'
  | 'artifact'
  | 'error'
  | 'raw';

export interface ExecutionTraceNode {
  id: string;
  kind: ExecutionTraceNodeKind;
  title: string;
  status: ExecutionItemStatus;
  namespace: string[];
  parentId?: string;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  children: string[];
  metrics: {
    durationMs?: number;
    toolCallCount: number;
    evidenceCount: number;
    artifactCount: number;
  };
}

export interface ExecutionEvidence {
  id: string;
  nodeId: string;
  kind: ExecutionEvidenceKind;
  title: string;
  summary: string;
  content: unknown;
  language?: 'sql' | 'json' | 'markdown' | 'text';
  metadata?: Record<string, unknown>;
}

export interface ResultCitation {
  id: string;
  claimId: string;
  evidenceId: string;
  quote?: string;
  confidence?: 'direct' | 'derived' | 'weak';
}

export interface ExecutionTraceModel {
  rootNodeIds: string[];
  nodes: ExecutionTraceNode[];
  nodesById: Record<string, ExecutionTraceNode>;
  evidence: ExecutionEvidence[];
  evidenceByNodeId: Record<string, ExecutionEvidence[]>;
  citations: ResultCitation[];
  rawEvents: unknown[];
  summary: {
    nodeCount: number;
    evidenceCount: number;
    artifactCount: number;
    errorCount: number;
  };
}

export function deriveTaskTitle(messages: ConversationRow[]): string {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const content = latestUserMessage?.content.trim();
  if (!content) return '新的协同任务';
  return content.length > 48 ? `${content.slice(0, 47)}...` : content;
}

export function normalizeStreamMessages(messages: unknown[]): ConversationRow[] {
  return messages
    .map((message, index) => {
      const kind = resolveMessageKind(message);
      if (isInternalMessageKind(kind)) return null;

      const role = resolveRole(kind);
      const content = normalizeDisplayContent(resolveContent(message), role);
      if (!isDisplayableContent(content)) return null;

      return {
        id: resolveId(message, index),
        role,
        actor: role === 'user' ? '你' : role === 'system' ? '系统' : 'PricingMeetingAgent',
        content
      };
    })
    .filter((row): row is ConversationRow => row !== null);
}

export function mergeConversationRows(
  localRows: ConversationRow[],
  remoteRows: ConversationRow[]
): ConversationRow[] {
  if (remoteRows.length === 0) return localRows;

  const remoteKeys = new Set(remoteRows.map(toConversationKey));
  const pendingRows = localRows.filter((row) => !remoteKeys.has(toConversationKey(row)));
  return [...remoteRows, ...pendingRows];
}

export function buildEvidenceGroups(cards: EvidenceCard[]): EvidenceGroups {
  return {
    process: cards.filter((card) => card.category === 'process'),
    source: cards.filter((card) => card.category === 'source'),
    missing: cards.filter((card) => card.category === 'missing'),
    technical: cards.filter((card) => card.category === 'technical')
  };
}

export function buildTaskProgress(input: TaskProgressInput): TaskProgress {
  const completedEvidenceCount = input.evidenceCards.length;
  if (input.isLoading) {
    return {
      percent: Math.min(85, 15 + completedEvidenceCount * 10),
      label: '处理中',
      completedEvidenceCount
    };
  }
  return {
    percent: completedEvidenceCount > 0 ? 100 : 0,
    label: completedEvidenceCount > 0 ? '已记录' : '待开始',
    completedEvidenceCount
  };
}

export function buildSubagentProcessCard(
  subagent: SubagentProcessSnapshot,
  messages: unknown[]
): SubagentProcessCard {
  const streamedPreview = [...messages]
    .reverse()
    .map((message) => normalizeDisplayContent(resolveContent(message), resolveRole(resolveMessageKind(message))))
    .find(isDisplayableContent);
  const outputPreview = resolveOutputContent(subagent.output);
  const errorPreview = subagent.error ? `执行异常：${subagent.error}` : '';

  return {
    id: subagent.id,
    title: subagent.name || `Agent ${subagent.id}`,
    description: subagent.taskInput || '子 Agent 执行任务',
    status: subagent.status,
    statusLabel: resolveSubagentStatusLabel(subagent.status),
    preview:
      subagent.status === 'error'
        ? errorPreview || streamedPreview || '子 Agent 执行异常'
        : subagent.status === 'complete'
          ? outputPreview || streamedPreview || '子 Agent 已完成'
          : streamedPreview || '等待子 Agent 输出',
    elapsedLabel: formatElapsedTime(subagent.startedAt, subagent.completedAt)
  };
}

export function buildExecutionDetailModel(events: unknown[]): ExecutionDetailModel {
  const model: ExecutionDetailModel = {
    plan: [],
    subagents: [],
    tools: [],
    tasks: [],
    artifacts: [],
    errors: [],
    messages: [],
    rawEvents: [],
    counts: {
      plan: 0,
      subagents: 0,
      tools: 0,
      tasks: 0,
      artifacts: 0,
      errors: 0,
      messages: 0,
      rawEvents: 0
    }
  };

  events.forEach((event, index) => {
    const projected = projectExecutionEvent(event, index);
    projected.forEach((item) => appendExecutionItem(model, item));
  });

  model.counts = {
    plan: model.plan.length,
    subagents: model.subagents.length,
    tools: model.tools.length,
    tasks: model.tasks.length,
    artifacts: model.artifacts.length,
    errors: model.errors.length,
    messages: model.messages.length,
    rawEvents: model.rawEvents.length
  };
  return model;
}

export function resolveEvidenceRefreshInterval(isLoading: boolean): number | null {
  return isLoading ? 1200 : null;
}

export function buildStreamErrorMessage(error: unknown, hasStartedRun: boolean): string {
  if (!error || !hasStartedRun) return '';
  return `执行过程出现异常：${resolveErrorText(error)}`;
}

export function buildExecutionTraceModel(events: unknown[]): ExecutionTraceModel {
  const trace: ExecutionTraceModel = {
    rootNodeIds: [],
    nodes: [],
    nodesById: {},
    evidence: [],
    evidenceByNodeId: {},
    citations: [],
    rawEvents: events,
    summary: {
      nodeCount: 0,
      evidenceCount: 0,
      artifactCount: 0,
      errorCount: 0
    }
  };

  events.forEach((event, index) => {
    projectTraceEvent(trace, event, index);
  });

  trace.nodes = Object.values(trace.nodesById);
  trace.summary = {
    nodeCount: trace.nodes.length,
    evidenceCount: trace.evidence.length,
    artifactCount: trace.nodes.filter((node) => node.kind === 'artifact').length,
    errorCount: trace.nodes.filter((node) => node.status === 'error').length + trace.evidence.filter((item) => item.kind === 'error').length
  };
  return trace;
}

function toConversationKey(row: ConversationRow): string {
  return `${row.role}:${row.content.trim()}`;
}

function resolveErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '请检查后端服务或 Agent Server 是否可用';
}

function projectTraceEvent(trace: ExecutionTraceModel, event: unknown, index: number): void {
  const envelope = asRecord(event);
  const params = asRecord(envelope.params);
  const data = asRecord(params.data);
  const eventId = readString(envelope.event_id) || readString(envelope.id) || `event_${index}`;
  const method = readString(envelope.method) || readString(envelope.type) || 'raw';
  const timestamp = readString(params.timestamp) || undefined;
  const namespace = readStringArray(params.namespace);
  const parentId = namespace.length > 0 ? ensureNamespaceNode(trace, namespace, timestamp) : undefined;

  if (method === 'tools') {
    projectTraceToolEvent(trace, eventId, data, namespace, parentId, timestamp);
    return;
  }

  if (method === 'custom') {
    projectTraceCustomEvent(trace, eventId, data, namespace, parentId, timestamp);
    return;
  }

  if (method === 'tasks') {
    projectTraceTaskEvent(trace, eventId, data, namespace, parentId, timestamp);
    return;
  }

  if (method === 'messages' && parentId) {
    updateNodeStatus(trace.nodesById[parentId], 'running', timestamp);
    const summary = readString(data.event) || 'message event';
    if (!trace.nodesById[parentId].summary) trace.nodesById[parentId].summary = summary;
    return;
  }

  if (method === 'lifecycle') {
    const nodeId = parentId || `system:${readString(data.graph_name) || eventId}`;
    const title = readString(data.graph_name) || formatNamespaceLabel(namespace) || 'system';
    const node = ensureTraceNode(trace, {
      id: nodeId,
      kind: parentId ? 'agent' : 'system',
      title,
      status: resolveEventStatus(readString(data.event)),
      namespace,
      parentId,
      timestamp
    });
    if (readString(data.error)) {
      addEvidence(trace, {
        id: `${eventId}:error`,
        nodeId: node.id,
        kind: 'error',
        title: 'Error',
        summary: readString(data.error),
        content: data.error,
        language: 'text',
        metadata: data
      });
    }
  }
}

function projectTraceToolEvent(
  trace: ExecutionTraceModel,
  eventId: string,
  data: Record<string, unknown>,
  namespace: string[],
  parentId?: string,
  timestamp?: string
): void {
  const toolCallId = readString(data.tool_call_id) || readString(data.id) || eventId;
  const nodeId = `tool:${toolCallId}`;
  const toolName = readString(data.tool_name) || readString(data.name) || 'tool';
  const status = resolveEventStatus(readString(data.event));
  const node = ensureTraceNode(trace, {
    id: nodeId,
    kind: 'tool',
    title: toolName,
    status,
    namespace,
    parentId,
    timestamp
  });

  const input = data.input;
  if (input !== undefined) {
    addEvidence(trace, createToolEvidence(`${eventId}:input`, node.id, 'Tool input', input, data));
  }

  const output = data.output;
  if (output !== undefined) {
    addEvidence(trace, createToolEvidence(`${eventId}:output`, node.id, 'Tool output', output, data));
  }

  const error = data.error;
  if (error !== undefined) {
    addEvidence(trace, {
      id: `${eventId}:error`,
      nodeId: node.id,
      kind: 'error',
      title: 'Tool error',
      summary: excerpt(error),
      content: error,
      language: 'text',
      metadata: data
    });
    updateNodeStatus(node, 'error', timestamp);
  }
}

function projectTraceCustomEvent(
  trace: ExecutionTraceModel,
  eventId: string,
  data: Record<string, unknown>,
  namespace: string[],
  parentId?: string,
  timestamp?: string
): void {
  const type = readString(data.type) || readString(data.event) || readString(data.name);
  if (type === 'artifact.created' || type === 'artifact.updated') {
    const artifact = asRecord(data.artifact);
    const artifactId = readString(artifact.id) || readString(data.id) || eventId;
    const node = ensureTraceNode(trace, {
      id: `artifact:${artifactId}`,
      kind: 'artifact',
      title: readString(data.title) || readString(artifact.name) || readString(artifact.uri) || 'artifact',
      status: type === 'artifact.created' ? 'complete' : 'running',
      namespace,
      parentId,
      timestamp
    });
    addEvidence(trace, {
      id: `${eventId}:artifact`,
      nodeId: node.id,
      kind: 'artifact',
      title: node.title,
      summary: readString(data.summary) || readString(data.description) || excerpt(artifact),
      content: data,
      language: inferArtifactLanguage(artifact),
      metadata: data
    });
    if (parentId && trace.nodesById[parentId]) {
      trace.nodesById[parentId].metrics.artifactCount += 1;
    }
    return;
  }

  if (type.startsWith('task.')) {
    projectTraceTaskEvent(trace, eventId, { ...data, event: type }, namespace, parentId, timestamp);
  }
}

function projectTraceTaskEvent(
  trace: ExecutionTraceModel,
  eventId: string,
  data: Record<string, unknown>,
  namespace: string[],
  parentId?: string,
  timestamp?: string
): void {
  const taskId = readString(data.task_id) || readString(data.id) || eventId;
  ensureTraceNode(trace, {
    id: `task:${taskId}`,
    kind: 'task',
    title: readString(data.name) || readString(data.title) || readString(data.agent_name) || 'task',
    status: resolveEventStatus(readString(data.event) || readString(data.status)),
    namespace,
    parentId,
    timestamp
  });
}

function ensureNamespaceNode(trace: ExecutionTraceModel, namespace: string[], timestamp?: string): string {
  let parentId: string | undefined;
  namespace.forEach((_, index) => {
    const scopedNamespace = namespace.slice(0, index + 1);
    const nodeId = `node:${scopedNamespace.join('/')}`;
    const node = ensureTraceNode(trace, {
      id: nodeId,
      kind: 'agent',
      title: formatNamespaceLabel(scopedNamespace) || 'agent',
      status: 'running',
      namespace: scopedNamespace,
      parentId,
      timestamp
    });
    parentId = node.id;
  });
  return parentId || '';
}

function ensureTraceNode(
  trace: ExecutionTraceModel,
  input: {
    id: string;
    kind: ExecutionTraceNodeKind;
    title: string;
    status: ExecutionItemStatus;
    namespace: string[];
    parentId?: string;
    timestamp?: string;
  }
): ExecutionTraceNode {
  const existing = trace.nodesById[input.id];
  if (existing) {
    updateNodeStatus(existing, input.status, input.timestamp);
    return existing;
  }

  const node: ExecutionTraceNode = {
    id: input.id,
    kind: input.kind,
    title: input.title,
    status: input.status,
    namespace: input.namespace,
    parentId: input.parentId,
    startedAt: input.timestamp,
    completedAt: input.status === 'complete' || input.status === 'error' ? input.timestamp : undefined,
    children: [],
    metrics: {
      toolCallCount: 0,
      evidenceCount: 0,
      artifactCount: 0
    }
  };
  trace.nodesById[node.id] = node;

  if (node.parentId && trace.nodesById[node.parentId]) {
    const parent = trace.nodesById[node.parentId];
    if (!parent.children.includes(node.id)) parent.children.push(node.id);
    if (node.kind === 'tool') parent.metrics.toolCallCount += 1;
    if (node.kind === 'artifact') parent.metrics.artifactCount += 1;
  } else if (!trace.rootNodeIds.includes(node.id)) {
    trace.rootNodeIds.push(node.id);
  }

  return node;
}

function updateNodeStatus(node: ExecutionTraceNode, status: ExecutionItemStatus, timestamp?: string): void {
  if (status === 'unknown') return;
  if (node.status === 'error') return;
  node.status = status;
  if (!node.startedAt && timestamp) node.startedAt = timestamp;
  if ((status === 'complete' || status === 'error') && timestamp) node.completedAt = timestamp;
}

function addEvidence(trace: ExecutionTraceModel, evidence: ExecutionEvidence): void {
  trace.evidence.push(evidence);
  trace.evidenceByNodeId[evidence.nodeId] = [...(trace.evidenceByNodeId[evidence.nodeId] || []), evidence];
  const node = trace.nodesById[evidence.nodeId];
  if (node) node.metrics.evidenceCount += 1;
}

function createToolEvidence(
  id: string,
  nodeId: string,
  title: string,
  content: unknown,
  metadata: Record<string, unknown>
): ExecutionEvidence {
  const kind = inferEvidenceKind(content, title);
  return {
    id,
    nodeId,
    kind,
    title,
    summary: summarizeEvidence(content, kind),
    content,
    language: inferEvidenceLanguage(content, kind),
    metadata
  };
}

function inferEvidenceKind(content: unknown, title: string): ExecutionEvidenceKind {
  if (hasSqlShape(content)) return 'sql';
  if (hasTableShape(content)) return 'table';
  if (typeof content === 'object' && content !== null) {
    return title.toLowerCase().includes('output') ? 'tool_output' : 'tool_input';
  }
  return 'raw';
}

function hasSqlShape(content: unknown): boolean {
  if (typeof content === 'string') return /^\s*(select|with|insert|update|delete|create|alter|drop)\b/i.test(content);
  const record = asRecord(content);
  return ['sql', 'query', 'statement'].some((key) => {
    const value = record[key];
    return typeof value === 'string' && /^\s*(select|with|insert|update|delete|create|alter|drop)\b/i.test(value);
  });
}

function hasTableShape(content: unknown): boolean {
  if (Array.isArray(content)) return content.every((item) => item && typeof item === 'object');
  const record = asRecord(content);
  const rows = record.rows ?? record.data ?? record.records;
  return Array.isArray(rows) && rows.every((item) => item && typeof item === 'object');
}

function inferEvidenceLanguage(content: unknown, kind: ExecutionEvidenceKind): 'sql' | 'json' | 'markdown' | 'text' | undefined {
  if (kind === 'sql') return 'sql';
  if (typeof content === 'object' && content !== null) return 'json';
  if (typeof content === 'string') return 'text';
  return undefined;
}

function inferArtifactLanguage(artifact: Record<string, unknown>): 'sql' | 'json' | 'markdown' | 'text' | undefined {
  const mime = readString(artifact.mime_type) || readString(artifact.mimeType);
  const uri = readString(artifact.uri);
  if (mime.includes('markdown') || uri.endsWith('.md')) return 'markdown';
  if (mime.includes('json') || uri.endsWith('.json')) return 'json';
  if (mime.includes('sql') || uri.endsWith('.sql')) return 'sql';
  if (mime.startsWith('text/')) return 'text';
  return undefined;
}

function summarizeEvidence(content: unknown, kind: ExecutionEvidenceKind): string {
  if (kind === 'sql') {
    const sql = typeof content === 'string' ? content : readString(asRecord(content).sql) || readString(asRecord(content).query) || readString(asRecord(content).statement);
    return excerpt(sql, 120);
  }
  if (kind === 'table') {
    const rows = Array.isArray(content) ? content : (asRecord(content).rows ?? asRecord(content).data ?? asRecord(content).records);
    const count = Array.isArray(rows) ? rows.length : 0;
    return `${count} rows`;
  }
  return excerpt(content);
}

function projectExecutionEvent(event: unknown, index: number): ExecutionDetailItem[] {
  const envelope = asRecord(event);
  const params = asRecord(envelope.params);
  const data = asRecord(params.data);
  const eventId = readString(envelope.event_id) || readString(envelope.id) || `event_${index}`;
  const method = readString(envelope.method) || readString(envelope.type) || 'raw';
  const timestamp = readString(params.timestamp) || undefined;
  const namespace = readStringArray(params.namespace);
  const namespaceLabel = formatNamespaceLabel(namespace);

  if (method === 'tools') {
    return [projectToolEvent(eventId, data, timestamp, namespaceLabel)];
  }

  if (method === 'tasks') {
    return [projectTaskEvent(eventId, data, timestamp, namespaceLabel)];
  }

  if (method === 'custom') {
    return [projectCustomEvent(eventId, data, timestamp, namespaceLabel)];
  }

  if (method === 'lifecycle') {
    return [projectLifecycleEvent(eventId, data, timestamp, namespaceLabel)];
  }

  if (method === 'values' || method === 'updates') {
    const projected = [
      ...projectTodoItems(eventId, data, timestamp, namespaceLabel),
      ...projectArtifactItems(eventId, data, timestamp, namespaceLabel),
      ...projectTaskItems(eventId, data, timestamp, namespaceLabel)
    ];
    if (projected.length > 0) return projected;
  }

  if (method === 'messages') {
    const protocolEvent = readString(data.event);
    if (protocolEvent === 'error') {
      return [
        baseExecutionItem({
          id: eventId,
          kind: 'error',
          title: 'Message stream error',
          description: excerpt(data.error ?? data.message ?? data),
          status: 'error',
          timestamp,
          namespaceLabel,
          metadata: data
        })
      ];
    }
    if (namespaceLabel) {
      return [
        baseExecutionItem({
          id: eventId,
          kind: 'subagent',
          title: namespaceLabel,
          description: protocolEvent || 'Scoped message event',
          status: 'running',
          timestamp,
          namespaceLabel,
          metadata: data
        })
      ];
    }
  }

  if (namespaceLabel) {
    return [
      baseExecutionItem({
        id: eventId,
        kind: 'subagent',
        title: namespaceLabel,
        description: `${method} event`,
        status: resolveGenericStatus(data),
        timestamp,
        namespaceLabel,
        metadata: data
      })
    ];
  }

  return [
    baseExecutionItem({
      id: eventId,
      kind: 'raw',
      title: method || 'raw event',
      description: excerpt(data),
      status: resolveGenericStatus(data),
      timestamp,
      metadata: data
    })
  ];
}

function projectToolEvent(
  eventId: string,
  data: Record<string, unknown>,
  timestamp?: string,
  namespaceLabel?: string
): ExecutionDetailItem {
  const toolCallId = readString(data.tool_call_id) || readString(data.id) || eventId;
  const title = readString(data.tool_name) || readString(data.name) || 'tool';
  return baseExecutionItem({
    id: `${eventId}:${toolCallId}`,
    kind: 'tool',
    title,
    description: excerpt(data.output ?? data.input ?? data.error ?? data),
    status: resolveEventStatus(readString(data.event)),
    timestamp,
    namespaceLabel,
    metadata: data
  });
}

function projectTaskEvent(
  eventId: string,
  data: Record<string, unknown>,
  timestamp?: string,
  namespaceLabel?: string
): ExecutionDetailItem {
  const taskId = readString(data.task_id) || readString(data.id) || eventId;
  const title = readString(data.name) || readString(data.agent_name) || readString(data.task_name) || namespaceLabel || 'task';
  return baseExecutionItem({
    id: taskId,
    kind: 'task',
    title,
    description: excerpt(data.description ?? data.output ?? data.error ?? data.event ?? data),
    status: resolveEventStatus(readString(data.event) || readString(data.status)),
    timestamp,
    namespaceLabel,
    metadata: data
  });
}

function projectCustomEvent(
  eventId: string,
  data: Record<string, unknown>,
  timestamp?: string,
  namespaceLabel?: string
): ExecutionDetailItem {
  const type = readString(data.type) || readString(data.event) || readString(data.name);
  if (type === 'artifact.created' || type === 'artifact.updated') {
    const artifact = asRecord(data.artifact);
    return baseExecutionItem({
      id: readString(artifact.id) || readString(data.id) || eventId,
      kind: 'artifact',
      title: readString(data.title) || readString(artifact.name) || readString(artifact.uri) || 'artifact',
      description: readString(data.summary) || readString(data.description) || excerpt(artifact),
      status: type === 'artifact.created' ? 'complete' : 'running',
      timestamp,
      namespaceLabel,
      metadata: data
    });
  }

  if (type.startsWith('task.')) {
    return projectTaskEvent(eventId, { ...data, event: type }, timestamp, namespaceLabel);
  }

  if (type.startsWith('plan.') || type.startsWith('todo.')) {
    return baseExecutionItem({
      id: readString(data.id) || eventId,
      kind: 'plan',
      title: readString(data.title) || readString(data.content) || type,
      description: readString(data.summary) || readString(data.description) || excerpt(data),
      status: resolveEventStatus(type),
      timestamp,
      namespaceLabel,
      metadata: data
    });
  }

  if (type.includes('error') || type.includes('failed')) {
    return baseExecutionItem({
      id: readString(data.id) || eventId,
      kind: 'error',
      title: readString(data.title) || type || 'error',
      description: readString(data.summary) || readString(data.description) || excerpt(data.error ?? data),
      status: 'error',
      timestamp,
      namespaceLabel,
      metadata: data
    });
  }

  return baseExecutionItem({
    id: readString(data.id) || eventId,
    kind: 'raw',
    title: readString(data.title) || type || 'custom event',
    description: readString(data.summary) || readString(data.description) || excerpt(data),
    status: resolveGenericStatus(data),
    timestamp,
    namespaceLabel,
    metadata: data
  });
}

function projectLifecycleEvent(
  eventId: string,
  data: Record<string, unknown>,
  timestamp?: string,
  namespaceLabel?: string
): ExecutionDetailItem {
  const status = resolveEventStatus(readString(data.event));
  const kind: ExecutionItemKind = status === 'error' ? 'error' : 'plan';
  return baseExecutionItem({
    id: eventId,
    kind,
    title: readString(data.graph_name) || namespaceLabel || 'agent',
    description: readString(data.error) || readString(data.event) || excerpt(data),
    status,
    timestamp,
    namespaceLabel,
    metadata: data
  });
}

function projectTodoItems(
  eventId: string,
  data: Record<string, unknown>,
  timestamp?: string,
  namespaceLabel?: string
): ExecutionDetailItem[] {
  const todos = Array.isArray(data.todos) ? data.todos : [];
  return todos.map((todo, index) => {
    const item = asRecord(todo);
    return baseExecutionItem({
      id: readString(item.id) || `${eventId}:todo:${index}`,
      kind: 'plan',
      title: readString(item.content) || readString(item.title) || readString(item.task) || `Step ${index + 1}`,
      description: readString(item.description) || readString(item.notes) || readString(item.status) || '',
      status: resolveEventStatus(readString(item.status)),
      timestamp,
      namespaceLabel,
      metadata: item
    });
  });
}

function projectArtifactItems(
  eventId: string,
  data: Record<string, unknown>,
  timestamp?: string,
  namespaceLabel?: string
): ExecutionDetailItem[] {
  const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
  return artifacts.map((artifact, index) => {
    const item = asRecord(artifact);
    return baseExecutionItem({
      id: readString(item.id) || `${eventId}:artifact:${index}`,
      kind: 'artifact',
      title: readString(item.title) || readString(item.name) || readString(item.uri) || `Artifact ${index + 1}`,
      description: readString(item.summary) || readString(item.description) || readString(item.mime_type) || excerpt(item),
      status: resolveEventStatus(readString(item.status)) === 'unknown' ? 'complete' : resolveEventStatus(readString(item.status)),
      timestamp,
      namespaceLabel,
      metadata: item
    });
  });
}

function projectTaskItems(
  eventId: string,
  data: Record<string, unknown>,
  timestamp?: string,
  namespaceLabel?: string
): ExecutionDetailItem[] {
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  return tasks.map((task, index) => {
    const item = asRecord(task);
    return baseExecutionItem({
      id: readString(item.task_id) || readString(item.id) || `${eventId}:task:${index}`,
      kind: 'task',
      title: readString(item.name) || readString(item.title) || readString(item.agent_name) || `Task ${index + 1}`,
      description: readString(item.description) || readString(item.summary) || excerpt(item),
      status: resolveEventStatus(readString(item.status)),
      timestamp,
      namespaceLabel,
      metadata: item
    });
  });
}

function appendExecutionItem(model: ExecutionDetailModel, item: ExecutionDetailItem): void {
  if (item.kind === 'plan') model.plan.push(item);
  else if (item.kind === 'subagent') model.subagents.push(item);
  else if (item.kind === 'tool') model.tools.push(item);
  else if (item.kind === 'task') model.tasks.push(item);
  else if (item.kind === 'artifact') model.artifacts.push(item);
  else if (item.kind === 'error') model.errors.push(item);
  else if (item.kind === 'message') model.messages.push(item);
  else model.rawEvents.push(item);
}

function baseExecutionItem(item: ExecutionDetailItem): ExecutionDetailItem {
  return item;
}

function resolveEventStatus(value: string): ExecutionItemStatus {
  const status = value.toLowerCase();
  if (status.includes('error') || status.includes('fail') || status === 'rejected') return 'error';
  if (status.includes('complete') || status.includes('finish') || status.includes('done') || status === 'approved') {
    return 'complete';
  }
  if (status.includes('start') || status.includes('run') || status.includes('progress') || status.includes('pending')) {
    return 'running';
  }
  if (status === 'todo' || status === 'open') return 'pending';
  return 'unknown';
}

function resolveGenericStatus(data: Record<string, unknown>): ExecutionItemStatus {
  return resolveEventStatus(readString(data.status) || readString(data.event) || readString(data.type));
}

function formatNamespaceLabel(namespace: string[]): string | undefined {
  if (namespace.length === 0) return undefined;
  return namespace[namespace.length - 1].split(':', 1)[0] || namespace[namespace.length - 1];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function excerpt(value: unknown, limit = 180): string {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 3)}...`;
}

function resolveMessageKind(message: unknown): string {
  if (!message || typeof message !== 'object') return 'assistant';
  const candidate =
    (message as { type?: unknown; role?: unknown; _getType?: () => string }).type ??
    (message as { role?: unknown }).role ??
    (message as { _getType?: () => string })._getType?.();
  return String(candidate ?? '').toLowerCase();
}

function resolveRole(kind: string): ConversationRole {
  if (kind.includes('human') || kind === 'user') return 'user';
  if (kind.includes('system')) return 'system';
  return 'assistant';
}

function isInternalMessageKind(kind: string): boolean {
  return kind.includes('tool') || kind.includes('function');
}

function normalizeDisplayContent(content: string, role: ConversationRole): string {
  const trimmed = content.trim();
  if (role !== 'assistant') return trimmed;
  return trimmed.replace(/^PricingMeetingAgent\s*\n+/i, '').trim();
}

function isDisplayableContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (/^No async subagent tasks tracked\.?$/i.test(trimmed)) return false;
  if (/^\[\s*\]$/.test(trimmed) || /^\{\s*\}$/.test(trimmed)) return false;
  return true;
}

function resolveId(message: unknown, index: number): string {
  if (message && typeof message === 'object' && typeof (message as { id?: unknown }).id === 'string') {
    return (message as { id: string }).id;
  }
  return `message_${index}`;
}

function resolveContent(message: unknown): string {
  if (typeof message === 'string') return message;
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text);
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(content ?? '');
}

function resolveOutputContent(output: unknown): string {
  if (typeof output === 'string') return output.trim();
  if (!output || typeof output !== 'object') return '';
  const content = (output as { content?: unknown }).content;
  if (typeof content === 'string') return content.trim();
  return JSON.stringify(output);
}

function resolveSubagentStatusLabel(status: SubagentProcessStatus): string {
  if (status === 'complete') return '已完成';
  if (status === 'error') return '异常';
  return '运行中';
}

function formatElapsedTime(startedAt?: Date | null, completedAt?: Date | null): string | null {
  if (!(startedAt instanceof Date)) return null;
  const end = completedAt instanceof Date ? completedAt : null;
  if (!end) return null;
  const seconds = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
