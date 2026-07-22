export interface RuntimeDataEntry {
  path: string;
  purpose: string;
  committable: false;
}

export const RUNTIME_DATA_ENTRIES: RuntimeDataEntry[] = [
  {
    path: '.agent-interaction-bridge/',
    purpose: 'default local app home',
    committable: false,
  },
  {
    path: 'bridge-data/',
    purpose: 'operator-local app data directory that must stay out of git',
    committable: false,
  },
  {
    path: 'config.json',
    purpose: 'local operator account and preference config',
    committable: false,
  },
  {
    path: 'model-providers.json',
    purpose: 'operator-local model provider catalog; Runtime Services config lives outside this repo',
    committable: false,
  },
  {
    path: 'secrets.enc',
    purpose: 'encrypted local secret store',
    committable: false,
  },
  {
    path: 'sessions.json',
    purpose: 'local session mapping',
    committable: false,
  },
  {
    path: 'proactive-correlations.json',
    purpose: 'bounded proactive message to domain-agent session correlation',
    committable: false,
  },
  {
    path: 'workspaces.json',
    purpose: 'local workspace mapping',
    committable: false,
  },
  {
    path: 'processes.json',
    purpose: 'local process registry',
    committable: false,
  },
  {
    path: 'health/',
    purpose: 'bounded per-process carrier and endpoint health snapshots',
    committable: false,
  },
  {
    path: 'media/',
    purpose: 'downloaded local message media cache',
    committable: false,
  },
  {
    path: 'artifacts/',
    purpose: 'operator-local generated delivery artifacts; Runtime Services owns current artifact storage',
    committable: false,
  },
  {
    path: 'db/',
    purpose: 'operator-local sqlite manifests; Runtime Services owns current manifests',
    committable: false,
  },
  {
    path: 'vector/',
    purpose: 'operator-local vector indexes; Runtime Services owns current vector stores',
    committable: false,
  },
  {
    path: 'logs/',
    purpose: 'local diagnostic logs',
    committable: false,
  },
  {
    path: 'debug-*.md',
    purpose: 'local diagnostic reports',
    committable: false,
  },
];

export function runtimeDataGitIgnorePatterns(): string[] {
  return RUNTIME_DATA_ENTRIES.map((entry) => entry.path);
}

export function validateRuntimeDataGitIgnore(gitignore: string): string[] {
  const patterns = new Set(
    gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  );
  return runtimeDataGitIgnorePatterns().filter((pattern) => !patterns.has(pattern));
}
