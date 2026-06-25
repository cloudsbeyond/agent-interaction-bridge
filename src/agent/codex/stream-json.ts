import type { AgentEvent } from '../types';

interface CodexRawEvent {
  type?: string;
  thread_id?: string;
  item?: CodexItem;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

interface CodexItem {
  id?: string;
  type?: string;
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
}

export function* translateEvent(raw: unknown): Generator<AgentEvent> {
  if (!raw || typeof raw !== 'object') return;
  const evt = raw as CodexRawEvent;

  if (evt.type === 'thread.started' && evt.thread_id) {
    yield { type: 'system', sessionId: evt.thread_id };
    return;
  }

  if (evt.type === 'item.started' && evt.item?.type === 'command_execution') {
    const id = evt.item.id;
    const command = evt.item.command;
    if (id && command) {
      yield {
        type: 'tool_use',
        id,
        name: 'shell',
        input: { command },
      };
    }
    return;
  }

  if (evt.type === 'item.completed' && evt.item) {
    if (evt.item.type === 'agent_message' && typeof evt.item.text === 'string' && evt.item.text) {
      yield { type: 'text', delta: evt.item.text };
      return;
    }

    if (evt.item.type === 'command_execution' && evt.item.id) {
      yield {
        type: 'tool_result',
        id: evt.item.id,
        output: evt.item.aggregated_output ?? '',
        isError: evt.item.exit_code !== 0,
      };
      return;
    }
  }

  if (evt.type === 'turn.completed') {
    if (evt.usage) {
      yield {
        type: 'usage',
        inputTokens: evt.usage.input_tokens,
        outputTokens: evt.usage.output_tokens,
      };
    }
    yield { type: 'done' };
  }
}
