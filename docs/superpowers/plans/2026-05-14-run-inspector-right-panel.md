# Run Inspector Right Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the right panel from a thread-level evidence drawer into a run-scoped task inspector that shows progress, execution trace, artifacts, citations, and diagnostics without hard-coding business agents, tool names, or file names.

**Architecture:** Raw Agent Streaming Protocol events remain the source of truth, but the frontend must project them through platform models before rendering. The first implementation derives `InteractionRun` boundaries from user messages and lifecycle spans; a later backend enhancement can persist explicit `interaction_id` / `run_id` metadata for stronger correlation. The UI renders generic platform objects only: runs, progress items, trace nodes, evidence, artifacts, citations, diagnostics, and raw events.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, `@langchain/react`, FastAPI, Python 3.11, DeepAgents / LangGraph Agent Streaming Protocol.

---

## Design Constraints

- Do not classify by concrete agent names such as `pricing_meeting_agent` or `interview_structuring_agent`.
- Do not classify by concrete tool names such as `write_todos`, `task`, or `inspect_interview_card_schema`.
- Do not classify by fixed artifact file names such as `asset_index.json`, `missing_info.json`, or `meeting_brief.md`.
- Use platform signals first: `namespace`, `tool_call_id`, lifecycle spans, message role/type, todo shape, file/artifact descriptors, MIME type, JSON/table/Markdown shape, and custom event envelopes.
- Treat existing `summary_cards` as a compatibility fallback. New UI should prefer typed projections from `technical_events`.
- The default right-panel scope is the current user interaction, not the entire thread.

## Target Information Architecture

Right panel title: `当前任务`

Header:

- User request summary.
- Run status: `running`, `complete`, `error`, `waiting`, or `unknown`.
- Duration.
- Agent count.
- Tool call count.
- Todo progress.
- Artifact count.
- Diagnostic count.

Tabs:

- `进度`: default tab. Shows current todo/progress state, active nodes, latest output, and compact run metrics.
- `链路`: trace-first execution tree and selected node details.
- `产物`: Codex-like run-scoped artifact viewer for generated Markdown, JSON, tables, preview blocks, and artifact bundles.
- `依据`: claim/citation/evidence view. Shows why final outputs say what they say.
- `诊断`: missing fields, warnings, errors, interruptions, duplicate-event counts, and raw protocol events.

## Platform Model

Add these frontend types in `frontend/src/workspaceView.ts`:

```ts
export type InteractionRunStatus = 'running' | 'complete' | 'error' | 'waiting' | 'unknown';

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
  kind: 'document' | 'data' | 'table' | 'preview' | 'bundle' | 'link' | 'unknown';
  summary?: string;
  producerNodeId?: string;
  schemaRef?: string;
  content?: unknown;
  metadata?: Record<string, unknown>;
}

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
```

## File Structure

- Modify `frontend/src/workspaceView.ts`: platform projection types and pure functions.
- Modify `frontend/src/workspaceView.test.ts`: projection tests using realistic duplicate `values` snapshots and lifecycle spans.
- Modify `frontend/src/App.tsx`: replace evidence drawer tab model with run inspector UI.
- Modify `frontend/src/styles.css`: right-panel layout, progress, trace, artifact, citation, and diagnostic styles.
- Modify `frontend/src/api.ts`: keep current API shape; only add types if backend response evolves.
- Modify `backend/src/agent_pilot/evidence.py`: later task only, add deduped event metadata and optional typed archive response while preserving current response.
- Modify `docs/deepagents-execution-detail-p0.md`: document the new run-scoped projection rules and UI contract.

## Task 1: Add Run Boundary Projection Tests

**Files:**

- Modify: `frontend/src/workspaceView.test.ts`
- Modify later: `frontend/src/workspaceView.ts`

- [ ] **Step 1: Write a failing test for duplicate-event dedupe**

Add a test near the current execution trace tests:

```ts
it('dedupes technical events before building run inspector projections', () => {
  const events = [
    lifecycleEvent('thread_1:1', 1, 'running', '2026-05-14T09:34:27.000Z'),
    lifecycleEvent('thread_1:1', 1, 'running', '2026-05-14T09:34:27.000Z'),
    lifecycleEvent('thread_1:2', 2, 'completed', '2026-05-14T09:34:31.000Z')
  ];

  const model = buildRunInspectorModel(events);

  expect(model.runs).toHaveLength(1);
  expect(model.runs[0].eventIds).toEqual(['thread_1:1', 'thread_1:2']);
  expect(model.runs[0].metrics.duplicateEventCount).toBe(1);
});
```

- [ ] **Step 2: Write a failing test for lifecycle span splitting**

```ts
it('splits thread events into interaction runs from supervisor lifecycle spans', () => {
  const events = [
    lifecycleEvent('thread_1:1', 1, 'running', '2026-05-14T09:34:27.000Z'),
    valuesEvent('thread_1:4', 4, [], {
      messages: [{ type: 'human', id: 'user_1', content: '第一轮任务' }],
      todos: []
    }),
    lifecycleEvent('thread_1:27', 27, 'completed', '2026-05-14T09:34:31.000Z'),
    lifecycleEvent('thread_1:28', 28, 'running', '2026-05-14T09:41:19.000Z'),
    valuesEvent('thread_1:31', 31, [], {
      messages: [{ type: 'human', id: 'user_2', content: '第二轮任务' }],
      todos: []
    }),
    lifecycleEvent('thread_1:146', 146, 'completed', '2026-05-14T09:41:33.000Z')
  ];

  const model = buildRunInspectorModel(events);

  expect(model.runs.map((run) => run.title)).toEqual(['第一轮任务', '第二轮任务']);
  expect(model.runs.map((run) => run.status)).toEqual(['complete', 'complete']);
});
```

- [ ] **Step 3: Write a failing test for namespace event assignment**

```ts
it('assigns namespace-scoped values snapshots to the active interaction run', () => {
  const events = [
    lifecycleEvent('thread_1:28', 28, 'running', '2026-05-14T09:41:19.000Z'),
    valuesEvent('thread_1:57', 57, ['tools:abc'], {
      messages: [{ type: 'tool', name: 'sample_tool', tool_call_id: 'call_1', content: '{"ok":true}' }],
      todos: []
    }),
    lifecycleEvent('thread_1:146', 146, 'completed', '2026-05-14T09:41:33.000Z')
  ];

  const model = buildRunInspectorModel(events);

  expect(model.runs).toHaveLength(1);
  expect(model.rawEventsByRunId[model.runs[0].id]).toHaveLength(3);
  expect(model.traceByRunId[model.runs[0].id].nodes.some((node) => node.title === 'tools')).toBe(true);
});
```

- [ ] **Step 4: Add local test helpers**

Add helpers inside `frontend/src/workspaceView.test.ts`:

```ts
function lifecycleEvent(id: string, seq: number, status: string, timestamp: string) {
  return {
    type: 'event',
    event_id: id,
    seq,
    method: 'lifecycle',
    params: {
      namespace: [],
      timestamp,
      data: { event: status, graph_name: 'supervisor' }
    }
  };
}

function valuesEvent(
  id: string,
  seq: number,
  namespace: string[],
  data: Record<string, unknown>
) {
  return {
    type: 'event',
    event_id: id,
    seq,
    method: 'values',
    params: {
      namespace,
      timestamp: `2026-05-14T09:41:${String(seq).padStart(2, '0')}.000Z`,
      data
    }
  };
}
```

- [ ] **Step 5: Run the targeted failing tests**

Run:

```powershell
cd frontend
npm test -- workspaceView.test.ts
```

Expected: fails because `buildRunInspectorModel` is not exported.

## Task 2: Implement Run Inspector Projection Core

**Files:**

- Modify: `frontend/src/workspaceView.ts`
- Test: `frontend/src/workspaceView.test.ts`

- [ ] **Step 1: Export the new platform model types**

Add the types from the "Platform Model" section near the existing execution trace types.

- [ ] **Step 2: Add `buildRunInspectorModel`**

Add this exported function after `buildExecutionTraceModel`:

