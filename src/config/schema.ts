import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import {
  AGENT_PROFILE_CODEX_HOST_ID,
  isAgentEndpointProfileId,
  type AgentEndpointProfileId,
} from '../topology/entities';

export type TenantBrand = 'feishu' | 'lark';

/**
 * SecretRef points at a secret stored outside this file — keeps secrets out
 * of `config.json` so backups / accidental git commits / log dumps don't
 * leak the bot's App Secret. The shape is intentionally generic so companion
 * operator tools can resolve secrets through the same `ResolveSecretInput`
 * pipeline without learning bridge internals.
 *
 *   - `env`:  value is in process env at `id` (optionally allowlisted via provider)
 *   - `file`: value is at the path `id` (or `provider.path` if provider config)
 *   - `exec`: spawn `provider.command`, send JSON over stdin, read JSON from stdout
 */
export interface SecretRef {
  source: 'env' | 'file' | 'exec';
  provider?: string;
  id: string;
}

/** A secret field can be either a plain string (potentially a `${VAR}`
 * template) or a SecretRef. JSON deserializer accepts both forms. */
export type SecretInput = string | SecretRef;

export interface AppCredentials {
  id: string;
  secret: SecretInput;
  tenant: TenantBrand;
}

/**
 * `secrets.providers` declares how SecretRefs resolve to plaintext (env
 * allowlist, file path, exec command). Only the fields actually consumed by
 * bridge's resolver are typed here.
 */
export interface ProviderConfig {
  source: 'env' | 'file' | 'exec';
  /** env: allowlist of env var names that ref.id is allowed to be in. */
  allowlist?: string[];
  /** file: optional base path; ref.id is joined onto it. */
  path?: string;
  /** exec: command to spawn + args. */
  command?: string;
  args?: string[];
  /** exec: explicit env to inject (key=value pairs). */
  env?: Record<string, string>;
  /** exec: env var names to pass through from parent env. */
  passEnv?: string[];
  /** exec: max ms to wait for the child. */
  noOutputTimeoutMs?: number;
  /** exec: max stdout bytes accepted before treating as runaway. */
  maxOutputBytes?: number;
}

export interface SecretsConfig {
  providers?: Record<string, ProviderConfig>;
  defaults?: { env?: string; file?: string; exec?: string };
}

/**
 * How replies are rendered in IM chats:
 *   - `card`: full interactive card (tool panels, ⏹ button, footer status)
 *   - `markdown`: lightweight streaming markdown card (typewriter, no buttons)
 *   - `text`: plain markdown post sent once at run completion (no streaming)
 */
export type MessageReplyMode = 'card' | 'markdown' | 'text';

export type AgentEndpointKind = 'exec' | 'app-server';

export type GatewayMode = 'relay' | 'adapter';

export function isGatewayMode(value: unknown): value is GatewayMode {
  return value === 'relay' || value === 'adapter';
}

export function isAgentEndpointKind(value: unknown): value is AgentEndpointKind {
  return value === 'exec' || value === 'app-server';
}

export interface TurnTracePreferences {
  enabled?: boolean;
  artifactNamespace?: string;
}

export interface ReplyMentionTarget {
  /** Human-readable mention name without the leading @, for example "Example Bot". */
  name: string;
  /** Feishu/Lark at target id used in post `tag: "at"` nodes. */
  id: string;
  /** Optional stable key used only for local deduplication. */
  key?: string;
}

export interface ReplyMentionTarget {
  name: string;
  id: string;
  key?: string;
}

export function parseAgentEndpointKind(value: string | undefined): AgentEndpointKind | undefined {
  if (value === undefined) return undefined;
  if (isAgentEndpointKind(value)) return value;
  throw new Error(`invalid agent endpoint: ${value}`);
}

/**
 * Access control settings. All three lists default to "no restriction" when
 * empty / undefined, so existing deployments are not broken on upgrade.
 * Operators that want a hardened deployment fill these in via
 * the bridge config file (no CLI surface yet — by design, since
 * persisting the lists requires the operator to look up open_ids/chat_ids
 * out-of-band anyway).
 */
