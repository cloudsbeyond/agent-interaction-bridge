import { describe, expect, test } from 'vitest';
import { renderPresentationCard } from '../card/presentation-card';
import { appendSessionIdentityCard } from '../card/session-identity';
import { presentAnswerCard } from './reply-presentation';
import type { RunState } from '../card/run-state';

describe('presentAnswerCard', () => {
  test('creates a stable card presentation from a final answer', () => {
    const presentation = presentAnswerCard(doneState([
      [
        '**我的架构**',
        '',
        '摘要',
        '能理解任务、调用工具，并在高风险动作前暂停确认。',
        '',
        '**大脑**',
        '理解目标',
        '拆解任务',
        '判断下一步',
        '',
        '**手**',
        '读文件',
        '改代码',
        '跑命令',
        '',
        '**刹车**',
        '删除、发布、远程写入、密钥相关操作都会先问你。',
      ].join('\n'),
    ]));

    expect(presentation).toEqual({
      title: '我的架构',
      sections: [
        { title: '摘要', body: '能理解任务、调用工具，并在高风险动作前暂停确认。' },
        { title: '大脑', body: '理解目标\n拆解任务\n判断下一步' },
        { title: '手', body: '读文件\n改代码\n跑命令' },
        { title: '刹车', body: '删除、发布、远程写入、密钥相关操作都会先问你。' },
      ],
    });
  });

  test('turns dense Dynamic UI architecture output into compact generic sections', () => {
    const presentation = presentAnswerCard(
      doneState([
        [
          '这套系统把用户输入、领域处理、执行端和返回展示拆开，避免通道 payload 直接进入业务判断。',
          '主链路是用户从一个消息入口发起请求，领域层归一化上下文，再把任务交给执行端处理，最后根据通道能力返回结果。',
          '内部组件包含上下文解析、意图判断、语义信号、展示计划、载体映射和策略检查。',
          '执行端负责真实任务推理和工具调用，展示层只能改变表达形态。',
          '边界上凭据、审批、目录、会话和发布权限都不能被展示层覆盖。',
        ].join(' '),
      ]),
      { mode: 'dynamic_ui', userText: '画一下当前系统架构' },
    );

    expect(presentation.title).toBe('架构说明');
    expect(presentation.layout).toBe('architecture');
    expect(presentation.sections.map((section) => section.title)).toEqual([
      '要点 1',
      '要点 2',
      '要点 3',
      '要点 4',
      '要点 5',
    ]);
    expect(presentation.sections.every((section) => section.body.length <= 420)).toBe(true);
  });

  test('turns dense Dynamic UI report output into compact generic sections', () => {
    const presentation = presentAnswerCard(
      doneState([
        [
          '产品进展报告当前开发中，核心链路已经跑通但还没有发布。',
          '完成项包括配置收敛、接口验证和主要展示路径打通。',
          '进行中事项是继续验证渠道入口、整理边界条件并补充失败兜底。',
          '风险在于部分依赖服务仍可能不可用，用户可见降级要保持清楚。',
          '下一步是补齐验收脚本并压缩过长输出。',
        ].join(' '),
      ]),
      { mode: 'dynamic_ui', userText: '生成一份产品进展报告' },
    );

    expect(presentation.title).toBe('进展报告');
    expect(presentation.layout).toBe('report');
    expect(presentation.sections.map((section) => section.title)).toEqual([
      '要点 1',
      '要点 2',
      '要点 3',
      '要点 4',
      '要点 5',
    ]);
    expect(presentation.sections.find((section) => section.title === '要点 4')?.body).toContain('依赖服务');
    expect(presentation.sections.every((section) => section.body.length <= 420)).toBe(true);
  });

  test('keeps Dynamic UI layout even when the agent already emitted sections', () => {
    const presentation = presentAnswerCard(
      doneState([
        [
          '# Bridge 架构',
          '',
          '主链路',
          '- Human Channel -> Bridge -> Agent Endpoint',
          '',
          '组件',
          '- Intent / Signal / Presentation / Carrier',
          '',
          '执行端',
          '- Codex app-server',
        ].join('\n'),
      ]),
      { mode: 'dynamic_ui', userText: '画一下当前 bridge 架构' },
    );

    expect(presentation.layout).toBe('architecture');
    expect(presentation.sections.map((section) => section.title)).toEqual([
      '主链路',
      '组件',
      '执行端',
    ]);
  });

  test('splits glued report headings before Dynamic UI rendering', () => {
    const presentation = presentAnswerCard(
      doneState([
        [
          '# 产品进展报告',
          '**状态**-阶段：活跃开发中-本地验证：通过**完成**-配置边界已清晰化-消息入口表达已升级到卡片化方向-执行端路线已展开**进行中**-资源状态和兜底判断正在补齐**风险**-渠道入口链路仍需验证**下一步**-继续打磨 Dynamic UI',
        ].join('\n'),
      ]),
      { mode: 'dynamic_ui', userText: '生成一份产品进展报告' },
    );

    expect(presentation.layout).toBe('report');
    expect(presentation.sections.map((section) => section.title)).toEqual([
      '状态',
      '完成',
      '进行中',
      '风险',
      '下一步',
    ]);
    expect(presentation.sections.find((section) => section.title === '状态')?.body).toContain('阶段：活跃开发中');
    expect(presentation.sections.find((section) => section.title === '完成')?.body).toContain('消息入口');
    expect(JSON.stringify(presentation.sections)).not.toContain('****状态**');
  });

  test('does not lower a Domain-emitted session footer into card body bullets', () => {
    const presentation = presentAnswerCard(
      doneState([
        [
          '## 卡片验证',
          '',
          '### 载体',
          '',
          '- 当前回复：interactive',
          '',
          '### 检查点',
          '',
          '- footer 位于卡片底部',
          '- 单独一行，不进入摘要列表',
          '',
          '> Session：Bridge - old-bridge | Domain - old-domain',
        ].join('\n'),
      ]),
      { mode: 'dynamic_ui', userText: '验证飞书卡片样式' },
    );

    expect(presentation.sections).toEqual([
      {
        title: '载体',
        body: '- 当前回复：interactive',
      },
      {
        title: '检查点',
        body: '- footer 位于卡片底部\n- 单独一行，不进入摘要列表',
      },
    ]);
    expect(JSON.stringify(presentation)).not.toContain('Session：Bridge -');

    const card = appendSessionIdentityCard(
      renderPresentationCard(presentation),
      { bridge: 'bridge', domain: 'domain' },
    ) as { body: { elements: Array<Record<string, unknown>> } };
    const rendered = JSON.stringify(card);
    expect(rendered.match(/Session：📥 -/g)).toHaveLength(1);
    expect(rendered).not.toContain('- > Session：📥 -');
    expect(card.body.elements.at(-1)).toEqual({
      tag: 'markdown',
      content: '> Session：📥 - bridge | 🤖 - domain',
      text_size: 'notation',
    });
  });
});

function doneState(texts: string[]): RunState {
  return {
    blocks: texts.map((content) => ({ kind: 'text', content, streaming: false })),
    reasoning: { content: '', active: false },
    footer: null,
    terminal: 'done',
  };
}
