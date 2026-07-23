import { describe, expect, test, vi } from 'vitest';
import type { RuntimeServicesPortContext } from '../runtime-services/selector';
import { ProactiveActionLog } from './action-log';

function context(status: 'available' | 'stubbed' = 'available'): RuntimeServicesPortContext {
  return {
    transport: 'rpc',
    resources: [{
      id: 'storage.record_store',
      kind: 'storage',
      capability: 'record store',
      purpose: 'ActionLog',
      status,
      operatorAction: 'configure it',
    }],
    runtime: {
      describe: vi.fn(),
      call: vi.fn(async (_capability, input: { id: string }) => ({
        status: 'ok',
        capabilityId: 'record.upsert',
        providerId: 'test-record-store',
        modelId: 'not-applicable',
        evidence: [],
        record: { id: input.id },
      })),
    },
  } as unknown as RuntimeServicesPortContext;
}

describe('proactive ActionLog', () => {
  test('appends a bridge-owned record before or after carrier delivery', async () => {
    const runtimeContext = context();
    const log = new ProactiveActionLog({
      context: runtimeContext,
      config: {},
      createId: () => 'event-1',
      now: () => new Date('2026-07-22T00:00:00.000Z'),
    });

    await expect(log.append({
      type: 'outbound_intent_accepted',
      correlationId: 'correlation-1',
      data: { signalId: 'signal-1' },
    })).resolves.toBe('action-log-event-1');

    expect(runtimeContext.runtime.call).toHaveBeenCalledWith(
      'record.upsert',
      expect.objectContaining({
        namespace: 'agent-interaction-bridge',
        tableName: 'agent_interaction_bridge_records',
        id: 'action-log-event-1',
        data: expect.objectContaining({
          objectType: 'ActionLog',
          eventType: 'outbound_intent_accepted',
          correlationId: 'correlation-1',
        }),
      }),
      { consumer: 'bridge-agent', purpose: 'proactive interaction ActionLog' },
    );
  });

  test('fails closed when durable record storage is missing', async () => {
    const log = new ProactiveActionLog({ context: context('stubbed'), config: {} });
    await expect(log.append({
      type: 'outbound_intent_accepted',
      correlationId: 'correlation-1',
      data: {},
    })).rejects.toThrow('storage.record_store is unavailable');
  });

  test.each([
    'reply_consumed',
    'resume_succeeded',
    'resume_failed',
  ] as const)('accepts the proactive reply lifecycle event %s', async (type) => {
    const runtimeContext = context();
    const log = new ProactiveActionLog({
      context: runtimeContext,
      config: {},
      createId: () => type,
    });

    await log.append({ type, correlationId: 'correlation-1', data: { sessionId: 'session-1' } });

    expect(runtimeContext.runtime.call).toHaveBeenCalledWith(
      'record.upsert',
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: type,
          correlationId: 'correlation-1',
          sessionId: 'session-1',
        }),
      }),
      expect.any(Object),
    );
  });
});
