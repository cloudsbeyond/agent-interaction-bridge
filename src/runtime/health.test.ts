import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  RuntimeHealthReporter,
  readRuntimeHealth,
  runtimeHealthFile,
} from './health';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('runtime health snapshots', () => {
  test('writes a fresh connected snapshot and later classifies it as stale', async () => {
    const appDir = await mkdtemp(join(tmpdir(), 'aib-health-'));
    dirs.push(appDir);
    const now = new Date('2026-07-22T06:00:00.000Z');
    const reporter = new RuntimeHealthReporter({
      appDir,
      processId: 'proc-1',
      pid: 123,
      endpoint: 'app-server',
      now: () => now.getTime(),
    });

    await reporter.update({ state: 'connected', endpointAvailable: true });

    expect(runtimeHealthFile(appDir, 'proc-1')).toBe(join(appDir, 'health', 'proc-1.json'));
    expect(await readRuntimeHealth(appDir, 'proc-1', now.getTime())).toEqual(
      expect.objectContaining({
        processId: 'proc-1',
        state: 'connected',
        endpoint: 'app-server',
        endpointAvailable: true,
        fresh: true,
      }),
    );
    expect(await readRuntimeHealth(appDir, 'proc-1', now.getTime() + 61_000)).toEqual(
      expect.objectContaining({ fresh: false }),
    );
  });

  test('removes its snapshot during process cleanup', async () => {
    const appDir = await mkdtemp(join(tmpdir(), 'aib-health-'));
    dirs.push(appDir);
    const reporter = new RuntimeHealthReporter({
      appDir,
      processId: 'proc-1',
      pid: 123,
      endpoint: 'exec',
    });
    await reporter.update({ state: 'starting', endpointAvailable: true });

    await reporter.remove();

    expect(await readRuntimeHealth(appDir, 'proc-1')).toBeUndefined();
  });
});
