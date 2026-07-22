import type { Block, FooterStatus, RunState, ToolEntry } from '../card/run-state';
import { normalizeChatPresentation } from '../card/chat-presentation-contract';
import { toolBodyMd, toolHeaderText } from '../card/tool-render';
import { stripTrailingSessionIdentity } from '../presentation/session-identity';

const REASONING_MAX = 1500;
const COLLAPSE_TOOL_THRESHOLD = 3;

export type RunPresentationSection =
  | { kind: 'markdown'; body: string }
  | { kind: 'note'; body: string }
  | {
      kind: 'panel';
      title: string;
      body: string;
      expanded: boolean;
      tone: 'neutral' | 'danger';
    }
  | {
      kind: 'tool_summary';
      title: string;
      items: string[];
      expanded: boolean;
    };

export interface RunStreamPresentation {
  streaming: boolean;
  summary: string;
  sections: RunPresentationSection[];
  controls: {
    stop: boolean;
  };
}

interface ToolGroup {
  kind: 'tools';
  tools: ToolEntry[];
}

interface TextGroup {
  kind: 'text';
  content: string;
}

type Group = ToolGroup | TextGroup;

export function presentRunState(state: RunState): RunStreamPresentation {
  const sections: RunPresentationSection[] = [];

  if (state.reasoning.content) {
    sections.push(reasoningSection(state.reasoning.content, state.reasoning.active));
  }

  for (const group of groupBlocks(state.blocks)) {
    if (group.kind === 'text') {
      const body = normalizeChatPresentation(stripTrailingSessionIdentity(group.content));
      if (body) sections.push({ kind: 'markdown', body });
    } else {
      sections.push(...presentToolGroup(group.tools, state.terminal !== 'running'));
    }
  }

  const terminalNote = terminalNoteFor(state);
  if (terminalNote) sections.push({ kind: 'note', body: terminalNote });
  if (state.terminal === 'done' && sections.length === 0) {
    sections.push({ kind: 'note', body: '_（未返回内容）_' });
  }

  if (state.terminal === 'running' && state.footer) {
    sections.push({ kind: 'note', body: footerStatusText(state.footer) });
  }

  return {
    streaming: state.terminal === 'running',
    summary: summaryText(state),
    sections,
    controls: { stop: state.terminal === 'running' },
  };
}

function* groupBlocks(blocks: Block[]): Generator<Group> {
  let toolBuf: ToolEntry[] = [];
  for (const block of blocks) {
    if (block.kind === 'tool') {
      toolBuf.push(block.tool);
    } else {
      if (toolBuf.length > 0) {
        yield { kind: 'tools', tools: toolBuf };
        toolBuf = [];
      }
      yield { kind: 'text', content: block.content };
    }
  }
  if (toolBuf.length > 0) yield { kind: 'tools', tools: toolBuf };
}

function presentToolGroup(tools: ToolEntry[], finalized: boolean): RunPresentationSection[] {
  if (tools.length === 0) return [];
  if (tools.length < COLLAPSE_TOOL_THRESHOLD) {
    return tools.map((tool) => toolSection(tool, false));
  }
  if (finalized) {
    return [toolSummarySection(tools, true)];
  }

  const prior = tools.slice(0, -1);
  const latest = tools[tools.length - 1];
  const out: RunPresentationSection[] = [];
  if (prior.length > 0) out.push(toolSummarySection(prior, false));
  if (latest) out.push(toolSection(latest, true));
  return out;
}

function reasoningSection(content: string, active: boolean): RunPresentationSection {
  return {
    kind: 'panel',
    title: active ? '🧠 **思考中**' : '🧠 **思考完成，点击查看**',
    expanded: active,
    tone: 'neutral',
    body: truncate(content, REASONING_MAX),
  };
}

function toolSection(tool: ToolEntry, expanded: boolean): RunPresentationSection {
  return {
    kind: 'panel',
    title: toolHeaderText(tool),
    expanded,
    tone: tool.status === 'error' ? 'danger' : 'neutral',
    body: toolBodyMd(tool) || '_无输出_',
  };
}

function toolSummarySection(tools: ToolEntry[], finalized: boolean): RunPresentationSection {
  const suffix = finalized ? '（已结束）' : '';
  return {
    kind: 'tool_summary',
    title: `☕ **${tools.length} 个工具调用${suffix}**`,
    expanded: false,
    items: tools.map((tool) => toolHeaderText(tool)),
  };
}

function terminalNoteFor(state: RunState): string | undefined {
  if (state.terminal === 'interrupted') return '_⏹ 已被中断_';
  if (state.terminal === 'idle_timeout') {
    return `_⏱ ${state.idleTimeoutMinutes ?? 0} 分钟无响应,已自动终止_`;
  }
  if (state.terminal === 'error' && state.errorMsg) return state.errorMsg;
  return undefined;
}

function footerStatusText(status: Exclude<FooterStatus, null>): string {
  if (status === 'thinking') return '🧠 正在思考';
  if (status === 'tool_running') return '🧰 正在调用工具';
  return '✍️ 正在输出';
}

function summaryText(state: RunState): string {
  if (state.terminal === 'interrupted') return '已中断';
  if (state.terminal === 'idle_timeout') return '已超时';
  if (state.terminal === 'error') return '出错';
  if (state.terminal === 'done') return '已完成';
  if (state.footer === 'tool_running') return '正在调用工具';
  if (state.footer === 'streaming') return '正在输出';
  return '思考中';
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
