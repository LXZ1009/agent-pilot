import { describe, expect, it } from 'vitest';

import {
  buildAgentTransportOptions,
  fetchArtifactContent,
  fetchArtifacts
} from './api';

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

  it('requests artifact list and content through the gateway artifact endpoints', async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ artifacts: [] }), { status: 200 });
    }) as typeof fetch;

    try {
      await fetchArtifacts('thread_001', 'run_001');
      await fetchArtifactContent('thread_001', 'artifact_001');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls).toEqual([
      'http://localhost/api/threads/thread_001/artifacts?run_id=run_001',
      'http://localhost/api/threads/thread_001/artifacts/artifact_001'
    ]);
  });
});
