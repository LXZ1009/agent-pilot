import { describe, expect, it } from 'vitest';

import {
  buildExecutionDetailModel,
  buildExecutionTraceModel,
  buildEvidenceGroups,
  buildRunInspectorModel,
  buildStreamErrorMessage,
  buildSubagentProcessCard,
  buildTaskProgress,
  deriveTaskTitle,
  mergeConversationRows,
  normalizeStreamMessages,
  resolveEvidenceRefreshInterval
} from './workspaceView';
import type { EvidenceCard } from './api';

describe('workspace view model', () => {
  it('normalizes stream messages into business-facing conversation rows', () => {
    const rows = normalizeStreamMessages([
      { type: 'human', content: '请根据已有信息生成一份执行计划' },
      { type: 'ai', content: [{ text: '已开始处理这项协同任务。' }] }
    ]);

    expect(rows).toEqual([
      { id: 'message_0', role: 'user', actor: '你', content: '请根据已有信息生成一份执行计划' },
      {
        id: 'message_1',
        role: 'assistant',
        actor: 'PricingMeetingAgent',
        content: '已开始处理这项协同任务。'
      }
    ]);
  });

  it('keeps tool outputs and raw protocol values out of the main conversation', () => {
    const rows = normalizeStreamMessages([
      { type: 'human', content: '现在有多少物料资产？' },
      { type: 'tool', name: 'inspect_async_subagent_tasks', content: 'No async subagent tasks tracked.' },
      { type: 'tool', name: 'inspect_material_asset_catalog', content: '[]' },
      { type: 'ai', content: 'PricingMeetingAgent\n目前没有任何物料资产。' }
    ]);

    expect(rows).toEqual([
      { id: 'message_0', role: 'user', actor: '你', content: '现在有多少物料资产？' },
      {
        id: 'message_3',
        role: 'assistant',
        actor: 'PricingMeetingAgent',
        content: '目前没有任何物料资产。'
      }
    ]);
  });

  it('groups evidence into user-facing disclosure tabs', () => {
    const cards: EvidenceCard[] = [
      evidence('1', 'process', '开始处理任务'),
      evidence('2', 'source', '引用访谈卡片'),
      evidence('3', 'missing', '缺少审批口径')
    ];

    expect(buildEvidenceGroups(cards)).toMatchObject({
      process: [{ title: '开始处理任务' }],
      source: [{ title: '引用访谈卡片' }],
      missing: [{ title: '缺少审批口径' }]
    });
  });

  it('derives material task progress from recorded evidence and loading state', () => {
    const progress = buildTaskProgress({
      evidenceCards: [
        evidence('1', 'process', '开始处理任务'),
        evidence('2', 'source', '引用访谈卡片')
      ],
      isLoading: true
    });

    expect(progress).toEqual({
      percent: 35,
      label: '处理中',
      completedEvidenceCount: 2
    });
  });

  it('derives the task title from natural language input instead of a configured scenario', () => {
    const title = deriveTaskTitle([
      { id: 'message_0', role: 'assistant', actor: 'PricingMeetingAgent', content: '我可以协助你完成任务。' },
      { id: 'message_1', role: 'user', actor: '你', content: '请根据客户访谈内容生成一份销售跟进计划，并列出依据。' }
    ]);

    expect(title).toBe('请根据客户访谈内容生成一份销售跟进计划，并列出依据。');
  });

  it('keeps optimistic user messages until the stream catches up without duplicating them', () => {
    const local = [
      { id: 'local_1', role: 'user' as const, actor: '你', content: '帮我生成一份协同任务结果' }
    ];

    expect(mergeConversationRows(local, [])).toEqual(local);
    expect(
      mergeConversationRows(local, [
        { id: 'message_0', role: 'user', actor: '你', content: '帮我生成一份协同任务结果' },
        { id: 'message_1', role: 'assistant', actor: 'PricingMeetingAgent', content: '已开始处理。' }
      ])
    ).toEqual([
      { id: 'message_0', role: 'user', actor: '你', content: '帮我生成一份协同任务结果' },
      { id: 'message_1', role: 'assistant', actor: 'PricingMeetingAgent', content: '已开始处理。' }
    ]);
  });

  it('builds live subagent process cards from scoped message streams', () => {
    const card = buildSubagentProcessCard(
      {
        id: 'call_001',
        name: 'material_asset_agent',
        status: 'running',
        taskInput: 'Generate a meeting asset package',
        startedAt: new Date('2026-05-14T02:00:00Z'),
        completedAt: null
      },
      [{ type: 'ai', content: [{ text: 'Collecting source material' }] }]
    );

    expect(card).toEqual({
      id: 'call_001',
      title: 'material_asset_agent',
      description: 'Generate a meeting asset package',
      status: 'running',
      statusLabel: '运行中',
      preview: 'Collecting source material',
      elapsedLabel: null
    });
  });

  it('prefers completed subagent output over the last streamed message', () => {
    const card = buildSubagentProcessCard(
      {
        id: 'call_002',
        name: 'task_tracking_agent',
        status: 'complete',
        taskInput: undefined,
        output: { content: 'Final tracking seed ready' },
        startedAt: new Date('2026-05-14T02:00:00Z'),
        completedAt: new Date('2026-05-14T02:01:42Z')
      },
      [{ type: 'ai', content: 'Drafting tracking seed' }]
    );

    expect(card).toMatchObject({
      id: 'call_002',
      title: 'task_tracking_agent',
      description: '子 Agent 执行任务',
      status: 'complete',
      statusLabel: '已完成',
      preview: 'Final tracking seed ready',
      elapsedLabel: '1m 42s'
    });
  });

  it('projects raw protocol events into generic execution detail sections', () => {
    const model = buildExecutionDetailModel([
      {
        event_id: 'evt_tool_start',
        method: 'tools',
        params: {
          timestamp: '2026-05-14T02:00:00Z',
          namespace: [],
          data: {
            event: 'tool-started',
            tool_name: 'search_docs',
            tool_call_id: 'tool_1',
            input: { query: 'streaming' }
          }
        }
      },
      {
        event_id: 'evt_todos',
        method: 'values',
        params: {
          namespace: [],
          data: {
            todos: [
              { id: 'todo_1', content: 'Inspect stream protocol', status: 'done' },
              { id: 'todo_2', content: 'Render execution panel', status: 'in_progress' }
            ]
          }
        }
      },
      {
        event_id: 'evt_artifact',
        method: 'custom',
        params: {
          namespace: [],
          data: {
            type: 'artifact.created',
            title: 'Run report',
            summary: 'Generated report artifact',
            artifact: { id: 'artifact_1', mime_type: 'text/markdown', uri: '/runs/report.md' }
          }
        }
      },
      {
        event_id: 'evt_task',
        method: 'tasks',
        params: {
          namespace: ['research_agent:run-001'],
          data: { event: 'task-started', task_id: 'async_1', name: 'research_agent' }
        }
      },
      {
        event_id: 'evt_error',
        method: 'lifecycle',
        params: {
          namespace: [],
          data: { event: 'failed', graph_name: 'supervisor', error: 'model unavailable' }
        }
      }
    ]);

    expect(model.plan.map((item) => item.title)).toEqual([
      'Inspect stream protocol',
      'Render execution panel'
    ]);
    expect(model.tools[0]).toMatchObject({
      id: 'evt_tool_start:tool_1',
      title: 'search_docs',
      status: 'running'
    });
    expect(model.artifacts[0]).toMatchObject({
      id: 'artifact_1',
      title: 'Run report',
      description: 'Generated report artifact'
    });
    expect(model.tasks[0]).toMatchObject({
      id: 'async_1',
      title: 'research_agent',
      status: 'running',
      namespaceLabel: 'research_agent'
    });
    expect(model.errors[0]).toMatchObject({
      title: 'supervisor',
      description: 'model unavailable',
      status: 'error'
    });
    expect(model.counts).toMatchObject({
      plan: 2,
      tools: 1,
      tasks: 1,
      artifacts: 1,
      errors: 1
    });
  });

  it('polls process evidence while a stream is running only', () => {
    expect(resolveEvidenceRefreshInterval(true)).toBe(1200);
    expect(resolveEvidenceRefreshInterval(false)).toBeNull();
  });

  it('does not surface passive stream connection errors before user starts a run', () => {
    const error = new Error('Unable to connect to LangGraph server. Original error: Failed to fetch');

    expect(buildStreamErrorMessage(error, false)).toBe('');
    expect(buildStreamErrorMessage(error, true)).toContain('Unable to connect to LangGraph server');
  });

  it('builds a namespace-based trace with tool evidence without hard-coded tool names', () => {
    const trace = buildExecutionTraceModel([
      {
        event_id: 'evt_subgraph_msg',
        method: 'messages',
        params: {
          timestamp: '2026-05-14T02:00:00Z',
          namespace: ['analysis_agent:run-123'],
          data: { event: 'message-start', role: 'ai', id: 'msg_1', content: 'Agent is inspecting the data' }
        }
      },
      {
        event_id: 'evt_tool_start',
        method: 'tools',
        params: {
          timestamp: '2026-05-14T02:00:02Z',
          namespace: ['analysis_agent:run-123'],
          data: {
            event: 'tool-started',
            tool_name: 'warehouse_query',
            tool_call_id: 'tool_1',
            input: {
              sql: 'select id, amount from orders limit 2',
              params: { limit: 2 }
            }
          }
        }
      },
      {
        event_id: 'evt_tool_finish',
        method: 'tools',
        params: {
          timestamp: '2026-05-14T02:00:03Z',
          namespace: ['analysis_agent:run-123'],
          data: {
            event: 'tool-finished',
            tool_name: 'warehouse_query',
            tool_call_id: 'tool_1',
            output: {
              rows: [
                { id: 'o_1', amount: 10 },
                { id: 'o_2', amount: 20 }
              ],
              row_count: 2
            }
          }
        }
      },
      {
        event_id: 'evt_artifact',
        method: 'custom',
        params: {
          timestamp: '2026-05-14T02:00:04Z',
          namespace: ['analysis_agent:run-123'],
          data: {
            type: 'artifact.created',
            title: 'Result markdown',
            artifact: { id: 'artifact_1', uri: '/runs/result.md', mime_type: 'text/markdown' }
          }
        }
      }
    ]);

    expect(trace.rootNodeIds).toEqual(['node:analysis_agent:run-123']);
    expect(trace.nodesById['node:analysis_agent:run-123']).toMatchObject({
      kind: 'agent',
      title: 'analysis_agent',
      status: 'running',
      children: ['tool:tool_1', 'artifact:artifact_1']
    });
    expect(trace.nodesById['tool:tool_1']).toMatchObject({
      kind: 'tool',
      parentId: 'node:analysis_agent:run-123',
      status: 'complete',
      startedAt: '2026-05-14T02:00:02Z',
      completedAt: '2026-05-14T02:00:03Z',
      metrics: { evidenceCount: 2 },
      metadata: {
        toolCallId: 'tool_1',
        toolName: 'warehouse_query',
        inputEventId: 'evt_tool_start',
        outputEventId: 'evt_tool_finish'
      }
    });
    expect(trace.evidenceByNodeId['node:analysis_agent:run-123']).toMatchObject([
      {
        kind: 'message',
        title: 'Agent message',
        summary: 'Agent is inspecting the data'
      }
    ]);
    expect(trace.evidenceByNodeId['tool:tool_1']).toMatchObject([
      {
        kind: 'sql',
        language: 'sql',
        title: 'Tool input'
      },
      {
        kind: 'table',
        title: 'Tool output'
      }
    ]);
    expect(trace.nodesById['artifact:artifact_1']).toMatchObject({
      kind: 'artifact',
      parentId: 'node:analysis_agent:run-123'
    });
    expect(trace.summary).toMatchObject({
      nodeCount: 3,
      evidenceCount: 4,
      artifactCount: 1,
      errorCount: 0
    });
  });

  it('builds run inspector projections from deduped lifecycle spans', () => {
    const model = buildRunInspectorModel([
      lifecycleEvent('thread_1:1', 1, 'running', '2026-05-14T09:34:27.000Z'),
      lifecycleEvent('thread_1:1', 1, 'running', '2026-05-14T09:34:27.000Z'),
      valuesEvent('thread_1:4', 4, [], {
        messages: [{ type: 'human', id: 'user_1', content: 'first task' }],
        todos: [{ content: 'inspect input', status: 'completed' }]
      }),
      lifecycleEvent('thread_1:27', 27, 'completed', '2026-05-14T09:34:31.000Z'),
      lifecycleEvent('thread_1:28', 28, 'running', '2026-05-14T09:41:19.000Z'),
      valuesEvent('thread_1:31', 31, [], {
        messages: [{ type: 'human', id: 'user_2', content: 'second task' }],
        todos: [{ content: 'build output', status: 'in_progress' }]
      }),
      lifecycleEvent('thread_1:146', 146, 'completed', '2026-05-14T09:41:33.000Z')
    ]);

    expect(model.runs.map((run) => run.title)).toEqual(['first task', 'second task']);
    expect(model.runs.map((run) => run.status)).toEqual(['complete', 'complete']);
    expect(model.runs[0].eventIds).toEqual(['thread_1:1', 'thread_1:4', 'thread_1:27']);
    expect(model.runs[0].metrics.duplicateEventCount).toBe(1);
    expect(model.progressByRunId[model.runs[1].id]).toMatchObject([
      { title: 'build output', status: 'running' }
    ]);
  });

  it('assigns namespace-scoped snapshots and artifacts to the active run', () => {
    const model = buildRunInspectorModel([
      lifecycleEvent('thread_1:28', 28, 'running', '2026-05-14T09:41:19.000Z'),
      valuesEvent('thread_1:57', 57, ['tools:abc'], {
        messages: [{ type: 'tool', name: 'sample_tool', tool_call_id: 'call_1', content: '{"ok":true}' }],
        todos: []
      }),
      {
        type: 'event',
        event_id: 'thread_1:58',
        seq: 58,
        method: 'custom',
        params: {
          namespace: ['tools:abc'],
          timestamp: '2026-05-14T09:41:58.000Z',
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
      lifecycleEvent('thread_1:146', 146, 'completed', '2026-05-14T09:41:33.000Z')
    ]);
    const runId = model.runs[0].id;

    expect(model.rawEventsByRunId[runId]).toHaveLength(4);
    expect(model.traceByRunId[runId].nodes.some((node) => node.title === 'tools')).toBe(true);
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

  it('keeps ordinary workspace files out of artifacts unless they are explicitly marked', () => {
    const model = buildRunInspectorModel([
      lifecycleEvent('thread_1:1', 1, 'running', '2026-05-15T01:00:00.000Z'),
      valuesEvent('thread_1:2', 2, [], {
        files: {
          '/scratch/notes.md': '# temporary notes'
        }
      }),
      lifecycleEvent('thread_1:3', 3, 'completed', '2026-05-15T01:00:03.000Z')
    ]);
    const runId = model.runs[0].id;

    expect(model.artifactsByRunId[runId]).toEqual([]);
  });

  it('projects explicit artifact envelopes with platform role and source fields', () => {
    const model = buildRunInspectorModel([
      lifecycleEvent('thread_1:1', 1, 'running', '2026-05-15T01:00:00.000Z'),
      customArtifactEvent('thread_1:2', {
        id: 'artifact_1',
        title: 'Run report',
        role: 'deliverable',
        source: 'inline',
        mime_type: 'text/markdown',
        content: '# report'
      }),
      lifecycleEvent('thread_1:3', 3, 'completed', '2026-05-15T01:00:03.000Z')
    ]);
    const runId = model.runs[0].id;

    expect(model.artifactsByRunId[runId]).toMatchObject([
      {
        id: 'artifact_1',
        title: 'Run report',
        role: 'deliverable',
        source: 'inline',
        mimeType: 'text/markdown',
        kind: 'document'
      }
    ]);
  });

  it('projects tool calls and async tasks from values snapshots', () => {
    const model = buildRunInspectorModel([
      lifecycleEvent('thread_1:1', 1, 'running', '2026-05-14T09:41:01.000Z'),
      valuesEvent('thread_1:2', 2, [], {
        messages: [
          { type: 'human', id: 'user_1', content: 'build package' },
          {
            type: 'ai',
            id: 'ai_1',
            name: 'supervisor',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                name: 'start_async_task',
                args: { agent_name: 'material_asset_agent', prompt: 'build package' }
              }
            ]
          },
          {
            type: 'tool',
            id: 'tool_msg_1',
            name: 'start_async_task',
            tool_call_id: 'call_1',
            status: 'success',
            content: '{"task_id":"task_1","status":"running"}'
          }
        ],
        async_tasks: {
          task_1: {
            task_id: 'task_1',
            agent_name: 'material_asset_agent',
            status: 'running',
            run_id: 'run_1',
            last_updated_at: '2026-05-14T09:41:03.000Z'
          }
        }
      }),
      lifecycleEvent('thread_1:3', 3, 'completed', '2026-05-14T09:41:04.000Z')
    ]);
    const runId = model.runs[0].id;
    const trace = model.traceByRunId[runId];

    expect(trace.nodesById['supervisor:supervisor']).toMatchObject({
      kind: 'supervisor',
      children: ['tool:call_1']
    });
    expect(trace.nodesById['tool:call_1']).toMatchObject({
      kind: 'tool',
      status: 'complete',
      metadata: {
        toolCallId: 'call_1',
        toolName: 'start_async_task',
        inputEventId: 'ai_1',
        outputEventId: 'tool_msg_1'
      }
    });
    expect(trace.nodesById['task:task_1']).toMatchObject({
      kind: 'task',
      title: 'material_asset_agent',
      status: 'running'
    });
    expect(trace.evidenceByNodeId['tool:call_1']).toMatchObject([
      { title: 'Tool input' },
      { title: 'Tool output' }
    ]);
    expect(model.progressByRunId[runId]).toMatchObject([
      {
        id: `${runId}:async:task_1`,
        title: 'material_asset_agent',
        status: 'running',
        producerNodeId: 'task:task_1'
      }
    ]);
  });
});

function evidence(id: string, category: string, title: string): EvidenceCard {
  return {
    id,
    title,
    category,
    description: `${title}说明`,
    confidence: 'recorded'
  };
}

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

function customArtifactEvent(id: string, artifact: Record<string, unknown>) {
  return {
    type: 'event',
    event_id: id,
    method: 'custom',
    params: {
      namespace: [],
      timestamp: '2026-05-15T01:00:01.000Z',
      data: {
        type: 'artifact.created',
        title: artifact.title,
        artifact
      }
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
