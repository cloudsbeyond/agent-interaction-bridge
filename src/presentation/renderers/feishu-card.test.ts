import { describe, expect, test } from 'vitest';
import { renderFeishuCardDocument } from './feishu-card';
import type { PresentationDocument } from '../document';

describe('Feishu presentation renderer', () => {
  test('renders generic documents as collapsible panels', () => {
    const card = renderFeishuCardDocument({
      title: 'Agent 回复',
      layout: 'generic',
      blocks: [
        { kind: 'section', title: '摘要', lines: ['普通回答'] },
      ],
    });
    const elements = (card as { body: { elements: object[] } }).body.elements;
    expect(elements.filter((element) => (element as { tag?: string }).tag === 'collapsible_panel')).toHaveLength(1);
  });

  test('renders dynamic documents with open layout primitives', () => {
    const doc: PresentationDocument = {
      title: 'Bridge 架构',
      layout: 'architecture',
      blocks: [
        { kind: 'lead', title: '一句话', text: 'Bridge 是通道中立的交互网关' },
        {
          kind: 'flow',
          steps: [
            { title: '主链路', lines: ['Human Channel -> Bridge -> Agent Endpoint'] },
            { title: '组件', lines: ['Intent / Signal / Presentation / Carrier'] },
            { title: '执行端', lines: ['Codex app-server'] },
          ],
        },
      ],
    };

    const card = renderFeishuCardDocument(doc);
    const elements = (card as { body: { elements: object[] } }).body.elements;
    expect(elements.some((element) => (element as { tag?: string }).tag === 'column_set')).toBe(true);
    expect(JSON.stringify(elements)).toContain('interactive_container');
    expect(elements.filter((element) => (element as { tag?: string }).tag === 'collapsible_panel')).toHaveLength(0);
  });

  test('wraps report metrics into narrow Feishu-friendly rows', () => {
    const card = renderFeishuCardDocument({
      title: '产品进展报告',
      layout: 'report',
      blocks: [
        {
          kind: 'metric_grid',
          metrics: [
            { label: '状态', value: '产品：example-service' },
            { label: '完成', value: '2 项' },
            { label: '风险', value: '本地未提交改动多，Feishu 渠道链路仍需验证' },
          ],
        },
      ],
    });

    const elements = (card as { body: { elements: Array<{ tag?: string; columns?: object[] }> } }).body.elements;
    const metricRows = elements.filter((element) => element.tag === 'column_set');
    expect(metricRows).toHaveLength(2);
    expect(metricRows.every((row) => (row.columns?.length ?? 0) <= 2)).toBe(true);
  });
});
