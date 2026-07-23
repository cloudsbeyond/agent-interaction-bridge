import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LarkChannel, NormalizedMessage } from '@larksuiteoapi/node-sdk';
import { describe, expect, test, vi } from 'vitest';
import type { AppConfig } from '../config/schema';
import type { RuntimeServicesPortContext } from '../runtime-services/selector';
import { SessionStore } from '../session/store';
import { ProactiveCorrelationStore } from '../signal/correlation-store';
import { resolveProactiveReply } from './proactive-reply';

describe('resolveProactiveReply policy boundary', () => {
  test.each([
    {
      profile: 'agent_profile.codex_host',
      expectedStatus: 'resolved',
      expectedEvent: 'reply_correlated',
      expectedReason: undefined,
    },
    {
      profile: 'agent_profile.codex_guest',
      expectedStatus: 'rejected',
      expectedEvent: 'reply_rejected',
      expectedReason: 'endpoint_profile_mismatch',
    },
  ])('keeps endpoint-profile policy in the production resolver: $expectedStatus', async ({
    profile,
    expectedStatus,
    expectedEvent,
    expectedReason,
  }) => {
    const dir = await mkdtemp(join(tmpdir(), 'aib-proactive-reply-'));
    const sessions = new SessionStore(join(dir, 'sessions.json'));
    const correlations = new ProactiveCorrelationStore({
      path: join(dir, 'correlations.json'),
      createId: () => 'correlation-1',
    });
    sessions.set('scope-1', 'session-1', '/work', 'runtime-1', 'adapter-v1');
    const reserved = await correlations.reserve({
      signalId: 'signal-1',
      signalKind: 'status',
      chatId: 'chat-1',
      scope: 'scope-1',
      sessionId: 'session-1',
      agentRuntimeId: 'runtime-1',
      endpointProfileId: 'agent_profile.codex_host',
      cwd: '/work',
      contextVersion: 'adapter-v1',
    });
    await correlations.markDelivered(reserved.record.correlationId, 'carrier-message-1');
    const actionRecords: Array<Record<string, unknown>> = [];
    const context = runtimeContext(actionRecords);
    const channel = { send: vi.fn(async () => ({})) } as unknown as LarkChannel;
    const cfg = {
      accounts: { app: { id: 'app-id', secret: 'secret', tenant: 'feishu' } },
      preferences: { agentProfile: profile },
    } as AppConfig;

    const result = await resolveProactiveReply({
      channel,
      msg: {
        chatId: 'chat-1',
        chatType: 'p2p',
        senderId: 'user-1',
        messageId: 'reply-message-1',
        replyToMessageId: 'carrier-message-1',
        content: 'continue',
        mentionedBot: false,
        resources: [],
      } as unknown as NormalizedMessage,
      cfg,
      sessions,
      correlations,
      getRuntimeServicesContext: async () => context,
    });

    expect(result.status).toBe(expectedStatus);
    expect(actionRecords).toContainEqual(expect.objectContaining({
      eventType: expectedEvent,
      correlationId: 'correlation-1',
      ...(expectedReason ? { reason: expectedReason } : {}),
    }));
    expect(channel.send).toHaveBeenCalledTimes(expectedStatus === 'rejected' ? 1 : 0);
  });
});

function runtimeContext(actionRecords: Array<Record<string, unknown>>): RuntimeServicesPortContext {
  return {
    transport: 'rpc',
    resources: [{
      id: 'storage.record_store',
      kind: 'storage',
      capability: 'record store',
      purpose: 'ActionLog',
      status: 'available',
      operatorAction: 'configure it',
    }],
    runtime: {
      describe: vi.fn(),
      call: vi.fn(async (_capabilityId, input: { id: string; data: Record<string, unknown> }) => {
        actionRecords.push(input.data);
        return {
          status: 'ok',
          capabilityId: 'record.upsert',
          providerId: 'test-record-store',
          modelId: 'not-applicable',
          evidence: [],
          record: { id: input.id },
        };
      }),
    },
  } as unknown as RuntimeServicesPortContext;
}