export interface AppAccess {
  /** open_id whitelist for who can interact with the bot (DM + group @bot).
   * Empty/undefined = allow everyone. */
  allowedUsers?: string[];
  /** chat_id whitelist for chats the bot responds in. Empty/undefined =
   * respond in all chats it's invited to. */
  allowedChats?: string[];
  /** open_id list with admin privileges. Gates sensitive commands
   * (/account, /config, /exit, /reconnect, /doctor, /cd, /ws). Empty /
   * undefined = no admin restriction (every allowed user is an admin). */
  admins?: string[];
}

export interface AppPreferences {
  /**
   * Agent endpoint implementation. `exec` keeps the stable Codex CLI JSONL
   * path; `app-server` uses Codex's stdio app-server protocol.
   */
  agentEndpoint?: AgentEndpointKind;
  /**
   * Authority profile used for Codex runs. Host preserves the operator's local
   * runtime. Guest uses profile-scoped cwd/CODEX_HOME and bounded permissions.
   */
  agentProfile?: string;
  /**
   * Process cwd for the Codex app-server service itself. This is separate
   * from per-turn task cwd passed to thread/start and turn/start.
   */
  appServerCwd?: string;
  /** Reply rendering mode for IM (group/p2p) messages. Default 'text'. */
  messageReply?: MessageReplyMode;
  /**
   * How much interpretation the bridge applies between the channel and the
   * execution agent. `adapter` keeps the full intent/HITL/
   * presentation path. `relay` keeps channel duties such as transport,
   * session, attachment, quote, approval, and stream delivery.
   */
  gatewayMode?: GatewayMode;
  /**
   * Optional AOP-style turn trace recorder. When enabled and Runtime Services
   * artifact storage is available, every bridge turn is persisted as a chained
   * JSONL artifact without changing relay/adapter behavior.
   */
  turnTrace?: TurnTracePreferences;
  /**
   * Operator-owned mapping for outbound reply mentions. Use this when the
   * agent output may contain `@name` text for a bot/user that was not a real
   * inbound mention, so the bridge can lower it to a Feishu/Lark post `at`
   * node instead of leaking a plain-text @ string.
   */
  replyMentionTargets?: ReplyMentionTarget[];
  /**
   * Whether to render tool-call blocks (Bash / Read / Edit / ...) in the
   * output. Default true. Turn off if you only care about Codex's final
   * text answer and want to hide the "工具调用过程".
   */
  showToolCalls?: boolean;
  /**
   * Cap on concurrent Codex runs across all chats / topics. Excess runs
   * queue FIFO. Default 10. Mostly relevant for topic groups where each
   * topic can spawn its own run; capping protects RAM / token spend.
   */
  maxConcurrentRuns?: number;
  /**
   * Global default idle-timeout for Codex runs, in minutes. When set,
   * if Codex emits no stream event for this long the bridge kills the
   * run as presumed-hung. Undefined / 0 = no timeout (the default — runs
   * can hang indefinitely). Per-scope `/timeout` overrides this.
   */
  runIdleTimeoutMinutes?: number;
  /**
   * Whether the bot only responds to messages that @-mention it in groups
   * (regular and topic groups). p2p is always unrestricted. Default true:
   * groups are quiet unless the user @bot. Set false to let any group
   * message reach Codex (the 0.1.21-and-earlier behavior).
   *
   * @全员 is never responded to regardless (SDK `respondToMentionAll: false`).
   * Cloud-doc comments still require @-mention unconditionally.
   */
  requireMentionInGroup?: boolean;
  /** Access control — user/chat allowlists + admin gating. See AppAccess. */
  access?: AppAccess;
  /**
   * Grace period (ms) between SIGTERM and SIGKILL when killing the Codex
   * subprocess. Default 5000ms because Codex often has its
   * own subprocesses (e.g. lark-cli mid-OAuth) that need a moment to clean
   * up — too short a window and the SIGKILL cascade kills the descendants
   * before they can finish what the user is waiting on. Default 5000ms.
   * Range 100-30000; out-of-range values fall back to default.
   */
  agentStopGraceMs?: number;
  /**
   * 是否在执行任务前发送审批卡片。默认 false：普通消息直接进入 agent runtime 执行，
   * 不再每条都先弹审批卡。设置为 true 时，会保留原审批确认流程。
   * 关键词（默认 `/approve`、`/审批`）始终强制要求审批。
   */
  requireApprovalBeforeRun?: boolean;
  /**
   * 强制走审批的关键词前缀。命中其中任意一个时，无论
   * `requireApprovalBeforeRun` 是 true 还是 false，都会先发审批卡片。
   * 默认：`['/approve', '/审批']`。
   */
  approvalKeywords?: string[];
  /**
   * 这些模型执行前自动要求审批。适合把更贵、更强或更有风险的模型
   * 放进名单，例如 `['gpt-5.5']`。默认空数组。
   */
  approvalModels?: string[];
}

