import { describe, expect, test } from 'vitest';
import type { AgentSignal } from './router';
import {
  AgentSignalStreamDecoder,
  encodeAgentSignalBlock,
  extractAgentSignals,
  stripAgentSignalBlocks,
} from './protocol';

const statusSignal: AgentSignal = {
  id: 'sync-ready-1',
  kind: 'status',
  title: '同步完成',
  summary: '请确认下一步。',
  severity: 'info',
  state: 'waiting_for_human',
};

describe('AgentSignal endpoint protocol', () => {
  test('round trips an existing semantic AgentSignal without routing fields', () => {
    const block = encodeAgentSignalBlock(statusSignal);
    expect(extractAgentSignals(block)).toEqual([statusSignal]);
    expect(stripAgentSignalBlocks(`before\n${block}\nafter`)).toBe('before\n\nafter');
  });

  test('rejects endpoint attempts to choose bridge routing state', () => {
    const block = [
      '<agent_signal>',
      JSON.stringify({ agent_signal: { ...statusSignal, chatId: 'other-chat' } }),
      '</agent_signal>',
    ].join('\n');
    expect(extractAgentSignals(block)).toEqual([]);
    expect(stripAgentSignalBlocks(block)).toBe('[无效的 AgentSignal 已忽略]');
  });

  test('holds split markers and never leaks a streamed signal block', () => {
    const decoder = new AgentSignalStreamDecoder();
    const block = encodeAgentSignalBlock(statusSignal);
    const chunks = [
      `visible ${block.slice(0, 7)}`,
      block.slice(7, 31),
      block.slice(31),
      ' tail',
    ];
    const results = chunks.map((chunk) => decoder.push(chunk));
    const finished = decoder.finish();

    expect(results.map((result) => result.text).join('') + finished.text).toBe('visible  tail');
    expect(results.flatMap((result) => result.signals)).toEqual([statusSignal]);
  });

  test('fails safely for incomplete blocks', () => {
    const decoder = new AgentSignalStreamDecoder();
    expect(decoder.push('<agent_signal>{"agent_signal":').text).toBe('');
    expect(decoder.finish()).toEqual({
      text: '[未完成的 AgentSignal 已忽略]',
      signals: [],
    });
  });

  test('uses a completed snapshot to replace any pending delta suffix', () => {
    const decoder = new AgentSignalStreamDecoder();
    decoder.push('partial<');
    expect(decoder.replace(`complete\n${encodeAgentSignalBlock(statusSignal)}`)).toEqual({
      text: 'complete',
      signals: [statusSignal],
    });
    expect(decoder.finish()).toEqual({ text: '', signals: [] });
  });
});
