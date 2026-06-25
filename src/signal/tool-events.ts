import type { AgentSignal } from './router';

export interface ToolResultSnapshot {
  id: string;
  name: string;
  input: unknown;
  output: string;
  isError: boolean;
}

const TEST_COMMAND_RE =
  /\b(?:(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:test|typecheck|build)|(?:vitest|jest|pytest|cargo\s+test|go\s+test|mix\s+test|swift\s+test))\b/i;

export function extractToolResultSignals(tool: ToolResultSnapshot): AgentSignal[] {
  if (!isShellTool(tool.name)) return [];
  const command = commandFromInput(tool.input);
  if (!command) return [];

  const signals: AgentSignal[] = [];
  if (TEST_COMMAND_RE.test(command)) {
    signals.push(testReportSignal(tool, command));
  }
  const patch = patchPreviewSignal(tool, command);
  if (patch) signals.push(patch);
  const artifact = artifactPreviewSignal(tool);
  if (artifact) signals.push(artifact);
  return signals;
}

function testReportSignal(tool: ToolResultSnapshot, command: string): AgentSignal {
  return {
    id: `tool-${tool.id}-test-report`,
    kind: 'test_report',
    title: tool.isError ? '验证失败' : '测试通过',
    summary: command,
    severity: tool.isError ? 'danger' : 'info',
    test: {
      command,
      passed: !tool.isError,
      sourceToolId: tool.id,
      outputPreview: truncate(tool.output.trim(), 1000),
    },
  };
}

function patchPreviewSignal(tool: ToolResultSnapshot, command: string): AgentSignal | undefined {
  if (!/\bgit\s+diff\b/i.test(command) && !/\bdiff\s+--git\b/.test(tool.output)) {
    return undefined;
  }
  const fileCount = countDiffFiles(tool.output);
  if (fileCount === 0) return undefined;
  return {
    id: `tool-${tool.id}-patch-preview`,
    kind: 'patch_preview',
    title: 'Patch 预览',
    summary: `检测到 ${fileCount} 个文件的 diff 输出`,
    severity: tool.isError ? 'warning' : 'info',
    patch: {
      command,
      fileCount,
      sourceToolId: tool.id,
      outputPreview: truncate(tool.output.trim(), 1000),
    },
  };
}

function artifactPreviewSignal(tool: ToolResultSnapshot): AgentSignal | undefined {
  if (tool.isError) return undefined;
  const artifactPath = findArtifactPath(tool.output);
  if (!artifactPath) return undefined;
  const representationHint = representationHintForPath(artifactPath);
  return {
    id: `tool-${tool.id}-artifact-preview`,
    kind: 'artifact_preview',
    title: '产物预览',
    summary: artifactPath,
    severity: 'info',
    artifact: {
      path: artifactPath,
      representationHint,
      sourceToolId: tool.id,
    },
  };
}

function isShellTool(name: string): boolean {
  return name === 'shell' || name === 'Bash';
}

function commandFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const command = (input as { command?: unknown }).command;
  return typeof command === 'string' && command.trim() ? command.trim() : undefined;
}

function countDiffFiles(output: string): number {
  return new Set([...output.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map((m) => m[2])).size;
}

function findArtifactPath(output: string): string | undefined {
  const match = output.match(/(?:^|\s)((?:\/|~\/)[^\s'"<>]+?\.(?:html?|png|jpe?g|webp|gif|svg|pdf|mp3|wav|m4a|mp4|mov))(?:\s|$)/i);
  return match?.[1];
}

function representationHintForPath(path: string): string {
  const lower = path.toLowerCase();
  if (/\.(?:html?)$/.test(lower)) return 'html';
  if (/\.(?:png|jpe?g|webp|gif|svg)$/.test(lower)) return 'image';
  if (/\.(?:mp3|wav|m4a)$/.test(lower)) return 'voice';
  return 'file';
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
