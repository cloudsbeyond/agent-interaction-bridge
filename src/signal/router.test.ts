import { describe, expect, test } from 'vitest';
import {
  chooseDeliveryPlan,
  chooseDeliveryStyle,
  FEISHU_CHANNEL,
  MAC_CHANNEL,
  WEB_CHANNEL,
  type AgentSignal,
  type ChannelCapabilities,
} from './router';

describe('signal delivery router', () => {
  const riskSignal: AgentSignal = {
    kind: 'risk_approval',
    title: 'Confirm deploy',
    summary: 'Codex wants to deploy the service.',
  };

  test('keeps channel-private carriers bound to their owning channel', () => {
    const mac: ChannelCapabilities = {
      id: MAC_CHANNEL,
      representations: [{ id: 'text' }],
      carriers: [
        { id: 'feishu.card', channel: FEISHU_CHANNEL, representations: ['interactive_card'] },
        { id: 'mac.notification', channel: MAC_CHANNEL, representations: ['text'] },
      ],
    };

    const plan = chooseDeliveryPlan(riskSignal, mac);

    expect(plan?.representation.id).toBe('text');
    expect(plan?.carrier.id).toBe('mac.notification');
    expect(plan?.reason).toContain('fallback');
  });

  test('allows portable representations to move across channels', () => {
    const web: ChannelCapabilities = {
      id: WEB_CHANNEL,
      representations: [{ id: 'html' }],
      carriers: [{ id: 'web.inline', channel: WEB_CHANNEL, representations: ['html'] }],
    };

    const plan = chooseDeliveryPlan(
      {
        kind: 'artifact_preview',
        title: 'Report',
        summary: 'Open the HTML report.',
        artifact: { path: '/tmp/report.html' },
      },
      web,
    );

    expect(plan?.representation.id).toBe('html');
    expect(plan?.carrier.id).toBe('web.inline');
  });

  test('prefers Feishu card carrier for risk approval on the Feishu channel', () => {
    const feishu: ChannelCapabilities = {
      id: FEISHU_CHANNEL,
      representations: [{ id: 'html' }, { id: 'markdown' }, { id: 'interactive_card' }],
      carriers: [
        { id: 'feishu.markdown', channel: FEISHU_CHANNEL, representations: ['markdown', 'html'] },
        { id: 'feishu.card', channel: FEISHU_CHANNEL, representations: ['interactive_card'] },
      ],
    };

    const plan = chooseDeliveryPlan(riskSignal, feishu);

    expect(plan?.representation.id).toBe('interactive_card');
    expect(plan?.carrier.id).toBe('feishu.card');
    expect(plan?.reason).toContain('preferred');
  });

  test('keeps the old chooseDeliveryStyle alias returning the split plan', () => {
    const feishu: ChannelCapabilities = {
      id: FEISHU_CHANNEL,
      representations: [{ id: 'markdown' }],
      carriers: [{ id: 'feishu.markdown', channel: FEISHU_CHANNEL, representations: ['markdown'] }],
    };

    const plan = chooseDeliveryStyle(
      { kind: 'final_result', title: 'Done', summary: 'Finished.' },
      feishu,
    );

    expect(plan?.representation.id).toBe('markdown');
    expect(plan?.carrier.id).toBe('feishu.markdown');
  });

  test('skips preferred representations the renderer cannot produce', () => {
    const feishu: ChannelCapabilities = {
      id: FEISHU_CHANNEL,
      representations: [{ id: 'interactive_card' }, { id: 'markdown' }],
      carriers: [
        { id: 'feishu.card', channel: FEISHU_CHANNEL, representations: ['interactive_card'] },
        { id: 'feishu.markdown', channel: FEISHU_CHANNEL, representations: ['markdown'] },
      ],
    };

    const plan = chooseDeliveryPlan(
      { kind: 'progress', title: 'Running', summary: 'Codex is working.' },
      feishu,
      { canRepresent: (representation) => representation.id !== 'interactive_card' },
    );

    expect(plan?.representation.id).toBe('markdown');
    expect(plan?.carrier.id).toBe('feishu.markdown');
  });
});
