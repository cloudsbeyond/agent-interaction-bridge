import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { SessionStore } from '../session/store';
import { TaskApprovalStore } from '../task/approval-store';
import { createAgentPromptEnvelope } from '../interaction/prompt';
import type { CommandContext } from '.';
import { tryHandleCommand } from '.';

const runtimeServicesMock = vi.hoisted(() => ({
  createRuntimeServicesPortContext: vi.fn(),
}));

vi.mock('../runtime-services/selector', () => ({
  createRuntimeServicesPortContext: runtimeServicesMock.createRuntimeServicesPortContext,
}));

describe('/gatewayMode command', () => {
  test('sets relay mode as a current-session override', async () => {
    const sessions = await tempSessions();
    sessions.set('oc_123', 'adapter-thread', '/work', 'agent_runtime.codex_app_server');
    const approvals = pendingApprovals();
    const send = vi.fn(async () => {});

    const handled = await tryHandleCommand(ctx('/gatewayMode relay', sessions, send, approvals));

    expect(handled).toBe(true);
    expect(sessions.getGatewayMode('oc_123')).toBe('relay');
    expect(sessions.resumeFor('oc_123', '/work', 'agent_runtime.codex_app_server')).toBeUndefined();
    expect(approvals.latestForScope('oc_123')).toBeUndefined();
    expect(markdownReply(send)).toMatchObject({
      markdown: expect.stringContaining('relay'),
    });
  });

  test('rejects adapter mode when Runtime Services adapter resources are unavailable', async () => {
    runtimeServicesMock.createRuntimeServicesPortContext.mockResolvedValueOnce({
      transport: 'rpc',
      runtime: { call: vi.fn() },
      resources: [],
    });
    const sessions = await tempSessions();
    const send = vi.fn(async () => {});

    const handled = await tryHandleCommand(ctx('/gatewayMode adapter', sessions, send));

    expect(handled).toBe(true);
    expect(sessions.getGatewayMode('oc_123')).toBeUndefined();
    expect(markdownReply(send)).toMatchObject({
      markdown: expect.stringContaining('无法切换'),
    });
  });

  test('clears the current-session override with default', async () => {
    const sessions = await tempSessions();
    sessions.setGatewayMode('oc_123', 'relay');
    const approvals = pendingApprovals();
    const send = vi.fn(async () => {});

    const handled = await tryHandleCommand(ctx('/gatewayMode default', sessions, send, approvals));

    expect(handled).toBe(true);
    expect(sessions.getGatewayMode('oc_123')).toBeUndefined();
    expect(approvals.latestForScope('oc_123')).toBeUndefined();
    expect(markdownReply(send)).toMatchObject({
      markdown: expect.stringContaining('全局默认'),
    });
  });
});

async function tempSessions(): Promise<SessionStore> {
  const dir = await mkdtemp(join(tmpdir(), 'aib-gateway-mode-'));
  return new SessionStore(join(dir, 'sessions.json'));
}

function markdownReply(send: ReturnType<typeof vi.fn>): { markdown?: string } | undefined {
  const calls = send.mock.calls as unknown as Array<[string, { markdown?: string }, unknown?]>;
  return calls[0]?.[1];
}

function ctx(
  content: string,
  sessions: SessionStore,
  send: ReturnType<typeof vi.fn>,
  approvals = new TaskApprovalStore(),
): CommandContext {
  return {
    channel: {
      send,
    },
    msg: {
      chatId: 'oc_123',
      messageId: 'om_123',
      senderId: 'ou_123',
      content,
    },
    scope: 'oc_123',
    chatMode: 'p2p',
    sessions,
    approvals,
    controls: {
      cfg: {
        accounts: {
          app: {
            id: 'cli_test',
            tenant: 'feishu',
            secret: 'secret',
          },
        },
      },
      configPath: '/tmp/config.json',
      processId: 'test-process',
      restart: vi.fn(async () => {}),
      exit: vi.fn(async () => {}),
    },
  } as unknown as CommandContext;
}

function pendingApprovals(): TaskApprovalStore {
  const approvals = new TaskApprovalStore(() => 'approval-1', () => 1234);
  approvals.create({
    scope: 'oc_123',
    chatId: 'oc_123',
    messageId: 'om_pending',
    promptEnvelope: createAgentPromptEnvelope({
      mode: 'adapter',
      channel: 'feishu',
      sections: [{ kind: 'user_message', content: 'run pending task' }],
    }),
    task: 'run pending task',
    cwd: '/work',
    gatewayMode: 'adapter',
    contextVersion: 'adapter-v1',
  });
  return approvals;
}
