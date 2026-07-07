import { describe, expect, test } from 'vitest';
import {
  checkArchitectureContracts,
  formatArchitectureCheck,
  readArchitectureContractInputs,
  type ArchitectureContractInputs,
} from './contract-check';
import { REQUIRED_CONTRACT_IDS } from './contract-registry';

const validInputs: ArchitectureContractInputs = {
  agents: [
    '## Freeze Layer',
    'AGENTS.md routes agents.',
    'README.md is product entry.',
    'PRD.md is formal product projection.',
    'architecture/README.md is architecture entry.',
    'agent-devops/README.md is devops entry.',
  ].join('\n'),
  readme: [
    'human-facing product narrative',
    'PRD.md',
    'architecture/system-design.md',
    'agent-devops/',
    '## Gateway Modes',
    '### Relay Flow',
    '```mermaid',
    'flowchart LR',
    '```',
    '### Adapter Flow',
    '```mermaid',
    'flowchart LR',
    '```',
  ].join('\n'),
  prd: [
    '## P0 Scope',
    '## Downstream Chain',
    'README.md / PRD.md',
    '## Owner Boundary',
  ].join('\n'),
  architectureReadme: [
    'product and system architecture',
    '../PRD.md',
    'must not redefine product intent',
    'agent-devops/',
  ].join('\n'),
  agentDevopsReadme: [
    'not included in the npm package',
    'product narrative, PRD',
    'does not own product L0 intent',
    'Part 1 runtime code',
    'product harness commands',
  ].join('\n'),
  systemDesign: [
    '## Gateway Modes',
    '### Relay Mode',
    '### Relay Flow',
    '```mermaid',
    'sequenceDiagram',
    '```',
    '### Adapter Mode',
    '### Adapter Flow',
    '```mermaid',
    'sequenceDiagram',
    '```',
    '## Layered Object Flow',
    '### Planning Layer',
    '### Execution Layer',
  ].join('\n'),
  aiContractIndex: [
    '| L1/L2 Contract | L4 Artifact | Responsibility | Status | Harness Evidence |',
    '| --- | --- | --- | --- | --- |',
    '| `architecture/system-design.md` | `src/runtime/interaction-runtime.ts` | runtime plan | `src/runtime/interaction-runtime.test.ts` |',
    '| `architecture/system-design.md` | `src/agent/profile-policy.ts` | profile run policy | `src/agent/profile-policy.test.ts` |',
    '| `architecture/system-design.md` | `src/runtime-services/port.ts`, `src/runtime-services/selector.ts`, `src/runtime-services/rpc-client.ts`, `src/runtime-services/mcp-client.ts`, `src/runtime-services/policy.ts` | runtime services port and adapters | `src/runtime-services/selector.test.ts`, `src/runtime-services/policy.test.ts` |',
    '| `architecture/system-design.md` | `src/signal/delivery-support.ts` | support | `src/signal/delivery-support.test.ts` |',
    '| `architecture/README.md` | `package.json` `files` | package docs | `npm pack --dry-run` |',
    '| `architecture/contracts/core-public-api.yaml` | `src/index.ts` | public exports | partial | `pnpm build` |',
    '| `architecture/contracts/core-public-api.yaml` | `src/architecture/public-api-contract.ts` | public api | covered | `src/architecture/public-api-contract.test.ts` |',
    ...REQUIRED_CONTRACT_IDS.map((id) => `| \`architecture/contracts/${id}.yaml\` | \`${id}\` | registry | partial | \`agent-interaction-bridge architecture check\` |`),
  ].join('\n'),
  gitignore: [
    'node_modules/',
    'dist/',
    'coverage/',
  ].join('\n'),
  nonCodeProjectTexts: [
    'README.md product positioning architecture/system-design.md agent-devops/',
    'architecture/README.md product and system architecture agent-devops/',
    'agent-devops/README.md not included in the npm package Part 1 runtime code product harness commands',
    'agent-devops/ai-contract-index.md Agent DevOps',
    'preferences.gatewayMode relay adapter',
    'package description bounded interaction bridge',
  ],
  contractRegistry: {
    contracts: REQUIRED_CONTRACT_IDS.map((id) => ({
      id,
      title: id,
      tier: 'contracted' as const,
      riskTags: ['schema'],
      status: 'partial' as const,
      l0: { owner: 'human' as const, status: 'frozen' as const, problem: `problem ${id}` },
      l1: {
        owner: 'human' as const,
        status: 'frozen' as const,
        expression: `expression ${id}`,
        paths: ['architecture/system-design.md'],
      },
      l2: {
        owner: 'human' as const,
        status: 'frozen' as const,
        path: 'architecture/contracts/resources-architecture.yaml',
        freezeSignal: 'Default freeze confirmed by human owner on 2026-05-27.',
        invariants: [`invariant ${id}`],
        generationCommands: [
          {
            cwd: '.',
            command: 'pnpm test',
            mode: 'check' as const,
            writesWorkspace: false,
            ciRequired: true,
          },
        ],
        generationCommand: 'pnpm test',
        driftChecks: ['agent-interaction-bridge architecture check'],
        driftCheck: 'agent-interaction-bridge architecture check',
      },
      l3: {
        owner: 'agent' as const,
        mode: 'durable' as const,
        carriers: ['AGENTS.md'],
        commands: [
          'pnpm test',
          'pnpm typecheck',
          'pnpm build',
          'npm pack --dry-run',
          'agent-interaction-bridge resources',
          'agent-interaction-bridge architecture check',
          'agent-interaction-bridge architecture contracts',
        ],
      },
      l4: {
        owner: 'agent' as const,
        artifacts: ['src/index.ts'],
        aiContractIndex: 'agent-devops/ai-contract-index.md',
        harness: ['pnpm test'],
        replayEvidence: ['contract-maintained source; replay is pnpm test'],
        handEditGuard: 'Change L2 contract or harness first, then let the agent update code.',
      },
      stopCondition: `stop ${id}`,
    })),
  },
  packageJson: {
    description: 'Local-first bounded interaction bridge for human surfaces and execution agents',
    files: ['dist', 'bin', 'architecture', 'PRD.md', 'README.md'],
    scripts: {
      prepublishOnly: 'pnpm public-safety-check && pnpm test && pnpm typecheck && pnpm build && npm pack --dry-run --ignore-scripts',
    },
  },
  publicApi: {
    indexSource: "export { renderText } from './card/text-renderer';",
    allowedSources: ['./card/text-renderer'],
  },
};

