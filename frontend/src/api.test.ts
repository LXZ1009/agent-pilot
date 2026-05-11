import { describe, expect, it } from 'vitest';

import { buildCreateRunPayload, reportContentUrl, statusTone, summarizeRun } from './api';

describe('api utilities', () => {
  it('deduplicates selected agents while preserving order', () => {
    expect(
      buildCreateRunPayload('hello', [
        'main_metric_agent',
        'partner_aging_agent',
        'main_metric_agent'
      ])
    ).toEqual({
      message: 'hello',
      agents: ['main_metric_agent', 'partner_aging_agent']
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
      requested_agents: ['main_metric_agent'],
      supervisor_note: 'routed',
      report_path: '/tmp/reports/run_1/financial-report.html',
      created_at: '2026-04-30T00:00:00Z',
      updated_at: '2026-04-30T00:00:00Z',
      events: [],
      tasks: [
        {
          task_id: 'task_1',
          run_id: 'run_1',
          agent: 'main_metric_agent',
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
          name: 'financial-report.html',
          display_path: '/tmp/reports/run_1/financial-report.html',
          content_url: '/api/runs/run_1/reports/finance/content',
          size_bytes: 128,
          modified_at: '2026-05-06T00:00:00Z'
        },
        42
      )
    ).toBe('/api/runs/run_1/reports/finance/content?v=42');

    expect(
      reportContentUrl(
        {
          exists: false,
          name: 'financial-report.html',
          display_path: '/tmp/reports/run_1/financial-report.html',
          content_url: null,
          size_bytes: null,
          modified_at: null
        },
        42
      )
    ).toBeNull();
  });
});