```ts
export function buildRunInspectorModel(events: unknown[]): RunInspectorModel {
  const { events: uniqueEvents, duplicateCount } = dedupeEvents(events);
  const runs = buildInteractionRuns(uniqueEvents, duplicateCount);
  const rawEventsByRunId = assignEventsToRuns(uniqueEvents, runs);
  const traceByRunId: Record<string, ExecutionTraceModel> = {};
  const progressByRunId: Record<string, ProgressItem[]> = {};
  const artifactsByRunId: Record<string, ArtifactDescriptor[]> = {};
  const citationsByRunId: Record<string, ResultCitation[]> = {};
  const diagnosticsByRunId: Record<string, DiagnosticItem[]> = {};

  runs.forEach((run) => {
    const runEvents = rawEventsByRunId[run.id] ?? [];
    traceByRunId[run.id] = buildExecutionTraceModel(runEvents);
    progressByRunId[run.id] = projectRunProgress(run.id, runEvents);
    artifactsByRunId[run.id] = projectRunArtifacts(run.id, runEvents);
    citationsByRunId[run.id] = traceByRunId[run.id].citations;
    diagnosticsByRunId[run.id] = projectRunDiagnostics(run.id, runEvents, duplicateCount);
    run.rootNodeIds = traceByRunId[run.id].rootNodeIds;
    run.metrics = calculateRunMetrics(
      traceByRunId[run.id],
      progressByRunId[run.id],
      artifactsByRunId[run.id],
      citationsByRunId[run.id],
      diagnosticsByRunId[run.id],
      duplicateCount
    );
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
```

- [ ] **Step 3: Add event dedupe helper**

```ts
function dedupeEvents(events: unknown[]): { events: unknown[]; duplicateCount: number } {
  const seen = new Set<string>();
  const unique: unknown[] = [];
  let duplicateCount = 0;

  events.forEach((event, index) => {
    const envelope = asRecord(event);
    const eventId = readString(envelope.event_id) || readString(envelope.id) || `event_${index}`;
    if (seen.has(eventId)) {
      duplicateCount += 1;
      return;
    }
    seen.add(eventId);
    unique.push(event);
  });

  return { events: unique, duplicateCount };
}
```

- [ ] **Step 4: Add run boundary builder**

```ts
function buildInteractionRuns(events: unknown[], duplicateCount: number): InteractionRun[] {
  const runs: InteractionRun[] = [];
  let activeRun: InteractionRun | null = null;

  events.forEach((event, index) => {
    const envelope = asRecord(event);
    const params = asRecord(envelope.params);
    const data = asRecord(params.data);
    const eventId = readString(envelope.event_id) || readString(envelope.id) || `event_${index}`;
    const method = readString(envelope.method) || readString(envelope.type);
    const timestamp = readString(params.timestamp) || undefined;

    if (method === 'lifecycle' && readString(data.event) === 'running') {
      activeRun = {
        id: `run:${eventId}`,
        title: '当前任务',
        startedAt: timestamp,
        status: 'running',
        eventIds: [eventId],
        lifecycleEventIds: [eventId],
        rootNodeIds: [],
        metrics: emptyRunMetrics(duplicateCount)
      };
      runs.push(activeRun);
      return;
    }

    if (!activeRun) {
      activeRun = {
        id: `run:${eventId}`,
        title: '当前任务',
        startedAt: timestamp,
        status: 'unknown',
        eventIds: [],
        lifecycleEventIds: [],
        rootNodeIds: [],
        metrics: emptyRunMetrics(duplicateCount)
      };
      runs.push(activeRun);
    }

    activeRun.eventIds.push(eventId);

    const userMessage = firstUserMessage(data);
    if (userMessage) {
      activeRun.userMessageId = readString(userMessage.id) || activeRun.userMessageId;
      activeRun.title = excerpt(resolveContent(userMessage), 48) || activeRun.title;
    }

    if (method === 'lifecycle') {
      activeRun.lifecycleEventIds.push(eventId);
      const lifecycleStatus = readString(data.event);
      if (lifecycleStatus === 'completed') {
        activeRun.status = 'complete';
        activeRun.completedAt = timestamp;
        activeRun = null;
      } else if (lifecycleStatus === 'failed' || lifecycleStatus === 'error') {
        activeRun.status = 'error';
        activeRun.completedAt = timestamp;
        activeRun = null;
      }
    }
  });

  return runs;
}
```

