export type ApprovalDecisionAction = 'execute' | 'modify' | 'cancel';

export interface ApprovalDecision {
  action: ApprovalDecisionAction;
  approvalId: string;
}

export interface ApprovalActionSpec {
  action: ApprovalDecisionAction;
  label: string;
  consumesApproval: boolean;
  startsRun: boolean;
  terminal: boolean;
}

export const APPROVAL_ACTION_SPECS: readonly ApprovalActionSpec[] = [
  {
    action: 'execute',
    label: 'execute approved task',
    consumesApproval: true,
    startsRun: true,
    terminal: true,
  },
  {
    action: 'modify',
    label: 'cancel approval and ask human to resend modified task',
    consumesApproval: true,
    startsRun: false,
    terminal: true,
  },
  {
    action: 'cancel',
    label: 'cancel approval without running',
    consumesApproval: true,
    startsRun: false,
    terminal: true,
  },
] as const;

export function approvalActionNames(): ApprovalDecisionAction[] {
  return APPROVAL_ACTION_SPECS.map((spec) => spec.action);
}

export function isApprovalDecisionAction(value: unknown): value is ApprovalDecisionAction {
  return typeof value === 'string' && approvalActionNames().includes(value as ApprovalDecisionAction);
}

export function approvalActionSpec(action: ApprovalDecisionAction): ApprovalActionSpec {
  const spec = APPROVAL_ACTION_SPECS.find((candidate) => candidate.action === action);
  if (!spec) throw new Error(`Unknown approval action: ${action}`);
  return spec;
}

export function validateApprovalDecisionPayload(payload: unknown): ApprovalDecision | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  if (obj.__agent_cb !== true) return undefined;
  const action = obj.approval_action;
  const approvalId = obj.approval_id;
  if (!isApprovalDecisionAction(action) || typeof approvalId !== 'string' || !approvalId) {
    return undefined;
  }
  return { action, approvalId };
}
