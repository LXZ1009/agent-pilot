import { describe, expect, it } from 'vitest';

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
          data: { event: 'message-start', role: 'ai', id: 'msg_1' }
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
      metrics: { evidenceCount: 2 }
    });
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
      evidenceCount: 3,
      artifactCount: 1,
      errorCount: 0
    });
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