export interface RuntimeServicesConfig {
  /** Caller-owned artifact/record namespace passed to Runtime Services. */
  artifact_namespace?: string;
  /** Caller-owned vector table name passed to Runtime Services. */
  vector_tableName?: string;
  /** Caller-owned record namespace passed to Runtime Services. */
  record_namespace?: string;
  /** Caller-owned record table name passed to Runtime Services. */
  record_tableName?: string;
}

/**
 * Top-level config shape on disk.
 *
 * `accounts` is a namespace for credential-flavored fields (currently just
 * the bot app, room for OAuth / alternate apps later). `preferences`
 * holds user-tunable behavior knobs. Other future sections (mcp, etc.)
 * belong at this top level alongside them.
 */
export interface AppConfig {
  accounts: {
    app: AppCredentials;
  };
  secrets?: SecretsConfig;
  preferences?: AppPreferences;
  runtimeServices?: RuntimeServicesConfig;
}

export function isComplete(cfg: Partial<AppConfig>): cfg is AppConfig {
  const app = cfg.accounts?.app;
  return Boolean(app?.id && hasSecret(app?.secret) && app?.tenant);
}

function hasSecret(s: SecretInput | undefined): boolean {
  if (!s) return false;
  if (typeof s === 'string') return s.length > 0;
  return Boolean(s.source && s.id);
}

/** True iff this credential's secret is stored externally (env/file/exec). */
export function isSecretRef(s: SecretInput): s is SecretRef {
  return typeof s === 'object' && s !== null;
}

/** Account/keystore key for the bot's App Secret. lark-cli also uses a
 * similar `appsecret:` convention so audit/grep is consistent. */
export function secretKeyForApp(appId: string): string {
  return `app-${appId}`;
}

/** Resolve the message-reply preference with default fallback. */
export function getMessageReplyMode(cfg: AppConfig): MessageReplyMode {
  const raw = cfg.preferences?.messageReply;
  if (raw === 'card' || raw === 'markdown' || raw === 'text') return raw;
  return 'text';
}

export function getAgentEndpointKind(cfg: AppConfig): AgentEndpointKind {
  return isAgentEndpointKind(cfg.preferences?.agentEndpoint)
    ? cfg.preferences.agentEndpoint
    : 'exec';
}

export function getAppServerCwd(
  cfg: Pick<AppConfig, 'preferences'>,
  userHome: string = homedir(),
): string {
  const raw = cfg.preferences?.appServerCwd?.trim();
  if (!raw) return defaultAppServerCwd(userHome);
  if (raw === '~') return userHome;
  if (raw.startsWith('~/')) return join(userHome, raw.slice(2));
  if (isAbsolute(raw)) return raw;
  return resolve(userHome, raw);
}

