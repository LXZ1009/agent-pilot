import { describe, expect, it } from 'vitest';

import { buildArtifactBlocks, buildTimelineFromPricingRun, parseWorkbenchCommand } from './workbench';
import type { PricingMeetingRun } from './api';

describe('strict pricing-meeting workbench', () => {
  it('parses slash commands and mention replies', () => {
    expect(parseWorkbenchCommand('/prepare meeting_001 @张三')).toMatchObject({
      kind: 'prepare',
      meetingId: 'meeting_001',
      target: '张三'
    });
    expect(parseWorkbenchCommand('@张三 补充近三个月销量')).toMatchObject({
      kind: 'reply',
      target: '张三',
      text: '补充近三个月销量'
    });
  });

  it('builds timeline from PricingMeetingRun only', () => {
    const run: PricingMeetingRun = {
      run_id: 'pm_run_1',
      command: '/prepare meeting_001 @张三',
      meeting_context: {
        meeting_id: 'meeting_001',
        meeting_title: '测试会议',
        scheduled_start: null,
        host_name: null,
        participant_name: null,
        business_topic: null,
        source: null,
        business_payload: {}
      },
      status: 'waiting_for_input',
      active_agent: 'PricingMeetingAgent',
      pending_agents: ['pre_meeting_interview_agent'],
      blocked_by: ['张三'],
      coordinator_note: '等待张三补充信息',
      async_jobs: [
        {
          job_id: 'job_1',
          agent: 'pre_meeting_interview_agent',
          status: 'needs_input',
          action: 'started',
          summary: '等待张三补充信息'
        }
      ],
      asset_package: null,
      preview_card: null,
      timeline: [
        { type: 'async_job', agent: 'pre_meeting_interview_agent', content: '等待张三补充信息', job_id: 'job_1', status: 'needs_input' }
      ],
      created_at: '2026-05-12T00:00:00Z',
      updated_at: '2026-05-12T00:00:00Z'
    };

    const blocks = buildTimelineFromPricingRun(run);
    expect(blocks.some((block) => block.type === 'async_job')).toBe(true);
    expect(blocks.some((block) => block.content === '等待张三补充信息')).toBe(true);
  });

  it('builds artifact blocks from inline run artifacts', () => {
    const blocks = buildArtifactBlocks({ asset_package_id: 'asset_1', summary: '资产包摘要' }, null);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'artifact', actor: 'MaterialAssetAgent', content: '资产包摘要' });
  });
});
