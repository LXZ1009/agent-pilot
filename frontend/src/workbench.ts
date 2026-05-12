import { displayAgentName, type PricingMeetingRun } from './api';

export type WorkbenchCommandKind = 'prepare' | 'reply' | 'material' | 'preview' | 'trace' | 'retry' | 'unknown';

export interface WorkbenchCommand {
  kind: WorkbenchCommandKind;
  raw: string;
  meetingId: string | null;
  target: string | null;
  targets: string[];
  text: string;
}

export type TimelineBlockType = 'user_command' | 'agent_message' | 'async_job' | 'artifact' | 'error';

export interface TimelineBlock {
  id: string;
  type: TimelineBlockType;
  actor: string;
  target?: string | null;
  title?: string;
  content: string;
  status?: string;
  createdAt?: string;
  jobId?: string;
  data?: unknown;
}

const MENTION_PATTERN = /@([\p{Script=Han}\w.-]+)/gu;

export function parseWorkbenchCommand(input: string): WorkbenchCommand {
  const raw = input.trim();
  const targets = extractTargets(raw);
  const firstTarget = targets[0] ?? null;

  if (!raw) return command('unknown', raw, null, null, [], '');

  if (raw.startsWith('@') && firstTarget) {
    return command(
      'reply',
      raw,
      null,
      firstTarget,
      targets,
      raw.replace(new RegExp(`^@${escapeRegExp(firstTarget)}\\s*`, 'u'), '').trim()
    );
  }

  const [slash, ...rest] = raw.split(/\s+/);
  const body = rest.join(' ').trim();

  if (slash === '/prepare') return command('prepare', raw, pickMeetingId(raw), firstTarget, targets, body);
  if (slash === '/material') return command('material', raw, null, null, targets, body || '生成会议物料');
  if (slash === '/preview') return command('preview', raw, null, null, targets, body || '生成会前预览');
  if (slash === '/trace') return command('trace', raw, null, null, targets, body || 'last');
  if (slash === '/retry') return command('retry', raw, null, firstTarget, targets, body);

  return command('prepare', raw, pickMeetingId(raw), firstTarget, targets, raw);
}

export function buildTimelineFromPricingRun(run: PricingMeetingRun): TimelineBlock[] {
  const blocks = run.timeline.map((event, index): TimelineBlock => {
    const type = normalizeTimelineType(String(event.type ?? 'agent_message'));
    const agent = String(event.agent ?? run.active_agent ?? 'PricingMeetingAgent');
    return {
      id: `${run.run_id}:event:${index}`,
      type,
      actor: displayAgentName(agent),
      target: typeof event.target === 'string' ? event.target : null,
      title: type === 'async_job' ? String(event.job_id ?? 'async job') : undefined,
      content: String(event.content ?? ''),
      status: String(event.status ?? run.status),
      jobId: typeof event.job_id === 'string' ? event.job_id : undefined,
      createdAt: typeof event.created_at === 'string' ? event.created_at : run.updated_at,
      data: event
    };
  });

  if (run.coordinator_note && !blocks.some((block) => block.content === run.coordinator_note)) {
    blocks.push({
      id: `${run.run_id}:coordinator`,
      type: 'agent_message',
      actor: 'PricingMeetingAgent',
      content: run.coordinator_note,
      status: run.status,
      createdAt: run.updated_at,
      data: { source: 'coordinator_note' }
    });
  }

  return blocks;
}

export function buildArtifactBlocks(
  assetPackage: Record<string, unknown> | null,
  previewCard: Record<string, unknown> | null
): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];

  if (assetPackage) {
    blocks.push({
      id: `artifact:material:${String(assetPackage.asset_package_id ?? 'latest')}`,
      type: 'artifact',
      actor: 'MaterialAssetAgent',
      title: '会议物料资产包',
      content: summarizeArtifact(assetPackage, ['summary', 'meeting_summary', 'asset_summary']),
      status: 'completed',
      data: assetPackage
    });
  }

  if (previewCard) {
    blocks.push({
      id: `artifact:preview:${String(previewCard.preview_id ?? previewCard.title ?? 'latest')}`,
      type: 'artifact',
      actor: 'NotificationAgent',
      title: '会前 5 分钟预览',
      content: summarizeArtifact(previewCard, ['title', 'summary', 'reminder', 'meeting_reminder']),
      status: 'completed',
      data: previewCard
    });
  }

  return blocks;
}

export function buildUserCommandBlock(commandText: string): TimelineBlock {
  return {
    id: `user:${Date.now()}`,
    type: 'user_command',
    actor: 'User',
    content: commandText,
    createdAt: new Date().toISOString()
  };
}

export function buildErrorBlock(message: string): TimelineBlock {
  return {
    id: `error:${Date.now()}`,
    type: 'error',
    actor: 'Workbench',
    title: '执行失败',
    content: message,
    status: 'error'
  };
}

function normalizeTimelineType(type: string): TimelineBlockType {
  if (type === 'user_command') return 'user_command';
  if (type === 'async_job') return 'async_job';
  if (type === 'artifact') return 'artifact';
  if (type === 'error') return 'error';
  return 'agent_message';
}

function extractTargets(input: string): string[] {
  return [...input.matchAll(MENTION_PATTERN)].map((match) => match[1]).filter(Boolean);
}

function pickMeetingId(input: string): string | null {
  return input.match(/\bmeeting[_-][\w-]+\b/u)?.[0] ?? null;
}

function command(
  kind: WorkbenchCommandKind,
  raw: string,
  meetingId: string | null,
  target: string | null,
  targets: string[],
  text: string
): WorkbenchCommand {
  return { kind, raw, meetingId, target, targets, text };
}

function summarizeArtifact(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const item = value[key];
    if (typeof item === 'string' && item.trim()) return item;
  }
  return JSON.stringify(value, null, 2);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
