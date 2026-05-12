import type { Interviewee, MeetingContext, PricingMeetingAsyncJob, PricingMeetingRun, WorkspaceCard } from './api';

export type WorkspaceMessageRole = 'user' | 'assistant' | 'system';
export type WorkspaceSessionStatus = 'idle' | 'running' | 'waiting_for_input' | 'completed' | 'error';

export interface WorkspaceMessage {
  id: string;
  role: WorkspaceMessageRole;
  actor: string;
  content: string;
  createdAt?: string;
  cards: WorkspaceCardView[];
  raw?: unknown;
}

export interface WorkspaceCardView {
  id: string;
  type: string;
  title: string;
  status?: string;
  summary?: string;
  questions: string[];
  missingFields: string[];
  nextActions: string[];
  data?: unknown;
}

export interface WorkspaceContextView {
  meetingId: string;
  title: string;
  scheduledStart: string;
  hostName: string;
  topic: string;
  scenario: string;
  interviewees: Interviewee[];
}

export interface WorkspaceView {
  status: WorkspaceSessionStatus;
  title: string;
  scenarioLabel: string;
  currentStage: string;
  messages: WorkspaceMessage[];
  cards: WorkspaceCardView[];
  jobs: PricingMeetingAsyncJob[];
  artifacts: WorkspaceCardView[];
  context: WorkspaceContextView;
  rawRun: PricingMeetingRun | null;
}

