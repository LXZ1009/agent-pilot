import { describe, expect, it } from 'vitest';

import { buildAgentTransportOptions } from './api';

describe('agent protocol transport', () => {
  it('targets our gateway with official Agent Streaming Protocol paths', () => {
    const options = buildAgentTransportOptions('thread_001');

    expect(options.apiUrl).toBe('http://localhost/api');
    expect(options.threadId).toBe('thread_001');
    expect(options.paths).toEqual({
      commands: 'threads/thread_001/commands',
      stream: 'threads/thread_001/stream/events'
    });
  });

  it('builds valid adapter URLs under the API gateway root', () => {
    const options = buildAgentTransportOptions('thread_001');

    expect(new URL(options.paths?.commands ?? '', `${options.apiUrl}/`).toString()).toBe(
      'http://localhost/api/threads/thread_001/commands'
    );
    expect(new URL(options.paths?.stream ?? '', `${options.apiUrl}/`).toString()).toBe(
      'http://localhost/api/threads/thread_001/stream/events'
    );
  });
});
