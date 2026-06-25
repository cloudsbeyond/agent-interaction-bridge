import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  REQUIRED_CONTRACT_IDS,
  formatContractRegistry,
  loadContractRegistryFromDir,
  readContractRegistry,
  validateContractRegistry,
} from './contract-registry';

const validContractYaml = `
schema_version: 1
contracts:
  - id: feishu.carrier
    title: Feishu carrier intake
    tier: contracted
    risk_tags:
      - schema
      - api
    status: partial
    l0:
      owner: human
      status: frozen
      problem: Keep Feishu as the current carrier without making it the architecture boundary.
    l1:
      owner: human
      status: frozen
      expression: inbound event -> normalized message -> scope -> queue -> turn plan -> delivery
      paths:
        - architecture/system-design.md
    l2:
      owner: human
      status: frozen
      path: architecture/contracts/feishu-carrier.yaml
      freeze_signal: Default freeze confirmed by human owner on 2026-05-27.
      invariants:
        - Feishu payloads stay behind carrier adapters.
      generation_commands:
        - cwd: .
          command: pnpm test -- src/bot/scope.test.ts
          mode: check
          writes_workspace: false
          ci_required: true
      generation_command: pnpm test -- src/bot/scope.test.ts
      drift_checks:
        - agent-interaction-bridge architecture check
      drift_check: agent-interaction-bridge architecture check
    l3:
      owner: agent
      mode: durable
      carriers:
        - AGENTS.md
      commands:
        - pnpm test -- src/bot/scope.test.ts
    l4:
      owner: agent
      artifacts:
        - src/bot/channel.ts
      ai_contract_index: agent-devops/ai-contract-index.md
      harness:
        - src/bot/scope.test.ts
      replay_evidence:
        - contract-maintained source; replay is the listed harness command.
      hand_edit_guard: Change L2 contract or harness first, then let the agent update code.
    stop_condition: Return to L0-L2 if Feishu behavior becomes generic runtime policy.
`;

