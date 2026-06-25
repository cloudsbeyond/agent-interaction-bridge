import type { MessageReplyMode, AppConfig } from '../config/schema';
import {
  getApprovalKeywords,
  getRequireApprovalBeforeRun,
  shouldRequireApproval,
} from '../config/schema';

export type ApprovalMode = 'auto' | 'required';

export interface RunPolicy {
  prompt: string;
  taskText: string;
  approval: ApprovalMode;
  replyMode?: MessageReplyMode;
  model?: string;
  source: 'default' | 'command' | 'model' | 'config';
}

interface Directive {
  prompt: string;
  approval?: ApprovalMode;
  replyMode?: MessageReplyMode;
  model?: string;
  source?: RunPolicy['source'];
}

const COMMANDS: Record<string, Omit<Directive, 'prompt'>> = {
  '/approve': { approval: 'required', replyMode: 'card', source: 'command' },
  '/approval': { approval: 'required', replyMode: 'card', source: 'command' },
  '/审批': { approval: 'required', replyMode: 'card', source: 'command' },
  '/run': { approval: 'auto', source: 'command' },
  '/执行': { approval: 'auto', source: 'command' },
  '/visual': { approval: 'auto', replyMode: 'card', source: 'command' },
  '/可视化': { approval: 'auto', replyMode: 'card', source: 'command' },
  '/quiet': { approval: 'auto', replyMode: 'text', source: 'command' },
  '/text': { approval: 'auto', replyMode: 'text', source: 'command' },
  '/纯文本': { approval: 'auto', replyMode: 'text', source: 'command' },
};

export function decideRunPolicy(cfg: AppConfig, rawPrompt: string): RunPolicy {
  const directive = parseDirective(cfg, rawPrompt);
  const prompt = directive.prompt.trim() || rawPrompt.trim();
  const modelNeedsApproval = directive.model ? getApprovalModels(cfg).includes(directive.model) : false;
  const approval =
    directive.approval ??
    (modelNeedsApproval || shouldRequireApproval(cfg, rawPrompt) ? 'required' : 'auto');
  const source: RunPolicy['source'] =
    directive.source ?? (modelNeedsApproval ? 'model' : getRequireApprovalBeforeRun(cfg) ? 'config' : 'default');

  return {
    prompt,
    taskText: summarizeTask(prompt),
    approval,
    replyMode: directive.replyMode,
    model: directive.model,
    source,
  };
}

export function getApprovalModels(cfg: AppConfig): string[] {
  const raw = cfg.preferences?.approvalModels;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDirective(cfg: AppConfig, input: string): Directive {
  const trimmed = input.trim();
  const [head = '', ...restParts] = trimmed.split(/\s+/);
  const rest = restParts.join(' ').trim();

  if (head === '/model' || head === '/模型') {
    const [model = '', ...promptParts] = rest.split(/\s+/);
    return {
      prompt: promptParts.join(' ').trim(),
      model: model.trim() || undefined,
      source: 'model',
    };
  }

  const direct = COMMANDS[head.toLowerCase()];
  if (direct) return { ...direct, prompt: rest };

  const keyword = getApprovalKeywords(cfg).find((kw) => trimmed.toLowerCase().startsWith(kw.toLowerCase()));
  if (keyword) {
    return {
      prompt: trimmed.slice(keyword.length).trim(),
      approval: 'required',
      replyMode: 'card',
      source: 'command',
    };
  }

  return { prompt: input };
}

function summarizeTask(prompt: string): string {
  const text = prompt.replace(/\s+/g, ' ').trim();
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
