import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { NormalizedMessage } from '@larksuiteoapi/node-sdk';
import type { AgentAdapter, AgentRunOptions } from '../agent/types';
import type { AppConfig } from '../config/schema';
import { SessionStore } from '../session/store';
import { WorkspaceStore } from '../workspace/store';
import { startChannel } from './channel';

const larkMock = vi.hoisted(() => {
  const state: {
    handlers?: {
      message?: (msg: NormalizedMessage) => Promise<void>;
    };
    stream: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  } = {
    stream: vi.fn(),
    send: vi.fn(),
  };
  const channel = {
    botIdentity: { name: 'Bridge Bot', openId: 'ou_bot' },
    on: vi.fn((handlers) => {
      state.handlers = handlers;
    }),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getChatMode: vi.fn(async () => 'p2p'),
    getConnectionStatus: vi.fn(() => ({ state: 'connected', reconnectAttempts: 0 })),
    send: state.send,
    stream: state.stream,
    rawClient: {
      im: {
        v1: {
          messageReaction: {
            create: vi.fn(async () => ({ data: { reaction_id: 'reaction_1' } })),
            delete: vi.fn(async () => ({})),
          },
        },
      },
    },
  };
  return { state, channel };
});

const runtimeServicesMock = vi.hoisted(() => ({
  createRuntimeServicesPortContext: vi.fn(),
}));

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Domain: { Feishu: 'feishu', Lark: 'lark' },
  LoggerLevel: { info: 'info' },
  defaultHttpInstance: { defaults: {} },
  createLarkChannel: vi.fn(() => larkMock.channel),
}));

vi.mock('../runtime-services/selector', () => ({
  createRuntimeServicesPortContext: runtimeServicesMock.createRuntimeServicesPortContext,
}));

