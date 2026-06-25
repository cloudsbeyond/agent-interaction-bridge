import { describe, expect, test } from 'vitest';
import {
  APPROVAL_ACTION_SPECS,
  approvalActionNames,
  approvalActionSpec,
  validateApprovalDecisionPayload,
} from './approval-contract';

describe('approval contract', () => {
  test('keeps HITL approval actions explicit and reviewable', () => {
    expect(approvalActionNames()).toEqual(['execute', 'modify', 'cancel']);
    expect(APPROVAL_ACTION_SPECS.map((spec) => spec.action)).toEqual(approvalActionNames());

    expect(approvalActionSpec('execute')).toMatchObject({
      consumesApproval: true,
      startsRun: true,
      terminal: true,
    });
    expect(approvalActionSpec('modify')).toMatchObject({
      consumesApproval: true,
      startsRun: false,
      terminal: true,
    });
    expect(approvalActionSpec('cancel')).toMatchObject({
      consumesApproval: true,
      startsRun: false,
      terminal: true,
    });
  });

  test('validates card callback payloads before they become task decisions', () => {
    expect(
      validateApprovalDecisionPayload({
        __agent_cb: true,
        approval_action: 'execute',
        approval_id: 'approval-1',
      }),
    ).toEqual({ action: 'execute', approvalId: 'approval-1' });

    expect(
      validateApprovalDecisionPayload({
        approval_action: 'execute',
        approval_id: 'approval-1',
      }),
    ).toBeUndefined();
    expect(
      validateApprovalDecisionPayload({
        __agent_cb: true,
        approval_action: 'publish',
        approval_id: 'approval-1',
      }),
    ).toBeUndefined();
  });
});