describe('architecture contract registry', () => {
  test('loads YAML contracts and validates frozen L0-L2 fields', () => {
    const root = mkdtempSync(join(tmpdir(), 'bridge-contracts-'));
    const dir = join(root, 'architecture', 'contracts');
    writeContractFixtureFiles(root);
    writeFileSync(join(dir, 'feishu-carrier.yaml'), validContractYaml);

    const registry = loadContractRegistryFromDir(dir);
    const result = validateContractRegistry(registry, {
      requiredIds: ['feishu.carrier'],
      rootDir: root,
    });

    expect(registry.contracts.map((contract) => contract.id)).toEqual(['feishu.carrier']);
    expect(registry.contracts[0]?.tier).toBe('contracted');
    expect(registry.contracts[0]?.riskTags).toEqual(['schema', 'api']);
    expect(result.ok).toBe(true);
    expect(formatContractRegistry(registry)).toContain('partial feishu.carrier');
  });

  test('rejects contracts that do not declare task tier and risk tags', () => {
    const registry = loadContractRegistryFromDirFromString(
      validContractYaml
        .replace('    tier: contracted\n', '')
        .replace('    risk_tags:\n      - schema\n      - api\n', ''),
    );

    const result = validateContractRegistry(registry, {
      requiredIds: ['feishu.carrier'],
      rootDir: process.cwd(),
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('contract.feishu.carrier.tier');
    expect(result.failures).toContain('contract.feishu.carrier.risk_tags');
  });

  test('rejects frozen contracts that do not declare generation and drift checks', () => {
    const registry = {
      contracts: [
        {
          ...loadContractRegistryFromDirFromString(validContractYaml).contracts[0]!,
          l2: {
            ...loadContractRegistryFromDirFromString(validContractYaml).contracts[0]!.l2,
            generationCommand: '',
          },
        },
      ],
    };

    const result = validateContractRegistry(registry, {
      requiredIds: ['feishu.carrier'],
      rootDir: process.cwd(),
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('contract.feishu.carrier.l2.generation_command');
  });

  test('rejects contracts that do not declare structured generation commands and drift checks', () => {
    const registry = loadContractRegistryFromDirFromString(
      validContractYaml
        .replace(
          '      generation_commands:\n        - cwd: .\n          command: pnpm test -- src/bot/scope.test.ts\n          mode: check\n          writes_workspace: false\n          ci_required: true\n',
          '',
        )
        .replace('      drift_checks:\n        - agent-interaction-bridge architecture check\n', ''),
    );

    const result = validateContractRegistry(registry, {
      requiredIds: ['feishu.carrier'],
      rootDir: process.cwd(),
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('contract.feishu.carrier.l2.generation_commands');
    expect(result.failures).toContain('contract.feishu.carrier.l2.drift_checks');
  });

  test('rejects contracts that do not declare L4 replay evidence and hand-edit guard', () => {
    const registry = loadContractRegistryFromDirFromString(
      validContractYaml
        .replace(
          '      replay_evidence:\n        - contract-maintained source; replay is the listed harness command.\n',
          '',
        )
        .replace('      hand_edit_guard: Change L2 contract or harness first, then let the agent update code.\n', ''),
    );

    const result = validateContractRegistry(registry, {
      requiredIds: ['feishu.carrier'],
      rootDir: process.cwd(),
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('contract.feishu.carrier.l4.replay_evidence');
    expect(result.failures).toContain('contract.feishu.carrier.l4.hand_edit_guard');
  });

  test('rejects invalid status and owner values instead of silently defaulting them', () => {
    const registry = loadContractRegistryFromDirFromString(
      validContractYaml
        .replace('status: partial', 'status: unknown')
        .replace('owner: agent', 'owner: robot'),
    );

    const result = validateContractRegistry(registry, {
      requiredIds: ['feishu.carrier'],
      rootDir: process.cwd(),
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('contract.feishu.carrier.status');
    expect(result.failures).toContain('contract.feishu.carrier.l3.owner');
  });

  test('rejects L3-L4 path drift for contract carriers, artifacts, and harness files', () => {
    const root = mkdtempSync(join(tmpdir(), 'bridge-contract-paths-'));
    const dir = join(root, 'architecture', 'contracts');
    writeContractFixtureFiles(root);
    writeFileSync(join(dir, 'feishu-carrier.yaml'), validContractYaml);
    const registry = loadContractRegistryFromDir(dir);
    registry.contracts[0]!.l4.artifacts = ['src/bot/missing-channel.ts'];

    const result = validateContractRegistry(registry, {
      requiredIds: ['feishu.carrier'],
      rootDir: root,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('contract.feishu.carrier.l4.artifacts[0].path_exists');
  });

  test('repository registry covers all required historical groups', () => {
    const registry = readContractRegistry();
    const ids = registry.contracts.map((contract) => contract.id).sort();

    expect(ids).toEqual([...REQUIRED_CONTRACT_IDS].sort());
    expect(validateContractRegistry(registry).ok).toBe(true);
  });
});

function loadContractRegistryFromDirFromString(yaml: string) {
  const root = mkdtempSync(join(tmpdir(), 'bridge-contract-inline-'));
  const dir = join(root, 'architecture', 'contracts');
  writeContractFixtureFiles(root);
  writeFileSync(join(dir, 'contract.yaml'), yaml);
  return loadContractRegistryFromDir(dir);
}

function writeContractFixtureFiles(root: string): void {
  for (const dir of [
    'architecture/contracts',
    'src/bot',
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  for (const file of [
    'AGENTS.md',
    'architecture/system-design.md',
    'architecture/contracts/feishu-carrier.yaml',
    'src/bot/channel.ts',
    'src/bot/scope.test.ts',
  ]) {
    writeFileSync(join(root, file), '');
  }
}
