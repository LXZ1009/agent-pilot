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

export interface LatestRunOutput {
  title: string;
  content: string;
}

export interface RunExecutionSummary {
  label: string;
  title: string;
  description: string;
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
  metadata?: Record<string, unknown>;
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

export type InteractionRunStatus = 'running' | 'complete' | 'error' | 'waiting' | 'unknown';

export interface RunMetrics {
  agentCount: number;
  toolCallCount: number;
  todoTotal: number;
  todoCompleted: number;
  artifactCount: number;
  citationCount: number;
  diagnosticCount: number;
  duplicateEventCount: number;
}

export interface InteractionRun {
  id: string;
  threadId?: string;
  title: string;
  userMessageId?: string;
  startedAt?: string;
  completedAt?: string;
  status: InteractionRunStatus;
  eventIds: string[];
  lifecycleEventIds: string[];
  rootNodeIds: string[];
  metrics: RunMetrics;
}

export interface ProgressItem {
  id: string;
  runId: string;
  title: string;
  status: ExecutionItemStatus;
  timestamp?: string;
  producerNodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactDescriptor {
  id: string;
  runId: string;
  title: string;
  uri?: string;
  mimeType?: string;
  role: ArtifactRole;
  source: ArtifactSource;
  kind: 'document' | 'data' | 'table' | 'preview' | 'bundle' | 'link' | 'unknown';
  summary?: string;
  producerNodeId?: string;
  schemaRef?: string;
  content?: unknown;
  metadata?: Record<string, unknown>;
}

export type ArtifactRole = 'deliverable' | 'workspace_file' | 'manifest' | 'preview';
export type ArtifactSource = 'inline' | 'workspace';

export interface DiagnosticItem {
  id: string;
  runId: string;
  severity: 'info' | 'warning' | 'error';
  type: 'missing_fields' | 'error' | 'warning' | 'interrupt' | 'duplicate_events' | 'raw';
  title: string;
  summary: string;
  producerNodeId?: string;
  evidenceIds: string[];
  content?: unknown;
}

export interface RunInspectorModel {
  runs: InteractionRun[];
  activeRunId?: string;
  progressByRunId: Record<string, ProgressItem[]>;
  traceByRunId: Record<string, ExecutionTraceModel>;
  artifactsByRunId: Record<string, ArtifactDescriptor[]>;
  citationsByRunId: Record<string, ResultCitation[]>;
  diagnosticsByRunId: Record<string, DiagnosticItem[]>;
  rawEventsByRunId: Record<string, unknown[]>;
}

const artifactRoleOrder: Record<ArtifactRole, number> = {
  deliverable: 0,
  preview: 1,
  manifest: 2,
  workspace_file: 3
};

export function sortArtifactsForWorkspace(artifacts: ArtifactDescriptor[]): ArtifactDescriptor[] {
  return [...artifacts].sort((left, right) => {
    const roleDelta = artifactRoleOrder[left.role] - artifactRoleOrder[right.role];
    if (roleDelta !== 0) return roleDelta;
    return left.title.localeCompare(right.title);
  });
}

export function mergeArtifactDescriptors(
  eventArtifacts: ArtifactDescriptor[],
  backendArtifacts: ArtifactDescriptor[]
): ArtifactDescriptor[] {
  const byId = new Map<string, ArtifactDescriptor>();
  eventArtifacts.forEach((artifact) => byId.set(artifact.id, artifact));
  backendArtifacts.forEach((artifact) => byId.set(artifact.id, artifact));
  return sortArtifactsForWorkspace([...byId.values()]);
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

export function buildTraceSubagentProcessCards(
  trace: ExecutionTraceModel,
  runStatus?: InteractionRunStatus
): SubagentProcessCard[] {
  return trace.nodes
    .filter((node) => node.kind === 'agent')
    .map((node) => {
      const evidence = collectTraceEvidence(trace, node.id);
      const latestUsefulEvidence = [...evidence]
        .reverse()
        .find((item) => item.kind === 'tool_output' || item.kind === 'message' || item.kind === 'artifact');
      const status: SubagentProcessStatus =
        node.status === 'error'
          ? 'error'
          : node.status === 'complete' || runStatus === 'complete'
            ? 'complete'
            : 'running';
      const preview =
        latestUsefulEvidence?.kind === 'tool_output'
          ? resolveOutputContent(latestUsefulEvidence.content) || latestUsefulEvidence.summary
          : latestUsefulEvidence?.summary || '子 Agent 已完成';
      return {
        id: node.id,
        title: node.title,
        description: '子 Agent 执行任务',
        status,
        statusLabel: resolveSubagentStatusLabel(status),
        preview,
        elapsedLabel: formatElapsedTime(
          node.startedAt ? new Date(node.startedAt) : null,
          resolveTraceNodeCompletedAt(trace, node.id)
        )
      };
    });
}

export function buildLatestRunOutput(trace: ExecutionTraceModel): LatestRunOutput | undefined {
  const candidates = trace.nodes
    .filter((node) => node.kind === 'supervisor' || node.kind === 'system')
    .flatMap((node) =>
      (trace.evidenceByNodeId[node.id] ?? [])
        .filter((evidence) => evidence.kind === 'message' && typeof evidence.content === 'string')
        .map((evidence) => ({
          title: node.title,
          content: String(evidence.content),
          timestamp: node.completedAt || node.startedAt || ''
        }))
    );
  const latest = candidates.at(-1);
  if (!latest) return undefined;
  return { title: latest.title, content: latest.content };
}

export function mergeConversationRowsWithLatestOutput(
  rows: ConversationRow[],
  latestOutput?: LatestRunOutput
): ConversationRow[] {
  if (!latestOutput) return rows;
  const hasSameAssistantReply = rows.some(
    (row) => row.role === 'assistant' && row.content.trim() === latestOutput.content.trim()
  );
  if (hasSameAssistantReply) return rows;
  return [
    ...rows,
    {
      id: 'trace_latest_output',
      role: 'assistant',
      actor: latestOutput.title,
      content: latestOutput.content
    }
  ];
}

export function buildRunExecutionSummary(
  run: InteractionRun | undefined,
  context: {
    liveSubagentCount: number;
    archivedSubagentCount: number;
    progressCount: number;
  }
): RunExecutionSummary | undefined {
  if (!run) return undefined;

  const collaborativeCount = context.liveSubagentCount || context.archivedSubagentCount;
  if (run.status === 'waiting') {
    return {
      label: '等待用户',
      title: '等待用户继续',
      description: '当前任务正在等待新的输入。'
    };
  }
  if (run.status === 'error') {
    return {
      label: '异常',
      title: '执行异常',
      description: '当前任务需要检查诊断信息。'
    };
  }
  if (run.status === 'complete') {
    return collaborativeCount > 0
      ? {
          label: '已完成',
          title: '本轮协同已完成',
          description: `${collaborativeCount} 个协同单元已完成。`
        }
      : {
          label: '已完成',
          title: '本轮任务已完成',
          description: '当前任务已经结束。'
        };
  }
  if (collaborativeCount > 0) {
    return {
      label: '运行中',
      title: '协同执行中',
      description: `${collaborativeCount} 个协同单元正在参与执行。`
    };
  }
  if (context.progressCount > 0) {
    return {
      label: '运行中',
      title: '执行推进中',
      description: '当前任务正在推进执行步骤。'
    };
  }
  return {
    label: '运行中',
    title: '主流程处理中',
    description: '当前任务仍在执行。'
  };
}

function collectTraceEvidence(trace: ExecutionTraceModel, nodeId: string): ExecutionEvidence[] {
  const node = trace.nodesById[nodeId];
  if (!node) return [];
  return [
    ...(trace.evidenceByNodeId[node.id] ?? []),
    ...node.children.flatMap((childId) => collectTraceEvidence(trace, childId))
  ];
}

function resolveTraceNodeCompletedAt(trace: ExecutionTraceModel, nodeId: string): Date | null {
  const node = trace.nodesById[nodeId];
  if (!node) return null;
  const completedAt = [
    node.completedAt,
    ...node.children.map((childId) => resolveTraceNodeCompletedAt(trace, childId)?.toISOString())
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return completedAt ? new Date(completedAt) : null;
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

export function buildRunInspectorModel(events: unknown[]): RunInspectorModel {
  const deduped = dedupeEvents(events);
  const runs = buildInteractionRuns(deduped.events, deduped.duplicateCount);
  const rawEventsByRunId = assignEventsToRuns(deduped.events, runs);
  const traceByRunId: Record<string, ExecutionTraceModel> = {};
  const progressByRunId: Record<string, ProgressItem[]> = {};
  const artifactsByRunId: Record<string, ArtifactDescriptor[]> = {};
  const citationsByRunId: Record<string, ResultCitation[]> = {};
  const diagnosticsByRunId: Record<string, DiagnosticItem[]> = {};

  runs.forEach((run) => {
    const runEvents = rawEventsByRunId[run.id] ?? [];
    const trace = buildExecutionTraceModel(runEvents);
    const progress = projectRunProgress(run.id, runEvents);
    const artifacts = projectRunArtifacts(run.id, runEvents);
    const diagnostics = projectRunDiagnostics(run.id, runEvents, deduped.duplicateCount);

    traceByRunId[run.id] = trace;
    progressByRunId[run.id] = progress;
    artifactsByRunId[run.id] = artifacts;
    citationsByRunId[run.id] = trace.citations;
    diagnosticsByRunId[run.id] = diagnostics;
    run.rootNodeIds = trace.rootNodeIds;
    run.metrics = calculateRunMetrics(trace, progress, artifacts, trace.citations, diagnostics, deduped.duplicateCount);
  });

  return {
    runs,
    activeRunId: runs.at(-1)?.id,
    progressByRunId,
    traceByRunId,
    artifactsByRunId,
    citationsByRunId,
    diagnosticsByRunId,
    rawEventsByRunId
  };
}

function dedupeEvents(events: unknown[]): { events: unknown[]; duplicateCount: number } {
  const seen = new Set<string>();
  const uniqueEvents: unknown[] = [];
  let duplicateCount = 0;

  events.forEach((event, index) => {
    const eventId = resolveEventId(event, index);
    if (seen.has(eventId)) {
      duplicateCount += 1;
      return;
    }
    seen.add(eventId);
    uniqueEvents.push(event);
  });

  return { events: uniqueEvents, duplicateCount };
}

function buildInteractionRuns(events: unknown[], duplicateCount: number): InteractionRun[] {
  const runs: InteractionRun[] = [];
  let activeRun: InteractionRun | null = null;

  events.forEach((event, index) => {
    const envelope = asRecord(event);
    const params = asRecord(envelope.params);
    const data = asRecord(params.data);
    const eventId = resolveEventId(event, index);
    const method = readString(envelope.method) || readString(envelope.type);
    const timestamp = readString(params.timestamp) || undefined;
    const lifecycleEvent = readString(data.event);

    if (method === 'lifecycle' && lifecycleEvent === 'running') {
      activeRun = createInteractionRun(readString(data.run_id), eventId, timestamp, duplicateCount);
      runs.push(activeRun);
      return;
    }

    if (!activeRun) {
      activeRun = createInteractionRun(readString(data.run_id), eventId, timestamp, duplicateCount, 'unknown');
      runs.push(activeRun);
    }

    activeRun.eventIds.push(eventId);
    assignUserMessageTitle(activeRun, data);

    if (method === 'lifecycle') {
      activeRun.lifecycleEventIds.push(eventId);
      if (lifecycleEvent === 'completed') {
        activeRun.status = 'complete';
        activeRun.completedAt = timestamp;
        activeRun = null;
      } else if (lifecycleEvent === 'failed' || lifecycleEvent === 'error') {
        activeRun.status = 'error';
        activeRun.completedAt = timestamp;
        activeRun = null;
      }
    }
  });

  return runs;
}

function createInteractionRun(
  runId: string,
  eventId: string,
  timestamp: string | undefined,
  duplicateCount: number,
  status: InteractionRunStatus = 'running'
): InteractionRun {
  return {
    id: runId || `run:${eventId}`,
    title: 'Current task',
    startedAt: timestamp,
    status,
    eventIds: [eventId],
    lifecycleEventIds: [eventId],
    rootNodeIds: [],
    metrics: emptyRunMetrics(duplicateCount)
  };
}

function assignUserMessageTitle(run: InteractionRun, data: Record<string, unknown>): void {
  const message = firstUserMessage(data);
  if (!message) return;
  run.userMessageId = readString(message.id) || run.userMessageId;
  run.title = excerpt(resolveContent(message), 48) || run.title;
}

function firstUserMessage(data: Record<string, unknown>): Record<string, unknown> | null {
  const messages = Array.isArray(data.messages) ? data.messages : [];
  for (const message of messages) {
    const item = asRecord(message);
    const kind = resolveMessageKind(item);
    if (resolveRole(kind) === 'user') return item;
  }
  return null;
}

function assignEventsToRuns(events: unknown[], runs: InteractionRun[]): Record<string, unknown[]> {
  const eventsByRunId = Object.fromEntries(runs.map((run) => [run.id, [] as unknown[]]));
  const runByEventId = new Map<string, string>();
  runs.forEach((run) => run.eventIds.forEach((eventId) => runByEventId.set(eventId, run.id)));

  events.forEach((event, index) => {
    const runId = runByEventId.get(resolveEventId(event, index));
    if (!runId) return;
    eventsByRunId[runId] = [...(eventsByRunId[runId] || []), event];
  });

  return eventsByRunId;
}

function projectRunProgress(runId: string, events: unknown[]): ProgressItem[] {
  const latestByKey = new Map<string, ProgressItem>();
  events.forEach((event, eventIndex) => {
    const envelope = asRecord(event);
    const params = asRecord(envelope.params);
    const data = asRecord(params.data);
    const timestamp = readString(params.timestamp) || undefined;
    const todos = Array.isArray(data.todos) ? data.todos : [];

    todos.forEach((todo, todoIndex) => {
      const item = asRecord(todo);
      const title = readString(item.content) || readString(item.title) || readString(item.task);
      if (!title) return;
      latestByKey.set(`todo:${readString(item.id) || title}`, {
        id: readString(item.id) || `${runId}:todo:${eventIndex}:${todoIndex}`,
        runId,
        title,
        status: resolveEventStatus(readString(item.status)),
        timestamp,
        metadata: item
      });
    });

    collectRecordItems(data.async_tasks).forEach(({ key, value }, taskIndex) => {
      const taskId = readString(value.task_id) || readString(value.id) || key || `${eventIndex}:${taskIndex}`;
      const title =
        readString(value.title) ||
        readString(value.name) ||
        readString(value.agent_name) ||
        readString(value.task_name) ||
        `Async task ${taskId.slice(0, 8)}`;
      latestByKey.set(`async:${taskId}`, {
        id: `${runId}:async:${taskId}`,
        runId,
        title,
        status: resolveEventStatus(readString(value.status) || readString(value.event)),
        timestamp: readString(value.last_updated_at) || readString(value.last_updated) || timestamp,
        producerNodeId: `task:${taskId}`,
        metadata: { ...value, task_id: taskId }
      });
    });
  });

  return [...latestByKey.values()];
}

function projectRunArtifacts(runId: string, events: unknown[]): ArtifactDescriptor[] {
  const artifacts: ArtifactDescriptor[] = [];
  events.forEach((event, eventIndex) => {
    const envelope = asRecord(event);
    const params = asRecord(envelope.params);
    const data = asRecord(params.data);
    const method = readString(envelope.method) || readString(envelope.type);

    if (method === 'custom') {
      const type = readString(data.type) || readString(data.event);
      if (type === 'artifact.created' || type === 'artifact.updated') {
        const descriptor = toArtifactDescriptor(
          runId,
          `${runId}:artifact:${eventIndex}`,
          asRecord(data.artifact),
          data
        );
        artifacts.push(descriptor, ...expandManifestArtifacts(runId, descriptor));
      }
    }

    if (method === 'tools' && readString(data.event) === 'tool-finished') {
      declaredArtifactsFromToolOutput(data.output).forEach((artifact, artifactIndex) => {
        const descriptor = toArtifactDescriptor(
          runId,
          `${runId}:tool-artifact:${eventIndex}:${artifactIndex}`,
          artifact,
          data
        );
        artifacts.push(descriptor, ...expandManifestArtifacts(runId, descriptor));
      });
    }
  });
  return artifacts;
}

function toArtifactDescriptor(
  runId: string,
  fallbackId: string,
  artifact: Record<string, unknown>,
  metadata: Record<string, unknown>
): ArtifactDescriptor {
  const mimeType = readString(artifact.mime_type) || readString(artifact.mimeType) || undefined;
  const uri = readString(artifact.uri) || undefined;
  const content = artifact.content;
  const title =
    readString(metadata.title) ||
    readString(artifact.title) ||
    readString(artifact.name) ||
    uri ||
    'Artifact';

  return {
    id: readString(artifact.id) || fallbackId,
    runId,
    title,
    uri,
    mimeType,
    role: normalizeArtifactRole(artifact.role, 'deliverable'),
    source: normalizeArtifactSource(artifact.source, content),
    kind: inferArtifactKind(mimeType || '', uri || '', content),
    summary: readString(metadata.summary) || readString(artifact.summary) || undefined,
    schemaRef: readString(artifact.schema_ref) || readString(artifact.schemaRef) || undefined,
    content,
    metadata
  };
}

function normalizeArtifactRole(value: unknown, fallback: ArtifactRole): ArtifactRole {
  if (value === 'deliverable' || value === 'workspace_file' || value === 'manifest' || value === 'preview') {
    return value;
  }
  return fallback;
}

function normalizeArtifactSource(value: unknown, content: unknown): ArtifactSource {
  if (value === 'inline' || value === 'workspace') return value;
  return content === undefined ? 'workspace' : 'inline';
}

function expandManifestArtifacts(runId: string, artifact: ArtifactDescriptor): ArtifactDescriptor[] {
  if (artifact.role !== 'manifest') return [];
  const content = asRecord(artifact.content);
  const children = Array.isArray(content.artifacts) ? content.artifacts : [];
  return children.map((child, index) =>
    toArtifactDescriptor(
      runId,
      `${artifact.id}:child:${index}`,
      asRecord(child),
      { parentArtifactId: artifact.id }
    )
  );
}

function declaredArtifactsFromToolOutput(output: unknown): Record<string, unknown>[] {
  const payload = asRecord(output);
  if (Array.isArray(payload.artifacts)) {
    return payload.artifacts.map((item) => asRecord(item)).filter((item) => Object.keys(item).length > 0);
  }
  const artifact = asRecord(payload.artifact);
  return Object.keys(artifact).length > 0 ? [artifact] : [];
}

function inferArtifactKind(mimeType: string, uri: string, content: unknown): ArtifactDescriptor['kind'] {
  if (mimeType.includes('markdown') || uri.endsWith('.md')) return 'document';
  if (mimeType.includes('json') || uri.endsWith('.json')) return hasTableShape(content) ? 'table' : 'data';
  if (mimeType.startsWith('text/')) return 'document';
  if (uri.startsWith('http://') || uri.startsWith('https://')) return 'link';
  if (typeof content === 'object' && content !== null) return hasTableShape(content) ? 'table' : 'data';
  return 'unknown';
}

function projectRunDiagnostics(runId: string, events: unknown[], duplicateCount: number): DiagnosticItem[] {
  const diagnostics: DiagnosticItem[] = [];
  if (duplicateCount > 0) {
    diagnostics.push({
      id: `${runId}:duplicates`,
      runId,
      severity: 'info',
      type: 'duplicate_events',
      title: 'Duplicate events folded',
      summary: `${duplicateCount} duplicate events were hidden from operator views`,
      evidenceIds: []
    });
  }

  events.forEach((event, index) => {
    const envelope = asRecord(event);
    const params = asRecord(envelope.params);
    const data = asRecord(params.data);
    const error = data.error ?? data.exception;
    if (resolveGenericStatus(data) !== 'error' && error === undefined) return;
    diagnostics.push({
      id: `${runId}:error:${index}`,
      runId,
      severity: 'error',
      type: 'error',
      title: readString(data.title) || 'Execution error',
      summary: excerpt(error ?? data),
      evidenceIds: [],
      content: data
    });
  });

  return diagnostics;
}

function calculateRunMetrics(
  trace: ExecutionTraceModel,
  progress: ProgressItem[],
  artifacts: ArtifactDescriptor[],
  citations: ResultCitation[],
  diagnostics: DiagnosticItem[],
  duplicateCount: number
): RunMetrics {
  return {
    agentCount: trace.nodes.filter((node) => node.kind === 'agent').length,
    toolCallCount: trace.nodes.filter((node) => node.kind === 'tool').length,
    todoTotal: progress.length,
    todoCompleted: progress.filter((item) => item.status === 'complete').length,
    artifactCount: artifacts.length || trace.summary.artifactCount,
    citationCount: citations.length,
    diagnosticCount: diagnostics.length,
    duplicateEventCount: duplicateCount
  };
}

function emptyRunMetrics(duplicateCount: number): RunMetrics {
  return {
    agentCount: 0,
    toolCallCount: 0,
    todoTotal: 0,
    todoCompleted: 0,
    artifactCount: 0,
    citationCount: 0,
    diagnosticCount: 0,
    duplicateEventCount: duplicateCount
  };
}

function resolveEventId(event: unknown, index: number): string {
  const envelope = asRecord(event);
  return readString(envelope.event_id) || readString(envelope.id) || `event_${index}`;
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

  if (method === 'values' || method === 'updates') {
    projectTraceValuesEvent(trace, eventId, data, namespace, parentId, timestamp);
    return;
  }

  if (method === 'messages' && parentId) {
    updateNodeStatus(trace.nodesById[parentId], 'running', timestamp);
    const content = resolveContent(data);
    const summary = isDisplayableContent(content) ? excerpt(content) : readString(data.event) || 'message event';
    if (!trace.nodesById[parentId].summary) trace.nodesById[parentId].summary = summary;
    if (isDisplayableContent(content)) {
      addEvidence(trace, {
        id: `${eventId}:message`,
        nodeId: parentId,
        kind: 'message',
        title: 'Agent message',
        summary,
        content,
        language: 'text',
        metadata: data
      });
    }
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

function projectTraceValuesEvent(
  trace: ExecutionTraceModel,
  eventId: string,
  data: Record<string, unknown>,
  namespace: string[],
  parentId?: string,
  timestamp?: string
): void {
  const messages = Array.isArray(data.messages) ? data.messages : [];
  messages.forEach((message, messageIndex) => {
    projectTraceMessageSnapshot(trace, `${eventId}:message:${messageIndex}`, asRecord(message), namespace, parentId, timestamp);
  });

  collectRecordItems(data.tasks).forEach(({ value }, taskIndex) => {
    projectTraceTaskEvent(trace, `${eventId}:task:${taskIndex}`, value, namespace, parentId, timestamp);
  });

  collectRecordItems(data.async_tasks).forEach(({ key, value }, taskIndex) => {
    const taskId = readString(value.task_id) || readString(value.id) || key || `${eventId}:${taskIndex}`;
    projectTraceTaskEvent(
      trace,
      `${eventId}:async:${taskIndex}`,
      { ...value, task_id: taskId, name: readString(value.agent_name) || readString(value.name), event: readString(value.status) },
      namespace,
      parentId,
      readString(value.last_updated_at) || readString(value.last_updated) || timestamp
    );
  });
}

function projectTraceMessageSnapshot(
  trace: ExecutionTraceModel,
  fallbackId: string,
  message: Record<string, unknown>,
  namespace: string[],
  parentId?: string,
  timestamp?: string
): void {
  const messageId = readString(message.id) || fallbackId;
  const kind = resolveMessageKind(message);
  const role = resolveRole(kind);

  if (role === 'user') {
    const node = ensureTraceNode(trace, {
      id: `user:${messageId}`,
      kind: 'user',
      title: 'User',
      status: 'complete',
      namespace,
      timestamp,
      metadata: { messageId }
    });
    const content = resolveContent(message);
    if (isDisplayableContent(content)) {
      addEvidence(trace, {
        id: `${messageId}:message`,
        nodeId: node.id,
        kind: 'message',
        title: 'User message',
        summary: excerpt(content),
        content,
        language: 'text',
        metadata: message
      });
    }
    return;
  }

  if (isInternalMessageKind(kind)) {
    projectTraceToolMessage(trace, messageId, message, namespace, parentId, timestamp);
    return;
  }

  const ownerId = ensureMessageOwnerNode(trace, message, namespace, parentId, timestamp);
  const content = resolveContent(message);
  if (isDisplayableContent(content)) {
    const summary = excerpt(content);
    const owner = trace.nodesById[ownerId];
    if (owner && !owner.summary) owner.summary = summary;
    addEvidence(trace, {
      id: `${messageId}:message`,
      nodeId: ownerId,
      kind: 'message',
      title: 'Agent message',
      summary,
      content,
      language: 'text',
      metadata: message
    });
  }

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  toolCalls.forEach((toolCall, index) => {
    const item = asRecord(toolCall);
    const toolCallId = readString(item.id) || readString(item.tool_call_id) || `${messageId}:tool:${index}`;
    const toolName = readString(item.name) || readString(item.tool_name) || 'tool';
    const input = item.args ?? item.input;
    const node = ensureTraceNode(trace, {
      id: `tool:${toolCallId}`,
      kind: 'tool',
      title: toolName,
      status: 'running',
      namespace,
      parentId: ownerId,
      timestamp,
      metadata: { toolCallId, toolName, inputEventId: messageId }
    });
    if (input !== undefined) {
      addEvidence(trace, createToolEvidence(`${toolCallId}:input`, node.id, 'Tool input', input, item));
    }
  });
}

function projectTraceToolMessage(
  trace: ExecutionTraceModel,
  messageId: string,
  message: Record<string, unknown>,
  namespace: string[],
  parentId?: string,
  timestamp?: string
): void {
  const toolCallId = readString(message.tool_call_id) || readString(message.id) || messageId;
  const toolName = readString(message.name) || readString(message.tool_name) || 'tool';
  const status = resolveEventStatus(readString(message.status)) === 'unknown'
    ? 'complete'
    : resolveEventStatus(readString(message.status));
  const node = ensureTraceNode(trace, {
    id: `tool:${toolCallId}`,
    kind: 'tool',
    title: toolName,
    status,
    namespace,
    parentId,
    timestamp,
    metadata: { toolCallId, toolName, outputEventId: messageId }
  });
  const content = parseStructuredText(resolveContent(message));
  addEvidence(trace, createToolEvidence(`${toolCallId}:output`, node.id, 'Tool output', content, message));
}

function ensureMessageOwnerNode(
  trace: ExecutionTraceModel,
  message: Record<string, unknown>,
  namespace: string[],
  parentId?: string,
  timestamp?: string
): string {
  if (parentId && trace.nodesById[parentId]) {
    updateNodeStatus(trace.nodesById[parentId], 'running', timestamp);
    return parentId;
  }

  const name = readString(message.name) || readString(message.agent_name) || 'Supervisor';
  const node = ensureTraceNode(trace, {
    id: `supervisor:${name}`,
    kind: 'supervisor',
    title: name,
    status: 'running',
    namespace,
    timestamp,
    metadata: { messageId: readString(message.id) || undefined }
  });
  return node.id;
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
  const input = data.input;
  const output = data.output;
  const node = ensureTraceNode(trace, {
    id: nodeId,
    kind: 'tool',
    title: toolName,
    status,
    namespace,
    parentId,
    timestamp,
    metadata: {
      toolCallId,
      toolName,
      ...(input !== undefined ? { inputEventId: eventId } : {}),
      ...(output !== undefined ? { outputEventId: eventId } : {}),
      ...(data.error !== undefined ? { errorEventId: eventId } : {})
    }
  });

  if (input !== undefined) {
    addEvidence(trace, createToolEvidence(`${eventId}:input`, node.id, 'Tool input', input, data));
  }

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
    timestamp,
    metadata: { ...data, taskId }
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
    metadata?: Record<string, unknown>;
  }
): ExecutionTraceNode {
  const existing = trace.nodesById[input.id];
  if (existing) {
    updateNodeStatus(existing, input.status, input.timestamp);
    if (input.metadata) existing.metadata = { ...(existing.metadata ?? {}), ...input.metadata };
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
    metadata: input.metadata,
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
  if (trace.evidence.some((item) => item.id === evidence.id)) return;
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
  if (
    status.includes('complete') ||
    status.includes('finish') ||
    status.includes('done') ||
    status === 'approved' ||
    status === 'success' ||
    status === 'succeeded'
  ) {
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

function collectRecordItems(value: unknown): Array<{ key: string; value: Record<string, unknown> }> {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({ key: String(index), value: asRecord(item) }));
  }
  const record = asRecord(value);
  return Object.entries(record).map(([key, item]) => ({ key, value: asRecord(item) }));
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

function parseStructuredText(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^[{\[]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
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