describe('architecture contract check', () => {
  test('accepts a frozen durable architecture contract with an index and harness evidence', () => {
    const result = checkArchitectureContracts(validInputs);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.checks.map((check) => check.id)).toContain('registry.l0_l2_frozen');
  });

  test('rejects durable implementation without registry AI Contract Index links', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      contractRegistry: {
        contracts: validInputs.contractRegistry.contracts.map((contract) => ({
          ...contract,
          l4: { ...contract.l4, aiContractIndex: '' },
        })),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('registry.ai_contract_index');
  });

  test('rejects package configs that drop the architecture contract directory', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      packageJson: { files: ['dist', 'bin', 'README.md'] },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('package.architecture_included');
  });

  test('rejects package configs that publish repo-local agent devops files', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      packageJson: { files: ['dist', 'bin', 'architecture', 'agent-devops', 'AGENTS.md'] },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('package.agent_devops_excluded');
    expect(result.failures).toContain('package.agents_excluded');
  });

  test('rejects package configs that omit the root PRD', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      packageJson: { files: ['dist', 'bin', 'architecture', 'README.md'] },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('package.prd_included');
  });

  test('rejects durable implementation without required registry contracts', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      contractRegistry: { contracts: [] },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('registry.contracts_valid');
  });

  test('rejects public API exports that are not listed in the frozen contract', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      publicApi: {
        indexSource: "export { internal } from './provider/internal';",
        allowedSources: ['./card/text-renderer'],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('public_api.exports_match_contract');
  });

  test('rejects gateway mode docs without separate relay and adapter diagrams', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      readme: [
        '## Gateway Modes',
        'relay and adapter are described together without separate flows',
      ].join('\n'),
      systemDesign: [
        '## Gateway Modes',
        'relay and adapter are described together without separate flows',
      ].join('\n'),
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.gateway_mode_flows');
  });

  test('rejects first-layer docs that do not declare the frozen role split', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      agents: 'missing freeze layer',
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.freeze_layer_roles');
  });

  test('rejects first-layer docs that omit the root PRD chain', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      prd: validInputs.prd.replace('README.md / PRD.md', 'architecture-only chain'),
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.freeze_layer_roles');
  });

  test('rejects nested subgraphs in first-layer docs', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      readme: `${validInputs.readme}\nsubgraph runtime`,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.freeze_layer_diagrams_simple');
  });

  test('rejects project docs that expose invisible local context', () => {
    const privateMarker = String.fromCharCode(46, 97, 108, 112, 104, 97, 88);
    const result = checkArchitectureContracts({
      ...validInputs,
      nonCodeProjectTexts: [...validInputs.nonCodeProjectTexts, `${privateMarker}/project-context.md`],
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.no_private_local_context_mentions');
  });

  test('rejects non-code docs that reference pre-split governance paths', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      nonCodeProjectTexts: [
        ...validInputs.nonCodeProjectTexts,
        'see architecture/ai-contract-index.md',
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.no_legacy_devops_paths');
  });

  test('rejects non-code docs that use legacy gateway mode names', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      nonCodeProjectTexts: [
        ...validInputs.nonCodeProjectTexts,
        'preferences.interactionMode transparent_proxy',
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.no_legacy_gateway_mode_names');
  });

  test('rejects non-code docs that use the old build-time label', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      nonCodeProjectTexts: [
        ...validInputs.nonCodeProjectTexts,
        'Build-Time Governance',
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.no_legacy_build_time_label');
  });

  test('rejects non-code docs that leak source-side method context into product assets', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      nonCodeProjectTexts: [
        ...validInputs.nonCodeProjectTexts,
        'target runtime external method is required before contributors can use this package',
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.no_source_method_leakage');
  });

  test('rejects product L1 contracts that point to agent devops docs', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      contractRegistry: {
        contracts: [
          {
            ...validInputs.contractRegistry.contracts[0]!,
            l1: {
              ...validInputs.contractRegistry.contracts[0]!.l1,
              paths: ['agent-devops/sops/example.md'],
            },
          },
          ...validInputs.contractRegistry.contracts.slice(1),
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('registry.l1_paths_product_only');
  });

  test('rejects package descriptions that drift from product positioning', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      packageJson: {
        ...validInputs.packageJson,
        description: 'Human-agent gateway',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('package.description_product_boundary');
  });

  test('rejects publish gates that omit package dry-run evidence', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      packageJson: {
        ...validInputs.packageJson,
        scripts: {
          prepublishOnly: 'pnpm public-safety-check && pnpm test && pnpm typecheck && pnpm build',
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('package.prepublish_runs_package_dry_run');
  });

  test('rejects wide left-to-right topology charts in system design', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      systemDesign: `${validInputs.systemDesign}\nflowchart LR\n  a --> b`,
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.system_design_no_wide_flowcharts');
  });

  test('rejects over-fragmented numbered object-flow layers in system design', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      systemDesign: validInputs.systemDesign.replace('### Planning Layer', '### Layer 1: Turn Understanding'),
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('docs.system_design_object_flow_compact');
  });

  test('rejects L4 artifacts that are not linked from the AI Contract Index', () => {
    const result = checkArchitectureContracts({
      ...validInputs,
      contractRegistry: {
        contracts: [
          {
            ...validInputs.contractRegistry.contracts[0]!,
            l4: {
              ...validInputs.contractRegistry.contracts[0]!.l4,
              artifacts: ['src/not-indexed.ts'],
            },
          },
          ...validInputs.contractRegistry.contracts.slice(1),
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain('index.l4_artifacts_linked');
  });

  test('formats actionable CLI output', () => {
    const output = formatArchitectureCheck(checkArchitectureContracts(validInputs));

    expect(output).toContain('Architecture contract check: PASS');
    expect(output).toContain('registry.l0_l2_frozen');
    expect(output).toContain('docs.freeze_layer_roles');
    expect(output).toContain('docs.no_private_local_context_mentions');
    expect(output).toContain('docs.no_legacy_devops_paths');
    expect(output).toContain('registry.l1_paths_product_only');
    expect(output).toContain('docs.system_design_no_wide_flowcharts');
    expect(output).toContain('docs.system_design_object_flow_compact');
    expect(output).toContain('package.architecture_included');
    expect(output).toContain('package.prd_included');
    expect(output).toContain('package.agent_devops_excluded');
    expect(output).toContain('package.prepublish_runs_package_dry_run');
  });

  test('accepts the repository architecture contracts', () => {
    const result = checkArchitectureContracts(readArchitectureContractInputs());
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