describe('channel gateway modes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    larkMock.state.handlers = undefined;
    larkMock.state.stream.mockReset();
    larkMock.state.send.mockReset();
    larkMock.channel.connect.mockReset();
    larkMock.channel.connect.mockResolvedValue(undefined);
    larkMock.channel.disconnect.mockReset();
    larkMock.channel.disconnect.mockResolvedValue(undefined);
    runtimeServicesMock.createRuntimeServicesPortContext.mockReset();
    runtimeServicesMock.createRuntimeServicesPortContext.mockResolvedValue(runtimeContext([
      {
        id: 'model.language_completion',
        kind: 'model',
        capability: 'intent',
        purpose: 'test',
        status: 'available',
        operatorAction: 'configure runtime services',
      },
    ]));
    larkMock.state.stream.mockImplementation(async (_chatId: string, payload: { card?: { producer: (ctrl: { update: (card: object) => Promise<void> }) => Promise<void> } }) => {
      if (payload.card) {
        await payload.card.producer({ update: vi.fn(async () => {}) });
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('channel relay mode forwards one user turn to the agent without bridge protocol wrapping', async () => {
    const prompts: string[] = [];
    const bridge = await startChannel({
      cfg: config({
        gatewayMode: 'relay',
        messageReply: 'card',
      }),
      agent: agentCapturingPrompts(prompts),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}.json`)),
      controls: controls(),
    });

    await larkMock.state.handlers?.message?.(message('直接转给 agent'));
    await vi.advanceTimersByTimeAsync(700);

    await vi.waitFor(() => {
      expect(prompts).toHaveLength(1);
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('直接转给 agent');
    expect(prompts[0]).toContain('<plain_text_response_template>');
    expect(prompts[0]).not.toContain('<agent_interaction_protocol>');
    expect(prompts[0]).not.toContain('<presentation_contract>');
    expect(prompts[0]).not.toContain('<bridge_context>');
    expect(prompts[0]).not.toContain('<interaction_intent>');

    await bridge.disconnect();
  });

  test('reports connected and stopped runtime health around the carrier lifecycle', async () => {
    const onHealth = vi.fn(async () => {});
    const bridge = await startChannel({
      cfg: config({ gatewayMode: 'relay', messageReply: 'card' }),
      agent: agentCapturingPrompts([]),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}.json`)),
      controls: controls(),
      onHealth,
    } as Parameters<typeof startChannel>[0] & { onHealth: typeof onHealth });

    expect(onHealth).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'connected' }),
    );

    await bridge.disconnect();

    expect(onHealth).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'stopped' }),
    );
  });

  test('closes a partially initialized carrier when the websocket handshake fails', async () => {
    larkMock.channel.connect.mockRejectedValueOnce(new Error('handshake failed'));
    const onHealth = vi.fn(async () => {});

    await expect(startChannel({
      cfg: config({ gatewayMode: 'relay', messageReply: 'card' }),
      agent: agentCapturingPrompts([]),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}.json`)),
      controls: controls(),
      onHealth,
    } as Parameters<typeof startChannel>[0] & { onHealth: typeof onHealth })).rejects.toThrow(
      'handshake failed',
    );

    expect(larkMock.channel.disconnect).toHaveBeenCalledTimes(1);
    expect(onHealth).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'degraded', issue: 'carrier_connect_failed' }),
    );
  });

  test('default adapter mode visibly degrades to relay when Runtime Services has no adapter resources', async () => {
    runtimeServicesMock.createRuntimeServicesPortContext.mockResolvedValueOnce(runtimeContext([]));
    const prompts: string[] = [];
    const cfg = config({
      messageReply: 'card',
    });
    const bridge = await startChannel({
      cfg,
      agent: agentCapturingPrompts(prompts),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}-degrade.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}-degrade.json`)),
      controls: controls(cfg),
    });

    await larkMock.state.handlers?.message?.(message('没有 runtime services 也要转给 agent'));
    await vi.advanceTimersByTimeAsync(700);

    await vi.waitFor(() => {
      expect(prompts).toHaveLength(1);
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('没有 runtime services 也要转给 agent');
    expect(prompts[0]).toContain('<plain_text_response_template>');
    expect(larkMock.state.send).toHaveBeenCalledWith(
      'oc_123',
      { markdown: expect.stringContaining('adapter 已降级为 relay') },
      expect.objectContaining({ replyTo: expect.any(String) }),
    );

    await bridge.disconnect();
  });

  test('refreshes Runtime Services resources so adapter can recover after a degraded turn', async () => {
    runtimeServicesMock.createRuntimeServicesPortContext
      .mockResolvedValueOnce(runtimeContext([]))
      .mockResolvedValue(runtimeContext([
        {
          id: 'model.language_completion',
          kind: 'model',
          capability: 'intent',
          purpose: 'test',
          status: 'available',
          operatorAction: 'configure runtime services',
        },
      ]));
    const prompts: string[] = [];
    const cfg = config({
      messageReply: 'card',
    });
    const bridge = await startChannel({
      cfg,
      agent: agentCapturingPrompts(prompts),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}-recover.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}-recover.json`)),
      controls: controls(cfg),
    });

    await larkMock.state.handlers?.message?.(message('first turn degraded'));
    await vi.advanceTimersByTimeAsync(700);
    await vi.waitFor(() => {
      expect(prompts).toHaveLength(1);
    });

    await larkMock.state.handlers?.message?.(message('second turn adapter'));
    await vi.advanceTimersByTimeAsync(700);
    await vi.waitFor(() => {
      expect(prompts).toHaveLength(2);
    });

    expect(prompts[0]).not.toContain('<agent_interaction_protocol>');
    expect(prompts[1]).toContain('<agent_interaction_protocol>');
    expect(runtimeServicesMock.createRuntimeServicesPortContext.mock.calls.length).toBeGreaterThanOrEqual(3);

    await bridge.disconnect();
  });

  test('text reply mode sends one final Feishu markdown post with hard line boundaries', async () => {
    const bridge = await startChannel({
      cfg: config({
        gatewayMode: 'adapter',
        messageReply: 'text',
      }),
      agent: agentWithText([
        '**指标快照**',
        '',
        '**Metric A**',
        '最新值：42',
        '变化：-2.28%',
        '日内区间：35 - 45',
        '',
        '**来源**',
        'Metric A：Example Source',
        'https://example.com/source-a',
      ].join('\n')),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}-text.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}-text.json`)),
      controls: controls(config({ gatewayMode: 'adapter', messageReply: 'text' })),
    });

    await larkMock.state.handlers?.message?.(message('指标快照'));
    await vi.advanceTimersByTimeAsync(700);

    await vi.waitFor(() => {
      expect(larkMock.state.send).toHaveBeenCalledWith(
        'oc_123',
        { markdown: expect.stringContaining('最新值：42  \n变化：-2.28%') },
        expect.objectContaining({ replyTo: expect.any(String) }),
      );
    });
    expect(larkMock.state.stream).not.toHaveBeenCalled();

    await bridge.disconnect();
  });

  test('text reply mode carries structured mentions for named inbound bot mentions', async () => {
    const bridge = await startChannel({
      cfg: config({
        gatewayMode: 'adapter',
        messageReply: 'text',
      }),
      agent: agentWithText('@Example Bot\n[trace_id=example]\nReceived'),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}-mentions.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}-mentions.json`)),
      controls: controls(config({ gatewayMode: 'adapter', messageReply: 'text' })),
    });

    await larkMock.state.handlers?.message?.({
      ...message('@Bridge Bot reply to @Example Bot'),
      chatType: 'group',
      mentionedBot: true,
      mentions: [
        { key: '@_bot_1', openId: 'ou_bot', name: 'Bridge Bot', isBot: true },
        { key: '@_bot_2', openId: 'ou_example_bot', name: 'Example Bot', isBot: true },
      ],
    } as unknown as NormalizedMessage);
    await vi.advanceTimersByTimeAsync(700);

    await vi.waitFor(() => {
      expect(larkMock.state.send).toHaveBeenCalledWith(
        'oc_123',
        { post: expect.any(Object) },
        expect.objectContaining({ replyTo: expect.any(String) }),
      );
    });
    const sendInput = larkMock.state.send.mock.calls.at(-1)?.[1] as { post?: FeishuPost };
    const sendOptions = larkMock.state.send.mock.calls.at(-1)?.[2] as { mentions?: unknown[] };
    expect(firstPostParagraph(sendInput.post)).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'at', user_id: 'ou_123' }),
      expect.objectContaining({ tag: 'at', user_id: 'ou_example_bot' }),
    ]));
    expect(JSON.stringify(sendInput.post)).not.toContain('ou_bot');
    expect(sendOptions).not.toHaveProperty('mentions');

    await bridge.disconnect();
  });

  test('group replies mention the message sender when the bot was mentioned', async () => {
    const bridge = await startChannel({
      cfg: config({
        gatewayMode: 'adapter',
        messageReply: 'text',
      }),
      agent: agentWithText('Received. I will handle it.'),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}-sender-mention.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}-sender-mention.json`)),
      controls: controls(config({ gatewayMode: 'adapter', messageReply: 'text' })),
    });

    await larkMock.state.handlers?.message?.({
      ...message('@Bridge Bot please check this'),
      chatType: 'group',
      senderId: 'ou_sender',
      senderName: 'Example Sender',
      mentionedBot: true,
      mentions: [
        { key: '@_bot_1', openId: 'ou_bot', name: 'Bridge Bot', isBot: true },
      ],
    } as unknown as NormalizedMessage);
    await vi.advanceTimersByTimeAsync(700);

    await vi.waitFor(() => {
      expect(larkMock.state.send).toHaveBeenCalledWith(
        'oc_123',
        { post: expect.any(Object) },
        expect.objectContaining({ replyTo: expect.any(String) }),
      );
    });
    const sendInput = larkMock.state.send.mock.calls.at(-1)?.[1] as { post?: FeishuPost };
    const sendOptions = larkMock.state.send.mock.calls.at(-1)?.[2] as { mentions?: unknown[] };
    expect(firstPostParagraph(sendInput.post)).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'at', user_id: 'ou_sender', user_name: 'Example Sender' }),
    ]));
    expect(JSON.stringify(sendInput.post)).toContain('Received. I will handle it.');
    expect(sendOptions).not.toHaveProperty('mentions');

    await bridge.disconnect();
  });

  test('group replies can mention an app sender by app_id from the raw event', async () => {
    const bridge = await startChannel({
      cfg: config({
        gatewayMode: 'adapter',
        messageReply: 'text',
      }),
      agent: agentWithText('Received the proxy bot message.'),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}-app-sender-mention.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}-app-sender-mention.json`)),
      controls: controls(config({ gatewayMode: 'adapter', messageReply: 'text' })),
    });

    await larkMock.state.handlers?.message?.({
      ...message('@Bridge Bot [trace_id=example] ping'),
      chatType: 'group',
      senderId: 'ou_proxy_sender',
      senderName: 'Example Proxy',
      mentionedBot: true,
      mentions: [
        { key: '@_bot_1', openId: 'ou_bot', name: 'Bridge Bot', isBot: true },
      ],
      raw: {
        event_type: 'im.message.receive_v1',
        sender: {
          sender_id: { app_id: 'cli_proxy_app' },
          sender_type: 'app',
        },
        message: {
          message_id: 'om_proxy',
          create_time: '1710000000000',
          chat_id: 'oc_123',
          chat_type: 'group',
          message_type: 'text',
          content: '{"text":"@Bridge Bot [trace_id=example] ping"}',
          mentions: [
            {
              key: '@_bot_1',
              id: { open_id: 'ou_bot' },
              name: 'Bridge Bot',
            },
          ],
        },
      },
    } as unknown as NormalizedMessage);
    await vi.advanceTimersByTimeAsync(700);

    await vi.waitFor(() => {
      expect(larkMock.state.send).toHaveBeenCalledWith(
        'oc_123',
        { post: expect.any(Object) },
        expect.objectContaining({ replyTo: expect.any(String) }),
      );
    });
    const sendInput = larkMock.state.send.mock.calls.at(-1)?.[1] as { post?: FeishuPost };
    const sendOptions = larkMock.state.send.mock.calls.at(-1)?.[2] as { mentions?: unknown[] };
    expect(firstPostParagraph(sendInput.post)).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: 'at', user_id: 'cli_proxy_app', user_name: 'Example Proxy' }),
    ]));
    expect(JSON.stringify(sendInput.post)).toContain('Received the proxy bot message.');
    expect(sendOptions).not.toHaveProperty('mentions');

    await bridge.disconnect();
  });

  test('app-server endpoint defaults new task cwd to the app-server workspace when chat cwd is unset', async () => {
    const runs: AgentRunOptions[] = [];
    const cfg = config({
      gatewayMode: 'relay',
      messageReply: 'card',
      agentEndpoint: 'app-server',
    });
    const bridge = await startChannel({
      cfg,
      agent: agentWithText('pong', [], runs, 'agent_runtime.codex_app_server'),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}-app-server-cwd.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}-app-server-cwd.json`)),
      controls: controls(cfg),
    });

    await larkMock.state.handlers?.message?.(message('用默认 app-server cwd'));
    await vi.advanceTimersByTimeAsync(700);

    await vi.waitFor(() => {
      expect(runs).toHaveLength(1);
    });
    expect(runs[0]?.cwd).toBe(join(homedir(), 'Documents', 'Codex', 'app-server'));

    await bridge.disconnect();
  });

  test('exec endpoint keeps the owner home as default task cwd when chat cwd is unset', async () => {
    const runs: AgentRunOptions[] = [];
    const cfg = config({
      gatewayMode: 'relay',
      messageReply: 'card',
      agentEndpoint: 'exec',
    });
    const bridge = await startChannel({
      cfg,
      agent: agentWithText('pong', [], runs, 'agent_runtime.codex_cli'),
      sessions: new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}-exec-cwd.json`)),
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}-exec-cwd.json`)),
      controls: controls(cfg),
    });

    await larkMock.state.handlers?.message?.(message('用默认 exec cwd'));
    await vi.advanceTimersByTimeAsync(700);

    await vi.waitFor(() => {
      expect(runs).toHaveLength(1);
    });
    expect(runs[0]?.cwd).toBe(homedir());

    await bridge.disconnect();
  });

  test('turn trace stores a chained JSONL artifact when enabled and Runtime Services storage is ready', async () => {
    const runtimeCall = vi.fn(async (capabilityId: string, input: { namespace: string; body: string; source: Record<string, unknown> }) => ({
      status: 'ok',
      capabilityId,
      providerId: 'mock-runtime-services',
      modelId: 'not-applicable',
      evidence: [],
      artifact: {
        id: 'trace-artifact-1',
        namespace: input.namespace,
        path: '/tmp/trace-artifact-1.jsonl',
        mimeType: 'application/jsonl',
        sizeBytes: input.body.length,
        sha256: 'sha',
        createdAt: '2026-06-17T00:00:00.000Z',
        source: input.source,
      },
    }));
    runtimeServicesMock.createRuntimeServicesPortContext.mockResolvedValue(runtimeContext([
      {
        id: 'model.language_completion',
        kind: 'model',
        capability: 'intent',
        purpose: 'test',
        status: 'available',
        operatorAction: 'configure runtime services',
      },
      {
        id: 'storage.artifact_store',
        kind: 'storage',
        capability: 'artifact_store',
        purpose: 'turn trace',
        status: 'available',
        operatorAction: 'configure runtime services',
      },
    ], runtimeCall));
    const sessions = new SessionStore(join(tmpdir(), `aib-sessions-${Date.now()}-turn-trace.json`));
    sessions.setTurnTraceArtifactId('oc_123', 'trace-artifact-prev');
    const cfg = config({
      gatewayMode: 'relay',
      messageReply: 'card',
      turnTrace: {
        enabled: true,
      },
    });
    const bridge = await startChannel({
      cfg,
      agent: agentWithText('traceable answer'),
      sessions,
      workspaces: new WorkspaceStore(join(tmpdir(), `aib-workspaces-${Date.now()}-turn-trace.json`)),
      controls: controls(cfg),
    });

    await larkMock.state.handlers?.message?.({
      ...message('record this turn'),
      raw: {
        event_type: 'im.message.receive_v1',
        sender: {
          sender_id: { app_id: 'cli_proxy' },
          sender_type: 'app',
        },
        message: {
          message_id: 'om_trace',
          create_time: '1710000000000',
          chat_id: 'oc_123',
          chat_type: 'p2p',
          message_type: 'text',
          content: '{"text":"record this turn"}',
          mentions: [
            {
              key: '@_user_1',
              id: 'cli_bridge',
              name: 'Bridge Bot',
            },
          ],
        },
      },
    } as unknown as NormalizedMessage);
    await vi.advanceTimersByTimeAsync(700);

    await vi.waitFor(() => {
      expect(runtimeCall).toHaveBeenCalledWith(
        'artifact.save',
        expect.objectContaining({
          namespace: 'agent-interaction-bridge.turn-traces',
          mimeType: 'application/jsonl',
          extension: 'jsonl',
        }),
        expect.objectContaining({ consumer: 'domain-agent' }),
      );
    });
    const saveInput = runtimeCall.mock.calls.find(([capabilityId]) => capabilityId === 'artifact.save')?.[1] as { body: string };
    expect(saveInput.body).toContain('"schema":"agent-interaction-bridge.turn-trace.v1"');
    expect(saveInput.body).toContain('"previousArtifactId":"trace-artifact-prev"');
    expect(saveInput.body).toContain('"stage":"message_received"');
    expect(saveInput.body).toContain('sender_type=app sender_app_id=cli_proxy');
    expect(saveInput.body).toContain('@_user_1 name=Bridge Bot (id=cli_bridge)');
    expect(saveInput.body).toContain('"stage":"gateway_resolved"');
    expect(saveInput.body).toContain('"stage":"run_started"');
    expect(saveInput.body).toContain('"stage":"run_finished"');
    expect(sessions.getTurnTraceArtifactId('oc_123')).toBe('trace-artifact-1');

    await bridge.disconnect();
  });
});