function defaultAppServerCwd(userHome: string): string {
  return join(userHome, 'Documents', 'Codex', 'app-server');
}

export function getGatewayMode(cfg: Pick<AppConfig, 'preferences'>): GatewayMode {
  return isGatewayMode(cfg.preferences?.gatewayMode)
    ? cfg.preferences.gatewayMode
    : 'adapter';
}

export function getTurnTraceEnabled(cfg: Pick<AppConfig, 'preferences'>): boolean {
  return cfg.preferences?.turnTrace?.enabled === true;
}

export function getReplyMentionTargets(cfg: Pick<AppConfig, 'preferences'>): Required<ReplyMentionTarget>[] {
  return (cfg.preferences?.replyMentionTargets ?? [])
    .map((target): Required<ReplyMentionTarget> | undefined => {
      const name = target.name?.trim();
      const id = target.id?.trim();
      const key = target.key?.trim() || (name ? `@${name}` : '');
      if (!name || !id || !key) return undefined;
      return { name, id, key };
    })
    .filter((target): target is Required<ReplyMentionTarget> => Boolean(target));
}

const DEFAULT_RUNTIME_SERVICES_ARTIFACT_NAMESPACE = 'agent-interaction-bridge';
const DEFAULT_RUNTIME_SERVICES_RECORD_NAMESPACE = 'agent-interaction-bridge';
const DEFAULT_RUNTIME_SERVICES_VECTOR_TABLE = 'agent_interaction_bridge_vectors';
const DEFAULT_RUNTIME_SERVICES_RECORD_TABLE = 'agent_interaction_bridge_records';
const RUNTIME_SERVICES_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function getRuntimeServicesArtifactNamespace(cfg: Pick<AppConfig, 'runtimeServices'>): string {
  return runtimeServicesNameOrDefault(
    cfg.runtimeServices?.artifact_namespace,
    DEFAULT_RUNTIME_SERVICES_ARTIFACT_NAMESPACE,
  );
}

export function getTurnTraceArtifactNamespace(
  cfg: Pick<AppConfig, 'preferences' | 'runtimeServices'>,
): string {
  return runtimeServicesNameOrDefault(
    cfg.preferences?.turnTrace?.artifactNamespace,
    `${getRuntimeServicesArtifactNamespace(cfg)}.turn-traces`,
  );
}

export function getRuntimeServicesVectorTableName(cfg: Pick<AppConfig, 'runtimeServices'>): string {
  return runtimeServicesNameOrDefault(
    cfg.runtimeServices?.vector_tableName,
    DEFAULT_RUNTIME_SERVICES_VECTOR_TABLE,
  );
}

export function getRuntimeServicesRecordNamespace(cfg: Pick<AppConfig, 'runtimeServices'>): string {
  return runtimeServicesNameOrDefault(
    cfg.runtimeServices?.record_namespace,
    DEFAULT_RUNTIME_SERVICES_RECORD_NAMESPACE,
  );
}

export function getRuntimeServicesRecordTableName(cfg: Pick<AppConfig, 'runtimeServices'>): string {
  return runtimeServicesNameOrDefault(
    cfg.runtimeServices?.record_tableName,
    DEFAULT_RUNTIME_SERVICES_RECORD_TABLE,
  );
}

function runtimeServicesNameOrDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && RUNTIME_SERVICES_NAME.test(trimmed) ? trimmed : fallback;
}

export function getAgentEndpointProfileId(cfg: Pick<AppConfig, 'preferences'>): AgentEndpointProfileId {
  return isAgentEndpointProfileId(cfg.preferences?.agentProfile)
    ? cfg.preferences.agentProfile
    : AGENT_PROFILE_CODEX_HOST_ID;
}

/** Resolve the show-tool-calls preference with default fallback. */
export function getShowToolCalls(cfg: AppConfig): boolean {
  return cfg.preferences?.showToolCalls !== false;
}

