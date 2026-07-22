import type {
  LarkChannel,
  LarkChannelOptions,
  NormalizedMessage,
  SendOptions,
} from '@larksuiteoapi/node-sdk';
import { Domain, LoggerLevel, createLarkChannel } from '@larksuiteoapi/node-sdk';
import type { AgentAdapter } from '../agent/types';
import { defaultAgentTaskCwd } from '../agent/default-cwd';
import { prepareAgentProfileRunPlan } from '../agent/profile-policy';
import { handleCardAction } from '../card/dispatcher';
import { renderPresentationCard } from '../card/presentation-card';
import { renderCard } from '../card/run-renderer';
import { isManaged, sendManagedCard, updateManagedCard } from '../card/managed';
import { taskApprovalCard, taskApprovalDecisionCard } from '../card/task-approval-card';
import {
  finalizeIfRunning,
  initialState,
  markIdleTimeout,
  markInterrupted,
  reduce,
  type RunState,
} from '../card/run-state';
import { renderText } from '../card/text-renderer';
import { formatFeishuFinalMarkdown } from '../card/feishu-markdown';
import { tryHandleCommand, type Controls } from '../commands';
import type { AppConfig } from '../config/schema';
import {
  getAgentStopGraceMs,
  getAgentEndpointProfileId,
  getGatewayMode,
  getMaxConcurrentRuns,
  getMessageReplyMode,
  getRequireMentionInGroup,
  getReplyMentionTargets,
  getRunIdleTimeoutMs,
  getShowToolCalls,
  getTurnTraceArtifactNamespace,
  getTurnTraceEnabled,
  isChatAllowed,
  isUserAllowed,
} from '../config/schema';
import { resolveAppSecret } from '../config/secret-resolver';
import { log, withTrace } from '../core/logger';
import { MediaCache } from '../media/cache';
import { agentSessionContextVersion } from '../session/context-version';
import type { SessionStore } from '../session/store';
import { CHANNEL_FEISHU } from '../topology/entities';
import {
  applyFeishuDeliverySupport,
  feishuSendInputsForRenderedSignal,
  type FeishuDeliverySupportOptions,
  type FeishuRenderedSignalWithSupport,
} from '../signal/feishu-delivery-support';
import { renderFeishuSignal } from '../signal/feishu-renderer';
import { interactionRequestToSignal } from '../signal/interaction';
import type { AgentSignal } from '../signal/router';
import { SignalTimelineStore } from '../signal/timeline';
import { extractToolResultSignals } from '../signal/tool-events';
import { sendMacNotification, shouldNotifyMac } from '../signal/mac-notifier';
import { presentAnswerCard } from '../signal/reply-presentation';
import type { InteractionRequest } from '../interaction/protocol';
import { extractInteractionRequests, stripInteractionBlocks } from '../interaction/protocol';
import {
  withInteractionProtocol,
  withRelayPlainTextTemplate,
} from '../interaction/prompt';
import type { StatelessIntentJudge } from '../interaction/intent';
import { createBridgeStatelessIntentJudge } from '../interaction/model-judge';
import { assessToolRisk } from '../interaction/risk-policy';
import type { ApprovalDecisionAction } from '../task/approval-contract';
import {
  parseApprovalDecision,
  TaskApprovalStore,
  type PendingApproval,
} from '../task/approval-store';
import { decideRunPolicy } from '../task/run-policy';
import { TaskStatusStore, type TaskLifecycle } from '../task/status-store';
import type { WorkspaceStore } from '../workspace/store';
import { paths } from '../config/paths';
import {
  createRuntimeServicesPortContext,
  type RuntimeServicesPortContext,
} from '../runtime-services/selector';
import {
  hasAvailableRuntimeResource,
  RUNTIME_RESOURCE_IDS,
} from '../runtime-services/resources';
import { resolveEffectiveGatewayMode } from '../gateway/mode-policy';
import { createTurnTraceRecorder } from '../turn-trace/plugin';
import { ActiveRuns, type RunHandle } from './active-runs';
import { ChatModeCache, type ChatMode } from './chat-mode-cache';
import { handleCommentMention } from './comments';
import { startKeepalive } from './keepalive';
import type { RuntimeHealthUpdate } from '../runtime/health';
import { configureNetwork } from './network-config';
import { PendingQueue } from './pending-queue';
import { ProcessPool } from './process-pool';
import { fetchQuotedContext, type QuotedContext } from './quote';
import { addWorkingReaction, removeReaction } from './reaction';
import { planReplyMarkdown, sendReplyMarkdown, withReplyMentions } from './reply-mentions';
import { replyModeForInteractionIntent } from './reply-mode-policy';
import { buildFeishuPromptPlan } from './prompt-plan';
import { sendFeishuSignalInputs } from './feishu-signal-delivery';
import { writeFeishuReplyDebugRecord } from './feishu-reply-debug';
import {
  buildFeishuUserText,
  normalizeFeishuCommandContent,
  renderFeishuMessageMetadataBlock,
} from './intake-contract';
import { validateFeishuRawInboundEvent } from './feishu-raw-event-contract';

const DEBOUNCE_MS = 600;

// Lark SDK logs API errors at error level even when the caller catches them.
// These specific codes are EXPECTED in our flow (wiki-node lookup that
// usually misses, fileComment.get that we deliberately let fall back to
// .list) and the surrounding noise is already covered by our own logs.
const SUPPRESSED_API_ERROR_CODES = new Set([
  131005, // wiki.space.getNode "not found" — the doc isn't a wiki node
  1069307, // drive.fileComment.get "not exist" — fall back to .list
  1069302, // drive.fileCommentReply.create — whole-doc comments don't accept replies; fall back to fileComment.create
]);

