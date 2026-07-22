import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { AgentSignal } from './router';

/**
 * Bind endpoint-provided display facts to the active endpoint profile context.
 * Routing fields never come from AgentSignal. Artifact delivery additionally
 * proves that the real file remains inside the active run cwd.
 */
export async function bindProactiveSignalToRun(
  signal: AgentSignal,
  input: { cwd: string },
): Promise<AgentSignal> {
  if (signal.kind === 'progress' || signal.kind === 'final_result') {
    return { ...signal, cwd: input.cwd };
  }
  if (signal.kind !== 'artifact_preview') return signal;

  const rawPath = signal.artifact.path;
  if (rawPath.startsWith('~')) {
    throw new Error('Proactive artifact path must not use home expansion');
  }
  const candidate = isAbsolute(rawPath) ? rawPath : resolve(input.cwd, rawPath);
  const [trustedCwd, trustedArtifact] = await Promise.all([
    realpath(input.cwd),
    realpath(candidate),
  ]);
  const rel = relative(trustedCwd, trustedArtifact);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error('Proactive artifact path escapes the active endpoint cwd');
  }
  return {
    ...signal,
    artifact: {
      ...signal.artifact,
      path: trustedArtifact,
    },
  };
}
