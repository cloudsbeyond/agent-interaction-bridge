import { describe, expect, test } from 'vitest';
import { chooseDeliveryPlan, CLI_CHANNEL, MAC_CHANNEL, WEB_CHANNEL } from './router';
import {
  CLI_CAPABILITIES,
  getChannelCapabilities,
  MAC_CAPABILITIES,
  WEB_CAPABILITIES,
} from './channels';

describe('channel capability registry', () => {
  test('routes urgent approvals to Mac notification without Feishu carriers', () => {
    const plan = chooseDeliveryPlan(
      {
        kind: 'risk_approval',
        title: 'Confirm push',
        summary: 'Remote write needs approval.',
      },
      MAC_CAPABILITIES,
    );

    expect(plan?.channel).toBe(MAC_CHANNEL);
    expect(plan?.representation.id).toBe('text');
    expect(plan?.carrier.id).toBe('mac.notification');
  });

  test('routes HTML artifacts to the web inline carrier', () => {
    const plan = chooseDeliveryPlan(
      {
        kind: 'artifact_preview',
        title: 'Report',
        summary: 'HTML report is ready.',
        artifact: { path: '/tmp/report.html', representationHint: 'html' },
      },
      WEB_CAPABILITIES,
    );

    expect(plan?.channel).toBe(WEB_CHANNEL);
    expect(plan?.representation.id).toBe('html');
    expect(plan?.carrier.id).toBe('web.inline');
  });

  test('keeps CLI as a markdown/text fallback channel', () => {
    const plan = chooseDeliveryPlan(
      { kind: 'final_result', title: 'Done', summary: 'Task complete.' },
      CLI_CAPABILITIES,
    );

    expect(plan?.channel).toBe(CLI_CHANNEL);
    expect(plan?.representation.id).toBe('markdown');
    expect(plan?.carrier.id).toBe('cli.stdout');
  });

  test('looks up capabilities by channel id', () => {
    expect(getChannelCapabilities(MAC_CHANNEL)).toBe(MAC_CAPABILITIES);
  });
});
