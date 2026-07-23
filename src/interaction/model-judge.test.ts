import { describe, expect, test } from 'vitest';
import type { RuntimeServicesPort } from '../runtime-services/port';
import type { RuntimeCapabilityId, RuntimeServiceEnvelope } from '../runtime-services/types';
import { createBridgeStatelessIntentJudge } from './model-judge';

describe('bridge stateless intent judge', () => {
  test('classifies interaction intent through Runtime Services without endpoint authority', async () => {
    const calls: string[] = [];
    const services = languageServices((input) => {
      calls.push(input);
      return JSON.stringify({
        kind: 'presentation_feedback',
        target: 'previous_agent_output',
        confidence: 'high',
        requiresPriorContext: true,
        guidance: ['Treat this as prior-answer presentation feedback.'],
      });
    });
    const judge = createBridgeStatelessIntentJudge({ runtime: services });

    await expect(
      judge.classify({
        text: '信息密度太高，做成飞书卡片',
        channel: 'feishu',
        hasPriorContext: true,
      }),
    ).resolves.toMatchObject({
      kind: 'presentation_feedback',
      target: 'previous_agent_output',
      confidence: 'high',
      requiresPriorContext: true,
      guidance: ['Treat this as prior-answer presentation feedback.'],
    });
    expect(await judge.classify({ text: '信息密度太高，做成飞书卡片' }))
      .not.toHaveProperty('presentation');
    expect(calls[0]).toContain('Authority boundary');
    expect(calls[0]).toContain('user_text: 信息密度太高，做成飞书卡片');
    expect(calls[0]).not.toContain('presentation may be omitted');
  });

  test('returns undefined when Runtime Services returns invalid intent JSON', async () => {
    const judge = createBridgeStatelessIntentJudge({
      runtime: languageServices(() => 'not json'),
    });

    await expect(judge.classify({ text: '随便看看' })).resolves.toBeUndefined();
  });

  test('keeps model-classified task requests free of presentation routing', async () => {
    const calls: string[] = [];
    const judge = createBridgeStatelessIntentJudge({
      runtime: languageServices((input) => {
        calls.push(input);
        return JSON.stringify({
          kind: 'task_request',
          target: 'current_message',
          confidence: 'medium',
          requiresPriorContext: false,
          guidance: [],
        });
      }),
    });

    await expect(
      judge.classify({
        text: '某产品指标趋势分析',
        channel: 'feishu',
      }),
    ).resolves.toMatchObject({ kind: 'task_request' });
    expect(await judge.classify({ text: '某产品指标趋势分析' }))
      .not.toHaveProperty('presentation');
    expect(calls[0]).not.toContain('dynamic_ui_heuristic');
  });
});

function languageServices(respond: (input: string) => string): RuntimeServicesPort {
  return {
    describe: async () => ({ schemaVersion: 1, capabilities: [] }),
    call: async <TInput, TOutput extends object>(_capabilityId: RuntimeCapabilityId, input: TInput) => {
      const payload = input as { input: string };
      return {
        status: 'ok',
        capabilityId: 'language.complete',
        providerId: 'runtime-services-rpc',
        modelId: 'mock-model',
        evidence: [],
        proposal: { kind: 'text', text: respond(payload.input), raw: {} },
      } as unknown as RuntimeServiceEnvelope<TOutput>;
    },
  };
}
