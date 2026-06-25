import { describe, expect, test } from 'vitest';
import { renderPresentationHtmlDocument } from './html';

describe('HTML presentation renderer', () => {
  test('renders the same presentation document as a standalone HTML artifact body', () => {
    const html = renderPresentationHtmlDocument({
      title: '产品进展报告',
      layout: 'report',
      blocks: [
        {
          kind: 'metric_grid',
          metrics: [
            { label: '状态', value: '开发中' },
            { label: '完成', value: '2 项' },
          ],
        },
        { kind: 'section', title: '下一步', lines: ['增强报告布局'] },
      ],
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('产品进展报告');
    expect(html).toContain('metric-grid');
    expect(html).toContain('增强报告布局');
  });

  test('escapes raw HTML in text blocks', () => {
    const html = renderPresentationHtmlDocument({
      title: '<script>',
      layout: 'generic',
      blocks: [{ kind: 'section', title: 'x', lines: ['<b>unsafe</b>'] }],
    });

    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;unsafe&lt;/b&gt;');
  });
});
