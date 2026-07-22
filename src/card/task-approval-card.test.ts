import { describe, expect, it } from 'vitest';
import { taskApprovalCard, taskApprovalDecisionCard } from './task-approval-card';

function collectButtons(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  const own = obj.tag === 'button' ? [obj] : [];
  return own.concat(Object.values(obj).flatMap(collectButtons));
}

describe('taskApprovalCard', () => {
  it('uses short approval ids in button payloads', () => {
    const card = taskApprovalCard({
      id: 'approval-1',
      task: '修复登录失败',
      cwd: '/repo',
      sessionId: 'thread-abc',
      model: 'gpt-5.4',
      createdAt: 1234,
    });

    const buttons = collectButtons(card);
    expect(buttons.map((b) => (b.text as { content?: string }).content)).toEqual([
      '执行',
      '修改',
      '停止',
    ]);

    for (const button of buttons) {
      const value = button.value as Record<string, unknown>;
      expect(value.__agent_cb).toBe(true);
      expect(value.approval_id).toBe('approval-1');
      expect(value.task).toBeUndefined();
      expect(value.prompt).toBeUndefined();
    }
    expect((buttons[0]?.value as Record<string, unknown>).approval_action).toBe('execute');
    expect((buttons[1]?.value as Record<string, unknown>).approval_action).toBe('modify');
    expect((buttons[2]?.value as Record<string, unknown>).approval_action).toBe('cancel');
    expect(JSON.stringify(card)).toContain('gpt-5.4');
  });

  it('shows the endpoint profile when approval locks a profile boundary', () => {
    const card = taskApprovalCard({
      id: 'approval-1',
      task: 'review',
      cwd: '/repo',
      agentProfileId: 'agent_profile.codex_guest',
      createdAt: 1234,
    });

    expect(JSON.stringify(card)).toContain('agent_profile.codex_guest');
  });

  it('renders button-free terminal states for accepted approval decisions', () => {
    const approval = {
      id: 'approval-1',
      task: 'review the release',
      cwd: '/repo',
      sessionId: 'thread-abc',
      agentProfileId: 'agent_profile.codex_host',
      createdAt: 1234,
    };

    const execute = taskApprovalDecisionCard(approval, 'execute');
    const modify = taskApprovalDecisionCard(approval, 'modify');
    const cancel = taskApprovalDecisionCard(approval, 'cancel');

    expect(collectButtons(execute)).toEqual([]);
    expect(collectButtons(modify)).toEqual([]);
    expect(collectButtons(cancel)).toEqual([]);
    expect(JSON.stringify(execute)).toContain('已批准');
    expect(JSON.stringify(execute)).toContain('正在执行');
    expect(JSON.stringify(modify)).toContain('已取消');
    expect(JSON.stringify(modify)).toContain('重新发送修改后的任务');
    expect(JSON.stringify(cancel)).toContain('已停止');
    expect(JSON.stringify(cancel)).toContain('未执行 Agent');
    expect(JSON.stringify(execute)).toContain('review the release');
    expect(JSON.stringify(execute)).toContain('agent_profile.codex_host');
  });
});
