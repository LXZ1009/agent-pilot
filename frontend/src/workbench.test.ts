import { describe, expect, it } from 'vitest';

import {
  buildArtifactBlocks,
  buildTimelineFromPricingRun,
  parseWorkbenchCommand
} from './workbench';
import { PricingMeetingRun } from './api';

const run: PricingMeetingRun = {
  run_id: 'pm_run_1',
  command: '开始华东大区定价会会前访谈',
  status: 'waiting_for_input',
  active_agent: 'PricingMeetingAgent',
  pending_agents: ['pre_meeting_interview_agent'],
  blocked_by: ['张三'],
  coordinator_note: '已启动会前访谈异步任务',
  async_jobs: [
    {
      job_id: 'job_interview_001',
      agent: 'pre_meeting_interview_agent',
      status: 'running',
      action: 'started',
      summary: '等待张三回复会前访谈'
    }
  ],
  asset_package: null,
  preview_card: null,
  created_at: '2026-05-12T07:00:00Z',
  updated_at: '2026-05-12T07:05:00Z',
  meeting_context: {
    meeting_id: 'meeting_001',
    meeting_title: '华东大区定价会',
    scheduled_start: '2026-05-12 15:30',
    host_name: '主持人A',
    participant_name: null,
    business_topic: '重点客户价格策略',
    source: 'frontend_poc_console',
    business_payload: {}
  },
  timeline: [
    {
      type: 'user_command',
      agent: 'User',
      content: '开始华东大区定价会会前访谈'
    },
    {
      type: 'agent_message',
      agent: 'PricingMeetingAgent',
      content: '已启动会前访谈异步任务'
    },
    {
      type: 'async_job',
      agent: 'pre_meeting_interview_agent',
      job_id: 'job_interview_001',
      status: 'running',
      action: 'started',
      content: '等待张三回复会前访谈'
    }
  ]
};

describe('workbench command parsing', () => {
  it('parses a prepare slash command for one target', () => {
    expect(parseWorkbenchCommand('/prepare meeting_001 @张三')).toEqual({
      kind: 'prepare',
      raw: '/prepare meeting_001 @张三',
      meetingId: 'meeting_001',
      target: null,
      text: 'meeting_001 @张三',
      targets: ['张三']
    });
  });

  it('parses a target mention as an interview reply', () => {
    expect(parseWorkbenchCommand('@张三 客户担心账期拉长')).toEqual({
      kind: 'reply',
      raw: '@张三 客户担心账期拉长',
      meetingId: null,
      target: '张三',
      text: '客户担心账期拉长',
      targets: ['张三']
    });
  });

  it('maps material and preview slash commands to command kinds', () => {
    expect(parseWorkbenchCommand('/material 生成会议物料').kind).toBe('material');
    expect(parseWorkbenchCommand('/preview 生成会前预览').kind).toBe('preview');
  });

  it('falls back natural language to prepare intent', () => {
    expect(parseWorkbenchCommand('帮我准备华东大区定价会')).toMatchObject({
      kind: 'prepare',
      text: '帮我准备华东大区定价会'
    });
  });
});

describe('workbench timeline adapters', () => {
  it('builds transparent timeline blocks from pricing run events', () => {
    const blocks = buildTimelineFromPricingRun(run);

    expect(blocks.map((block) => block.type)).toEqual([
      'user_command',
      'agent_message',
      'async_job'
    ]);
    expect(blocks[2]).toMatchObject({
      actor: 'PreMeetingInterviewAgent',
      title: 'job_interview_001',
      status: 'running',
      jobId: 'job_interview_001'
    });
  });

  it('builds artifact blocks for material and preview outputs', () => {
    const blocks = buildArtifactBlocks(
      { asset_package_id: 'asset_1', summary: '会议摘要' },
      { title: '会前预览', highlights: ['价格底线'] }
    );

    expect(blocks).toMatchObject([
      {
        type: 'artifact',
        actor: 'MaterialAssetAgent',
        title: '会议物料资产包'
      },
      {
        type: 'artifact',
        actor: 'NotificationAgent',
        title: '会前 5 分钟预览'
      }
    ]);
  });
});
