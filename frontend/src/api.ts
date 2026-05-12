export type AgentName =
  | 'pre_meeting_interview_agent'
  | 'interview_structuring_agent'
  | 'material_asset_agent'
  | 'notification_agent'
  | 'task_tracking_agent'
  | 'pricing_meeting_agent';
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'cancelled' | 'error';
export type StatusTone = 'neutral' | 'active' | 'success' | 'muted' | 'danger';

export interface AgentInfo {
  name: AgentName;
  title: string;
  description: string;
  capabilities: string[];
  table_name: string | null;
  business_domain: string | null;
}

export interface MeetingContext {
  meeting_id: string | null;
  meeting_title: string | null;
  scheduled_start: string | null;
  host_name: string | null;
  participant_name: string | null;
  business_topic: string | null;
  source: string | null;
  business_payload: Record<string, unknown>;
}

export interface Interviewee {
  interviewee_id?: string | null;
  name: string;
  role?: string | null;
  region?: string | null;
}

export type PricingMeetingRunStatus = 'running' | 'waiting_for_input' | 'completed' | 'error';

export interface PricingMeetingAsyncJob {
  job_id: string;
  agent: AgentName;
  status: string;
  action: string;
  summary: string;
}

export interface PricingMeetingRunCreatePayload {
  command: string;
  meeting_context: Partial<MeetingContext>;
  interviewees: Interviewee[];
}

export interface PricingMeetingRunContinuePayload {
  content: string;
}

export interface PricingMeetingRun {
  run_id: string;
  command: string;
  meeting_context: MeetingContext;
  status: PricingMeetingRunStatus;
  active_agent: string;
  pending_agents: string[];
  blocked_by: string[];
  coordinator_note: string;
  async_jobs: PricingMeetingAsyncJob[];
  asset_package: Record<string, unknown> | null;
  preview_card: Record<string, unknown> | null;
  timeline: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export interface AgentTask {
  task_id: string;
  run_id: string;
  agent: AgentName;
  input: string;
  status: TaskStatus;
  progress: number;
  result: string | null;
  error: string | null;
  updates: string[];
  analysis: unknown | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_updated_at: string | null;
}

export interface EventRecord {
  event_id: string;
  run_id: string;
  task_id: string | null;
  agent: AgentName | null;
  type: string;
  message: string;
  created_at: string;
}

export interface RunRecord {
  run_id: string;
  message: string;
  meeting_context: MeetingContext | null;
  requested_agents: AgentName[];
  auto_route: boolean;
  supervisor_note: string;
  report_path: string | null;
  tasks: AgentTask[];
  events: EventRecord[];
  created_at: string;
  updated_at: string;
}

export interface CreateRunPayload {
  message: string;
  agents: AgentName[];
  meeting_context?: Partial<MeetingContext>;
}

export interface RunSummary {
  running: number;
  succeeded: number;
  cancelled: number;
  error: number;
}

export interface ReportFileInfo {
  exists: boolean;
  name: string;
  display_path: string;
  content_url: string | null;
  size_bytes: number | null;
  modified_at: string | null;
}

const API_ROOT = import.meta.env.VITE_API_ROOT ?? '/api';

export function buildPricingMeetingRunCreatePayload(
  command: string,
  meetingContext: Partial<MeetingContext>,
  interviewees: Interviewee[]
): PricingMeetingRunCreatePayload {
  return {
    command,
    meeting_context: meetingContext,
    interviewees
  };
}

export function buildCreateRunPayload(
  message: string,
  agents: AgentName[],
  meetingContext?: Partial<MeetingContext>
): CreateRunPayload {
  return {
    message,
    agents: [...new Set(agents)],
    ...(meetingContext ? { meeting_context: meetingContext } : {})
  };
}

export function buildAutoRouteRunPayload(
  message: string,
  meetingContext: Partial<MeetingContext>
): CreateRunPayload {
  return buildCreateRunPayload(message, [], meetingContext);
}

export function statusTone(status: TaskStatus): StatusTone {
  switch (status) {
    case 'running':
      return 'active';
    case 'succeeded':
      return 'success';
    case 'cancelled':
      return 'muted';
    case 'error':
      return 'danger';
    case 'queued':
    default:
      return 'neutral';
  }
}

export function summarizeRun(run: RunRecord): RunSummary {
  return run.tasks.reduce<RunSummary>(
    (summary, task) => {
      if (task.status === 'running' || task.status === 'queued') {
        summary.running += 1;
      }
      if (task.status === 'succeeded') {
        summary.succeeded += 1;
      }
      if (task.status === 'cancelled') {
        summary.cancelled += 1;
      }
      if (task.status === 'error') {
        summary.error += 1;
      }
      return summary;
    },
    { running: 0, succeeded: 0, cancelled: 0, error: 0 }
  );
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function listAgents(): Promise<AgentInfo[]> {
  return requestJson<AgentInfo[]>('/agents');
}

export function createRun(payload: CreateRunPayload): Promise<RunRecord> {
  return requestJson<RunRecord>('/runs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function createPricingMeetingRun(payload: PricingMeetingRunCreatePayload): Promise<PricingMeetingRun> {
  return requestJson<PricingMeetingRun>('/pricing-meeting/runs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function continuePricingMeetingRun(
  runId: string,
  payload: PricingMeetingRunContinuePayload
): Promise<PricingMeetingRun> {
  return requestJson<PricingMeetingRun>(`/pricing-meeting/runs/${runId}/continue`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function getRun(runId: string): Promise<RunRecord> {
  return requestJson<RunRecord>(`/runs/${runId}`);
}

export function getEvents(runId: string): Promise<EventRecord[]> {
  return requestJson<EventRecord[]>(`/runs/${runId}/events`);
}

export function getMeetingAssets(runId: string): Promise<ReportFileInfo> {
  return requestJson<ReportFileInfo>(`/runs/${runId}/artifacts/meeting-assets`);
}

export function reportContentUrl(info: ReportFileInfo, version: number): string | null {
  if (!info.exists || !info.content_url) return null;
  return `${API_ROOT}${info.content_url.replace(/^\/api/, '')}?v=${version}`;
}

export function updateTask(
  runId: string,
  taskId: string,
  instruction: string
): Promise<AgentTask> {
  return requestJson<AgentTask>(`/runs/${runId}/tasks/${taskId}/updates`, {
    method: 'POST',
    body: JSON.stringify({ instruction })
  });
}

export function cancelTask(runId: string, taskId: string): Promise<AgentTask> {
  return requestJson<AgentTask>(`/runs/${runId}/tasks/${taskId}/cancel`, {
    method: 'POST'
  });
}
