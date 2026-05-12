import { describe, expect, it } from 'vitest';

import {
  buildAutoRouteRunPayload,
  buildCreateRunPayload,
  buildPricingMeetingRunCreatePayload,
  reportContentUrl,
  statusTone,
  summarizeRun
} from './api';

describe('api utilities', () => {
  it('deduplicates selected meeting agents while preserving order', () => {
    expect(
      buildCreateRunPayload('hello', [
        'pre_meeting_interview_agent',
        'material_asset_agent',
        'pre_meeting_interview_agent'
      ])
    ).toEqual({
      message: 'hello',
      agents: ['pre_meeting_interview_agent', 'material_asset_agent']
    });
  });

  it('builds an auto-route scenario run payload with no forced agents', () => {
    expect(
      buildAutoRouteRunPayload('生成会议物料资产包', {
        meeting_id: 'meeting_001',
        meeting_title: '华东大区定价会',
        source: 'frontend_scenario_workspace',
        business_payload: {
          region: '华东',
          confirmed_interview_card: '客户价格敏感，需要明确底线。'
        }
      })
    ).toEqual({
      message: '生成会议物料资产包',
      agents: [],
      meeting_context: {
        meeting_id: 'meeting_001',
        meeting_title: '华东大区定价会',
        source: 'frontend_scenario_workspace',
        business_payload: {
          region: '华东',
          confirmed_interview_card: '客户价格敏感，需要明确底线。'
        }
      }
    });
  });

  it('builds a PricingMeetingRun create payload for async agent collaboration', () => {
    expect(
      buildPricingMeetingRunCreatePayload(
        '开始华东大区定价会会前访谈，并在完成后生成会议物料',
        {
          meeting_id: 'meeting_001',
          meeting_title: '华东大区定价会',
          source: 'transparent_agent_workbench'
        },
        [{ interviewee_id: 'u1', name: '张三', role: '大区负责人', region: '华东' }]
      )
    ).toEqual({
      command: '开始华东大区定价会会前访谈，并在完成后生成会议物料',
      meeting_context: {
        meeting_id: 'meeting_001',
        meeting_title: '华东大区定价会',
        source: 'transparent_agent_workbench'
      },
      interviewees: [{ interviewee_id: 'u1', name: '张三', role: '大区负责人', region: '华东' }]
    });
  });

  it('maps task status to stable UI tones', () => {
    expect(statusTone('queued')).toBe('neutral');
    expect(statusTone('running')).toBe('active');
    expect(statusTone('succeeded')).toBe('success');
    expect(statusTone('cancelled')).toBe('muted');
    expect(statusTone('error')).toBe('danger');
  });

  it('summarizes run task status counts', () => {
    const summary = summarizeRun({
      run_id: 'run_1',
      message: 'demo',
      requested_agents: ['pre_meeting_interview_agent'],
      auto_route: false,
      supervisor_note: 'routed',
      report_path: '/tmp/reports/run_1/meeting-asset-package.json',
      meeting_context: null,
      created_at: '2026-04-30T00:00:00Z',
      updated_at: '2026-04-30T00:00:00Z',
      events: [],
      tasks: [
        {
          task_id: 'task_1',
          run_id: 'run_1',
          agent: 'pre_meeting_interview_agent',
          input: 'demo',
          status: 'running',
          progress: 50,
          result: null,
          error: null,
          updates: [],
          analysis: null,
          created_at: '2026-04-30T00:00:00Z',
          started_at: '2026-04-30T00:00:01Z',
          completed_at: null,
          last_updated_at: null
        }
      ]
    });

    expect(summary).toEqual({ running: 1, succeeded: 0, cancelled: 0, error: 0 });
  });

  it('builds the run report preview URL only when the file exists', () => {
    expect(
      reportContentUrl(
        {
          exists: true,
          name: 'meeting-asset-package.json',
          display_path: '/tmp/reports/run_1/meeting-asset-package.json',
          content_url: '/api/runs/run_1/artifacts/meeting-assets/content',
          size_bytes: 128,
          modified_at: '2026-05-06T00:00:00Z'
        },
        42
      )
    ).toBe('/api/runs/run_1/artifacts/meeting-assets/content?v=42');

    expect(
      reportContentUrl(
        {
          exists: false,
          name: 'meeting-asset-package.json',
          display_path: '/tmp/reports/run_1/meeting-asset-package.json',
          content_url: null,
          size_bytes: null,
          modified_at: null
        },
        42
      )
    ).toBeNull();
  });
});
