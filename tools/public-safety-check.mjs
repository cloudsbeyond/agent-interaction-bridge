#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRIVATE_CONTEXT_DIR = ['.', 'alphaX'].join('');
const DEFAULT_LOCAL_DENYLIST = join(PRIVATE_CONTEXT_DIR, 'security', 'private-denylist.txt');

const DEFAULT_RULES = [
  {
    id: 'feishu.open_id',
    summary: 'real-looking Feishu/Lark open_id',
    pattern: /\bou_[0-9a-f]{32,}\b/g,
  },
  {
    id: 'feishu.message_id',
    summary: 'real-looking Feishu/Lark message_id',
    pattern: /\bom_[0-9a-z]{20,}\b/g,
  },
  {
    id: 'feishu.chat_id',
    summary: 'real-looking Feishu/Lark chat_id',
    pattern: /\boc_[0-9a-z]{20,}\b/g,
  },
  {
    id: 'feishu.app_id',
    summary: 'real-looking Feishu/Lark app_id',
    pattern: /\bcli_[0-9a-f]{16,}\b/g,
  },
  {
    id: 'secret.openai_api_key',
    summary: 'OpenAI-style API key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g,
    redact: true,
  },
  {
    id: 'secret.url_token',
    summary: 'long token in a URL or query string',
    pattern: /(?:\?|&|\b)(?:token|access_token|tenant_access_token|app_access_token|signature)=([A-Za-z0-9._~+/=-]{20,})/gi,
    redact: true,
  },
  {
    id: 'secret.inline_value',
    summary: 'long inline secret or access token value',
    pattern: /\b(?:app_secret|client_secret|access_token|tenant_access_token|app_access_token)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{20,}["']?/gi,
    redact: true,
  },
  {
    id: 'private.absolute_home_path',
    summary: 'absolute local user home path',
    pattern: /\/Users\/[A-Za-z0-9._-]+\/[^\s"'`)<>]*/g,
    redact: true,
  },
  {
    id: 'private.codex_session_id',
    summary: 'local Codex session id',
    pattern: /\bsessionId\s*[:=]\s*["']?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    redact: true,
  },
  {
    id: 'private.trace_date',
    summary: 'incident-style trace id with date',
    pattern: /\btrace_id\s*=\s*[A-Za-z0-9_-]*20[0-9]{6}[A-Za-z0-9_-]*\b/g,
  },
  {
    id: 'private.local_context',
    summary: 'private local context marker',
    pattern: new RegExp(escapeRegExp(PRIVATE_CONTEXT_DIR), 'g'),
    allowedPaths: new Set(['.gitignore']),
  },
];

const BINARY_EXTENSIONS = new Set([
  '.avif',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.tgz',
  '.webp',
  '.zip',
]);

const EXCLUDED_PATH_PREFIXES = [
  '.git/',
  'coverage/',
  'dist/',
  'node_modules/',
];

export function scanPublicSafetyFiles(files, options = {}) {
  const rules = options.rules ?? DEFAULT_RULES;
  const denylist = normalizeDenylist(options.denylist ?? []);
  const issues = [];

  for (const file of files) {
    const path = normalizePath(file.path);
    const content = String(file.content ?? '');
    for (const rule of rules) {
      if (rule.allowedPaths?.has(path)) continue;
      for (const match of findRegexMatches(content, rule.pattern)) {
        issues.push(issueFromMatch({ path, content, rule, match }));
      }
    }
    for (const entry of denylist) {
      for (const match of findLiteralMatches(content, entry.value)) {
        issues.push(issueFromMatch({
          path,
          content,
          rule: {
            id: 'private.denylist',
            summary: `local private denylist entry (${entry.source})`,
            redact: true,
          },
          match,
        }));
      }
    }
  }

  issues.sort((a, b) => (
    a.path.localeCompare(b.path) ||
    a.line - b.line ||
    a.column - b.column ||
    a.ruleId.localeCompare(b.ruleId)
  ));

  return {
    ok: issues.length === 0,
    issues,
  };
}

/**
 * Scan the final text files selected by npm packaging. Unlike the repository
 * scan, this intentionally includes generated `dist/` outputs.
 */
export function scanPackageSafetyFiles(files, options = {}) {
  return scanPublicSafetyFiles(files, options);
}

export function formatPublicSafetyReport(result) {
  const lines = [`Public safety check: ${result.ok ? 'PASS' : 'FAIL'}`];
  if (result.ok) return lines.join('\n');

  for (const issue of result.issues) {
    lines.push(
      `FAIL ${issue.ruleId} ${issue.path}:${issue.line}:${issue.column} - ${issue.summary}${issue.redacted ? '' : ` (${issue.match})`}`,
    );
  }
  return lines.join('\n');
}

export function collectPublicSafetyFiles(rootDir = process.cwd()) {
  const paths = collectGitVisiblePaths(rootDir);
  const files = [];
  for (const relativePath of paths) {
    if (shouldSkipPath(relativePath)) continue;
    const absolutePath = join(rootDir, relativePath);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) continue;
    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) continue;
    files.push({
      path: relativePath,
      content: buffer.toString('utf8'),
    });
  }
  return files;
}

export function readLocalDenylist(rootDir = process.cwd(), relativePath = DEFAULT_LOCAL_DENYLIST) {
  const denylistPath = join(rootDir, relativePath);
  if (!existsSync(denylistPath)) return [];
  return parseDenylist(readFileSync(denylistPath, 'utf8'), relativePath);
}

export function parseDenylist(text, source = 'inline-denylist') {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => ({
      value: line.startsWith('literal:') ? line.slice('literal:'.length).trim() : line,
      source,
    }))
    .filter((entry) => entry.value.length > 0);
}