- [ ] **Step 5: Add assignment and progress helpers**

```ts
function assignEventsToRuns(events: unknown[], runs: InteractionRun[]): Record<string, unknown[]> {
  const result = Object.fromEntries(runs.map((run) => [run.id, [] as unknown[]]));
  const runByEventId = new Map<string, string>();
  runs.forEach((run) => run.eventIds.forEach((eventId) => runByEventId.set(eventId, run.id)));

  events.forEach((event, index) => {
    const envelope = asRecord(event);
    const eventId = readString(envelope.event_id) || readString(envelope.id) || `event_${index}`;
    const runId = runByEventId.get(eventId) || runs.at(-1)?.id;
    if (runId) result[runId] = [...(result[runId] || []), event];
  });

  return result;
}

function projectRunProgress(runId: string, events: unknown[]): ProgressItem[] {
  const latestByTitle = new Map<string, ProgressItem>();
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
      latestByTitle.set(title, {
        id: readString(item.id) || `${runId}:todo:${eventIndex}:${todoIndex}`,
        runId,
        title,
        status: resolveEventStatus(readString(item.status)),
        timestamp,
        metadata: item
      });
    });
  });
  return [...latestByTitle.values()];
}
```

- [ ] **Step 6: Add artifact, diagnostic, and metric helpers**

Implement these as generic shape-based helpers:

```ts
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
        const artifact = asRecord(data.artifact);
        artifacts.push(toArtifactDescriptor(runId, `${runId}:artifact:${eventIndex}`, artifact, data));
      }
    }

    const files = asRecord(data.files);
    Object.entries(files).forEach(([uri, content], fileIndex) => {
      artifacts.push(
        toArtifactDescriptor(runId, `${runId}:file:${eventIndex}:${fileIndex}`, { uri, content }, data)
      );
    });
  });
  return artifacts;
}

function projectRunDiagnostics(runId: string, events: unknown[], duplicateCount: number): DiagnosticItem[] {
  const diagnostics: DiagnosticItem[] = [];
  if (duplicateCount > 0) {
    diagnostics.push({
      id: `${runId}:duplicates`,
      runId,
      severity: 'info',
      type: 'duplicate_events',
      title: '重复事件已折叠',
      summary: `${duplicateCount} 条重复 event_id 未进入主视图`,
      evidenceIds: []
    });
  }
  events.forEach((event, index) => {
    const envelope = asRecord(event);
    const params = asRecord(envelope.params);
    const data = asRecord(params.data);
    const status = resolveGenericStatus(data);
    const error = data.error ?? data.exception;
    if (status === 'error' || error !== undefined) {
      diagnostics.push({
        id: `${runId}:error:${index}`,
        runId,
        severity: 'error',
        type: 'error',
        title: readString(data.title) || '执行异常',
        summary: excerpt(error ?? data),
        evidenceIds: [],
        content: data
      });
    }
  });
  return diagnostics;
}
```

Use `toArtifactDescriptor`, `emptyRunMetrics`, `calculateRunMetrics`, `firstUserMessage`, and `inferArtifactKind` as small helpers near the bottom of `workspaceView.ts`.

- [ ] **Step 7: Run tests**

Run:

```powershell
cd frontend
npm test -- workspaceView.test.ts
```

Expected: all `workspaceView.test.ts` tests pass.

## Task 3: Scope Existing Trace Rendering to the Active Run

**Files:**

- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/workspaceView.ts`
- Test: `frontend/src/workspaceView.test.ts`

- [ ] **Step 1: Replace top-level trace derivation**

In `frontend/src/App.tsx`, replace:

```ts
const executionDetails = useMemo(() => buildExecutionDetailModel(technicalEvents), [technicalEvents]);
const executionTrace = useMemo(() => buildExecutionTraceModel(technicalEvents), [technicalEvents]);
```

with:

```ts
const runInspector = useMemo(() => buildRunInspectorModel(technicalEvents), [technicalEvents]);
const activeRun = runInspector.runs.find((run) => run.id === runInspector.activeRunId) ?? runInspector.runs.at(-1);
const activeTrace = activeRun ? runInspector.traceByRunId[activeRun.id] : buildExecutionTraceModel([]);
```

- [ ] **Step 2: Keep `ExecutionDetailModel` only as fallback**

Keep:

```ts
const executionDetails = useMemo(() => buildExecutionDetailModel(technicalEvents), [technicalEvents]);
```

but pass it only to a compatibility fallback when `activeTrace.nodes.length === 0`.

- [ ] **Step 3: Update right panel props**

Rename `EvidenceDrawer` to `RunInspectorDrawer` in `frontend/src/App.tsx`.

Use props:

```ts
runInspector={runInspector}
activeRun={activeRun}
activeTrace={activeTrace}
```

Keep `visibleEvidence` temporarily for compatibility tabs until Task 4 removes the old tab model.

- [ ] **Step 4: Run build**

Run:

```powershell
cd frontend
npm run build
```

Expected: TypeScript build and Vite build pass.

## Task 4: Replace Evidence Tabs with Run Inspector Tabs

**Files:**

- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Replace tab type**

Replace:

```ts
type EvidenceTab = 'process' | 'source' | 'missing' | 'technical';
```

with:

```ts
type InspectorTab = 'progress' | 'trace' | 'artifacts' | 'citations' | 'diagnostics';
```

- [ ] **Step 2: Update tab labels**

Replace the tab buttons with:

```tsx
<TabButton active={activeTab === 'progress'} onClick={() => setActiveTab('progress')} label="进度" />
<TabButton active={activeTab === 'trace'} onClick={() => setActiveTab('trace')} label="链路" />
<TabButton active={activeTab === 'artifacts'} onClick={() => setActiveTab('artifacts')} label="产物" />
<TabButton active={activeTab === 'citations'} onClick={() => setActiveTab('citations')} label="依据" />
<TabButton active={activeTab === 'diagnostics'} onClick={() => setActiveTab('diagnostics')} label="诊断" />
```

- [ ] **Step 3: Add header metrics component**

Create a local component in `frontend/src/App.tsx`:

```tsx
function RunInspectorHeader({ run }: { run?: InteractionRun }) {
  if (!run) {
    return (
      <div className="run-inspector-summary">
        <strong>当前任务</strong>
        <span>等待任务事件</span>
      </div>
    );
  }

  return (
    <div className="run-inspector-summary">
      <div>
        <strong>{run.title}</strong>
        <span>{executionStatusLabel(run.status === 'waiting' ? 'pending' : run.status)}</span>
      </div>
      <div className="execution-summary-grid compact">
        <ExecutionMetric label="Agent" value={run.metrics.agentCount} />
        <ExecutionMetric label="工具" value={run.metrics.toolCallCount} />
        <ExecutionMetric label="Todo" value={`${run.metrics.todoCompleted}/${run.metrics.todoTotal}`} />
        <ExecutionMetric label="产物" value={run.metrics.artifactCount} />
        <ExecutionMetric label="诊断" value={run.metrics.diagnosticCount} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement tab content components**

Add local components:

```tsx
function ProgressTab({ items }: { items: ProgressItem[] }) {
  if (items.length === 0) return <EmptyPanel title="暂无进度" description="任务开始后会显示计划、待办和实时状态。" />;
  return (
    <div className="progress-step-list">
      {items.map((item) => (
        <div key={item.id} className={`progress-step ${item.status}`}>
          <span />
          <div>
            <strong>{item.title}</strong>
            <em>{executionStatusLabel(item.status)}</em>
          </div>
        </div>
      ))}
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
```

Wire:

```tsx
const activeRunId = activeRun?.id;
const progressItems = activeRunId ? runInspector.progressByRunId[activeRunId] ?? [] : [];
const artifacts = activeRunId ? runInspector.artifactsByRunId[activeRunId] ?? [] : [];
const citations = activeRunId ? runInspector.citationsByRunId[activeRunId] ?? [] : [];
const diagnostics = activeRunId ? runInspector.diagnosticsByRunId[activeRunId] ?? [] : [];
const rawEvents = activeRunId ? runInspector.rawEventsByRunId[activeRunId] ?? [] : technicalEvents;
```

- [ ] **Step 5: Add CSS**

Add to `frontend/src/styles.css`:

```css
.run-inspector-summary {
  display: grid;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
}

.execution-summary-grid.compact {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.progress-step-list {
  display: grid;
  gap: 8px;
}

.progress-step {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 10px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
}

.progress-step > span {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: #94a3b8;
}

.progress-step.complete > span {
  background: #16a34a;
}

.progress-step.running > span {
  background: #2563eb;
}

.progress-step.error > span {
  background: #dc2626;
}
```

- [ ] **Step 6: Run build**

Run:

```powershell
cd frontend
npm run build
```

Expected: build passes and the right panel compiles with the new tab model.

## Task 5: Add Run-Scoped Artifact Viewer

**Files:**

- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/workspaceView.ts`
- Modify: `frontend/src/workspaceView.test.ts`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Write a failing artifact projection test**

```ts
it('projects custom artifact envelopes into run-scoped artifact descriptors', () => {
  const events = [
    lifecycleEvent('thread_1:1', 1, 'running', '2026-05-14T09:34:27.000Z'),
    {
      type: 'event',
      event_id: 'thread_1:2',
      seq: 2,
      method: 'custom',
      params: {
        namespace: ['agent:writer'],
        timestamp: '2026-05-14T09:34:28.000Z',
        data: {
          type: 'artifact.created',
          title: 'Markdown brief',
          artifact: {
            id: 'brief_md',
            uri: '/runs/brief.md',
            mime_type: 'text/markdown'
          }
        }
      }
    },
    lifecycleEvent('thread_1:3', 3, 'completed', '2026-05-14T09:34:31.000Z')
  ];

  const model = buildRunInspectorModel(events);
  const runId = model.runs[0].id;

  expect(model.artifactsByRunId[runId]).toMatchObject([
    {
      id: 'brief_md',
      title: 'Markdown brief',
      uri: '/runs/brief.md',
      mimeType: 'text/markdown',
      kind: 'document'
    }
  ]);
});
```

- [ ] **Step 2: Implement `toArtifactDescriptor` and `inferArtifactKind`**

```ts
function toArtifactDescriptor(
  runId: string,
  fallbackId: string,
  artifact: Record<string, unknown>,
  metadata: Record<string, unknown>
): ArtifactDescriptor {
  const mimeType = readString(artifact.mime_type) || readString(artifact.mimeType);
  const uri = readString(artifact.uri);
  const title = readString(metadata.title) || readString(artifact.title) || readString(artifact.name) || uri || 'Artifact';
  return {
    id: readString(artifact.id) || fallbackId,
    runId,
    title,
    uri,
    mimeType,
    kind: inferArtifactKind(mimeType, uri, artifact.content),
    summary: readString(metadata.summary) || readString(artifact.summary) || '',
    schemaRef: readString(artifact.schema_ref) || readString(artifact.schemaRef),
    content: artifact.content,
    metadata
  };
}

function inferArtifactKind(mimeType: string, uri: string, content: unknown): ArtifactDescriptor['kind'] {
  if (mimeType.includes('markdown') || uri.endsWith('.md')) return 'document';
  if (mimeType.includes('json') || uri.endsWith('.json')) return hasTableShape(content) ? 'table' : 'data';
  if (mimeType.startsWith('text/')) return 'document';
  if (uri.startsWith('http://') || uri.startsWith('https://')) return 'link';
  if (typeof content === 'object' && content !== null) return hasTableShape(content) ? 'table' : 'data';
  return 'unknown';
}
```

- [ ] **Step 3: Add artifact tab component**

```tsx
function ArtifactsTab({ artifacts }: { artifacts: ArtifactDescriptor[] }) {
  const [selectedId, setSelectedId] = useState(artifacts[0]?.id ?? '');
  const selected = artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0];

  useEffect(() => {
    if (!selectedId && artifacts[0]) setSelectedId(artifacts[0].id);
  }, [artifacts, selectedId]);

  if (artifacts.length === 0) {
    return <EmptyPanel title="暂无产物" description="本轮任务生成文件或结构化结果后会显示在这里。" />;
  }

  return (
    <div className="artifact-viewer">
      <div className="artifact-list">
        {artifacts.map((artifact) => (
          <button
            key={artifact.id}
            className={artifact.id === selected?.id ? 'active' : ''}
            type="button"
            onClick={() => setSelectedId(artifact.id)}
          >
            <strong>{artifact.title}</strong>
            <span>{artifact.mimeType || artifact.kind}</span>
          </button>
        ))}
      </div>
      {selected && <ArtifactPreview artifact={selected} />}
    </div>
  );
}
```

- [ ] **Step 4: Add artifact preview renderer**

```tsx
function ArtifactPreview({ artifact }: { artifact: ArtifactDescriptor }) {
  if (artifact.content !== undefined && artifact.kind === 'table') {
    return <EvidenceTable content={artifact.content} />;
  }
  if (artifact.content !== undefined) {
    return <pre className="evidence-code json">{JSON.stringify(artifact.content, null, 2)}</pre>;
  }
  return (
    <div className="artifact-preview-empty">
      <strong>{artifact.title}</strong>
      <span>{artifact.uri || artifact.summary || '产物内容需要通过后端 artifact API 获取。'}</span>
    </div>
  );
}
```

- [ ] **Step 5: Run tests and build**

Run:

```powershell
cd frontend
npm test -- workspaceView.test.ts
npm run build
```

Expected: tests and build pass.

## Task 6: Add Citation and Diagnostic Views

**Files:**

- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/workspaceView.ts`
- Modify: `frontend/src/workspaceView.test.ts`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Write diagnostic projection tests**

```ts
it('projects failed lifecycle events into diagnostics', () => {
  const events = [
    lifecycleEvent('thread_1:1', 1, 'running', '2026-05-14T09:34:27.000Z'),
    {
      type: 'event',
      event_id: 'thread_1:2',
      seq: 2,
      method: 'lifecycle',
      params: {
        namespace: [],
        timestamp: '2026-05-14T09:34:31.000Z',
        data: { event: 'failed', graph_name: 'supervisor', error: 'boom' }
      }
    }
  ];

  const model = buildRunInspectorModel(events);
  const runId = model.runs[0].id;

  expect(model.diagnosticsByRunId[runId]).toContainEqual(
    expect.objectContaining({
      severity: 'error',
      type: 'error',
      summary: 'boom'
    })
  );
});
```

- [ ] **Step 2: Add diagnostics tab**

```tsx
function DiagnosticsTab({ diagnostics, rawEvents }: { diagnostics: DiagnosticItem[]; rawEvents: unknown[] }) {
  if (diagnostics.length === 0 && rawEvents.length === 0) {
    return <EmptyPanel title="暂无诊断" description="异常、缺失字段、警告和技术事件会显示在这里。" />;
  }
  return (
    <div className="diagnostic-list">
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
    </div>
  );
}
```

- [ ] **Step 3: Add citations tab**

```tsx
function CitationsTab({ citations, trace }: { citations: ResultCitation[]; trace: ExecutionTraceModel }) {
  if (citations.length === 0) {
    return <EmptyPanel title="暂无依据映射" description="产物或最终结论声明引用后，会在这里关联到过程证据。" />;
  }
  return (
    <div className="citation-list">
      {citations.map((citation) => {
        const evidence = trace.evidence.find((item) => item.id === citation.evidenceId);
        return (
          <article key={citation.id} className="citation-item">
            <strong>{citation.claimId}</strong>
            <span>{evidence?.summary || citation.evidenceId}</span>
          </article>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run build**

Run:

```powershell
cd frontend
npm run build
```

Expected: build passes.

## Task 7: Backend Evidence Response Cleanup

**Files:**

- Modify: `backend/src/agent_pilot/evidence.py`
- Modify: `backend/tests/test_api_startup.py` or create `backend/tests/test_evidence_archive.py`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Add backend test for deduped metadata while preserving raw events**

Create `backend/tests/test_evidence_archive.py`:

```python
from agent_pilot.evidence import EvidenceArchive


def test_evidence_archive_reports_unique_and_duplicate_event_counts() -> None:
    archive = EvidenceArchive()
    event = {
        "event_id": "thread_1:1",
        "method": "lifecycle",
        "params": {"namespace": [], "data": {"event": "running", "graph_name": "supervisor"}},
    }
    archive.append("thread_1", event)
    archive.append("thread_1", event)

    payload = archive.build_business_evidence("thread_1")

    assert payload["event_stats"] == {
        "raw_count": 2,
        "unique_count": 1,
        "duplicate_count": 1,
    }
    assert len(payload["technical_events"]) == 2
```

- [ ] **Step 2: Implement `event_stats`**

In `backend/src/agent_pilot/evidence.py`, update `build_business_evidence`:

```python
        event_ids = [
            str(event.get("event_id") or event.get("id") or index)
            for index, event in enumerate(events)
        ]
        unique_event_ids = set(event_ids)
        return {
            "thread_id": thread_id,
            "summary_cards": summary_cards,
            "technical_events": events,
            "event_stats": {
                "raw_count": len(events),
                "unique_count": len(unique_event_ids),
                "duplicate_count": len(events) - len(unique_event_ids),
            },
        }
```

- [ ] **Step 3: Update frontend API type**

In `frontend/src/api.ts`, add:

```ts
export interface EventStats {
  raw_count: number;
  unique_count: number;
  duplicate_count: number;
}
```

and update `ThreadEvidence`:

```ts
event_stats?: EventStats;
```

- [ ] **Step 4: Run backend tests**

Run:

```powershell
cd backend
python -m pytest tests/test_evidence_archive.py -q
```

Expected: test passes.

## Task 8: Documentation Update

**Files:**

- Modify: `docs/deepagents-execution-detail-p0.md`

- [ ] **Step 1: Add run inspector contract section**

Add a section:

```md
## Run Inspector Contract

The right panel is scoped to one interaction run by default. A thread may contain
multiple supervisor lifecycle spans and repeated values snapshots. The platform
therefore projects raw events through these stages:

1. dedupe by event_id for operator views;
2. split events into InteractionRun objects;
3. diff cumulative values snapshots into progress, trace, artifacts, citations,
   and diagnostics;
4. preserve raw events in the diagnostics tab.

The UI must not classify events by business agent names, concrete tool names, or
fixed artifact file names. Domain-specific outputs should enter the platform as
generic artifact descriptors, structured result blocks, citations, or
diagnostics.
```

- [ ] **Step 2: Add official alignment notes**

Add:

```md
This design aligns with DeepAgents frontend patterns:

- subagent streaming maps to trace nodes and active progress;
- todo list state maps to the Progress tab;
- sandbox/file viewing maps to the run-scoped Artifact tab;
- raw protocol streams remain available under Diagnostics.
```

- [ ] **Step 3: Run repository checks**

Run:

```powershell
cd frontend
npm test
npm run build
cd ..\backend
python -m pytest -q
```

Expected: all tests and builds pass.

## Verification Checklist

- [ ] The panel defaults to the latest interaction run, not all thread events.
- [ ] Duplicate `event_id` entries are counted but not repeated in operator views.
- [ ] `values` snapshots update progress state without duplicating old todos.
- [ ] Trace nodes still come from `namespace`, `tool_call_id`, task events, and artifact envelopes.
- [ ] Artifact rendering uses descriptor shape, MIME type, URI, and content shape.
- [ ] Missing fields and protocol errors appear as diagnostics, not as a hard-coded `缺失信息` top-level category.
- [ ] Raw events are still accessible for debugging.
- [ ] No platform projection branch checks concrete business agent names, concrete tool names, or fixed artifact file names.

## Execution Handoff

Recommended execution mode: Subagent-Driven.

Reason: Tasks 1-2 are pure projection logic, Tasks 4-6 are UI slices, and Task 7 is backend metadata. They can be reviewed independently with focused tests. If the repository is actively changing, run tasks inline to avoid merge conflicts in `frontend/src/App.tsx`.
