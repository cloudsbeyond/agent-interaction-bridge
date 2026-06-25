import { describe, expect, test } from 'vitest';
import { answerPresentationToDocument } from './templates';

describe('presentation templates', () => {
  test('maps architecture sections into a flow document', () => {
    const doc = answerPresentationToDocument({
      title: 'Bridge 架构',
      layout: 'architecture',
      sections: [
        { title: '一句话', body: '- Bridge 是通道中立的交互网关' },
        { title: '主链路', body: '- Human Channel -> Bridge -> Agent Endpoint' },
        { title: '组件', body: '- Intent / Signal / Presentation / Carrier' },
        { title: '执行端', body: '- Codex app-server' },
        { title: '边界', body: '- helper model 不干预 endpoint 决策' },
      ],
    });

    expect(doc.layout).toBe('architecture');
    expect(doc.blocks.map((block) => block.kind)).toEqual(['lead', 'flow', 'divider', 'section']);
    expect(JSON.stringify(doc)).toContain('组件');
  });

  test('maps report sections into metric grid plus report body', () => {
    const doc = answerPresentationToDocument({
      title: '产品进展报告',
      layout: 'report',
      sections: [
        { title: '状态', body: '- 开发中，验证通过' },
        { title: '完成', body: '- 架构边界已收敛\n- Feishu Dynamic UI 已接入' },
        { title: '进行中', body: '- Feishu 渠道链路继续打磨' },
        { title: '风险', body: '- 表达层仍需产品化' },
        { title: '下一步', body: '- 增强报告和架构卡片布局' },
      ],
    });

    expect(doc.layout).toBe('report');
    expect(doc.blocks[0]).toMatchObject({ kind: 'metric_grid' });
    expect(JSON.stringify(doc)).toContain('"label":"完成"');
    expect(JSON.stringify(doc)).toContain('2 项');
  });

  test('keeps report metrics compact and report body deduplicated', () => {
    const doc = answerPresentationToDocument({
      title: '产品进展报告',
      layout: 'report',
      sections: [
        { title: '状态', body: '- **状态**-产品：`example-service`-阶段：活跃开发中-本地状态：有较多未提交改动' },
        { title: '完成', body: '- 配置边界已清晰化\n- 消息入口表达已升级到卡片化方向' },
        { title: '风险', body: '- **风险**-本地未提交改动多，Feishu 渠道链路仍需验证' },
      ],
    });

    const serialized = JSON.stringify(doc);
    expect(serialized).not.toContain('**');
    expect(serialized).not.toContain('`');
    expect(doc.blocks[0]).toMatchObject({
      kind: 'metric_grid',
      metrics: [
        { label: '状态', value: '产品：example-service' },
        { label: '完成', value: '2 项' },
        { label: '风险', value: '本地未提交改动多，Feishu 渠道链路仍需验证' },
      ],
    });
    expect(doc.blocks.filter((block) => block.kind === 'section').map((block) => block.title)).toEqual([
      '完成',
      '风险',
    ]);
  });
});