/** Resolve the max-concurrent-runs preference with default + sanity clamp. */
export function getMaxConcurrentRuns(cfg: AppConfig): number {
  const raw = cfg.preferences?.maxConcurrentRuns;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) return 10;
  // Reasonable upper bound — at 50+ concurrent Codex runs the bot box is
  // probably already RAM-starved. Clamp to keep typos from killing the box.
  return Math.min(Math.floor(raw), 50);
}

/**
 * Resolve the require-mention-in-group preference. Default `true` — the
 * `!== false` check makes "undefined" (older configs that don't have the
 * field) inherit the new safer default automatically.
 */
export function getRequireMentionInGroup(cfg: AppConfig): boolean {
  return cfg.preferences?.requireMentionInGroup !== false;
}

/**
 * Resolve the global default idle-timeout in ms. Returns `undefined` when
 * disabled (the default). Clamps to [1, 120] minutes when set so a typo
 * can't lock the bot into a 1-second kill loop or wait forever to a number
 * the user didn't really mean.
 */
/**
 * Grace period before SIGKILL fallback when stopping a Codex subprocess.
 * Returns ms. Defaults to 5000 (5 seconds). Clamps to [100, 30000] so a
 * typo can't either make stop() effectively SIGKILL-immediate or hang for
 * minutes.
 */
export function getAgentStopGraceMs(cfg: AppConfig): number {
  const raw = cfg.preferences?.agentStopGraceMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 5000;
  return Math.min(30_000, Math.max(100, Math.floor(raw)));
}

/** True when `senderId` may interact with the bot. Empty list = allow all. */
export function isUserAllowed(cfg: AppConfig, senderId: string): boolean {
  const list = cfg.preferences?.access?.allowedUsers;
  if (!list || list.length === 0) return true;
  return list.includes(senderId);
}

/** True when `chatId` is one the bot will respond in. Empty list = allow all. */
export function isChatAllowed(cfg: AppConfig, chatId: string): boolean {
  const list = cfg.preferences?.access?.allowedChats;
  if (!list || list.length === 0) return true;
  return list.includes(chatId);
}

/** True when `senderId` has admin privileges. Empty list = no admin
 * restriction (every allowed user can run admin commands). */
export function isAdmin(cfg: AppConfig, senderId: string): boolean {
  const list = cfg.preferences?.access?.admins;
  if (!list || list.length === 0) return true;
  return list.includes(senderId);
}

export function getRunIdleTimeoutMs(cfg: AppConfig): number | undefined {
  const raw = cfg.preferences?.runIdleTimeoutMinutes;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined;
  const clamped = Math.min(Math.max(Math.floor(raw), 1), 120);
  return clamped * 60_000;
}

/** 默认强制审批的关键词，可被 `preferences.approvalKeywords` 覆盖。 */
const DEFAULT_APPROVAL_KEYWORDS = ['/approve', '/审批'];

/** 是否对“普通消息”默认要求审批。默认 false（按需触发）。 */
export function getRequireApprovalBeforeRun(cfg: AppConfig): boolean {
  return cfg.preferences?.requireApprovalBeforeRun === true;
}

/** 解析强制审批关键词列表，未配置时使用默认值。 */
export function getApprovalKeywords(cfg: AppConfig): string[] {
  const raw = cfg.preferences?.approvalKeywords;
  if (!Array.isArray(raw)) return DEFAULT_APPROVAL_KEYWORDS;
  const cleaned = raw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : DEFAULT_APPROVAL_KEYWORDS;
}

/**
 * 判断当前任务是否需要走审批卡片：
 *  - 命中关键词前缀 → 强制审批
 *  - 否则跟随 `requireApprovalBeforeRun` 偏好
 */
export function shouldRequireApproval(cfg: AppConfig, taskText: string): boolean {
  const keywords = getApprovalKeywords(cfg);
  const head = taskText.trim().toLowerCase();
  if (head && keywords.some((kw) => head.startsWith(kw.toLowerCase()))) return true;
  return getRequireApprovalBeforeRun(cfg);
}
