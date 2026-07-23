import { helpCommandLines } from '../commands/registry';
import {
  displayHomeRelativePath,
  escapeInlineCode,
  escapeLarkMarkdown,
  truncateText,
} from './card-text';

interface ButtonSpec {
  text: string;
  value: Record<string, unknown>;
  style?: 'primary' | 'danger' | 'default';
}

function button(spec: ButtonSpec): object {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: spec.text },
    type: spec.style ?? 'default',
    value: spec.value,
  };
}

function divMd(content: string): object {
  return { tag: 'div', text: { tag: 'lark_md', content } };
}

function actions(buttons: ButtonSpec[]): object {
  return { tag: 'action', actions: buttons.map(button) };
}

const HR: object = { tag: 'hr' };

function shell(title: string, elements: object[]): object {
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: { title: { tag: 'plain_text', content: title } },
    elements,
  };
}

export function workspacesCard(current: string | undefined, named: Record<string, string>): object {
  const entries = Object.entries(named);
  const elements: object[] = [];

  elements.push(divMd(`当前 cwd：\`${escapeInlineCode(displayHomeRelativePath(current ?? '(未设置，使用 $HOME)'))}\``));

  if (entries.length === 0) {
    elements.push(HR);
    elements.push(divMd('暂无命名工作空间。'));
    elements.push(
      divMd('💡 发送 `/ws save <name>` 把当前 cwd 存为命名工作空间'),
    );
  } else {
    elements.push(HR);
    entries.forEach(([name, path], i) => {
      const marker = path === current ? '  ← 当前' : '';
      elements.push(divMd(`**${escapeLarkMarkdown(name)}** → \`${escapeInlineCode(displayHomeRelativePath(path))}\`${marker}`));
      elements.push(
        actions([
          { text: '切换到此处', value: { cmd: 'ws.use', name }, style: 'primary' },
          { text: '删除', value: { cmd: 'ws.remove', name }, style: 'danger' },
        ]),
      );
      if (i < entries.length - 1) elements.push(HR);
    });
  }

  return shell('📂 工作空间', elements);
}

export interface StatusInfo {
  cwd: string;
  sessionId?: string;
  sessionStale: boolean;
  agentName: string;
  /** Session scope (= chatId or chatId:threadId in topic groups). */
  scope: string;
  /** Chat mode — used to label scope. */
  chatMode: 'p2p' | 'group' | 'topic';
  task?: {
    state: string;
    task: string;
    cwd: string;
    pid?: number;
    elapsedMs: number;
    recentOutput: string;
  };
  signals?: {
    pendingDecisions: number;
    recent: {
      kind: string;
      title: string;
      summary: string;
      decisionAction?: string;
    }[];
  };
}

export function statusCard(info: StatusInfo): object {
  const sessionLine = info.sessionId
    ? `\`${info.sessionId.slice(0, 8)}…\`${info.sessionStale ? ' ⚠️ 旧 cwd，下一条会新建' : ''}`
    : '(无)';
  // For topic groups, surface that the scope is per-topic so the user
  // knows /cd / /new only affect this topic.
  const scopeLine =
    info.chatMode === 'topic'
      ? `\`${escapeInlineCode(info.scope)}\` _（话题独立 session）_`
      : `\`${escapeInlineCode(info.scope)}\``;
  const lines = [
    `🧭 **scope**: ${scopeLine}`,
    `📁 **cwd**: \`${escapeInlineCode(displayHomeRelativePath(info.cwd))}\``,
    `🔗 **session**: ${sessionLine}`,
    `🤖 **agent**: ${escapeLarkMarkdown(info.agentName)}`,
  ];
  const elements: object[] = [divMd(lines.join('\n'))];
  if (info.task) {
    elements.push(HR);
    elements.push(
      divMd(
        [
          '**当前任务**',
          `状态：${escapeLarkMarkdown(formatTaskState(info.task.state))}`,
          `任务：${escapeLarkMarkdown(info.task.task)}`,
          `耗时：${formatDuration(info.task.elapsedMs)}`,
          `PID：${info.task.pid ?? '-'}`,
          `cwd：\`${escapeInlineCode(displayHomeRelativePath(info.task.cwd))}\``,
          `最近输出：${escapeLarkMarkdown(truncateText(info.task.recentOutput || '-', 600))}`,
        ].join('\n'),
      ),
    );
  }
  if (info.signals && (info.signals.pendingDecisions > 0 || info.signals.recent.length > 0)) {
    const recent = info.signals.recent
      .map((signal) => {
        const decision = signal.decisionAction ? ` · 决策：${escapeLarkMarkdown(signal.decisionAction)}` : '';
        return `- \`${escapeInlineCode(signal.kind)}\` ${escapeLarkMarkdown(signal.title)}${decision}\n  ${escapeLarkMarkdown(truncateText(signal.summary, 120))}`;
      })
      .join('\n');
    elements.push(HR);
    elements.push(
      divMd(
        [
          '**交互信号**',
          `待处理决策：${info.signals.pendingDecisions}`,
          recent || '暂无近期信号',
        ].join('\n'),
      ),
    );
  }
  elements.push(
    HR,
    actions([
      { text: '🆕 新会话', value: { cmd: 'new' }, style: 'primary' },
      { text: '🔁 恢复会话', value: { cmd: 'resume' } },
      { text: '📂 工作空间', value: { cmd: 'ws.list' } },
      { text: '💡 帮助', value: { cmd: 'help' } },
    ]),
  );
  return shell('📊 当前状态', elements);
}

