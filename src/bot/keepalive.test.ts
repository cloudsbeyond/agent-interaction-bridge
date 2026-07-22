import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { LarkChannel } from '@larksuiteoapi/node-sdk';
import { startKeepalive } from './keepalive';

describe('bridge keepalive health replay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T06:00:00.000Z'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('reports network-unreachable without forcing a websocket restart', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    const forceReconnect = vi.fn(async () => {});
    const onHealth = vi.fn();
    const handle = startKeepalive({
      channel: channelWithState('reconnecting'),
      domain: 'https://open.feishu.cn',
      forceReconnect,
      onHealth,
    } as Parameters<typeof startKeepalive>[0] & { onHealth: typeof onHealth });

    await vi.advanceTimersByTimeAsync(15_000);

    expect(forceReconnect).not.toHaveBeenCalled();
    expect(onHealth).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'degraded', issue: 'network_unreachable' }),
    );
    handle.stop();
  });

  test('records wake-up recovery evidence without trusting pre-sleep connection state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    const forceReconnect = vi.fn(async () => {});
    const onHealth = vi.fn();
    const handle = startKeepalive({
      channel: channelWithState('reconnecting'),
      domain: 'https://open.feishu.cn',
      forceReconnect,
      onHealth,
    } as Parameters<typeof startKeepalive>[0] & { onHealth: typeof onHealth });

    await vi.advanceTimersByTimeAsync(15_000);
    vi.setSystemTime(new Date('2026-07-22T06:01:00.000Z'));
    await vi.advanceTimersByTimeAsync(15_000);

    expect(onHealth).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'starting', issue: 'wake_up_recheck' }),
    );
    expect(forceReconnect).not.toHaveBeenCalled();
    handle.stop();
  });
});

function channelWithState(state: string): LarkChannel {
  return {
    getConnectionStatus: vi.fn(() => ({ state, reconnectAttempts: 2 })),
  } as unknown as LarkChannel;
}
