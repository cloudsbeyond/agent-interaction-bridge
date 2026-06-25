import {
  formatContractRegistry,
  readContractRegistry,
  type ArchitectureContractRegistry,
} from '../../architecture/contract-registry';

export function formatArchitectureContracts(registry: ArchitectureContractRegistry): string {
  const lines = ['Architecture contracts'];
  const formatted = formatContractRegistry(registry);
  if (formatted) {
    lines.push(formatted);
  } else {
    lines.push('(none)');
  }
  for (const contract of registry.contracts) {
    lines.push(
      `- ${contract.id} tier: ${contract.tier}; risk: ${contract.riskTags.join(', ')}; L0-L2: ${contract.l0.status}/${contract.l1.status}/${contract.l2.status}; L3/L4: ${contract.l3.mode}; harness: ${contract.l4.harness.length}`,
    );
  }
  return lines.join('\n');
}

export function runArchitectureContractsCli(rootDir = process.cwd()): void {
  console.log(formatArchitectureContracts(readContractRegistry(rootDir)));
}
