import { describe, expect, test, vi } from 'vitest';
import { runServiceCommand } from './service';

describe('service command', () => {
  test.each(['start', 'restart'] as const)(
    '%s reports success only after LaunchAgent readiness',
    async (action) => {
      const events: string[] = [];
      const start = vi.fn(async () => { events.push(action); });
      const waitForReadiness = vi.fn(async ({ startedAfter }: { startedAfter: number }) => {
        expect(startedAfter).toBe(4_200);
        events.push('ready');
        return {} as never;
      });
      const info = vi.spyOn(console, 'log').mockImplementation((message) => {
        events.push(String(message));
      });

      await runServiceCommand(action, 'launchd', {}, {
        now: () => 4_200,
        startLaunchAgent: start,
        restartLaunchAgent: start,
        waitForReadiness,
      });

      expect(events).toEqual([
        action,
        'ready',
        action === 'start' ? 'Started LaunchAgent' : 'Restarted LaunchAgent',
      ]);
      info.mockRestore();
    },
  );

  test('does not report success when readiness times out', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runServiceCommand('restart', 'launchd', {}, {
      now: () => 4_200,
      restartLaunchAgent: vi.fn(async () => undefined),
      waitForReadiness: vi.fn(async () => {
        throw new Error('LaunchAgent readiness timed out');
      }),
    })).rejects.toThrow('LaunchAgent readiness timed out');

    expect(info).not.toHaveBeenCalledWith('Restarted LaunchAgent');
    info.mockRestore();
  });

  test('does not wait for non-start lifecycle actions', async () => {
    const waitForReadiness = vi.fn();
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runServiceCommand('stop', 'launchd', {}, {
      stopLaunchAgent: vi.fn(async () => undefined),
      waitForReadiness,
    });

    expect(waitForReadiness).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
