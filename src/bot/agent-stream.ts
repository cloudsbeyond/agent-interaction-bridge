import {
  finalizeIfRunning,
  initialState,
  markIdleTimeout,
  markInterrupted,
  reduce,
  type RunState,
} from '../card/run-state';
import { log } from '../core/logger';
import type { InteractionRequest } from '../interaction/protocol';
import { extractInteractionRequests, stripInteractionBlocks } from '../interaction/protocol';
import { assessToolRisk } from '../interaction/risk-policy';
import type { SessionStore } from '../session/store';
import { AgentSignalStreamDecoder } from '../signal/protocol';
import type { AgentSignal } from '../signal/router';
import { extractToolResultSignals } from '../signal/tool-events';
import type { RunHandle } from './active-runs';

const POST_DONE_EXIT_GRACE_MS = 2000;

export interface AgentStreamOptions {
  onInteraction?: (request: InteractionRequest) => Promise<void>;
  onSignal?: (signal: AgentSignal, source: 'endpoint' | 'bridge_tool') => Promise<void>;
  onSession?: (sessionId: string) => void | Promise<void>;
}

/**
 * Drive an agent event stream into presentation state without owning carrier
 * delivery. Session persistence and typed endpoint-signal extraction happen
 * here; callers decide how each state transition is rendered and delivered.
 */
export async function processAgentStream(
  handle: RunHandle,
  sessions: SessionStore,
  scope: string,
  cwd: string,
  agentRuntimeId: string,
  sessionContextVersion: string,
  idleTimeoutMs: number | undefined,
  flush: (state: RunState) => Promise<void>,
  options: AgentStreamOptions = {},
): Promise<RunState> {
  let state: RunState = initialState;

  // Long-running tools may be silent while waiting for human or provider
  // input. Pause the idle watchdog until every in-flight tool has settled.
  let idleFired = false;
  let timer: NodeJS.Timeout | undefined;
  const inFlightTools = new Map<string, { name: string; input: unknown }>();
  const sentInteractions = new Set<string>();
  const sentSignals = new Set<string>();
  const signalDecoder = new AgentSignalStreamDecoder();
  const emitInteraction = async (request: InteractionRequest): Promise<void> => {
    if (!options.onInteraction || sentInteractions.has(request.id)) return;
    sentInteractions.add(request.id);
    await options.onInteraction(request);
  };
  const emitSignal = async (
    signal: AgentSignal,
    source: 'endpoint' | 'bridge_tool',
  ): Promise<void> => {
    if (!options.onSignal) return;
    const key = signal.id ? `${signal.kind}:${signal.id}` : undefined;
    if (key && sentSignals.has(key)) return;
    if (key) sentSignals.add(key);
    await options.onSignal(signal, source);
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
        // stop errors are non-fatal
      });
    }, idleTimeoutMs);
  };
  armOrPauseIdle();

  try {
    for await (const evt of handle.run.events) {
      if (handle.interrupted) break;
      let effectiveEvt = evt;

      if (effectiveEvt.type === 'signal') {
        await emitSignal(effectiveEvt.signal, 'endpoint');
        armOrPauseIdle();
        continue;
      }

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
        const decoded = signalDecoder.push(effectiveEvt.delta);
        for (const signal of decoded.signals) await emitSignal(signal, 'endpoint');
        for (const request of extractInteractionRequests(decoded.text)) {
          log.info('interaction', 'request', {
            scope,
            id: request.id,
            kind: request.kind,
          });
          await emitInteraction(request);
        }
        const visible = stripInteractionBlocks(decoded.text);
        if (!visible) continue;
        effectiveEvt = { ...effectiveEvt, delta: visible };
      } else if (effectiveEvt.type === 'text_replace') {
        const decoded = signalDecoder.replace(effectiveEvt.text);
        for (const signal of decoded.signals) await emitSignal(signal, 'endpoint');
        for (const request of extractInteractionRequests(decoded.text)) {
          log.info('interaction', 'request', {
            scope,
            id: request.id,
            kind: request.kind,
          });
          await emitInteraction(request);
        }
        const visible = stripInteractionBlocks(decoded.text);
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
          for (const signal of signals) await emitSignal(signal, 'bridge_tool');
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
          await options.onSession?.(effectiveEvt.sessionId);
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
      if (state.terminal !== 'running') break;
    }
  } finally {
    if (timer) clearTimeout(timer);
  }

  const signalTail = signalDecoder.finish();
  for (const signal of signalTail.signals) await emitSignal(signal, 'endpoint');
  if (signalTail.text) {
    const terminalBeforeTail = state.terminal;
    const errorBeforeTail = state.errorMsg;
    state = reduce(state, { type: 'text', delta: signalTail.text });
    if (terminalBeforeTail === 'done') {
      state = reduce(state, { type: 'done' });
    } else if (terminalBeforeTail === 'error') {
      state = reduce(state, {
        type: 'error',
        message: errorBeforeTail ?? 'Agent runtime failed',
      });
    }
    await flush(state);
  }

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
