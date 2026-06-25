import { describe, expect, test } from 'vitest';
import { renderMacNotification, shouldNotifyMac } from './mac-notifier';

describe('Mac signal notifier', () => {
  test('renders risk approval as a Mac notification payload', () => {
    const payload = renderMacNotification({
      kind: 'risk_approval',
      title: 'Push branch?',
      summary: 'Codex wants to push commits.',
      risk: 'remote write',
      proposedAction: 'git push github main',
    });

    expect(payload).toMatchObject({
      title: 'Push branch?',
      subtitle: 'Agent 风险审批',
      plan: {
        channel: 'mac',
        representation: { id: 'text' },
        carrier: { id: 'mac.notification' },
      },
    });
    expect(payload?.body).toContain('remote write');
    expect(payload?.body).toContain('git push github main');
  });

  test('does not notify for passive progress signals', () => {
    expect(
      shouldNotifyMac({ kind: 'progress', title: 'Running', summary: 'Working.' }),
    ).toBe(false);
    expect(
      renderMacNotification({ kind: 'progress', title: 'Running', summary: 'Working.' }),
    ).toBeUndefined();
  });
});