function config(preferences: NonNullable<AppConfig['preferences']> & { gatewayMode?: string }): AppConfig {
  return {
    accounts: {
      app: {
        id: 'cli_test',
        secret: 'secret',
        tenant: 'feishu',
      },
    },
    preferences,
  } as AppConfig;
}

function controls(cfg = config({
    gatewayMode: 'relay',
    messageReply: 'card',
  })) {
  return {
    cfg,
    configPath: '/tmp/config.json',
    processId: 'test-process',
    restart: vi.fn(async () => {}),
    exit: vi.fn(async () => {}),
  };
}

function message(content: string): NormalizedMessage {
  return {
    chatId: 'oc_123',
    chatType: 'p2p',
    senderId: 'ou_123',
    senderName: 'Ada',
    messageId: `om_${content.length}`,
    content,
    mentionedBot: false,
    resources: [],
  } as unknown as NormalizedMessage;
}

function agentCapturingPrompts(prompts: string[]): AgentAdapter {
  return agentWithText('pong', prompts);
}

function agentWithText(
  text: string,
  prompts: string[] = [],
  runs: AgentRunOptions[] = [],
  id = 'codex-test',
): AgentAdapter {
  return {
    id,
    displayName: 'Codex Test',
    isAvailable: async () => true,
    run(opts: AgentRunOptions) {
      prompts.push(opts.prompt);
      runs.push(opts);
      return {
        pid: 123,
        events: (async function* () {
          yield { type: 'text' as const, delta: text };
          yield { type: 'done' as const, sessionId: 'session_1' };
        })(),
        stop: async () => {},
        waitForExit: async () => true,
      };
    },
  };
}

function runtimeContext(resources: Array<{
  id: string;
  kind: string;
  capability: string;
  purpose: string;
  status: string;
  operatorAction: string;
}>, runtimeCall: ReturnType<typeof vi.fn> = vi.fn(async (capabilityId: string) => ({
  status: 'failed',
  capabilityId,
  providerId: 'mock-runtime-services',
  modelId: 'not-applicable',
  evidence: [{ kind: 'mock_failure', message: 'mock unavailable' }],
}))) {
  return {
    transport: 'rpc',
    runtime: {
      call: runtimeCall,
    },
    resources,
  };
}

type FeishuPost = {
  zh_cn?: {
    content?: Array<Array<Record<string, unknown>>>;
  };
};

function firstPostParagraph(post: FeishuPost | undefined): Array<Record<string, unknown>> {
  return post?.zh_cn?.content?.[0] ?? [];
}
