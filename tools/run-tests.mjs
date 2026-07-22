import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeHome = await mkdtemp(join(tmpdir(), 'agent-interaction-bridge-test-'));
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const requestedArgs = process.argv.slice(2);
if (requestedArgs[0] === '--') requestedArgs.shift();
const child = spawn(process.execPath, [vitest, 'run', ...requestedArgs], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AGENT_INTERACTION_BRIDGE_HOME: runtimeHome,
  },
  stdio: 'inherit',
});

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.once('SIGINT', forward);
process.once('SIGTERM', forward);

const result = await new Promise((resolve) => {
  child.once('exit', (code, signal) => resolve({ code, signal }));
});

process.removeListener('SIGINT', forward);
process.removeListener('SIGTERM', forward);
await rm(runtimeHome, { recursive: true, force: true });

if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.code ?? 1;
}
