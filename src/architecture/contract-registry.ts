import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export type ArchitectureContractStatus = 'covered' | 'partial' | 'draft';
export type ArchitectureContractTier = 'routine' | 'scoped' | 'contracted' | 'critical';
export type ArchitectureContractOwner = 'human' | 'agent';
export type ArchitectureContractFreezeStatus = 'frozen' | 'draft';
export type ArchitectureContractMode = 'durable' | 'draft';
export type ArchitectureContractCommandMode = 'check' | 'generate' | 'replay';

export interface ArchitectureContractCommand {
  cwd: string;
  command: string;
  mode: ArchitectureContractCommandMode;
  writesWorkspace?: boolean;
  ciRequired?: boolean;
}

export interface ArchitectureContractLayer0 {
  owner: ArchitectureContractOwner;
  status: ArchitectureContractFreezeStatus;
  problem: string;
}

export interface ArchitectureContractLayer1 {
  owner: ArchitectureContractOwner;
  status: ArchitectureContractFreezeStatus;
  expression: string;
  paths: string[];
}

export interface ArchitectureContractLayer2 {
  owner: ArchitectureContractOwner;
  status: ArchitectureContractFreezeStatus;
  path: string;
  freezeSignal: string;
  invariants: string[];
  generationCommands: ArchitectureContractCommand[];
  generationCommand: string;
  driftChecks: string[];
  driftCheck: string;
}

export interface ArchitectureContractLayer3 {
  owner: ArchitectureContractOwner;
  mode: ArchitectureContractMode;
  carriers: string[];
  commands: string[];
}

export interface ArchitectureContractLayer4 {
  owner: ArchitectureContractOwner;
  artifacts: string[];
  aiContractIndex: string;
  harness: string[];
  replayEvidence: string[];
  handEditGuard: string;
}

export interface ArchitectureContractRecord {
  id: string;
  title: string;
  tier: ArchitectureContractTier;
  riskTags: string[];
  status: ArchitectureContractStatus;
  l0: ArchitectureContractLayer0;
  l1: ArchitectureContractLayer1;
  l2: ArchitectureContractLayer2;
  l3: ArchitectureContractLayer3;
  l4: ArchitectureContractLayer4;
  stopCondition: string;
}

export interface ArchitectureContractRegistry {
  contracts: ArchitectureContractRecord[];
}

export interface ContractRegistryValidationOptions {
  requiredIds?: readonly string[];
  rootDir?: string;
}

export interface ContractRegistryValidationResult {
  ok: boolean;
  failures: string[];
}

export const REQUIRED_CONTRACT_IDS = [
  'core.public_api',
  'feishu.carrier',
  'presentation.rendering',
  'interaction.hitl',
  'codex.endpoint',
  'runtime.data',
  'operator.commands',
  'resources.architecture',
] as const;

export function readContractRegistry(rootDir = process.cwd()): ArchitectureContractRegistry {
  return loadContractRegistryFromDir(join(rootDir, 'architecture', 'contracts'));
}

export function loadContractRegistryFromDir(dir: string): ArchitectureContractRegistry {
  const contracts: ArchitectureContractRecord[] = [];
  for (const file of contractFiles(dir)) {
    const raw = parse(readFileSync(join(dir, file), 'utf8')) as unknown;
    contracts.push(...recordsFromYaml(raw));
  }
  return { contracts };
}

