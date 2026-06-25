import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  readContractRegistry,
  validateContractRegistry,
  type ArchitectureContractRegistry,
} from './contract-registry';
import {
  readPublicApiContractInputs,
  validatePublicApiContract,
  type PublicApiContractInputs,
} from './public-api-contract';

export interface ArchitectureContractInputs {
  agents: string;
  readme: string;
  architectureReadme: string;
  agentDevopsReadme: string;
  systemDesign: string;
  aiContractIndex: string;
  gitignore: string;
  nonCodeProjectTexts: string[];
  contractRegistry: ArchitectureContractRegistry;
  packageJson: {
    files?: unknown;
    description?: unknown;
  };
  publicApi: PublicApiContractInputs;
}

const AI_CONTRACT_INDEX_PATH = 'agent-devops/ai-contract-index.md';
const SKIPPED_NON_CODE_DIRS = new Set([
  '.git',
  invisibleLocalContextDirName(),
  'node_modules',
  'dist',
  'coverage',
]);
const TEXT_NON_CODE_EXTENSIONS = new Set(['', '.json', '.md', '.txt', '.yaml', '.yml']);
const LEGACY_DEVOPS_PATH_RE =
  /\barchitecture\/(?:ai-contract-index|requirements-to-code-chain|sops)(?:[/.]|\b)/;
const LEGACY_GATEWAY_MODE_RE = /\b(?:transparent_proxy|human_agent_adapter|interactionMode)\b/;

export interface ArchitectureContractCheck {
  id: string;
  passed: boolean;
  summary: string;
}

export interface ArchitectureContractCheckResult {
  ok: boolean;
  checks: ArchitectureContractCheck[];
  failures: string[];
}

const REQUIRED_HARNESS_COMMANDS = [
  'pnpm test',
  'pnpm typecheck',
  'pnpm build',
  'npm pack --dry-run',
  'agent-interaction-bridge resources',
  'agent-interaction-bridge architecture check',
  'agent-interaction-bridge architecture contracts',
];

const REQUIRED_INDEX_ARTIFACTS = [
  'src/runtime/interaction-runtime.ts',
  'src/agent/profile-policy.ts',
  'src/runtime-services/port.ts',
  'src/runtime-services/selector.ts',
  'src/runtime-services/rpc-client.ts',
  'src/runtime-services/mcp-client.ts',
  'src/runtime-services/policy.ts',
  'src/signal/delivery-support.ts',
  'src/architecture/public-api-contract.ts',
  'package.json',
];

