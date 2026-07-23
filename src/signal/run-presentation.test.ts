import { describe, expect, test } from 'vitest';
import type { RunState } from '../card/run-state';
import { presentRunState } from './run-presentation';

describe('presentRunState', () => {
  test('turns running state into channel-neutral sections plus a stop control', () => {
    const state: RunState = {
      terminal: 'running',
      footer: 'tool_running',
      reasoning: { content: 'Need to inspect files.', active: true },
      blocks: [
        { kind: 'text', content: 'Working on it.', streaming: true },
        { kind: 'tool', tool: { id: 't1', name: 'Read', input: { file_path: '/tmp/a.ts' }, status: 'done', output: 'ok' } },
      ],
    };

    const presentation = presentRunState(state);

    expect(presentation.streaming).toBe(true);
    expect(presentation.summary).toBe('正在调用工具');
    expect(presentation.controls.stop).toBe(true);
    expect(presentation.sections.map((section) => section.kind)).toEqual([
      'panel',
      'markdown',
      'panel',
      'note',
    ]);
    expect(presentation.sections[0]).toMatchObject({
      kind: 'panel',
      title: '🧠 **思考中**',
      expanded: true,
    });
  });

  test('collapses completed tool groups without embedding every tool body', () => {
    const state: RunState = {
      terminal: 'done',
      footer: null,
      reasoning: { content: '', active: false },
      blocks: [
        { kind: 'tool', tool: { id: '1', name: 'Read', input: { file_path: '/a.ts' }, status: 'done', output: 'a' } },
        { kind: 'tool', tool: { id: '2', name: 'Read', input: { file_path: '/b.ts' }, status: 'done', output: 'b' } },
        { kind: 'tool', tool: { id: '3', name: 'Read', input: { file_path: '/c.ts' }, status: 'done', output: 'c' } },
      ],
    };

    const presentation = presentRunState(state);

    expect(presentation.streaming).toBe(false);
    expect(presentation.summary).toBe('已完成');
    expect(presentation.sections).toHaveLength(1);
    expect(presentation.sections[0]).toMatchObject({
      kind: 'tool_summary',
      title: '☕ **3 个工具调用（已结束）**',
      expanded: false,
    });
  });

  test('represents terminal notes without channel-specific card payloads', () => {
    const presentation = presentRunState({
      terminal: 'idle_timeout',
      idleTimeoutMinutes: 7,
      footer: null,
      reasoning: { content: '', active: false },
      blocks: [],
    });

    expect(presentation.sections).toEqual([
      { kind: 'note', body: '_⏱ 7 分钟无响应,已自动终止_' },
    ]);
  });

  test('normalizes chat-facing markdown before card rendering', () => {
    const presentation = presentRunState({
      terminal: 'done',
      footer: null,
      reasoning: { content: '', active: false },
      blocks: [
        {
          kind: 'text',
          streaming: false,
          content: '#Agent-Interaction-Bridge\n```text\nSignal -> Carrier\n```\n##当前',
        },
      ],
    });

    expect(presentation.sections).toEqual([
      { kind: 'markdown', body: '# Agent-Interaction-Bridge\nSignal -> Carrier\n## 当前' },
    ]);
  });

  test('removes a domain-emitted session footer before generic card lowering', () => {
    const presentation = presentRunState({
      terminal: 'done',
      footer: null,
      reasoning: { content: '', active: false },
      blocks: [
        {
          kind: 'text',
          streaming: false,
          content: [
            '完成。',
            '',
            '> Session：Bridge - old-bridge | Domain - old-domain',
          ].join('\n'),
        },
      ],
    });

    expect(presentation.sections).toEqual([{ kind: 'markdown', body: '完成。' }]);
  });
});
