import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { AgentAdapter, AgentSessionQuery, AgentSessionSummary } from '../agent/types';
import { ActiveRuns } from '../bot/active-runs';
import { SessionStore } from '../session/store';
import { agentSessionContextVersion } from '../session/context-version';
import { SignalTimelineStore } from '../signal/timeline';
import { TaskApprovalStore } from '../task/approval-store';
import { TaskStatusStore } from '../task/status-store';
import { WorkspaceStore } from '../workspace/store';
import type { CommandContext } from '.';
import { tryHandleCommand } from '.';

describe('/resume command', () => {
  test('lists Codex threads through the profile-bound endpoint catalog', async () => {
    const send = vi.fn(async () => {});
    const list = vi.fn(async () => [savedThread()]);
    const context = await makeContext('/resume 10', send, { list });

    expect(await tryHandleCommand(context)).toBe(true);

    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      cwd: '/work/repo',
      endpointProfileId: 'agent_profile.codex_host',
      limit: 10,
    }));
    const payload = sendCalls(send)[0]?.[1] as { card?: object } | undefined;
    expect(JSON.stringify(payload?.card)).toContain('绑定 Codex Thread');
    expect(JSON.stringify(payload?.card)).toContain('Continue Desk work');
  });

  test('binds a revalidated idle thread using the profile-qualified runtime key', async () => {
    const send = vi.fn(async () => {});
    const read = vi.fn(async () => savedThread());
    const context = await makeContext('/resume use thread-idle', send, { read });

    expect(await tryHandleCommand(context)).toBe(true);

    expect(read).toHaveBeenCalledWith('thread-idle', expect.objectContaining({
      cwd: '/work/repo',
      endpointProfileId: 'agent_profile.codex_host',
    }));
    expect(context.sessions.resumeFor(
      'chat-1',
      '/work/repo',
      'agent_runtime.codex_app_server:agent_profile.codex_host',
      agentSessionContextVersion('adapter'),
    )).toBe('thread-idle');
  });

  test('rejects active or cwd-mismatched threads without changing scope state', async () => {
    const send = vi.fn(async () => {});
    const context = await makeContext('/resume use thread-active', send, {
      read: vi.fn(async (): Promise<AgentSessionSummary> => ({
        ...savedThread(),
        sessionId: 'thread-active',
        status: 'active',
      })),
    });
    context.sessions.set(
      'chat-1',
      'thread-before',
      '/work/repo',
      'agent_runtime.codex_app_server:agent_profile.codex_host',
      agentSessionContextVersion('adapter'),
    );

    expect(await tryHandleCommand(context)).toBe(true);

    expect(context.sessions.getRaw('chat-1')?.sessionId).toBe('thread-before');
    const payload = sendCalls(send)[0]?.[1] as { markdown?: string } | undefined;
    expect(payload?.markdown).toContain('仍在运行');
  });

  test('does not switch threads while the current scope has an active run', async () => {
    const send = vi.fn(async () => {});
    const read = vi.fn(async () => savedThread());
    const context = await makeContext('/resume use thread-idle', send, { read });
    context.activeRuns.register('chat-1', {
      events: (async function* () {})(),
      stop: vi.fn(async () => {}),
      waitForExit: vi.fn(async () => true),
    });

    expect(await tryHandleCommand(context)).toBe(true);

    expect(read).not.toHaveBeenCalled();
    expect(context.sessions.getRaw('chat-1')).toBeUndefined();
    const payload = sendCalls(send)[0]?.[1] as { markdown?: string } | undefined;
    expect(payload?.markdown).toContain('请先 `/stop`');
  });
});

async function makeContext(
  content: string,
  send: ReturnType<typeof vi.fn>,
  catalog: {
    list?: (query: AgentSessionQuery) => Promise<AgentSessionSummary[]>;
    read?: (sessionId: string, query: AgentSessionQuery) => Promise<AgentSessionSummary | undefined>;
  },
): Promise<CommandContext> {
  const dir = await mkdtemp(join(tmpdir(), 'aib-resume-'));
  const sessions = new SessionStore(join(dir, 'sessions.json'));
  const workspaces = new WorkspaceStore(join(dir, 'workspaces.json'));
  workspaces.setCwd('chat-1', '/work/repo');
  const agent = {
    id: 'agent_runtime.codex_app_server',
    displayName: 'Codex App Server',
    sessions: {
      list: catalog.list ?? vi.fn(async () => []),
      read: catalog.read ?? vi.fn(async () => undefined),
    },
    isAvailable: vi.fn(async () => true),
    run: vi.fn(),
  } as unknown as AgentAdapter;

  return {
    channel: { send },
    msg: {
      chatId: 'chat-1',
      messageId: 'message-1',
      senderId: 'user-1',
      content,
    },
    scope: 'chat-1',
    chatMode: 'p2p',
    sessions,
    workspaces,
    agent,
    activeRuns: new ActiveRuns(),
    approvals: new TaskApprovalStore(),
    taskStatus: new TaskStatusStore(),
    signalTimeline: new SignalTimelineStore(),
    controls: {
      cfg: {
        accounts: {
          app: { id: 'cli_test', tenant: 'feishu', secret: 'secret' },
        },
      },
      configPath: join(dir, 'config.json'),
      processId: 'test-process',
      restart: vi.fn(async () => {}),
      exit: vi.fn(async () => {}),
    },
  } as unknown as CommandContext;
}

function sendCalls(send: ReturnType<typeof vi.fn>): Array<[string, unknown, unknown?]> {
  return send.mock.calls as unknown as Array<[string, unknown, unknown?]>;
}

function savedThread(): AgentSessionSummary {
  return {
    sessionId: 'thread-idle',
    cwd: '/work/repo',
    preview: 'Continue Desk work',
    updatedAtMs: Date.now() - 60_000,
    status: 'not_loaded',
    ephemeral: false,
    source: 'appServer',
  };
}
