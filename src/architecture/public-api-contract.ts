import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface PublicApiContractInputs {
  indexSource: string;
  allowedSources: string[];
}

export interface PublicApiContractValidation {
  ok: boolean;
  actualSources: string[];
  allowedSources: string[];
  extraSources: string[];
  missingSources: string[];
  failures: string[];
}

const EXPORT_FROM_RE =
  /\bexport\s+(?:type\s+)?(?:\{[\s\S]*?\}|\*)\s+from\s+['"]([^'"]+)['"]/g;

export function extractPublicExportSources(indexSource: string): string[] {
  const sources = new Set<string>();
  for (const match of indexSource.matchAll(EXPORT_FROM_RE)) {
    const source = match[1]?.trim();
    if (source) sources.add(source);
  }
  return [...sources].sort();
}

export function validatePublicApiContract(
  inputs: PublicApiContractInputs = readPublicApiContractInputs(),
): PublicApiContractValidation {
  const actualSources = extractPublicExportSources(inputs.indexSource);
  const allowedSources = [...new Set(inputs.allowedSources)].sort();
  const extraSources = actualSources.filter((source) => !allowedSources.includes(source));
  const missingSources = allowedSources.filter((source) => !actualSources.includes(source));
  const failures: string[] = [];

  if (extraSources.length > 0) failures.push('public_api.extra_exports');
  if (missingSources.length > 0) failures.push('public_api.missing_exports');

  return {
    ok: failures.length === 0,
    actualSources,
    allowedSources,
    extraSources,
    missingSources,
    failures,
  };
}

export function readPublicApiContractInputs(rootDir = process.cwd()): PublicApiContractInputs {
  return {
    indexSource: readFileSync(join(rootDir, 'src', 'index.ts'), 'utf8'),
    allowedSources: readAllowedSources(rootDir),
  };
}

function readAllowedSources(rootDir: string): string[] {
  const raw = readFileSync(
    join(rootDir, 'architecture', 'contracts', 'core-public-api.yaml'),
    'utf8',
  );
  const parsed = parse(raw) as {
    contracts?: Array<{ id?: unknown; l2?: { public_export_sources?: unknown } }>;
  };
  const contract = parsed.contracts?.find((item) => item.id === 'core.public_api');
  const sources = contract?.l2?.public_export_sources;
  if (!Array.isArray(sources)) return [];
  return sources.filter(
    (source): source is string => typeof source === 'string' && source.trim().length > 0,
  );
}