export interface CommandTemplate {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

export const COMMAND_TEMPLATES: CommandTemplate[] = [
  {
    id: 'start-interview',
    label: '开始会前访谈',
    description: '由主 Agent 同步调用访谈 Agent，生成访谈问题并汇总给用户。',
    prompt: '开始华东大区定价会的会前访谈，先访谈张三。'
  },
  {
    id: 'reply-interview',
    label: '录入访谈回复',
    description: '在工作区直接收集访谈回复，由主 Agent 判断完整性和追问。',
    prompt: '张三回复：浙江建投当前报价3850元/吨，江苏交工报价3830元/吨，竞品近期下调20元/吨。'
  },
  {
    id: 'generate-material',
    label: '生成会议物料',
    description: '长任务由主 Agent 启动异步物料 Agent，并在右侧展示执行详情。',
    prompt: '基于当前已收集的访谈内容，生成会议物料资产包。'
  },
  {
    id: 'generate-preview',
    label: '生成会前预览',
    description: '生成主持人会前预览和通知载荷。',
    prompt: '生成会前5分钟主持人预览和通知载荷。'
  }
];

export function defaultMeetingContext(): Partial<MeetingContext> {
  return {
    meeting_id: 'meeting_20260511_001',
    meeting_title: '华东大区定价会',
    scheduled_start: '2026-05-11 15:30',
    host_name: '主持人A',
    business_topic: '重点客户价格策略与风险提示',
    source: 'agent_pilot_workspace',
    business_payload: {
      trigger: 'workspace_conversation',
      architecture: 'main_agent_user_interaction_mixed_subagents',
      current_scenario: 'pricing_meeting_validation'
    }
  };
}

export function defaultInterviewees(): Interviewee[] {
  return [
    {
      interviewee_id: 'u1',
      name: '张三',
      role: '华东大区负责人',
      region: '华东大区'
    }
  ];
}

export function buildWorkspaceView(
  run: PricingMeetingRun | null,
  context: Partial<MeetingContext>,
  interviewees: Interviewee[],
  localMessages: WorkspaceMessage[]
): WorkspaceView {
  const contextView = buildContextView(run?.meeting_context ?? context, interviewees);
  const cards = safeCards(run).map(normalizeWorkspaceCard);
  const artifactCards = buildArtifactCards(run);
  const runMessages = run ? buildMessagesFromRun(run, cards) : [];
  const messages = [...localMessages, ...runMessages];
  const status = run?.status ?? 'idle';

  return {
    status,
    title: contextView.title,
    scenarioLabel: '定价会议智能协同 · 验证场景',
    currentStage: inferStage(run, cards),
    messages,
    cards,
    jobs: safeJobs(run),
    artifacts: artifactCards,
    context: contextView,
    rawRun: run
  };
}

export function buildUserMessage(content: string): WorkspaceMessage {
  return {
    id: `local-user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role: 'user',
    actor: 'User',
    content,
    createdAt: new Date().toISOString(),
    cards: []
  };
}

export function buildErrorMessage(content: string): WorkspaceMessage {
  return {
    id: `local-error-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role: 'system',
    actor: 'System',
    content,
    createdAt: new Date().toISOString(),
    cards: []
  };
}

export function actionPrompt(action: string, card?: WorkspaceCardView): string {
  if (action === 'refresh') return '请刷新当前子任务状态，并汇总最新进展。';
  if (action === 'confirm-interview') return '请确认当前访谈信息是否足够，如果足够请整理访谈卡片。';
  if (action === 'followup') return '请基于当前访谈缺口继续生成追问问题。';
  if (action === 'generate-material') return '基于当前已确认访谈内容，生成会议物料资产包。';
  if (action === 'copy-reply-template') return `请给出${card?.title ?? '当前任务'}的回复模板。`;
  return action;
}

function buildContextView(context: Partial<MeetingContext>, interviewees: Interviewee[]): WorkspaceContextView {
  return {
    meetingId: context.meeting_id ?? 'meeting_20260511_001',
    title: context.meeting_title ?? '华东大区定价会',
    scheduledStart: context.scheduled_start ?? '2026-05-11 15:30',
    hostName: context.host_name ?? '主持人A',
    topic: context.business_topic ?? '重点客户价格策略与风险提示',
    scenario: String(context.business_payload?.current_scenario ?? 'pricing_meeting_validation'),
    interviewees
  };
}

function buildMessagesFromRun(run: PricingMeetingRun, cards: WorkspaceCardView[]): WorkspaceMessage[] {
  const timeline = safeTimeline(run);
  return timeline.map((event, index) => {
    const type = String(event.type ?? 'agent_message');
    const agent = String(event.agent ?? 'PricingMeetingAgent');
    const role: WorkspaceMessageRole = type === 'user_command' ? 'user' : type === 'error' ? 'system' : 'assistant';
    const relatedCards = role === 'assistant' && index === timeline.length - 1 ? cards : [];
    return {
      id: `${run.run_id}-${index}`,
      role,
      actor: displayActor(agent, role),
      content: String(event.content ?? ''),
      createdAt: String(event.created_at ?? run.updated_at ?? ''),
      cards: relatedCards,
      raw: event
    };
  });
}

function normalizeWorkspaceCard(card: WorkspaceCard, index: number): WorkspaceCardView {
  return {
    id: card.id ?? `${card.type}-${index}`,
    type: card.type,
    title: card.title,
    status: card.status,
    summary: card.summary,
    questions: toStringArray(card.questions),
    missingFields: toStringArray(card.missing_fields ?? card.missingFields),
    nextActions: toStringArray(card.next_actions ?? card.nextActions),
    data: card.data ?? card
  };
}

function buildArtifactCards(run: PricingMeetingRun | null): WorkspaceCardView[] {
  const artifacts: WorkspaceCardView[] = [];
  if (run?.asset_package) {
    artifacts.push({
      id: 'asset-package',
      type: 'artifact',
      title: '会议物料资产包',
      status: 'ready',
      summary: summarizeRecord(run.asset_package),
      questions: [],
      missingFields: [],
      nextActions: ['查看物料详情', '复制摘要'],
      data: run.asset_package
    });
  }
  if (run?.preview_card) {
    artifacts.push({
      id: 'preview-card',
      type: 'preview',
      title: '会前 5 分钟预览',
      status: 'ready',
      summary: summarizeRecord(run.preview_card),
      questions: [],
      missingFields: [],
      nextActions: ['复制通知内容'],
      data: run.preview_card
    });
  }
  return artifacts;
}

function inferStage(run: PricingMeetingRun | null, cards: WorkspaceCardView[]): string {
  if (!run) return '等待任务输入';
  if (run.status === 'error') return '执行异常';
  if (cards.some((card) => card.type.includes('interview'))) return '会前访谈';
  if (run.asset_package) return '会议物料';
  if (run.preview_card) return '会前预览';
  if (safeJobs(run).some((job) => String(job.agent).includes('material'))) return '物料生成中';
  return run.status === 'waiting_for_input' ? '等待补充' : 'Agent 协同中';
}

export function safeJobs(run: PricingMeetingRun | null): PricingMeetingAsyncJob[] {
  return Array.isArray(run?.async_jobs) ? run.async_jobs : [];
}

export function safeTimeline(run: PricingMeetingRun | null): Record<string, unknown>[] {
  return Array.isArray(run?.timeline) ? run.timeline : [];
}

export function safeCards(run: PricingMeetingRun | null): WorkspaceCard[] {
  return Array.isArray(run?.workspace_cards) ? run.workspace_cards : [];
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function displayActor(agent: string, role: WorkspaceMessageRole): string {
  if (role === 'user') return 'User';
  if (role === 'system') return 'System';
  if (agent === 'PricingMeetingAgent' || agent === 'pricing_meeting_agent') return 'PricingMeetingAgent';
  return 'PricingMeetingAgent';
}

function summarizeRecord(value: Record<string, unknown>): string {
  for (const key of ['summary', 'meeting_summary', 'asset_summary', 'title', 'content']) {
    const item = value[key];
    if (typeof item === 'string' && item.trim()) return item;
  }
  return '已生成结构化产物，可在右侧产物区查看详情。';
}
