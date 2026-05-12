import { describe, expect, it } from 'vitest';

import { buildPricingMeetingRunCreatePayload } from './api';

describe('api payload', () => {
  it('builds pricing meeting payload', () => {
    const payload = buildPricingMeetingRunCreatePayload(
      '开始会前访谈',
      { meeting_id: 'm1' },
      [{ name: '张三' }]
    );
    expect(payload.command).toBe('开始会前访谈');
    expect(payload.meeting_context.meeting_id).toBe('m1');
    expect(payload.interviewees[0].name).toBe('张三');
  });
});
