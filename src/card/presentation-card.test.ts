import { describe, expect, test } from 'vitest';
import { renderPresentationCard } from './presentation-card';

describe('renderPresentationCard', () => {
  test('renders a structured Feishu card from a presentation plan', () => {
    const card = renderPresentationCard({
      title: '我的架构',
      sections: [
        { title: '摘要', body: '能理解任务、调用工具，并在高风险动作前暂停确认。' },
        { title: '能力', body: '理解目标\n拆解任务\n判断下一步' },
        { title: '操作', body: '读文件\n改代码\n跑命令' },
        { title: '边界', body: '删除、发布、远程写入、密钥相关操作都会先问你。' },
      ],
    });

    expect(card).toMatchObject({
      schema: '2.0',
      config: {
        summary: { content: '我的架构' },
      },
    });
    const elements = (card as { body: { elements: object[] } }).body.elements;
    expect(JSON.stringify(elements)).toContain('我的架构');
    expect(JSON.stringify(elements)).toContain('摘要');
    expect(JSON.stringify(elements)).toContain('能力');
    expect(JSON.stringify(elements)).toContain('操作');
    expect(JSON.stringify(elements)).toContain('边界');
    expect(elements.filter((element) => (element as { tag?: string }).tag === 'collapsible_panel')).toHaveLength(4);
  });

  test('renders architecture Dynamic UI as an open visual flow instead of panels', () => {
    const card = renderPresentationCard({
      title: 'Bridge 架构',
      layout: 'architecture',
      sections: [
        { title: '一句话', body: '- Bridge 是通道中立的交互网关' },
        { title: '主链路', body: '- Human Channel -> Bridge -> Agent Endpoint' },
        { title: '组件', body: '- Intent / Signal / Presentation / Carrier / Policy' },
        { title: '执行端', body: '- Codex app-server\n- exec fallback' },
        { title: '边界', body: '- helper model 不干预 endpoint 决策' },
      ],
    });

    const elements = (card as { body: { elements: object[] } }).body.elements;
    expect(elements.some((element) => (element as { tag?: string }).tag === 'column_set')).toBe(true);
    expect(elements.some((element) => (element as { tag?: string }).tag === 'hr')).toBe(true);
    expect(elements.filter((element) => (element as { tag?: string }).tag === 'collapsible_panel')).toHaveLength(0);
    expect(JSON.stringify(elements)).toContain('Human Channel');
    expect(JSON.stringify(elements)).toContain('helper model');
  });

  test('renders report Dynamic UI as an open dashboard-style card', () => {
    const card = renderPresentationCard({
      title: '产品进展报告',
      layout: 'report',
      sections: [
        { title: '状态', body: '- 开发中，验证通过' },
        { title: '完成', body: '- 架构边界已收敛\n- 消息入口表达已接入' },
        { title: '进行中', body: '- 渠道入口链路继续打磨' },
        { title: '风险', body: '- 表达层仍需产品化' },
        { title: '下一步', body: '- 增强报告和架构卡片布局' },
      ],
    });

    const elements = (card as { body: { elements: object[] } }).body.elements;
    const metricRows = elements.filter((element) => (element as { tag?: string }).tag === 'column_set');
    expect(metricRows).toHaveLength(2);
    expect(metricRows.every((row) => (((row as { columns?: object[] }).columns?.length ?? 0) <= 2))).toBe(true);
    expect(elements.filter((element) => (element as { tag?: string }).tag === 'collapsible_panel')).toHaveLength(0);
    expect(JSON.stringify(elements)).toContain('状态');
    expect(JSON.stringify(elements)).toContain('下一步');
  });
});
