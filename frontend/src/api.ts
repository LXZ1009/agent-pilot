export type AgentName =
  | 'pre_meeting_interview_agent'
  | 'interview_structuring_agent'
  | 'material_asset_agent'
  | 'notification_agent'
  | 'task_tracking_agent'
  | 'pricing_meeting_agent';

export type PricingMeetingRunStatus = 'running' | 'waiting_for_input' | 'completed' | 'error';

export interface AgentInfo {
  name: AgentName;
  title: string;
  description: string;
  capabilities: string[];
  table_name?: string | null;
  business_domain?: string | null;
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

export interface PricingMeetingAsyncJob {
  job_id: string;
  agent: AgentName | string;
  status: string;
  action?: string;
  summary: string;
}

export interface WorkspaceCard {
  id?: string;
  type: string;
  title: string;
  status?: string;
  summary?: string;
  questions?: string[];
  missing_fields?: string[];
  next_actions?: string[];
  data?: unknown;
  [key: string]: unknown;
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
  pending_agents?: string[];
  blocked_by?: string[];
  coordinator_note: string;
  async_jobs?: PricingMeetingAsyncJob[];
  workspace_cards?: WorkspaceCard[];
  asset_package?: Record<string, unknown> | null;
  preview_card?: Record<string, unknown> | null;
  timeline?: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

const API_ROOT = import.meta.env.VITE_API_ROOT ?? '/api';

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

export function listAgents(): Promise<AgentInfo[]> {
  return requestJson<AgentInfo[]>('/agents');
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
