import { describe, expect, test } from 'vitest';
import {
  bodyToLines,
  compactLine,
  firstLine,
  isPresentationLayout,
} from './document';

describe('presentation document primitives', () => {
  test('normalizes section bodies into reusable lines', () => {
    expect(bodyToLines('- One\n* Two\nThree')).toEqual(['One', 'Two', 'Three']);
  });

  test('extracts a compact first line for metric summaries', () => {
    expect(firstLine('- 开发中，验证通过\n- 下一条')).toBe('开发中，验证通过');
    expect(firstLine('')).toBe('');
  });

  test('normalizes glued markdown report bodies for channel renderers', () => {
    const lines = bodyToLines([
      '**产品进展报告****状态**-',
      '产品：`example-service`-阶段：活跃开发中-本地状态：有较多未提交改动**完成**-配置边界已清晰化-消息入口表达已升级到卡片化方向-执行端路线已展开',
    ].join('\n'));

    expect(lines).toEqual([
      '产品进展报告',
      '产品：example-service',
      '阶段：活跃开发中',
      '本地状态：有较多未提交改动',
      '配置边界已清晰化',
      '消息入口表达已升级到卡片化方向',
      '执行端路线已展开',
    ]);
  });

  test('compacts metric text without leaking raw markdown', () => {
    expect(compactLine('**风险**-`agent-interaction-bridge` 本地未提交改动较多', 24)).toBe('agent-interaction-bridge...');
  });

  test('guards known presentation layouts', () => {
    expect(isPresentationLayout('architecture')).toBe(true);
    expect(isPresentationLayout('unknown')).toBe(false);
  });
});
