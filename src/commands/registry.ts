export type CommandSurface = 'chat' | 'directive';
export type CommandStatus = 'covered' | 'draft';

export interface CommandSpec {
  name: `/${string}`;
  surface: CommandSurface;
  admin: boolean;
  status: CommandStatus;
  summary: string;
  help?: string;
}

export const COMMAND_SPECS: CommandSpec[] = [
  {
    name: '/new',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'clear the current chat session',
    help: '`/new` `/reset` — 清空当前 chat 的会话',
  },
  {
    name: '/reset',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'alias for /new',
  },
  {
    name: '/new chat',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'create a new bound group chat and session',
    help: '`/new chat [name]` — 新建群+新会话，自动拉你进群',
  },
  {
    name: '/resume',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'list and resume recent Codex sessions',
    help: '`/resume [N]` — 列出并恢复历史会话（最多 N 条）',
  },
  {
    name: '/cd',
    surface: 'chat',
    admin: true,
    status: 'covered',
    summary: 'switch workspace directory and reset session',
    help: '`/cd <path>` — 切换工作目录（会重置 session）',
  },
  {
    name: '/ws',
    surface: 'chat',
    admin: true,
    status: 'covered',
    summary: 'manage named workspaces',
    help: '`/ws list|save <name>|use <name>|remove <name>` — 工作空间',
  },
  {
    name: '/account',
    surface: 'chat',
    admin: true,
    status: 'covered',
    summary: 'view or rotate Feishu/Lark app credentials',
    help: '`/account` — 查看当前应用；`/account change` 换 appId/secret 并重连',
  },
  {
    name: '/config',
    surface: 'chat',
    admin: true,
    status: 'covered',
    summary: 'change local preferences and access policy',
    help: '`/config` — 调整偏好（消息回复方式、工具调用显示）',
  },
  {
    name: '/status',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'show current bot, session, and task status',
    help: '`/status` — 当前状态',
  },
  {
    name: '/stop',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'stop the active task in this scope',
    help: '`/stop` — 结束当前正在跑的任务（也可点卡片底部 ⏹ 终止 按钮）',
  },
  {
    name: '/timeout',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'set or reset the current session idle timeout',
    help: '`/timeout [N|off|default]` — 当前 session 的探活分钟数,`/config` 改全局默认',
  },
  {
    name: '/gatewayMode',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'set or reset the current session gateway mode',
    help: '`/gatewayMode [relay|adapter|default]` — 当前 session 的 gateway 模式,`/config` 改全局默认',
  },
  {
    name: '/ps',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'list local running bot processes',
    help: '`/ps` — 列出本机所有 bot,标识当前正在回复的那个',
  },
  {
    name: '/exit',
    surface: 'chat',
    admin: true,
    status: 'covered',
    summary: 'stop a selected local bot process',
    help: '`/exit <id|#>` — 关掉指定 bot(用 `/ps` 看 id/序号)',
  },
  {
    name: '/reconnect',
    surface: 'chat',
    admin: true,
    status: 'covered',
    summary: 'force reconnect the WebSocket channel',
    help: '`/reconnect` — 强制重连 WebSocket(网络抖动后 bot 没反应时用)',
  },
  {
    name: '/doctor',
    surface: 'chat',
    admin: true,
    status: 'covered',
    summary: 'run Codex diagnosis with sanitized recent logs',
    help: '`/doctor [描述]` — 把日志和描述喂给 Codex 自助诊断',
  },
  {
    name: '/approve',
    surface: 'directive',
    admin: false,
    status: 'covered',
    summary: 'force an approval card before running the task',
    help: '`/approve <任务>` — 强制先发审批卡片',
  },
  {
    name: '/run',
    surface: 'directive',
    admin: false,
    status: 'covered',
    summary: 'run directly and skip approval',
    help: '`/run <任务>` — 明确直接执行,跳过审批',
  },
  {
    name: '/visual',
    surface: 'directive',
    admin: false,
    status: 'covered',
    summary: 'prefer interactive-card progress presentation',
    help: '`/visual <任务>` — 强制用交互卡片展示过程；对比/图标/架构/报告会自动触发 Dynamic UI',
  },
  {
    name: '/quiet',
    surface: 'directive',
    admin: false,
    status: 'covered',
    summary: 'send only the final text',
    help: '`/quiet <任务>` — 只发最终文本',
  },
  {
    name: '/model',
    surface: 'directive',
    admin: false,
    status: 'covered',
    summary: 'choose an Agent endpoint Codex model for one task',
    help: '`/model <模型> <任务>` — 指定 Agent endpoint 的 Codex 模型；不是 bridge helper model',
  },
  {
    name: '/help',
    surface: 'chat',
    admin: false,
    status: 'covered',
    summary: 'show command help',
    help: '`/help` — 本帮助',
  },
];

export const HANDLED_CHAT_COMMANDS = [
  '/new',
  '/reset',
  '/cd',
  '/ws',
  '/resume',
  '/status',
  '/help',
  '/account',
  '/config',
  '/stop',
  '/timeout',
  '/gatewayMode',
  '/ps',
  '/exit',
  '/doctor',
  '/reconnect',
] as const;

export type HandledChatCommand = (typeof HANDLED_CHAT_COMMANDS)[number];

const ADMIN_COMMAND_ORDER: `/${string}`[] = [
  '/account',
  '/config',
  '/exit',
  '/reconnect',
  '/doctor',
  '/cd',
  '/ws',
];

export function findCommandSpec(name: string): CommandSpec | undefined {
  const normalized = normalizeCommandName(name);
  return COMMAND_SPECS.find((command) => command.name === normalized);
}

export function isAdminCommandName(name: string): boolean {
  return Boolean(findCommandSpec(name)?.admin);
}

export function adminCommandNames(): string[] {
  return ADMIN_COMMAND_ORDER.filter((name) => findCommandSpec(name)?.admin);
}

export function helpCommandLines(): string[] {
  return COMMAND_SPECS.filter((command) => command.help).map((command) => command.help!);
}

export function handledChatCommandNames(): HandledChatCommand[] {
  return [...HANDLED_CHAT_COMMANDS];
}

function normalizeCommandName(name: string): `/${string}` {
  const raw = name.trim();
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const parts = withSlash.split(/\s+/);
  return (parts[0] ?? '/') as `/${string}`;
}
