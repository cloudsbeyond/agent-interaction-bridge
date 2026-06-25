import { describe, expect, test } from 'vitest';
import { formatFeishuCardMarkdown, formatFeishuFinalMarkdown } from './feishu-markdown';

describe('formatFeishuCardMarkdown', () => {
  test('uses hard line breaks for Feishu card markdown prose', () => {
    const rendered = formatFeishuCardMarkdown(
      [
        '**指标快照**',
        '',
        '**Metric A**',
        '- 当前值：42',
        '- 变化：-2.28%',
        '- 参考区间：35 - 45',
        '',
        '**Metric B**',
        '- 当前值：78.33',
        '- 变化：-1.63%',
        '',
        '**来源**',
        '- Example Source  ',
        'https://example.com/source',
      ].join('\n'),
    );

    expect(rendered).toContain('**Metric A**  \n- 当前值：42');
    expect(rendered).toContain('- 参考区间：35 - 45  \n');
    expect(rendered).toContain('**Metric B**  \n- 当前值：78.33');
    expect(rendered).toContain('- Example Source  \nhttps://example.com/source');
  });

  test('does not add Feishu hard breaks inside fenced code blocks', () => {
    const rendered = formatFeishuCardMarkdown(
      ['说明', '```ts', 'const value = 1;', 'console.log(value);', '```', '下一段'].join('\n'),
    );

    expect(rendered).toContain('说明  \n```ts');
    expect(rendered).toContain('```ts\nconst value = 1;\nconsole.log(value);\n```');
    expect(rendered).toContain('```\n下一段  ');
    expect(rendered).not.toContain('const value = 1;  ');
  });

  test('uses hard line boundaries for final Feishu markdown posts', () => {
    const rendered = formatFeishuFinalMarkdown([
      '**指标快照**',
      '',
      '**Metric A**',
      '最新值：42',
      '变化：-2.28%',
      '日内区间：35 - 45',
      '52 周区间：30 - 80',
      '',
      '**来源**',
      'Metric A：Example Source',
      'https://example.com/source-a',
    ].join('\n'));

    expect(rendered).toContain('**Metric A**  \n最新值：42');
    expect(rendered).toContain('最新值：42  \n变化：-2.28%');
    expect(rendered).toContain('日内区间：35 - 45  \n52 周区间：30 - 80');
    expect(rendered).toContain('Metric A：Example Source  \nhttps://example.com/source-a');
    expect(rendered).not.toContain('42-变化');
  });
});
