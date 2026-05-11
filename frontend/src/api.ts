export type AgentName =
  | 'main_metric_agent'
  | 'partner_aging_agent'
  | 'partner_balance_agent'
  | 'finance_report_agent';
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

export interface MetricValue {
  name: string;
  value: string;
  unit: string | null;
  note: string | null;
}

export interface DomainAnalysis {
  domain: string;
  table_name: string;
  status: string;
  period: string | null;
  sql: string | null;
  row_count: number | null;
  metrics: MetricValue[];
  findings: string[];
  risks: string[];
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
  analysis: DomainAnalysis | null;
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
  requested_agents: AgentName[];
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

const API_ROOT = '/api';

export function buildCreateRunPayload(message: string, agents: AgentName[]): CreateRunPayload {
  return {
    message,
    agents: [...new Set(agents)]
  };
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

export function getRun(runId: string): Promise<RunRecord> {
  return requestJson<RunRecord>(`/runs/${runId}`);
}

export function getEvents(runId: string): Promise<EventRecord[]> {
  return requestJson<EventRecord[]>(`/runs/${runId}/events`);
}

export function getRunReport(runId: string): Promise<ReportFileInfo> {
  return requestJson<ReportFileInfo>(`/runs/${runId}/reports/finance`);
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