export function validateContractRegistry(
  registry: ArchitectureContractRegistry,
  options: ContractRegistryValidationOptions = {},
): ContractRegistryValidationResult {
  const rootDir = options.rootDir ?? process.cwd();
  const requiredIds = options.requiredIds ?? REQUIRED_CONTRACT_IDS;
  const failures: string[] = [];
  const ids = new Set<string>();

  if (registry.contracts.length === 0) failures.push('registry.contracts_present');

  for (const requiredId of requiredIds) {
    if (!registry.contracts.some((contract) => contract.id === requiredId)) {
      failures.push(`contract.${requiredId}.present`);
    }
  }

  for (const contract of registry.contracts) {
    const prefix = `contract.${contract.id || 'unknown'}`;
    if (!contract.id) failures.push(`${prefix}.id`);
    if (ids.has(contract.id)) failures.push(`${prefix}.unique`);
    ids.add(contract.id);

    requireString(contract.title, `${prefix}.title`, failures);
    requireTier(contract.tier, `${prefix}.tier`, failures);
    requireNonEmptyArray(contract.riskTags, `${prefix}.risk_tags`, failures);
    requireStatus(contract.status, `${prefix}.status`, failures);
    requireString(contract.stopCondition, `${prefix}.stop_condition`, failures);

    validateL0(contract, prefix, failures);
    validateL1(contract, prefix, rootDir, failures);
    validateL2(contract, prefix, rootDir, failures);
    validateL3(contract, prefix, rootDir, failures);
    validateL4(contract, prefix, rootDir, failures);
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function formatContractRegistry(registry: ArchitectureContractRegistry): string {
  return registry.contracts
    .map((contract) => `${contract.status} ${contract.id} - ${contract.title}`)
    .join('\n');
}

function contractFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .sort();
}

function recordsFromYaml(raw: unknown): ArchitectureContractRecord[] {
  const root = asRecord(raw);
  const contracts = root.contracts;
  if (!Array.isArray(contracts)) return [];
  return contracts.map(normalizeContract);
}

function normalizeContract(raw: unknown): ArchitectureContractRecord {
  const contract = asRecord(raw);
  return {
    id: stringValue(contract.id),
    title: stringValue(contract.title),
    tier: tierValue(contract.tier),
    riskTags: stringArray(contract.risk_tags ?? contract.riskTags),
    status: statusValue(contract.status),
    l0: normalizeL0(contract.l0),
    l1: normalizeL1(contract.l1),
    l2: normalizeL2(contract.l2),
    l3: normalizeL3(contract.l3),
    l4: normalizeL4(contract.l4),
    stopCondition: stringValue(contract.stop_condition ?? contract.stopCondition),
  };
}

function normalizeL0(raw: unknown): ArchitectureContractLayer0 {
  const layer = asRecord(raw);
  return {
    owner: ownerValue(layer.owner),
    status: freezeStatusValue(layer.status),
    problem: stringValue(layer.problem),
  };
}

function normalizeL1(raw: unknown): ArchitectureContractLayer1 {
  const layer = asRecord(raw);
  return {
    owner: ownerValue(layer.owner),
    status: freezeStatusValue(layer.status),
    expression: stringValue(layer.expression),
    paths: stringArray(layer.paths),
  };
}

function normalizeL2(raw: unknown): ArchitectureContractLayer2 {
  const layer = asRecord(raw);
  return {
    owner: ownerValue(layer.owner),
    status: freezeStatusValue(layer.status),
    path: stringValue(layer.path),
    freezeSignal: stringValue(layer.freeze_signal ?? layer.freezeSignal),
    invariants: stringArray(layer.invariants),
    generationCommands: commandArray(layer.generation_commands ?? layer.generationCommands),
    generationCommand: stringValue(layer.generation_command ?? layer.generationCommand),
    driftChecks: stringArray(layer.drift_checks ?? layer.driftChecks),
    driftCheck: stringValue(layer.drift_check ?? layer.driftCheck),
  };
}

function normalizeL3(raw: unknown): ArchitectureContractLayer3 {
  const layer = asRecord(raw);
  return {
    owner: ownerValue(layer.owner),
    mode: modeValue(layer.mode),
    carriers: stringArray(layer.carriers),
    commands: stringArray(layer.commands),
  };
}

function normalizeL4(raw: unknown): ArchitectureContractLayer4 {
  const layer = asRecord(raw);
  return {
    owner: ownerValue(layer.owner),
    artifacts: stringArray(layer.artifacts),
    aiContractIndex: stringValue(layer.ai_contract_index ?? layer.aiContractIndex),
    harness: stringArray(layer.harness),
    replayEvidence: stringArray(layer.replay_evidence ?? layer.replayEvidence),
    handEditGuard: stringValue(layer.hand_edit_guard ?? layer.handEditGuard),
  };
}

function validateL0(
  contract: ArchitectureContractRecord,
  prefix: string,
  failures: string[],
): void {
  requireOwner(contract.l0.owner, 'human', `${prefix}.l0.owner`, failures);
  requireFreezeStatus(contract.l0.status, 'frozen', `${prefix}.l0.status`, failures);
  requireString(contract.l0.problem, `${prefix}.l0.problem`, failures);
}

function validateL1(
  contract: ArchitectureContractRecord,
  prefix: string,
  rootDir: string,
  failures: string[],
): void {
  requireOwner(contract.l1.owner, 'human', `${prefix}.l1.owner`, failures);
  requireFreezeStatus(contract.l1.status, 'frozen', `${prefix}.l1.status`, failures);
  requireString(contract.l1.expression, `${prefix}.l1.expression`, failures);
  requireNonEmptyArray(contract.l1.paths, `${prefix}.l1.paths`, failures);
  validateExistingPaths(contract.l1.paths, `${prefix}.l1.paths`, rootDir, failures);
}

function validateL2(
  contract: ArchitectureContractRecord,
  prefix: string,
  rootDir: string,
  failures: string[],
): void {
  requireOwner(contract.l2.owner, 'human', `${prefix}.l2.owner`, failures);
  requireFreezeStatus(contract.l2.status, 'frozen', `${prefix}.l2.status`, failures);
  requireString(contract.l2.path, `${prefix}.l2.path`, failures);
  requireString(contract.l2.freezeSignal, `${prefix}.l2.freeze_signal`, failures);
  requireNonEmptyArray(contract.l2.invariants, `${prefix}.l2.invariants`, failures);
  requireNonEmptyCommands(contract.l2.generationCommands, `${prefix}.l2.generation_commands`, failures);
  requireString(contract.l2.generationCommand, `${prefix}.l2.generation_command`, failures);
  requireNonEmptyArray(contract.l2.driftChecks, `${prefix}.l2.drift_checks`, failures);
  requireString(contract.l2.driftCheck, `${prefix}.l2.drift_check`, failures);
  if (contract.l2.path && !existsSync(join(rootDir, contract.l2.path))) {
    failures.push(`${prefix}.l2.path_exists`);
  }
}

function validateL3(
  contract: ArchitectureContractRecord,
  prefix: string,
  rootDir: string,
  failures: string[],
): void {
  requireOwner(contract.l3.owner, 'agent', `${prefix}.l3.owner`, failures);
  if (contract.l3.mode !== 'durable' && contract.l3.mode !== 'draft') {
    failures.push(`${prefix}.l3.mode`);
  }
  requireNonEmptyArray(contract.l3.carriers, `${prefix}.l3.carriers`, failures);
  validateExistingPaths(contract.l3.carriers, `${prefix}.l3.carriers`, rootDir, failures);
  requireNonEmptyArray(contract.l3.commands, `${prefix}.l3.commands`, failures);
}

function validateL4(
  contract: ArchitectureContractRecord,
  prefix: string,
  rootDir: string,
  failures: string[],
): void {
  requireOwner(contract.l4.owner, 'agent', `${prefix}.l4.owner`, failures);
  requireNonEmptyArray(contract.l4.artifacts, `${prefix}.l4.artifacts`, failures);
  validateExistingPaths(contract.l4.artifacts, `${prefix}.l4.artifacts`, rootDir, failures);
  requireString(contract.l4.aiContractIndex, `${prefix}.l4.ai_contract_index`, failures);
  if (contract.l4.aiContractIndex !== 'agent-devops/ai-contract-index.md') {
    failures.push(`${prefix}.l4.ai_contract_index_value`);
  }
  requireNonEmptyArray(contract.l4.harness, `${prefix}.l4.harness`, failures);
  validateExistingPaths(contract.l4.harness, `${prefix}.l4.harness`, rootDir, failures);
  requireNonEmptyArray(contract.l4.replayEvidence, `${prefix}.l4.replay_evidence`, failures);
  requireString(contract.l4.handEditGuard, `${prefix}.l4.hand_edit_guard`, failures);
}

function requireString(value: string, id: string, failures: string[]): void {
  if (!value.trim()) failures.push(id);
}

function requireNonEmptyArray(value: string[], id: string, failures: string[]): void {
  if (value.length === 0 || value.some((item) => !item.trim())) failures.push(id);
}

function requireNonEmptyCommands(
  value: ArchitectureContractCommand[] | undefined,
  id: string,
  failures: string[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    failures.push(id);
    return;
  }
  value.forEach((command, index) => {
    const prefix = `${id}[${index}]`;
    requireString(command.cwd, `${prefix}.cwd`, failures);
    requireString(command.command, `${prefix}.command`, failures);
    if (
      command.mode !== 'check' &&
      command.mode !== 'generate' &&
      command.mode !== 'replay'
    ) {
      failures.push(`${prefix}.mode`);
    }
    if (typeof command.writesWorkspace !== 'boolean') failures.push(`${prefix}.writes_workspace`);
    if (typeof command.ciRequired !== 'boolean') failures.push(`${prefix}.ci_required`);
  });
}

function validateExistingPaths(
  values: string[],
  prefix: string,
  rootDir: string,
  failures: string[],
): void {
  values.forEach((value, index) => {
    if (!looksLikePath(value)) return;
    if (!existsSync(join(rootDir, value))) failures.push(`${prefix}[${index}].path_exists`);
  });
}

function looksLikePath(value: string): boolean {
  if (!value || value.includes('*') || /\s/.test(value)) return false;
  return /^(AGENTS\.md|README\.md|NOTICE|LICENSE|package\.json|config\.example\.json|architecture\/|agent-devops\/|src\/|bin\/|dist\/)/.test(value);
}

function requireStatus(
  value: ArchitectureContractStatus,
  id: string,
  failures: string[],
): void {
  if (value !== 'covered' && value !== 'partial' && value !== 'draft') failures.push(id);
}

function requireTier(
  value: ArchitectureContractTier,
  id: string,
  failures: string[],
): void {
  if (
    value !== 'routine' &&
    value !== 'scoped' &&
    value !== 'contracted' &&
    value !== 'critical'
  ) {
    failures.push(id);
  }
}

function requireOwner(
  value: ArchitectureContractOwner,
  expected: ArchitectureContractOwner,
  id: string,
  failures: string[],
): void {
  if (value !== expected) failures.push(id);
}

function requireFreezeStatus(
  value: ArchitectureContractFreezeStatus,
  expected: ArchitectureContractFreezeStatus,
  id: string,
  failures: string[],
): void {
  if (value !== expected) failures.push(id);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function commandArray(value: unknown): ArchitectureContractCommand[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const command = asRecord(item);
    return {
      cwd: stringValue(command.cwd),
      command: stringValue(command.command),
      mode: stringValue(command.mode) as ArchitectureContractCommandMode,
      writesWorkspace: booleanValue(command.writes_workspace ?? command.writesWorkspace),
      ciRequired: booleanValue(command.ci_required ?? command.ciRequired),
    };
  });
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function statusValue(value: unknown): ArchitectureContractStatus {
  return stringValue(value) as ArchitectureContractStatus;
}

function tierValue(value: unknown): ArchitectureContractTier {
  return stringValue(value) as ArchitectureContractTier;
}

function ownerValue(value: unknown): ArchitectureContractOwner {
  return stringValue(value) as ArchitectureContractOwner;
}

function freezeStatusValue(value: unknown): ArchitectureContractFreezeStatus {
  return stringValue(value) as ArchitectureContractFreezeStatus;
}

function modeValue(value: unknown): ArchitectureContractMode {
  return stringValue(value) as ArchitectureContractMode;
}
