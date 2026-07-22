import { mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { bindProactiveSignalToRun } from './ingress-policy';

describe('proactive AgentSignal ingress policy', () => {
  test('replaces endpoint-claimed cwd with the active run cwd', async () => {
    await expect(bindProactiveSignalToRun({
      id: 'progress-1',
      kind: 'progress',
      title: 'Working',
      summary: 'Still running',
      cwd: '/untrusted',
    }, { cwd: '/trusted' })).resolves.toMatchObject({ cwd: '/trusted' });
  });

  test('allows real artifacts inside cwd and rejects symlink escapes', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'aib-ingress-cwd-'));
    const outside = await mkdtemp(join(tmpdir(), 'aib-ingress-outside-'));
    const insidePath = join(cwd, 'result.txt');
    const outsidePath = join(outside, 'secret.txt');
    const linkPath = join(cwd, 'escaped.txt');
    await writeFile(insidePath, 'ok');
    await writeFile(outsidePath, 'not allowed');
    await symlink(outsidePath, linkPath);

    const signal = {
      id: 'artifact-1',
      kind: 'artifact_preview' as const,
      title: 'Artifact',
      summary: 'Generated file',
      artifact: { path: 'result.txt' },
    };
    await expect(bindProactiveSignalToRun(signal, { cwd })).resolves.toMatchObject({
      artifact: { path: await realpath(insidePath) },
    });
    await expect(bindProactiveSignalToRun({
      ...signal,
      artifact: { path: linkPath },
    }, { cwd })).rejects.toThrow('escapes the active endpoint cwd');
  });
});