export function checkArchitectureContracts(
  inputs: ArchitectureContractInputs,
): ArchitectureContractCheckResult {
  const registryValidation = validateContractRegistry(inputs.contractRegistry);
  const publicApiValidation = validatePublicApiContract(inputs.publicApi);
  const unlinkedArtifacts = l4ArtifactsWithoutIndexLinks(inputs);
  const checks: ArchitectureContractCheck[] = [
    check(
      'registry.l0_l2_frozen',
      inputs.contractRegistry.contracts.every(
        (contract) =>
          contract.l0.status === 'frozen' &&
          contract.l1.status === 'frozen' &&
          contract.l2.status === 'frozen',
      ),
      'registry declares L0-L2 frozen for every contract',
    ),
    check(
      'registry.durable',
      inputs.contractRegistry.contracts.every((contract) => contract.l3.mode === 'durable'),
      'registry declares durable L3-L4 mode for every contract',
    ),
    check(
      'registry.freeze_signal',
      inputs.contractRegistry.contracts.every((contract) => contract.l2.freezeSignal.trim()),
      'registry records L2 freeze signals',
    ),
    check(
      'registry.ai_contract_index',
      inputs.contractRegistry.contracts.every(
        (contract) => contract.l4.aiContractIndex === AI_CONTRACT_INDEX_PATH,
      ),
      `registry points L4 artifacts to ${AI_CONTRACT_INDEX_PATH}`,
    ),
    check(
      'index.has_artifact_links',
      REQUIRED_INDEX_ARTIFACTS.every((artifact) => inputs.aiContractIndex.includes(artifact)),
      'AI Contract Index links required L4 artifacts',
    ),
    check(
      'index.has_harness_evidence',
      REQUIRED_HARNESS_COMMANDS.some((command) => inputs.aiContractIndex.includes(command)) &&
        inputs.aiContractIndex.includes('Harness Evidence'),
      'AI Contract Index records harness evidence',
    ),
    check(
      'registry.contracts_valid',
      registryValidation.ok,
      registryValidation.ok
        ? 'contract registry validates all required L0-L4 records'
        : `contract registry failures: ${registryValidation.failures.slice(0, 5).join(', ')}`,
    ),
    check(
      'public_api.exports_match_contract',
      publicApiValidation.ok,
      publicApiValidation.ok
        ? 'public API exports match core public API contract'
        : `public API drift: extra ${publicApiValidation.extraSources.join(', ') || '(none)'}; missing ${publicApiValidation.missingSources.join(', ') || '(none)'}`,
    ),
    check(
      'index.has_contract_registry_links',
      inputs.contractRegistry.contracts.every((contract) =>
        inputs.aiContractIndex.includes(contract.id),
      ),
      'AI Contract Index links registry contract IDs',
    ),
    check(
      'index.l4_artifacts_linked',
      unlinkedArtifacts.length === 0,
      unlinkedArtifacts.length === 0
        ? 'AI Contract Index links registry L4 artifacts'
        : `missing AI Contract Index links: ${unlinkedArtifacts.slice(0, 5).join(', ')}`,
    ),
    check(
      'registry.harness_commands',
      REQUIRED_HARNESS_COMMANDS.every((command) => registryText(inputs).includes(command)),
      'registry records required harness commands',
    ),
    check(
      'docs.gateway_mode_flows',
      hasGatewayModeFlows(inputs.readme) && hasGatewayModeFlows(inputs.systemDesign),
      'README and system design document separate relay and adapter diagrams/flows',
    ),
    check(
      'docs.freeze_layer_roles',
      hasFreezeLayerRoles(inputs),
      'first-layer docs keep AGENTS, README, architecture, and agent-devops responsibilities explicit',
    ),
    check(
      'docs.freeze_layer_diagrams_simple',
      freezeLayerDocs(inputs).every((text) => !hasMermaidSubgraph(text)),
      'first-layer docs avoid nested diagram subgraphs',
    ),
    check(
      'docs.no_private_local_context_mentions',
      inputs.nonCodeProjectTexts.every((text) => !hasInvisibleLocalContextMention(text)),
      'project docs do not mention invisible local context data',
    ),
    check(
      'docs.no_legacy_devops_paths',
      inputs.nonCodeProjectTexts.every((text) => !LEGACY_DEVOPS_PATH_RE.test(text)),
      'non-code docs do not reference pre-split architecture governance paths',
    ),
    check(
      'docs.no_legacy_gateway_mode_names',
      inputs.nonCodeProjectTexts.every((text) => !LEGACY_GATEWAY_MODE_RE.test(text)),
      'non-code docs use relay/adapter gateway mode naming',
    ),
    check(
      'docs.no_legacy_build_time_label',
      inputs.nonCodeProjectTexts.every((text) => !text.includes('Build-Time Governance')),
      'non-code docs use Agent DevOps terminology instead of old build-time label',
    ),
    check(
      'registry.l1_paths_product_only',
      inputs.contractRegistry.contracts.every((contract) =>
        contract.l1.paths.every((path) => !path.startsWith('agent-devops/')),
      ),
      'product contract L1 paths point to product architecture sources only',
    ),
    check(
      'docs.system_design_no_wide_flowcharts',
      !/^\s*flowchart\s+LR\b/m.test(inputs.systemDesign),
      'system design diagrams avoid wide left-to-right topology charts',
    ),
    check(
      'docs.system_design_object_flow_compact',
      hasCompactObjectFlow(inputs.systemDesign),
      'system design object flow uses compact planning and execution layers',
    ),
    check(
      'package.architecture_included',
      Array.isArray(inputs.packageJson.files) &&
        inputs.packageJson.files.includes('architecture'),
      'package files include architecture/',
    ),
    check(
      'package.agent_devops_excluded',
      Array.isArray(inputs.packageJson.files) &&
        !inputs.packageJson.files.includes('agent-devops'),
      'package files exclude agent-devops/',
    ),
    check(
      'package.agents_excluded',
      Array.isArray(inputs.packageJson.files) &&
        !inputs.packageJson.files.includes('AGENTS.md'),
      'package files exclude AGENTS.md',
    ),
    check(
      'package.description_product_boundary',
      typeof inputs.packageJson.description === 'string' &&
        inputs.packageJson.description.includes('bounded interaction bridge') &&
        !inputs.packageJson.description.includes('gateway'),
      'package description follows frozen product positioning',
    ),
  ];
  const failures = checks.filter((item) => !item.passed).map((item) => item.id);
  return {
    ok: failures.length === 0,
    checks,
    failures,
  };
}

export function readArchitectureContractInputs(rootDir = process.cwd()): ArchitectureContractInputs {
  return {
    agents: readFileSync(join(rootDir, 'AGENTS.md'), 'utf8'),
    readme: readFileSync(join(rootDir, 'README.md'), 'utf8'),
    architectureReadme: readFileSync(join(rootDir, 'architecture', 'README.md'), 'utf8'),
    agentDevopsReadme: readFileSync(join(rootDir, 'agent-devops', 'README.md'), 'utf8'),
    systemDesign: readFileSync(join(rootDir, 'architecture', 'system-design.md'), 'utf8'),
    aiContractIndex: readFileSync(join(rootDir, AI_CONTRACT_INDEX_PATH), 'utf8'),
    gitignore: readFileSync(join(rootDir, '.gitignore'), 'utf8'),
    nonCodeProjectTexts: readNonCodeProjectTexts(rootDir),
    contractRegistry: readContractRegistry(rootDir),
    packageJson: JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
      files?: unknown;
      description?: unknown;
    },
    publicApi: readPublicApiContractInputs(rootDir),
  };
}

