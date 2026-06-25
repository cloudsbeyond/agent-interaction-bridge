import { describe, expect, test } from 'vitest';
import { renderPresentationMarkdownDocument } from './markdown';

describe('Markdown presentation renderer', () => {
  test('renders a presentation document as channel-safe markdown fallback', () => {
    const markdown = renderPresentationMarkdownDocument({
      title: 'Bridge 架构',
      layout: 'architecture',
      blocks: [
        { kind: 'lead', title: '一句话', text: '通道中立交互网关' },
        {
          kind: 'flow',
          steps: [
            { title: '主链路', lines: ['Human -> Bridge -> Agent'] },
            { title: '执行端', lines: ['app-server'] },
          ],
        },
        { kind: 'section', title: '边界', lines: ['helper model 不干预决策'] },
      ],
    });

    expect(markdown).toContain('## Bridge 架构');
    expect(markdown).toContain('**主链路**');
    expect(markdown).toContain('- helper model 不干预决策');
  });
});
