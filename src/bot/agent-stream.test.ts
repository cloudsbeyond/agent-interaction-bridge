import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { AgentEvent, AgentRun } from '../agent/types';
import { SessionStore } from '../session/store';
import type { AgentSignal } from '../signal/router';
import { processAgentStream } from './agent-stream';

describe('processAgentStream signal provenance', () => {
  test('marks tool-result-derived signals as bridge_tool rather than endpoint proactive intent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aib-agent-stream-'));
    const sessions = new SessionStore(join(dir, 'sessions.json'));
    const events: AgentEvent[] = [
      { type: 'system', sessionId: 'session-1', cwd: '/work' },
      { type: 'tool_use', id: 'tool-1', name: 'shell', input: { command: 'pnpm test' } },
      { type: 'tool_result', id: 'tool-1', output: '37 tests passed', isError: false },
      { type: 'done', sessionId: 'session-1' },
    ];
    const run: AgentRun = {
      events: (async function* () {
        yield* events;
      })(),
      stop: async () => {},
      waitForExit: async () => true,
    };
    const observed: Array<{ signal: AgentSignal; source: 'endpoint' | 'bridge_tool' }> = [];

    await processAgentStream(
      { run, interrupted: false },
      sessions,
      'scope-1',
      '/work',
      'runtime-1',
      'adapter-v1',
      undefined,
      async () => {},
      {
        onSignal: async (signal, source) => {
          observed.push({ signal, source });
        },
      },
    );

    expect(observed).toEqual([
      {
        source: 'bridge_tool',
        signal: expect.objectContaining({
          id: 'tool-tool-1-test-report',
          kind: 'test_report',
        }),
      },
    ]);
  });
});
