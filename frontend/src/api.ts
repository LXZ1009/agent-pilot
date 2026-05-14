import { HttpAgentServerAdapter, type HttpAgentServerAdapterOptions } from '@langchain/react';

export type AgentName =
  | 'pricing_meeting_agent'
  | 'pre_meeting_interview_agent'
  | 'interview_structuring_agent'
  | 'material_asset_agent'
  | 'notification_agent'
  | 'task_tracking_agent';

export interface AgentInfo {
  name: AgentName;
  title: string;
  description: string;
  capabilities: string[];
  business_domain: string;
}

export interface EvidenceCard {
  id: string;
  title: string;
  description: string;
  category: 'process' | 'source' | 'missing' | 'technical' | string;
  confidence: 'recorded' | string;
}

export interface ThreadEvidence {
  thread_id: string;
  summary_cards: EvidenceCard[];
  technical_events: unknown[];
}

const API_ROOT = normalizeApiRoot(import.meta.env.VITE_API_ROOT ?? '/api');

export function buildAgentTransportOptions(threadId: string): HttpAgentServerAdapterOptions {
  return {
    apiUrl: API_ROOT,
    threadId,
    paths: {
      commands: `threads/${threadId}/commands`,
      stream: `threads/${threadId}/stream/events`
    }
  };
}

export function createAgentTransport(threadId: string): HttpAgentServerAdapter {
  return new HttpAgentServerAdapter(buildAgentTransportOptions(threadId));
}

export async function fetchThreadEvidence(threadId: string): Promise<ThreadEvidence> {
  const response = await fetch(`${API_ROOT}/threads/${threadId}/evidence`);
  if (!response.ok) {
    throw new Error(`Evidence request failed with ${response.status}`);
  }
  return response.json() as Promise<ThreadEvidence>;
}

export async function listAgents(): Promise<AgentInfo[]> {
  const response = await fetch(`${API_ROOT}/agents`);
  if (!response.ok) {
    throw new Error(`Agent request failed with ${response.status}`);
  }
  return response.json() as Promise<AgentInfo[]>;
}

function normalizeApiRoot(apiRoot: string): string {
  const origin = globalThis.location?.origin ?? 'http://localhost';
  return new URL(apiRoot, origin).toString().replace(/\/$/, '');
}