export interface ResumeEntry {
  sessionId: string;
  preview: string;
  relTime: string;
  status: 'active' | 'idle' | 'not_loaded' | 'error';
  source?: string;
  bindable: boolean;
  current?: boolean;
}

export function resumeCard(cwd: string, entries: ResumeEntry[]): object {
  const elements: object[] = [];
  elements.push(divMd(`当前 cwd：\`${escapeInlineCode(displayHomeRelativePath(cwd))}\``));

  if (entries.length === 0) {
    elements.push(HR);
    elements.push(divMd('此 cwd 下没有可发现的 Codex Thread。'));
    return shell('🔁 绑定 Codex Thread', elements);
  }

  elements.push(HR);
  entries.forEach((e, i) => {
    const marker = e.current ? '  ← 当前' : '';
    const status = formatResumeStatus(e.status);
    const source = e.source ? ` · ${escapeLarkMarkdown(e.source)}` : '';
    elements.push(
      divMd(
        `**${i + 1}.** ${escapeLarkMarkdown(e.preview)}${marker}\n\`${e.sessionId.slice(0, 8)}…\` · ${e.relTime}${source} · ${status}`,
      ),
    );
    if (e.current || !e.bindable) {
      elements.push(divMd(e.current ? '_已是当前 Thread_' : '_当前不可绑定_'));
    } else {
      elements.push(
        actions([
          {
            text: '▸ 绑定此 Thread',
            value: { cmd: 'resume.use', arg: e.sessionId },
            style: 'primary',
          },
        ]),
      );
    }
    if (i < entries.length - 1) elements.push(HR);
  });

  return shell('🔁 绑定 Codex Thread', elements);
}

function formatResumeStatus(status: ResumeEntry['status']): string {
  if (status === 'active') return '运行中，不可绑定';
  if (status === 'idle') return '空闲';
  if (status === 'error') return '状态异常';
  return '已保存';
}

export function helpCard(): object {
  return shell('💡 使用帮助', [
    divMd(
      [
        '**命令列表**',
        '',
        ...helpCommandLines().map((line) => `- ${line}`),
        '',
        '其他内容直接交给 Codex。',
      ].join('\n'),
    ),
    HR,
    actions([
      { text: '📊 状态', value: { cmd: 'status' }, style: 'primary' },
      { text: '🔁 恢复会话', value: { cmd: 'resume' } },
      { text: '📂 工作空间', value: { cmd: 'ws.list' } },
      { text: '🆕 新会话', value: { cmd: 'new' } },
    ]),
  ]);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return min > 0 ? `${min}m ${rest}s` : `${rest}s`;
}

function formatTaskState(state: string): string {
  switch (state) {
    case 'pending_approval':
      return '待审批';
    case 'running':
      return '运行中';
    case 'done':
      return '已完成';
    case 'interrupted':
      return '已中断';
    case 'idle_timeout':
      return '已超时';
    case 'cancelled':
      return '已取消';
    case 'error':
      return '出错';
    default:
      return state;
  }
}
