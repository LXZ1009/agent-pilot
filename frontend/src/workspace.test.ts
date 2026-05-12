import { describe, expect, it } from 'vitest';

import { buildWorkspaceView, defaultInterviewees, defaultMeetingContext } from './workspace';
import type { PricingMeetingRun } from './api';

describe('workspace view', () => {
  it('handles null run', () => {
    const view = buildWorkspaceView(null, defaultMeetingContext(), defaultInterviewees(), []);
    expect(view.status).toBe('idle');
    expect(view.messages).toHaveLength(0);
    expect(view.jobs).toHaveLength(0);
  });

  it('handles missing optional arrays from backend', () => {
    const run: PricingMeetingRun = {
      run_id: 'pm_run_1',
      command: '开始会前访谈',
      meeting_context: {
        meeting_id: 'm1',
        meeting_title: '会议',
        scheduled_start: '2026-05-12 10:00',
        host_name: '主持人',
        participant_name: null,
        business_topic: '主题',
        source: 'test',
        business_payload: {}
      },
      status: 'waiting_for_input',
      active_agent: 'PricingMeetingAgent',
      coordinator_note: '已生成访谈问题',
      created_at: '2026-05-12T00:00:00Z',
      updated_at: '2026-05-12T00:00:01Z'
    };

    const view = buildWorkspaceView(run, defaultMeetingContext(), defaultInterviewees(), []);
    expect(view.jobs).toEqual([]);
    expect(view.messages).toHaveLength(0);
  });

  it('attaches workspace cards to the latest assistant message', () => {
    const run: PricingMeetingRun = {
      run_id: 'pm_run_1',
      command: '开始会前访谈',
      meeting_context: {
        meeting_id: 'm1',
        meeting_title: '会议',
        scheduled_start: '2026-05-12 10:00',
        host_name: '主持人',
        participant_name: null,
        business_topic: '主题',
        source: 'test',
        business_payload: {}
      },
      status: 'waiting_for_input',
      active_agent: 'PricingMeetingAgent',
      coordinator_note: '已生成访谈问题',
      timeline: [
        { type: 'user_command', agent: 'User', content: '开始会前访谈' },
        { type: 'agent_message', agent: 'PricingMeetingAgent', content: '已生成访谈问题' }
      ],
      workspace_cards: [
        {
          type: 'interview_task',
          title: '张三会前访谈',
          questions: ['请补充销量'],
          missing_fields: ['销量'],
          next_actions: ['等待张三回复']
        }
      ],
      created_at: '2026-05-12T00:00:00Z',
      updated_at: '2026-05-12T00:00:01Z'
    };

    const view = buildWorkspaceView(run, defaultMeetingContext(), defaultInterviewees(), []);
    expect(view.messages.at(-1)?.cards[0].title).toBe('张三会前访谈');
  });
});
