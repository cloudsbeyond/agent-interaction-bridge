import { describe, expect, it } from 'vitest';
import { TaskApprovalStore, parseApprovalDecision } from './approval-store';
import { createAgentPromptEnvelope } from '../interaction/prompt';

describe('TaskApprovalStore', () => {
  it('stores pending task approvals by short id and consumes them once', () => {
    const store = new TaskApprovalStore(() => 'approval-1', () => 1234);

    const approval = store.create({
      scope: 'chat-1',
      chatId: 'chat-1',
      messageId: 'msg-1',
      promptEnvelope: createAgentPromptEnvelope({
        mode: 'adapter',
        channel: 'feishu',
        sections: [{ kind: 'user_message', content: 'fix login' }],
      }),
      task: 'fix login',
      cwd: '/repo',
      sessionId: 'thread-1',
      gatewayMode: 'adapter',
      contextVersion: 'adapter-v1',
      proactiveCorrelationId: 'correlation-1',
      proactiveSessionId: 'thread-1',
    });

    expect(approval.id).toBe('approval-1');
    expect(store.get('approval-1')?.promptEnvelope.sections.at(-1)).toEqual({
      kind: 'user_message',
      content: 'fix login',
    });
    expect(store.latestForScope('chat-1')?.id).toBe('approval-1');
    expect(store.get('approval-1')?.proactiveCorrelationId).toBe('correlation-1');
    expect(store.get('approval-1')).toMatchObject({
      gatewayMode: 'adapter',
      contextVersion: 'adapter-v1',
    });
    expect(store.consume('approval-1')?.cwd).toBe('/repo');
    expect(store.get('approval-1')).toBeUndefined();
  });

  it('parses approval decisions from card-click messages', () => {
    const execute = parseApprovalDecision(
      '[card-click] {"__agent_cb":true,"approval_action":"execute","approval_id":"approval-1"}',
    );
    expect(execute).toEqual({ action: 'execute', approvalId: 'approval-1' });

    const modify = parseApprovalDecision(
      '[card-click] {"__agent_cb":true,"approval_action":"modify","approval_id":"approval-2"}',
    );
    expect(modify).toEqual({ action: 'modify', approvalId: 'approval-2' });

    expect(parseApprovalDecision('normal task')).toBeUndefined();
    expect(parseApprovalDecision('[card-click] not-json')).toBeUndefined();
    expect(
      parseApprovalDecision('[card-click] {"approval_action":"execute","approval_id":"approval-1"}'),
    ).toBeUndefined();
  });
});