export function formatArchitectureCheck(result: ArchitectureContractCheckResult): string {
  const lines = [`Architecture contract check: ${result.ok ? 'PASS' : 'FAIL'}`];
  for (const item of result.checks) {
    lines.push(`${item.passed ? 'PASS' : 'FAIL'} ${item.id} - ${item.summary}`);
  }
  if (!result.ok) {
    lines.push(`Failures: ${result.failures.join(', ')}`);
  }
  return lines.join('\n');
}

export function runArchitectureCheckCli(rootDir = process.cwd()): void {
  const result = checkArchitectureContracts(readArchitectureContractInputs(rootDir));
  console.log(formatArchitectureCheck(result));
  if (!result.ok) process.exitCode = 1;
}

function check(id: string, passed: boolean, summary: string): ArchitectureContractCheck {
  return { id, passed, summary };
}

function l4ArtifactsWithoutIndexLinks(inputs: ArchitectureContractInputs): string[] {
  const artifacts = inputs.contractRegistry.contracts.flatMap((contract) => contract.l4.artifacts);
  return [...new Set(artifacts)].filter(
    (artifact) => !artifactIsIndexed(inputs.aiContractIndex, artifact),
  );
}

function artifactIsIndexed(indexText: string, artifact: string): boolean {
  if (indexText.includes(artifact)) return true;
  const parts = artifact.replace(/\/$/, '').split('/');
  for (let length = parts.length - 1; length > 0; length -= 1) {
    const prefix = parts.slice(0, length).join('/');
    if (indexText.includes(`${prefix}/*`) || indexText.includes(`${prefix}/**`)) {
      return true;
    }
  }
  return false;
}

function registryText(inputs: ArchitectureContractInputs): string {
  return inputs.contractRegistry.contracts
    .flatMap((contract) => [
      contract.l2.generationCommand,
      contract.l2.driftCheck,
      ...contract.l2.generationCommands.map((command) => command.command),
      ...contract.l2.driftChecks,
      ...contract.l3.commands,
      ...contract.l4.harness,
      ...contract.l4.replayEvidence,
    ])
    .join('\n');
}

function hasGatewayModeFlows(text: string): boolean {
  return (
    [
      '## Gateway Modes',
      'Relay Flow',
      'Adapter Flow',
      '```mermaid',
    ].every((marker) => text.includes(marker)) &&
    (text.includes('flowchart') || text.includes('sequenceDiagram'))
  );
}

function hasFreezeLayerRoles(inputs: ArchitectureContractInputs): boolean {
  return (
    inputs.agents.includes('## Freeze Layer') &&
    inputs.agents.includes('README.md') &&
    inputs.agents.includes('architecture/README.md') &&
    inputs.agents.includes('agent-devops/README.md') &&
    inputs.readme.includes('product positioning') &&
    inputs.readme.includes('architecture/system-design.md') &&
    inputs.readme.includes('agent-devops/') &&
    inputs.architectureReadme.includes('product and system architecture') &&
    inputs.architectureReadme.includes('agent-devops/') &&
    inputs.agentDevopsReadme.includes('not included in the npm package') &&
    inputs.agentDevopsReadme.includes('Part 1 runtime code') &&
    inputs.agentDevopsReadme.includes('product harness commands')
  );
}

function freezeLayerDocs(inputs: ArchitectureContractInputs): string[] {
  return [
    inputs.agents,
    inputs.readme,
    inputs.architectureReadme,
    inputs.agentDevopsReadme,
  ];
}

function hasMermaidSubgraph(text: string): boolean {
  return /^\s*subgraph\b/m.test(text);
}

function hasInvisibleLocalContextMention(text: string): boolean {
  const privateMarker = invisibleLocalContextName();
  const privateDirMarker = invisibleLocalContextDirName();
  return [privateDirMarker, privateMarker].some((marker) =>
    text.toLowerCase().includes(marker.toLowerCase()),
  );
}

function invisibleLocalContextName(): string {
  return String.fromCharCode(97, 108, 112, 104, 97, 88);
}

function invisibleLocalContextDirName(): string {
  return `.${invisibleLocalContextName()}`;
}

function readNonCodeProjectTexts(rootDir: string, dir = rootDir): string[] {
  const texts: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_NON_CODE_DIRS.has(entry)) continue;
    if (dir === rootDir && entry === '.gitignore') continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      texts.push(...readNonCodeProjectTexts(rootDir, path));
      continue;
    }
    if (!stat.isFile()) continue;
    if (!TEXT_NON_CODE_EXTENSIONS.has(extname(entry))) continue;
    texts.push(readFileSync(path, 'utf8'));
  }
  return texts;
}

function hasCompactObjectFlow(text: string): boolean {
  return (
    text.includes('## Layered Object Flow') &&
    text.includes('### Planning Layer') &&
    text.includes('### Execution Layer') &&
    !/### Layer \d+:/m.test(text)
  );
}