export function runPublicSafetyCheck(rootDir = process.cwd()) {
  const result = scanPublicSafetyFiles(collectPublicSafetyFiles(rootDir), {
    denylist: readLocalDenylist(rootDir),
  });
  console.log(formatPublicSafetyReport(result));
  return result.ok ? 0 : 1;
}

export function collectPackageSafetyFiles(rootDir = process.cwd()) {
  return packageManifest(rootDir).flatMap((entry) => {
    const relativePath = normalizePath(entry.path);
    const absolutePath = join(rootDir, relativePath);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return [];
    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) return [];
    return [{ path: relativePath, content: buffer.toString('utf8') }];
  });
}

export function runPackageSafetyCheck(rootDir = process.cwd()) {
  const result = scanPackageSafetyFiles(collectPackageSafetyFiles(rootDir), {
    denylist: readLocalDenylist(rootDir),
  });
  console.log(formatPublicSafetyReport(result).replace('Public safety', 'Package safety'));
  return result.ok ? 0 : 1;
}

function collectGitVisiblePaths(rootDir) {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: rootDir },
  );
  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map(normalizePath);
}

function packageManifest(rootDir) {
  const output = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  const manifest = JSON.parse(output);
  if (!Array.isArray(manifest) || manifest.length !== 1 || !Array.isArray(manifest[0]?.files)) {
    throw new Error('npm pack did not return one package manifest');
  }
  return manifest[0].files.filter(
    (entry) => entry && typeof entry === 'object' && typeof entry.path === 'string',
  );
}

function shouldSkipPath(path) {
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot).toLowerCase() : '';
  return BINARY_EXTENSIONS.has(ext);
}

function normalizeDenylist(entries) {
  return entries
    .map((entry) => ({
      value: String(entry.value ?? '').trim(),
      source: String(entry.source ?? 'local-denylist'),
    }))
    .filter((entry) => entry.value.length > 0);
}

function findRegexMatches(content, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const matches = [];
  for (const match of content.matchAll(regex)) {
    if (match.index === undefined) continue;
    matches.push({
      index: match.index,
      text: match[0],
    });
  }
  return matches;
}

function findLiteralMatches(content, literal) {
  const matches = [];
  let start = 0;
  while (start < content.length) {
    const index = content.indexOf(literal, start);
    if (index < 0) break;
    matches.push({ index, text: literal });
    start = index + Math.max(literal.length, 1);
  }
  return matches;
}

function issueFromMatch({ path, content, rule, match }) {
  const location = locate(content, match.index);
  return {
    path,
    line: location.line,
    column: location.column,
    ruleId: rule.id,
    summary: rule.summary,
    match: match.text,
    redacted: Boolean(rule.redact),
  };
}

function locate(content, index) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return {
    line,
    column: index - lineStart + 1,
  };
}

function normalizePath(path) {
  return String(path).replaceAll('\\', '/');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = process.argv.includes('--package')
    ? runPackageSafetyCheck(process.cwd())
    : runPublicSafetyCheck(process.cwd());
}
