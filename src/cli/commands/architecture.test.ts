import { describe, expect, test } from 'vitest';
import { formatArchitectureContracts } from './architecture';
import type { ArchitectureContractRegistry } from '../../architecture/contract-registry';

describe('architecture CLI commands', () => {
  test('formats contract registry status for operator review', () => {
    const registry: ArchitectureContractRegistry = {
      contracts: [
        {
          id: 'feishu.carrier',
          title: 'Feishu carrier',
          tier: 'contracted',
          riskTags: ['schema'],
          status: 'partial',
          l0: { owner: 'human', status: 'frozen', problem: 'problem' },
          l1: { owner: 'human', status: 'frozen', expression: 'flow', paths: ['architecture/system-design.md'] },
          l2: {
            owner: 'human',
            status: 'frozen',
            path: 'architecture/contracts/feishu-carrier.yaml',
            freezeSignal: 'freeze',
            invariants: ['invariant'],
            generationCommands: [
              {
                cwd: '.',
                command: 'pnpm test',
                mode: 'check',
                writesWorkspace: false,
                ciRequired: true,
              },
            ],
            generationCommand: 'pnpm test',
            driftChecks: ['agent-interaction-bridge architecture check'],
            driftCheck: 'agent-interaction-bridge architecture check',
          },
          l3: { owner: 'agent', mode: 'durable', carriers: ['src/bot/channel.ts'], commands: ['pnpm test'] },
          l4: {
            owner: 'agent',
            artifacts: ['src/bot/channel.ts'],
            aiContractIndex: 'agent-devops/ai-contract-index.md',
            harness: ['src/bot/scope.test.ts'],
            replayEvidence: ['contract-maintained source; replay is pnpm test'],
            handEditGuard: 'Change L2 contract or harness first, then let the agent update code.',
          },
          stopCondition: 'stop',
        },
      ],
    };

    expect(formatArchitectureContracts(registry)).toContain('partial feishu.carrier');
    expect(formatArchitectureContracts(registry)).toContain('tier: contracted');
    expect(formatArchitectureContracts(registry)).toContain('risk: schema');
    expect(formatArchitectureContracts(registry)).toContain('L3/L4: durable');
  });
});
