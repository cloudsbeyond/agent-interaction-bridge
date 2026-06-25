import { describe, expect, it } from 'vitest';
import { statusCard } from './templates';

describe('statusCard', () => {
  it('includes current task details and recent output when available', () => {
    const card = statusCard({
      cwd: '/repo',
      sessionId: 'thread-1',
      sessionStale: false,
      agentName: 'Codex',
      scope: 'chat-1',
      chatMode: 'p2p',
      task: {
        state: 'running',
        task: '修复登录失败',
        cwd: '/repo',
        pid: 12345,
        elapsedMs: 65_000,
        recentOutput: '正在跑测试',
      },
    });

    const json = JSON.stringify(card);
    expect(json).toContain('当前任务');
    expect(json).toContain('修复登录失败');
    expect(json).toContain('PID');
    expect(json).toContain('12345');
    expect(json).toContain('正在跑测试');
  });

  it('includes pending decisions and recent agent signals', () => {
    const card = statusCard({
      cwd: '/repo',
      sessionId: 'thread-1',
      sessionStale: false,
      agentName: 'Codex',
      scope: 'chat-1',
      chatMode: 'p2p',
      signals: {
        pendingDecisions: 1,
        recent: [
          {
            kind: 'risk_approval',
            title: 'Push branch?',
            summary: 'Codex wants to push commits.',
            decisionAction: undefined,
          },
        ],
      },
    });

    const json = JSON.stringify(card);
    expect(json).toContain('交互信号');
    expect(json).toContain('待处理决策：1');
    expect(json).toContain('risk_approval');
    expect(json).toContain('Push branch?');
  });
});