function buildQuietLogger(): {
  error: (...m: unknown[]) => void;
  warn: (...m: unknown[]) => void;
  info: (...m: unknown[]) => void;
  debug: (...m: unknown[]) => void;
  trace: (...m: unknown[]) => void;
} {
  // Match either `{ code: <feishu-code> }` (the response data SDK logs as
  // its second arg) or an AxiosError where the feishu code lives at
  // `err.response.data.code` (which the SDK logs raw).
  const codeFromObj = (m: unknown): number | undefined => {
    if (!m || typeof m !== 'object') return undefined;
    const top = (m as { code?: unknown }).code;
    if (typeof top === 'number') return top;
    const nested = (m as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
    return typeof nested === 'number' ? nested : undefined;
  };
  const isSuppressed = (msg: unknown): boolean => {
    if (Array.isArray(msg)) return msg.some(isSuppressed);
    const code = codeFromObj(msg);
    return code !== undefined && SUPPRESSED_API_ERROR_CODES.has(code);
  };
  return {
    error: (...args: unknown[]) => {
      if (args.some(isSuppressed)) return;
      log.warn('sdk', 'error', { args: stringifyArgs(args) });
    },
    warn: (...args: unknown[]) => log.warn('sdk', 'warn', { args: stringifyArgs(args) }),
    info: (...args: unknown[]) => log.info('sdk', 'info', { args: stringifyArgs(args) }),
    debug: () => {},
    trace: () => {},
  };
}

function stringifyArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

export interface InteractionChannelAdapter<TChannel = unknown> {
  readonly entityId: string;
  readonly displayName: string;
  readonly channel: TChannel;
  disconnect(): Promise<void>;
}

export type BridgeChannel = InteractionChannelAdapter<LarkChannel>;

export interface StartChannelDeps {
  cfg: AppConfig;
  agent: AgentAdapter;
  sessions: SessionStore;
  workspaces: WorkspaceStore;
  controls: Controls;
  onHealth?: (update: RuntimeHealthUpdate) => void | Promise<void>;
}

export async function startChannel(deps: StartChannelDeps): Promise<BridgeChannel> {
  const { cfg, agent, sessions, workspaces, controls, onHealth } = deps;
  const reportHealth = async (update: RuntimeHealthUpdate): Promise<void> => {
    if (!onHealth) return;
    try {
      await onHealth(update);
    } catch (err) {
      log.fail('runtime-health', err, { step: 'update' });
    }
  };
  const activeRuns = new ActiveRuns();
  const approvals = new TaskApprovalStore();
  const taskStatus = new TaskStatusStore();
  const signalTimeline = new SignalTimelineStore();
  // ChatModeCache stays per-bridge-instance — invalidated on restart along
  // with everything else. Topic-mode chats only need one chat.get() call ever.
  const chatModeCache = new ChatModeCache();
  // Concurrency cap — reads `preferences.maxConcurrentRuns` on each acquire,
  // so /config bumps take effect for the next run.
  const pool = new ProcessPool(() => getMaxConcurrentRuns(controls.cfg));

  // Apply network-layer overrides (HTTP timeout + proxy from env). Idempotent;
  // safe to call on every startChannel (used by /account change hot-reload too).
  const netOverrides = configureNetwork();

  // Resolve the App Secret to plaintext. The config field can be a literal
  // string, a "${VAR}" template, or a {source, id} SecretRef referencing
  // the encrypted keystore / env / file / exec provider. Re-resolved on
  // every startChannel so /account change picks up new secrets.
  const appSecret = await resolveAppSecret(cfg);

  const opts: LarkChannelOptions = {
    appId: cfg.accounts.app.id,
    appSecret,
    domain: cfg.accounts.app.tenant === 'lark' ? Domain.Lark : Domain.Feishu,
    source: 'Agent-Interaction-Bridge',
    loggerLevel: LoggerLevel.info,
    logger: buildQuietLogger(),
    policy: {
      dmMode: 'open',
      requireMention: false,
      respondToMentionAll: false,
    },
    // Disable per-chat serialization so we can implement our own
    // debounce + run-chain policy (see pending-queue + runChain below).
    safety: {
      chatQueue: { enabled: false },
    },
    // Attach raw Feishu event body to normalized events so we can read fields
    // the normalizer drops (e.g. action.form_value on CardKit 2.0 form submits).
    includeRawEvent: true,
    outbound: {
      streamThrottleMs: 400,
    },
    // SDK 1.65.0-alpha.3+ knobs.
    wsConfig: {
      // 3s liveness watchdog: if no inbound message arrives within 3s after
      // the last ping, SDK presumes connection dead and forces a reconnect.
      pingTimeout: 3,
    },
    // 8s handshake timeout. Fast-fail + fast-retry beats slow-fail in
    // unstable networks.
    handshakeTimeoutMs: 8_000,
    // Optional WS-layer proxy agent (only when HTTPS_PROXY / HTTP_PROXY env set).
    ...(netOverrides.agent ? { agent: netOverrides.agent } : {}),
  };

  const channel = createLarkChannel(opts);
  const media = new MediaCache(channel);
  const getRuntimeServicesContext = async (): Promise<RuntimeServicesPortContext | undefined> => {
    try {
      return await createRuntimeServicesPortContext();
    } catch (err) {
      log.warn('runtime-services', 'context-unavailable', {
        err: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  };
  const getStatelessIntentJudge = (): Promise<StatelessIntentJudge | undefined> => {
    return buildStatelessIntentJudge(getRuntimeServicesContext);
  };
  const gatewayModeDegradeNotices = new Set<string>();

  // Pending → run handoff: while a run is active on a chat, block its pending
  // queue so messages keep accumulating without flushing. When the run ends,
  // unblock arms a fresh quiet-window timer. Net effect: at most one run per
  // chat in flight, and everything sent during a run merges into the next
  // batch (only flushed once 600ms of silence has passed *after* the run).
  const pending = new PendingQueue(DEBOUNCE_MS, (scope, batch) => {
    const firstMsg = batch[0];
    if (!firstMsg) return;
    pending.block(scope);
    void withTrace({ chatId: firstMsg.chatId }, async () => {
      log.info('flush', 'start', { scope, batchSize: batch.length });
      // Pool slot acquired here, released in finally. Across-the-bridge cap.
      const release = await pool.acquire();
      try {
        const mode = await chatModeCache.resolve(channel, firstMsg.chatId);
        await runAgentBatch({
          channel,
          agent,
          sessions,
          workspaces,
          activeRuns,
          approvals,
          taskStatus,
          signalTimeline,
          media,
          batch,
          controls,
          scope,
          mode,
          getRuntimeServicesContext,
          getStatelessIntentJudge,
          gatewayModeDegradeNotices,
        });
      } catch (err) {
        log.fail('flush', err);
      } finally {
        release();
        pending.unblock(scope);
        log.info('flush', 'end');
      }
    });
  });

  // Counter for stdout reconnect escalation; reset on `reconnected`.
  let consecutiveReconnects = 0;

  channel.on({
    message: async (msg) => {
      await withTrace({ chatId: msg.chatId, msgId: msg.messageId }, () =>
        intakeMessage({
          channel,
          agent,
          sessions,
          workspaces,
          activeRuns,
          approvals,
          taskStatus,
          signalTimeline,
          pending,
          msg,
          controls,
          chatModeCache,
        }),
      ).catch((err) => log.fail('intake', err));
    },
    reject: (evt) => {
      log.info('intake', 'reject', { chatId: evt.chatId, reason: evt.reason });
    },
    cardAction: async (evt) => {
      await withTrace({ chatId: evt.chatId, msgId: evt.messageId }, async () => {
        await handleCardAction({
          channel,
          evt,
          sessions,
          workspaces,
          activeRuns,
          approvals,
          agent,
          controls,
          pending,
          chatModeCache,
          taskStatus,
          signalTimeline,
        });
      }).catch((err) => log.fail('cardAction', err));
    },
    comment: async (evt) => {
      await withTrace({ chatId: 'comment' }, async () => {
        await handleCommentMention({ channel, evt, agent, sessions, workspaces, cfg: controls.cfg }).catch((err) =>
          log.fail('comment', err),
        );
      }).catch((err) => log.fail('comment', err));
    },
    reconnecting: () => {
      consecutiveReconnects++;
      log.warn('ws', 'reconnecting', { consecutive: consecutiveReconnects });
      void reportHealth({
        state: 'reconnecting',
        issue: 'ws_reconnecting',
        reconnectAttempts: consecutiveReconnects,
      });
      // Stdout escalation — surface jitter that's hidden in the file log.
      if (consecutiveReconnects === 3) {
        console.error('⚠️ 已连续重连 3 次,网络可能不稳。');
      } else if (consecutiveReconnects === 10) {
        console.error('❌ 已连续重连 10 次,建议在飞书发 /reconnect 或重启 bot。');
      }
    },
    reconnected: () => {
      if (consecutiveReconnects > 1) {
        log.info('ws', 'recovered', { afterAttempts: consecutiveReconnects });
      } else {
        log.info('ws', 'reconnected');
      }
      consecutiveReconnects = 0;
      void reportHealth({ state: 'connected' });
    },
    // Classify common WS errors into the `network` phase so /doctor and grep
    // can find them without scanning generic `ws.fail` entries.
    error: (err) => {
      const msg = err?.message ?? String(err);
      if (/ENOTFOUND|getaddrinfo/.test(msg)) {
        log.fail('network', err, { kind: 'dns', code: err.code });
        void reportHealth({ state: 'degraded', issue: 'network_dns' });
      } else if (/handshake|did not complete/.test(msg)) {
        log.fail('network', err, { kind: 'handshake-timeout', code: err.code });
        void reportHealth({ state: 'degraded', issue: 'network_handshake_timeout' });
      } else if (/timeout/i.test(msg)) {
        log.fail('network', err, { kind: 'timeout', code: err.code });
        void reportHealth({ state: 'degraded', issue: 'network_timeout' });
      } else {
        log.fail('ws', err, { code: err.code });
        void reportHealth({ state: 'degraded', issue: 'ws_error' });
      }
    },
  });

  await reportHealth({ state: 'starting', issue: 'carrier_connecting' });
  try {
    await channel.connect();
  } catch (err) {
    await reportHealth({ state: 'degraded', issue: 'carrier_connect_failed' });
    await channel.disconnect().catch((disconnectError) =>
      log.fail('ws', disconnectError, { step: 'failed-connect-cleanup' }),
    );
    throw err;
  }

  const identity = channel.botIdentity;
  log.info('ws', 'connected', {
    bot: identity?.name ?? 'unknown',
    openId: identity?.openId ?? '-',
    agent: `${agent.displayName} (${agent.id})`,
    appId: cfg.accounts.app.id,
    procId: controls.processId,
  });
  await reportHealth({ state: 'connected' });
  console.log('正在监听消息。按 Ctrl+C 退出。\n');

  // App-level keepalive: 15s probe + wake-up detection + HTTP reachability.
  // Defense-in-depth — the SDK's pingTimeout watchdog handles half-dead WS,
  // this catches anything that the SDK misses (silent state stuck, etc.).
  const probeDomain =
    cfg.accounts.app.tenant === 'lark'
      ? 'https://open.larksuite.com'
      : 'https://open.feishu.cn';
  const keepalive = startKeepalive({
    channel,
    domain: probeDomain,
    forceReconnect: () => controls.restart(),
    onHealth: reportHealth,
  });

  return {
    entityId: CHANNEL_FEISHU.id,
    displayName: CHANNEL_FEISHU.displayName,
    channel,
    disconnect: async () => {
      keepalive.stop();
      pending.cancelAll();
      await channel.disconnect();
      await activeRuns.stopAll();
      await Promise.allSettled([sessions.flush(), workspaces.flush()]);
      await reportHealth({ state: 'stopped', issue: 'carrier_stopped' });
    },
  };
}

interface IntakeDeps {
  channel: LarkChannel;
  agent: AgentAdapter;
  sessions: SessionStore;
  workspaces: WorkspaceStore;
  activeRuns: ActiveRuns;
  approvals: TaskApprovalStore;
  taskStatus: TaskStatusStore;
  signalTimeline: SignalTimelineStore;
  pending: PendingQueue;
  msg: NormalizedMessage;
  controls: Controls;
  chatModeCache: ChatModeCache;
}

async function intakeMessage(deps: IntakeDeps): Promise<void> {
  const {
    channel,
    agent,
    sessions,
    workspaces,
    activeRuns,
    approvals,
    taskStatus,
    signalTimeline,
    pending,
    controls,
    chatModeCache,
  } = deps;
  const normalizedContent = normalizeFeishuCommandContent(deps.msg.content);
  const msg = normalizedContent === deps.msg.content
    ? deps.msg
    : { ...deps.msg, content: normalizedContent };
  const preview = msg.content.length > 80 ? `${msg.content.slice(0, 80)}…` : msg.content;
  if (msg.raw !== undefined) {
    const rawValidation = validateFeishuRawInboundEvent(msg.raw);
    if (!rawValidation.ok) {
      log.warn('intake', 'raw-event-contract-fail', {
        failures: rawValidation.failures,
      });
    }
  }
  // Resolve scope (and underlying chat mode) once at intake — every
  // downstream consumer keys off these.
  const chatMode = await chatModeCache.resolve(channel, msg.chatId);
  const scope = chatMode === 'topic' && msg.threadId
    ? `${msg.chatId}:${msg.threadId}`
    : msg.chatId;
  log.info('intake', 'enter', {
    scope,
    chatType: msg.chatType,
    chatMode,
    sender: msg.senderId,
    preview,
    resources: msg.resources.length,
  });

  // Access control. Silent drop — replying would reveal the bot to
  // unauthorized users and let them spam the chat with denial messages.
  // Operator-defined lists; both empty = allow all (back-compat).
  if (!isUserAllowed(controls.cfg, msg.senderId)) {
    log.info('intake', 'skip-not-allowed-user', {
      scope,
      sender: msg.senderId.slice(-6),
    });
    return;
  }
  // `allowedChats` is intentionally a group-only gate. p2p chat_ids are
  // generated per-user-pair and can't be hijacked by an unauthorized
  // sender, so the user allowlist above is already authoritative for DMs.
  // Restricting p2p by chat_id would also create a chicken-and-egg lockout
  // hazard (the operator must know the chat_id before they ever DM the bot).
  if (msg.chatType !== 'p2p' && !isChatAllowed(controls.cfg, msg.chatId)) {
    log.info('intake', 'skip-not-allowed-chat', {
      scope,
      chatId: msg.chatId.slice(-6),
    });
    return;
  }

  // Group-mention policy. p2p is always unrestricted; in groups (regular and
  // topic) we drop messages that don't @bot when the user has opted into the
  // quiet-by-default behavior. Slash commands are NOT exempt — the user
  // chose strict mode so the group stays uniformly quiet unless mentioned.
  // @全员 is already filtered by SDK (`respondToMentionAll: false`), so any
  // event reaching here is either targeted or undirected chatter.
  if (
    msg.chatType !== 'p2p' &&
    getRequireMentionInGroup(controls.cfg) &&
    !msg.mentionedBot
  ) {
    log.info('intake', 'skip-no-mention', { scope, chatType: msg.chatType });
    return;
  }

  const handled = await tryHandleCommand({
    channel,
    msg,
    scope,
    chatMode,
    sessions,
    workspaces,
    agent,
    activeRuns,
    approvals,
    taskStatus,
    signalTimeline,
    controls,
  });
  if (handled) {
    const dropped = pending.cancel(scope);
    log.info('intake', 'command', { scope, droppedPending: dropped.length });
    return;
  }

  const size = pending.push(scope, msg);
  log.info('intake', 'queued', { scope, queueSize: size, debounceMs: DEBOUNCE_MS });
}

interface RunBatchDeps {
  channel: LarkChannel;
  agent: AgentAdapter;
  sessions: SessionStore;
  workspaces: WorkspaceStore;
  activeRuns: ActiveRuns;
  approvals: TaskApprovalStore;
  taskStatus: TaskStatusStore;
  signalTimeline: SignalTimelineStore;
  media: MediaCache;
  batch: NormalizedMessage[];
  controls: Controls;
  scope: string;
  mode: ChatMode;
  getRuntimeServicesContext: () => Promise<RuntimeServicesPortContext | undefined>;
  getStatelessIntentJudge: () => Promise<StatelessIntentJudge | undefined>;
  gatewayModeDegradeNotices: Set<string>;
}

async function settleApprovalCard(
  channel: LarkChannel,
  messageId: string,
  approval: PendingApproval,
  action: ApprovalDecisionAction,
): Promise<void> {
  if (!isManaged(messageId)) return;
  try {
    await updateManagedCard(channel, messageId, taskApprovalDecisionCard(approval, action));
  } catch (err) {
    log.warn('approval', 'card-update-failed', {
      approvalId: approval.id,
      action,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function runAgentBatch(deps: RunBatchDeps): Promise<void> {
  const {
    channel,
    agent,
    sessions,
    workspaces,
    activeRuns,
    approvals,
    taskStatus,
    signalTimeline,
    media,
    batch,
    controls,
    scope,
    mode,
    getRuntimeServicesContext,
    getStatelessIntentJudge,
    gatewayModeDegradeNotices,
  } = deps;
  if (batch.length === 0) return;
  const firstMsg = batch[0];
  const lastMsg = batch[batch.length - 1];
  if (!firstMsg || !lastMsg) return;

  const chatId = firstMsg.chatId;
  const threadId = firstMsg.threadId;

  // For topic groups: thread replies so they land in the same topic as the
  // user's message. Otherwise the SDK posts at top level.
  const sendOpts = withReplyMentions({
    sendOpts: {
      replyTo: lastMsg.messageId,
      ...(mode === 'topic' && threadId ? { replyInThread: true } : {}),
    },
    batch,
    botOpenId: channel.botIdentity?.openId,
  });

  let prompt: string;
  let cwd: string;
  let resumeFrom: string | undefined;
  let taskText: string;
  let model: string | undefined;
  let replyModeOverride: ReturnType<typeof getMessageReplyMode> | undefined;
  let answerCardPresentationRequested = false;
  let answerCardPresentationMode: 'default' | 'dynamic_ui' = 'default';
  let answerCardPresentationUserText = '';
  let agentProfileId: string | undefined;
  let agentRuntimeSessionKey = agent.id;
  let runtimeServicesContextForTurn: RuntimeServicesPortContext | undefined;
  let runtimeServicesContextLoaded = false;
  const getRuntimeServicesContextForTurn = async (): Promise<RuntimeServicesPortContext | undefined> => {
    if (!runtimeServicesContextLoaded) {
      runtimeServicesContextForTurn = await getRuntimeServicesContext();
      runtimeServicesContextLoaded = true;
    }
    return runtimeServicesContextForTurn;
  };
  const turnTraceEnabled = getTurnTraceEnabled(controls.cfg);
  const traceRuntimeContext = turnTraceEnabled
    ? await getRuntimeServicesContextForTurn()
    : undefined;
  const turnTraceArtifactNamespace = getTurnTraceArtifactNamespace(controls.cfg);
  const turnTrace = createTurnTraceRecorder({
    enabled: turnTraceEnabled,
    scope,
    chatId,
    previousArtifactId: sessions.getTurnTraceArtifactId(scope),
    runtime: traceRuntimeContext?.runtime,
    resources: traceRuntimeContext?.resources ?? [],
    artifactNamespace: turnTraceArtifactNamespace,
  });
  turnTrace.record('message_received', {
    messageIds: batch.map((m) => m.messageId),
    batchSize: batch.length,
    chatId,
    chatMode: mode,
    threadId: threadId ?? null,
    senderId: firstMsg.senderId,
    contentPreview: lastMsg.content.slice(0, 500),
    feishuMetadata: renderFeishuMessageMetadataBlock(batch) || null,
    resourceCount: batch.reduce((sum, item) => sum + item.resources.length, 0),
  });
  const flushTurnTrace = async (): Promise<void> => {
    try {
      const result = await turnTrace.flush();
      if (result.status === 'stored') {
        sessions.setTurnTraceArtifactId(scope, result.artifactId);
        log.info('turn-trace', 'stored', {
          scope,
          artifactId: result.artifactId,
          namespace: turnTraceArtifactNamespace,
        });
      } else if (result.status === 'failed') {
        log.warn('turn-trace', 'store-failed', {
          scope,
          message: result.message,
        });
      }
    } catch (err) {
      log.warn('turn-trace', 'flush-failed', {
        scope,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  };
  const requestedGatewayMode = sessions.getGatewayMode(scope) ?? getGatewayMode(controls.cfg);
  const gatewayModeResolution = requestedGatewayMode === 'adapter'
    ? resolveEffectiveGatewayMode({
        requestedMode: requestedGatewayMode,
        resources: (await getRuntimeServicesContextForTurn())?.resources ?? [],
      })
    : resolveEffectiveGatewayMode({
        requestedMode: requestedGatewayMode,
        resources: [],
      });
  if (gatewayModeResolution.degraded) {
    await notifyGatewayModeDegraded({
      channel,
      chatId,
      scope,
      reason: gatewayModeResolution.reason ?? 'Runtime Services adapter resources are unavailable',
      sendOpts,
      notices: gatewayModeDegradeNotices,
    });
  }
  const gatewayMode = gatewayModeResolution.mode;
  const relayMode = gatewayMode === 'relay';
  const sessionContextVersion = agentSessionContextVersion(gatewayMode);
  turnTrace.record('gateway_resolved', {
    requestedGatewayMode,
    gatewayMode,
    degraded: gatewayModeResolution.degraded,
    reason: gatewayModeResolution.reason ?? null,
    sessionContextVersion,
  });

  const decision = parseApprovalDecision(lastMsg.content);
  if (decision) {
    const pendingApproval = approvals.get(decision.approvalId);
    const approvalInScope = pendingApproval?.scope === scope ? pendingApproval : undefined;
    const approval = decision.action === 'execute'
      ? approvalInScope && approvals.consume(decision.approvalId)
      : approvalInScope;
    if (!approval) {
      turnTrace.record('approval_missing', {
        approvalId: decision.approvalId,
        action: decision.action,
        scopeMatch: Boolean(approvalInScope),
      });
      await sendReplyMarkdown(channel, chatId, '这张审批卡片已过期或已处理。', sendOpts);
      await flushTurnTrace();
      return;
    }
    await settleApprovalCard(channel, lastMsg.messageId, approval, decision.action);
    if (decision.action === 'modify') {
      approvals.cancel(decision.approvalId);
      taskStatus.finish(scope, 'cancelled');
      turnTrace.record('approval_cancelled', {
        approvalId: decision.approvalId,
        action: decision.action,
      });
      await sendReplyMarkdown(
        channel,
        chatId,
        '已取消原审批。请直接发送修改后的任务内容，我会重新生成执行审批卡片。',
        sendOpts,
      );
      await flushTurnTrace();
      return;
    }
    if (decision.action === 'cancel') {
      approvals.cancel(decision.approvalId);
      taskStatus.finish(scope, 'cancelled');
      turnTrace.record('approval_cancelled', {
        approvalId: decision.approvalId,
        action: decision.action,
      });
      await sendReplyMarkdown(channel, chatId, '已停止，未执行 Codex。', sendOpts);
      await flushTurnTrace();
      return;
    }
    prompt = approval.prompt;
    cwd = approval.cwd;
    resumeFrom = approval.sessionId;
    taskText = approval.task;
    model = approval.model;
    replyModeOverride = approval.replyMode;
    agentProfileId = approval.agentProfileId ?? getAgentEndpointProfileId(controls.cfg);
    log.info('approval', 'execute', { scope, approvalId: approval.id });
    turnTrace.record('approval_execute', {
      approvalId: approval.id,
      cwd,
      hasResumeSession: Boolean(resumeFrom),
      replyModeOverride: replyModeOverride ?? null,
      agentProfileId,
    });
  } else {
    const resourceItems = batch.flatMap((m) =>
      m.resources.map((r) => ({ messageId: m.messageId, resource: r })),
    );
    const attachments = await media.resolve(chatId, resourceItems);
    if (attachments.length > 0) {
      log.info('media', 'resolved', { count: attachments.length });
    }

    // Collect any reply-quote targets in the batch. Dedup so the same target
    // quoted by multiple messages in one batch only fetches once. Filter out
    // ids that are themselves in the batch — those are already in the prompt.
    const batchIds = new Set(batch.map((m) => m.messageId));
    const quoteTargets = [
      ...new Set(
        batch
          .map((m) => m.replyToMessageId)
          .filter((id): id is string => Boolean(id) && !batchIds.has(id!)),
      ),
    ];
    const quotes: QuotedContext[] = [];
    for (const targetId of quoteTargets) {
      const q = await fetchQuotedContext(channel, targetId);
      if (q) {
        quotes.push(q);
        log.info('quote', 'fetched', {
          messageId: targetId,
          type: q.rawContentType,
          contentChars: q.content.length,
        });
      }
    }

    const userText = buildFeishuUserText(batch, attachments);
    const policy = decideRunPolicy(controls.cfg, userText);
    const promptPlan = await buildFeishuPromptPlan({
      batch,
      attachments,
      quotes,
      userTextOverride: policy.prompt,
      hasPriorContext: Boolean(sessions.getRaw(scope)) || quotes.length > 0,
      gatewayMode,
      intentJudge: relayMode ? undefined : await getStatelessIntentJudge(),
      replyMentionTargets: getReplyMentionTargets(controls.cfg),
    });
    prompt = promptPlan.prompt;
    taskText = policy.taskText || summarizeTask(batch);
    model = policy.model;
    const intentReplyMode = relayMode
      ? undefined
      : replyModeForInteractionIntent({
          intent: promptPlan.intent,
          userText: promptPlan.userText,
        });
    replyModeOverride =
      policy.replyMode ??
      intentReplyMode;
    answerCardPresentationRequested =
      !policy.replyMode &&
      intentReplyMode === 'card' &&
      promptPlan.intent.presentation?.representation === 'interactive_card';
    answerCardPresentationMode =
      promptPlan.intent.presentation?.source === 'dynamic_ui_heuristic' ? 'dynamic_ui' : 'default';
    answerCardPresentationUserText = promptPlan.userText;
    if (replyModeOverride && !policy.replyMode) {
      log.info('presentation', 'reply-mode-hint', {
        scope,
        intent: promptPlan.intent.kind,
        mode: replyModeOverride,
      });
    }
    agentProfileId = getAgentEndpointProfileId(controls.cfg);
    log.info('prompt', 'built', { promptChars: prompt.length, quotes: quotes.length });

    const requestedCwd = workspaces.cwdFor(scope) ?? defaultAgentTaskCwd({ agent, cfg: controls.cfg });
    const cwdPlan = await prepareAgentProfileRunPlan({
      profileId: agentProfileId,
      runtimeHome: paths.appDir,
      scope,
      agentRuntimeId: agent.id,
      run: {
        prompt,
        cwd: requestedCwd,
        model,
        stopGraceMs: getAgentStopGraceMs(controls.cfg),
      },
    });
    cwd = cwdPlan.run.cwd ?? requestedCwd;
    agentProfileId = cwdPlan.profile.id;
    agentRuntimeSessionKey = cwdPlan.agentRuntimeId;
    if (cwdPlan.notes.length > 0) {
      log.info('agent-profile', 'cwd-policy', {
        scope,
        profile: cwdPlan.profile.id,
        notes: cwdPlan.notes,
      });
    }
    resumeFrom = sessions.resumeFor(
      scope,
      cwd,
      agentRuntimeSessionKey,
      sessionContextVersion,
    );
    if (resumeFrom) {
      log.info('session', 'resume', {
        sessionId: resumeFrom,
        cwd,
        agentRuntimeId: agentRuntimeSessionKey,
      });
    } else {
      const stale = sessions.getRaw(scope);
      if (stale && stale.cwd !== cwd) {
        log.info('session', 'stale-cleared', { staleCwd: stale.cwd, newCwd: cwd });
        sessions.clear(scope);
      } else if (stale?.agentRuntimeId && stale.agentRuntimeId !== agentRuntimeSessionKey) {
        log.info('session', 'stale-runtime-cleared', {
          staleRuntime: stale.agentRuntimeId,
          newRuntime: agentRuntimeSessionKey,
        });
        sessions.clear(scope);
      } else if (stale?.sessionId && stale.contextVersion !== sessionContextVersion) {
        log.info('session', 'stale-context-cleared', {
          staleContextVersion: stale.contextVersion,
          newContextVersion: sessionContextVersion,
        });
        sessions.clear(scope);
      } else {
        log.info('session', 'fresh', { cwd, agentRuntimeId: agentRuntimeSessionKey });
      }
    }
    turnTrace.record('turn_planned', {
      taskText,
      promptChars: prompt.length,
      cwd,
      model: model ?? null,
      agentProfileId,
      agentRuntimeId: agentRuntimeSessionKey,
      sessionContextVersion,
      hasResumeSession: Boolean(resumeFrom),
      replyModeOverride: replyModeOverride ?? null,
      approvalPolicy: policy.approval,
      policySource: policy.source,
    });

    const approval = approvals.create({
      scope,
      chatId,
      messageId: lastMsg.messageId,
      threadId,
      prompt,
      task: taskText,
      cwd,
      sessionId: resumeFrom,
      model,
      replyMode: replyModeOverride,
      agentProfileId,
    });

    // 是否需要审批由策略统一决定：命令前缀、模型、配置都在 decideRunPolicy 中处理。
    if (policy.approval !== 'required') {
      // 直接落入下方常规执行分支：把审批信息直接 consume 掉，
      // 仅复用 prompt/cwd/session/task 这几个解算结果。
      approvals.cancel(approval.id);
      log.info('approval', 'skipped', { scope, reason: 'auto-run', policy: policy.source });
    } else {
      taskStatus.markPending(scope, { task: taskText, cwd });
      await sendManagedCard(channel, chatId, taskApprovalCard(approval), lastMsg.messageId);
      log.info('approval', 'created', { scope, approvalId: approval.id });
      turnTrace.record('approval_required', {
        approvalId: approval.id,
        cwd,
        model: model ?? null,
      });
      await flushTurnTrace();
      return;
    }
  }

  const runPlan = await prepareAgentProfileRunPlan({
    profileId: agentProfileId,
    runtimeHome: paths.appDir,
    scope,
    agentRuntimeId: agent.id,
    run: {
      prompt: relayMode
        ? withRelayPlainTextTemplate(prompt, { channel: 'feishu' })
        : withInteractionProtocol(prompt, { channel: 'feishu' }),
      sessionId: resumeFrom,
      cwd,
      model,
      stopGraceMs: getAgentStopGraceMs(controls.cfg),
    },
  });
  agentProfileId = runPlan.profile.id;
  agentRuntimeSessionKey = runPlan.agentRuntimeId;
  if (runPlan.notes.length > 0) {
    log.info('agent-profile', 'run-policy', {
      scope,
      profile: runPlan.profile.id,
      notes: runPlan.notes,
    });
  }
  cwd = runPlan.run.cwd ?? cwd;
  resumeFrom = runPlan.run.sessionId;
  turnTrace.record('run_planned', {
    promptChars: runPlan.run.prompt.length,
    cwd,
    model: runPlan.run.model ?? null,
    hasResumeSession: Boolean(resumeFrom),
    agentProfileId,
    agentRuntimeId: agentRuntimeSessionKey,
    gatewayMode,
    sessionContextVersion,
    stopGraceMs: runPlan.run.stopGraceMs ?? null,
  });

  const run = agent.run(runPlan.run);
  const handle = activeRuns.register(scope, run);
  taskStatus.markRunning(scope, { task: taskText, cwd, pid: run.pid });
  signalTimeline.append(scope, {
    kind: 'progress',
    title: 'Agent runtime 已启动',
    summary: taskText,
    severity: 'info',
    cwd,
    pid: run.pid,
  });

  // Resolve idle-timeout for this run: scope override (on SessionEntry) wins
  // over global default (preferences). 0 / undefined = no watchdog.
  const scopeOverride = sessions.getIdleTimeoutMinutes(scope);
  const idleTimeoutMs =
    scopeOverride !== undefined
      ? scopeOverride > 0
        ? scopeOverride * 60_000
        : undefined
      : getRunIdleTimeoutMs(controls.cfg);
  if (idleTimeoutMs) {
    log.info('flush', 'idle-watchdog', { idleTimeoutMs });
  }

  const replyMode = replyModeOverride ?? getMessageReplyMode(controls.cfg);
  log.info('flush', 'reply-mode', { mode: replyMode, override: Boolean(replyModeOverride) });
  turnTrace.record('run_started', {
    pid: run.pid,
    replyMode,
    cwd,
    agentProfileId,
    agentRuntimeId: agentRuntimeSessionKey,
    hasResumeSession: Boolean(resumeFrom),
  });

  // Re-read prefs on every flush so toggling /config mid-stream takes
  // effect immediately. Cheap object lookups, no allocation when on.
  const filterForPrefs = (state: RunState): RunState => {
    if (getShowToolCalls(controls.cfg)) return state;
    return { ...state, blocks: state.blocks.filter((b) => b.kind !== 'tool') };
  };
  const finishTask = (lifecycle: Exclude<TaskLifecycle, 'pending_approval' | 'running'>): void => {
    if (!taskStatus.snapshot(scope)) return;
    taskStatus.finish(scope, lifecycle);
    signalTimeline.append(scope, {
      kind: 'final_result',
      title: 'Agent runtime 任务结束',
      summary: `状态：${lifecycle}`,
      severity: lifecycle === 'error' ? 'danger' : lifecycle === 'done' ? 'info' : 'warning',
      lifecycle,
      cwd,
    });
  };
  const finishRun = (state: RunState): void => {
    const lifecycle = lifecycleForTerminal(state.terminal);
    finishTask(lifecycle);
    const visible = filterForPrefs(state);
    turnTrace.record('run_finished', {
      terminal: state.terminal,
      lifecycle,
      footer: visible.footer,
      blockCount: visible.blocks.length,
      reasoningChars: visible.reasoning.content.length,
      textChars: renderText(visible).length,
    });
  };

  // For non-card modes the agent runtime output doesn't surface visually until either
  // a first streamed token (markdown mode) or the whole run ends (text mode).
  // Add a "Typing" reaction to the triggering message as an instant ack;
  // remove it in finally. Card mode has a visible "正在思考…" footer the
  // moment the initial card lands, so the extra reaction would be redundant.
  const reactionId =
    replyMode === 'card' ? undefined : await addWorkingReaction(channel, lastMsg.messageId);

  // 判断是否“恢复旧会话失败但未产出任何内容”——这种情况下尝试一次降级到
  // 新会话再跑（agent runtime 偶尔会因为 session 内部状态损坏，resume 后立即 exit 1）。
  const isResumeFailureWithoutOutput = (state: RunState, hadResume: boolean): boolean => {
    if (!hadResume) return false;
    if (state.terminal !== 'error') return false;
    return state.blocks.length === 0 && !state.reasoning.content;
  };
  let feishuDeliverySupportOptions: Promise<FeishuDeliverySupportOptions> | undefined;
  const getFeishuDeliverySupportOptions = (): Promise<FeishuDeliverySupportOptions> => {
    feishuDeliverySupportOptions ??= buildFeishuDeliverySupportOptions(
      controls.cfg,
      getRuntimeServicesContext,
    );
    return feishuDeliverySupportOptions;
  };
  const deliverSignal = async (signal: AgentSignal): Promise<void> => {
    const rendered: FeishuRenderedSignalWithSupport = relayMode
      ? renderFeishuSignal(signal)
      : await applyFeishuDeliverySupport(renderFeishuSignal(signal), {
          ...(await getFeishuDeliverySupportOptions()),
          onError: (err) => {
            log.warn('signal', 'delivery-support-failed', {
              scope,
              kind: signal.kind,
              err: err instanceof Error ? err.message : String(err),
            });
          },
        });
    log.info('signal', 'deliver', {
      scope,
      kind: signal.kind,
      representation: rendered.plan.representation.id,
      carrier: rendered.plan.carrier.id,
      support: rendered.supportOutcome?.status,
      resource: rendered.supportOutcome?.status === 'ready'
        ? rendered.supportOutcome.usedResourceId
        : undefined,
    });
    await sendFeishuSignalInputs(
      {
        async send(to, input, options) {
          if ('markdown' in input) {
            return sendReplyMarkdown(channel, to, input.markdown, options ?? {});
          }
          const { mentions: _mentions, ...sendOptions } = options ?? {};
          return channel.send(to, input, sendOptions);
        },
      },
      chatId,
      feishuSendInputsForRenderedSignal(rendered),
      sendOpts,
      (err, input) => {
        log.warn('signal', 'support-payload-send-failed', {
          scope,
          kind: signal.kind,
          payload: Object.keys(input)[0] ?? 'unknown',
          err: err instanceof Error ? err.message : String(err),
        });
      },
    );
    if (shouldNotifyMac(signal)) {
      void sendMacNotification(signal).catch((err) => {
        log.warn('signal', 'mac-notify-failed', {
          scope,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }
  };

  // 把单次执行抽出来：返回 final RunState，外层根据 state 决定是否重试。
  const runOnceWithStream = async (
    runHandle: RunHandle,
    onState: (state: RunState) => Promise<void>,
  ): Promise<RunState> => {
    return processAgentStream(
      runHandle,
      sessions,
      scope,
      cwd,
      agentRuntimeSessionKey,
      sessionContextVersion,
      idleTimeoutMs,
      onState,
      {
        onSignal: async (signal) => {
          signalTimeline.append(scope, signal);
          log.info('signal', 'record', { scope, kind: signal.kind, title: signal.title });
          turnTrace.record('signal_recorded', {
            kind: signal.kind,
            title: signal.title,
            severity: signal.severity,
          });
          await deliverSignal(signal);
        },
        onInteraction: async (request) => {
          const signal = interactionRequestToSignal(request);
          signalTimeline.append(scope, signal);
          turnTrace.record('interaction_request', {
            id: request.id,
            kind: request.kind,
          });
          await deliverSignal(signal);
        },
      },
    );
  };

  try {
    let finalState: RunState = initialState;
    let resumedThisTry = Boolean(resumeFrom);

    const runStreaming = async (
      onState: (state: RunState) => Promise<void>,
    ): Promise<void> => {
      finalState = await runOnceWithStream(handle, onState);

      if (isResumeFailureWithoutOutput(finalState, resumedThisTry)) {
        log.warn('agent', 'resume-failed-fallback', {
          scope,
          previousSessionId: resumeFrom,
          reason: finalState.errorMsg,
        });
        sessions.clear(scope);
        activeRuns.unregister(scope, run);
        // 用全新会话再跑一次。
        const fallbackPlan = await prepareAgentProfileRunPlan({
          profileId: agentProfileId,
          runtimeHome: paths.appDir,
          scope,
          agentRuntimeId: agent.id,
          run: {
            ...runPlan.run,
            sessionId: undefined,
          },
        });
        const fallback = agent.run(fallbackPlan.run);
        const fallbackHandle = activeRuns.register(scope, fallback);
        taskStatus.markRunning(scope, { task: taskText, cwd, pid: fallback.pid });
        signalTimeline.append(scope, {
          kind: 'progress',
          title: 'Agent runtime 已重试新会话',
          summary: taskText,
          severity: 'warning',
          cwd,
          pid: fallback.pid,
        });
        turnTrace.record('run_retry_without_resume', {
          previousSessionId: resumeFrom ?? null,
          reason: finalState.errorMsg ?? null,
          pid: fallback.pid,
        });
        resumedThisTry = false;
        finalState = await runOnceWithStream(fallbackHandle, onState);
        activeRuns.unregister(scope, fallback);
      }
    };

    if (replyMode === 'card') {
      await channel.stream(
        chatId,
        {
          card: {
            initial: renderCard(initialState),
            producer: async (ctrl) => {
              await runStreaming(async (state) => {
                const visible = filterForPrefs(state);
                taskStatus.updateFromRunState(scope, visible);
                await ctrl.update(
                  answerCardPresentationRequested && visible.terminal !== 'running'
                    ? renderPresentationCard(
                        presentAnswerCard(visible, {
                          mode: answerCardPresentationMode,
                          userText: answerCardPresentationUserText,
                        }),
                      )
                    : renderCard(visible),
                );
              });
              finishRun(finalState);
              if (answerCardPresentationRequested) {
                await ctrl.update(
                  renderPresentationCard(
                    presentAnswerCard(filterForPrefs(finalState), {
                      mode: answerCardPresentationMode,
                      userText: answerCardPresentationUserText,
                    }),
                  ),
                );
              }
            },
          },
        },
        sendOpts,
      );
    } else if (replyMode === 'markdown') {
      await channel.stream(
        chatId,
        {
          markdown: async (ctrl) => {
            await runStreaming(async (state) => {
              const visible = filterForPrefs(state);
              taskStatus.updateFromRunState(scope, visible);
              await ctrl.setContent(formatFeishuFinalMarkdown(renderText(visible)));
            });
            finishRun(finalState);
            const visibleFinalState = filterForPrefs(finalState);
            const renderedText = formatFeishuFinalMarkdown(renderText(visibleFinalState));
            await persistFeishuReplyDebug({
              appDir: paths.appDir,
              scope,
              chatId,
              replyMode,
              state: visibleFinalState,
              renderedText,
              payload: { markdown: renderedText },
            });
          },
        },
        sendOpts,
      );
    } else {
      // text mode: drain the agent stream without sending anything during
      // the run, then post the final rendered text once as a plain markdown
      // (msg_type=post) message — no card, no streaming, no typewriter.
      await runStreaming(async (state) => {
        finalState = state;
        taskStatus.updateFromRunState(scope, filterForPrefs(state));
      });
      finishRun(finalState);
      const visibleFinalState = filterForPrefs(finalState);
      const body = formatFeishuFinalMarkdown(renderText(visibleFinalState));
      if (body.trim()) {
        const finalSendOpts = withReplyMentions({
          sendOpts,
          body,
          batch,
          botOpenId: channel.botIdentity?.openId,
          replyMentionTargets: getReplyMentionTargets(controls.cfg),
        });
        const plannedReply = planReplyMarkdown(body, finalSendOpts);
        await persistFeishuReplyDebug({
          appDir: paths.appDir,
          scope,
          chatId,
          replyMode,
          state: visibleFinalState,
          renderedText: body,
          payload: { ...plannedReply.input, sendOptions: plannedReply.sendOpts },
        });
        await channel.send(chatId, plannedReply.input, plannedReply.sendOpts);
      }
    }
  } catch (err) {
    turnTrace.record('run_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    finishTask('error');
    log.fail('stream', err);
  } finally {
    activeRuns.unregister(scope, run);
    if (reactionId) {
      await removeReaction(channel, lastMsg.messageId, reactionId);
    }
    await flushTurnTrace();
  }
}

function rawTextFromRunState(state: RunState): string {
  return state.blocks
    .filter((block) => block.kind === 'text')
    .map((block) => block.content)
    .join('\n\n');
}

async function persistFeishuReplyDebug(input: {
  appDir: string;
  scope: string;
  chatId: string;
  replyMode: string;
  state: RunState;
  renderedText: string;
  payload: unknown;
}): Promise<void> {
  try {
    const path = await writeFeishuReplyDebugRecord({
      appDir: input.appDir,
      scope: input.scope,
      chatId: input.chatId,
      replyMode: input.replyMode,
      rawText: rawTextFromRunState(input.state),
      renderedText: input.renderedText,
      payload: input.payload,
    });
    log.info('reply-debug', 'saved', { path });
  } catch (err) {
    log.warn('reply-debug', 'save-failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Drive the agent's event stream into a stateful RunState, calling `flush`
 * on every state transition. Used by both card and markdown reply modes —
 * the only difference between the two is what `flush` does with the state.
 */
async function processAgentStream(
  handle: RunHandle,
  sessions: SessionStore,
  scope: string,
  cwd: string,
  agentRuntimeId: string,
  sessionContextVersion: string,
  idleTimeoutMs: number | undefined,
  flush: (state: RunState) => Promise<void>,
  options: {
    onInteraction?: (request: InteractionRequest) => Promise<void>;
    onSignal?: (signal: AgentSignal) => Promise<void>;
  } = {},
): Promise<RunState> {
  let state: RunState = initialState;

  // Idle watchdog: Codex going silent for `idleTimeoutMs` is treated as
  // "presumed hung", we stop() and surface a timeout marker on the card.
  //
  // BUT — Codex can legitimately be silent for a long time when it's
  // waiting on a long-running tool call (e.g. `lark-cli` printing an
  // OAuth URL and blocking until the user clicks authorize). In that
  // case there's no event stream activity from Codex itself, only the
  // tool subprocess running. We track which tool_use ids haven't matched
  // a tool_result yet, and pause the watchdog whenever the set is
  // non-empty.
  //
  // The watchdog re-arms when:
  //  - a tool_result drains the in-flight set to zero, OR
  //  - any non-tool event arrives while the set is empty.
  let idleFired = false;
  let timer: NodeJS.Timeout | undefined;
  const inFlightTools = new Map<string, { name: string; input: unknown }>();
  const sentInteractions = new Set<string>();
  const emitInteraction = async (request: InteractionRequest): Promise<void> => {
    if (!options.onInteraction || sentInteractions.has(request.id)) return;
    sentInteractions.add(request.id);
    await options.onInteraction(request);
  };
  const armOrPauseIdle = (): void => {
    if (!idleTimeoutMs) return;
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (inFlightTools.size > 0) return;
    timer = setTimeout(() => {
      idleFired = true;
      handle.interrupted = true;
      log.warn('agent', 'idle-timeout', { scope, idleTimeoutMs });
      void handle.run.stop().catch(() => {
        /* stop errors are non-fatal */
      });
    }, idleTimeoutMs);
  };
  armOrPauseIdle();

  try {
    for await (const evt of handle.run.events) {
      if (handle.interrupted) break;

      // Track tool flight before re-arming the idle timer so the arm step
      // sees the correct set size. tool_use opens a window; tool_result
      // closes it. Other event types are bookkept after the if/else.
      let effectiveEvt = evt;

      if (effectiveEvt.type === 'tool_use') {
        const risk = assessToolRisk(effectiveEvt.name, effectiveEvt.input);
        if (risk) {
          log.warn('agent', 'tool-risk', {
            scope,
            tool: effectiveEvt.name,
            risk: risk.risk,
          });
          await emitInteraction(risk);
        }
      }

      if (effectiveEvt.type === 'text') {
        for (const req of extractInteractionRequests(effectiveEvt.delta)) {
          log.info('interaction', 'request', { scope, id: req.id, kind: req.kind });
          await emitInteraction(req);
        }
        const visible = stripInteractionBlocks(effectiveEvt.delta);
        if (!visible) continue;
        effectiveEvt = { ...effectiveEvt, delta: visible };
      } else if (effectiveEvt.type === 'text_replace') {
        for (const req of extractInteractionRequests(effectiveEvt.text)) {
          log.info('interaction', 'request', { scope, id: req.id, kind: req.kind });
          await emitInteraction(req);
        }
        const visible = stripInteractionBlocks(effectiveEvt.text);
        if (!visible) continue;
        effectiveEvt = { ...effectiveEvt, text: visible };
      }

      if (effectiveEvt.type === 'tool_use') {
        inFlightTools.set(effectiveEvt.id, {
          name: effectiveEvt.name,
          input: effectiveEvt.input,
        });
        log.info('agent', 'tool-in-flight', {
          tool: effectiveEvt.name,
          inFlight: inFlightTools.size,
        });
      } else if (effectiveEvt.type === 'tool_result') {
        const tool = inFlightTools.get(effectiveEvt.id);
        if (tool && options.onSignal) {
          const signals = extractToolResultSignals({
            id: effectiveEvt.id,
            name: tool.name,
            input: tool.input,
            output: effectiveEvt.output,
            isError: effectiveEvt.isError,
          });
          for (const signal of signals) {
            await options.onSignal(signal);
          }
        }
        inFlightTools.delete(effectiveEvt.id);
        log.info('agent', 'tool-done', { inFlight: inFlightTools.size });
      }
      armOrPauseIdle();

      if (effectiveEvt.type === 'system') {
        if (effectiveEvt.sessionId) {
          const effectiveCwd = effectiveEvt.cwd ?? cwd;
          sessions.set(
            scope,
            effectiveEvt.sessionId,
            effectiveCwd,
            agentRuntimeId,
            sessionContextVersion,
          );
          log.info('session', 'set', { sessionId: effectiveEvt.sessionId });
        }
        continue;
      }
      if (effectiveEvt.type === 'usage') {
        if (effectiveEvt.costUsd !== undefined) {
          log.info('agent', 'usage', { costUsd: Number(effectiveEvt.costUsd.toFixed(4)) });
        }
        continue;
      }

      const prevTerminal = state.terminal;
      const prevFooter = state.footer;
      state = reduce(state, effectiveEvt);
      if (state.footer !== prevFooter || state.terminal !== prevTerminal) {
        log.info('card', 'transition', { footer: state.footer, terminal: state.terminal });
      }
      await flush(state);
      // Stop iterating as soon as we have a terminal state. Some Codex
      // versions don't close stdout immediately after the result event, which
      // would leave the for-await waiting forever otherwise.
      if (state.terminal !== 'running') break;
    }
  } finally {
    if (timer) clearTimeout(timer);
  }

  // If state already reached a terminal event (done/error/etc.) before the
  // watchdog or interrupt could land, don't clobber it — that real terminal
  // wins. This avoids "Codex finished but flush was slow → timer fired
  // mid-flush → user sees 'idle_timeout' on a successful run".
  if (state.terminal === 'running') {
    if (idleFired) {
      state = markIdleTimeout(state, Math.round(idleTimeoutMs! / 60_000));
    } else if (handle.interrupted) {
      state = markInterrupted(state);
    } else {
      state = finalizeIfRunning(state);
    }
  }
  log.info('card', 'final', { terminal: state.terminal, interrupted: handle.interrupted });
  await flush(state);
    // Reap the subprocess. Two regimes:
  //  - Interrupted (user /stop, idle watchdog, disconnect): stop() was already
  //    fire-and-forgotten by whoever set handle.interrupted; this awaits it.
  //  - Natural done: stream-json emits `result` ~1ms before Codex actually
  //    closes stdout (telemetry flush). Wait it out so the run exits with
  //    code 0; only SIGTERM as a hung-process safety net.
  if (handle.interrupted) {
    await handle.run.stop();
  } else {
    const exited = await handle.run.waitForExit(POST_DONE_EXIT_GRACE_MS);
    if (!exited) {
      log.warn('agent', 'post-done-timeout', { graceMs: POST_DONE_EXIT_GRACE_MS });
      await handle.run.stop();
    }
  }
  return state;
}

async function buildFeishuDeliverySupportOptions(
  cfg: AppConfig,
  getRuntimeServicesContext: () => Promise<RuntimeServicesPortContext | undefined> = () =>
    createRuntimeServicesPortContext(),
): Promise<FeishuDeliverySupportOptions> {
  const context = await getRuntimeServicesContext();
  if (!context) {
    return {
      resources: [],
      storage: cfg.runtimeServices,
    };
  }
  return {
    resources: context.resources,
    runtime: context.runtime,
    storage: cfg.runtimeServices,
  };
}

/**
 * How long to wait for Codex to close stdout after a terminal event before
 * forcing a SIGTERM. Empirically Codex's post-`result` tail is well under a
 * second; 2s leaves headroom for slow flushes without making the user notice
 * a stall (the card has already rendered terminal state by this point).
 */
const POST_DONE_EXIT_GRACE_MS = 2000;

function lifecycleForTerminal(terminal: RunState['terminal']): Exclude<TaskLifecycle, 'pending_approval' | 'running'> {
  switch (terminal) {
    case 'interrupted':
      return 'interrupted';
    case 'idle_timeout':
      return 'idle_timeout';
    case 'error':
      return 'error';
    case 'done':
    case 'running':
      return 'done';
  }
}

function summarizeTask(batch: NormalizedMessage[]): string {
  const text = batch
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/\s+/g, ' ')
    .trim();
  if (text) return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  const resources = batch.reduce((sum, m) => sum + m.resources.length, 0);
  return resources > 0 ? `处理 ${resources} 个附件` : '飞书任务';
}

async function buildStatelessIntentJudge(
  getRuntimeServicesContext: () => Promise<RuntimeServicesPortContext | undefined>,
): Promise<StatelessIntentJudge | undefined> {
  const context = await getRuntimeServicesContext();
  if (!context || !hasAvailableRuntimeResource(context.resources, RUNTIME_RESOURCE_IDS.languageCompletion)) return undefined;
  return createBridgeStatelessIntentJudge({
    runtime: context.runtime,
  });
}

async function notifyGatewayModeDegraded(input: {
  channel: LarkChannel;
  chatId: string;
  scope: string;
  reason: string;
  sendOpts: SendOptions;
  notices: Set<string>;
}): Promise<void> {
  const key = `${input.scope}:adapter-to-relay`;
  if (input.notices.has(key)) return;
  input.notices.add(key);
  await sendReplyMarkdown(
    input.channel,
    input.chatId,
    [
      '当前会话 gatewayMode: adapter 已降级为 relay。',
      `原因：${input.reason}。`,
      'Runtime Services 资源可用后，可用 `/gatewayMode adapter` 切回。',
    ].join('\n'),
    input.sendOpts,
  );
}
