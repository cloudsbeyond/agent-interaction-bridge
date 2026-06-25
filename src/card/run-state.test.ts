import { describe, expect, test } from 'vitest';
import { initialState, reduce } from './run-state';
import { renderText } from './text-renderer';

describe('RunState reduction', () => {
  test('uses a final text snapshot to replace unreliable streaming text', () => {
    let state = reduce(initialState, {
      type: 'text',
      delta: '指标快照Metric A- 当前值：42',
    });
    state = reduce(state, {
      type: 'text_replace',
      text: [
        '指标快照',
        '',
        'Metric A',
        '- 当前值：42',
      ].join('\n'),
    });

    expect(renderText(state)).toContain('Metric A\n- 当前值：42');
    expect(renderText(state)).not.toContain('指标快照Metric A- 当前值');
  });
});
