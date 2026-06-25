import { randomUUID } from 'node:crypto';

import type { MessageReplyMode } from '../config/schema';
import {
  validateApprovalDecisionPayload,
  type ApprovalDecision,
} from './approval-contract';

export type { ApprovalDecision, ApprovalDecisionAction } from './approval-contract';

export interface PendingApproval {
  id: string;
  scope: string;
  chatId: string;
  messageId: string;
  threadId?: string;
  prompt: string;
  task: string;
  cwd: string;
  sessionId?: string;
  model?: string;
  replyMode?: MessageReplyMode;
  agentProfileId?: string;
  createdAt: number;
}

export class TaskApprovalStore {
  private readonly byId = new Map<string, PendingApproval>();

  constructor(
    private readonly makeId: () => string = () => randomUUID().slice(0, 8),
    private readonly now: () => number = () => Date.now(),
  ) {}

  create(input: Omit<PendingApproval, 'id' | 'createdAt'>): PendingApproval {
    const approval: PendingApproval = { ...input, id: this.makeId(), createdAt: this.now() };
    this.byId.set(approval.id, approval);
    return approval;
  }

  get(id: string): PendingApproval | undefined {
    return this.byId.get(id);
  }

  consume(id: string): PendingApproval | undefined {
    const approval = this.byId.get(id);
    if (approval) this.byId.delete(id);
    return approval;
  }

  cancel(id: string): boolean {
    return this.byId.delete(id);
  }

  latestForScope(scope: string): PendingApproval | undefined {
    return [...this.byId.values()]
      .filter((a) => a.scope === scope)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  }
}

export function parseApprovalDecision(content: string): ApprovalDecision | undefined {
  const prefix = '[card-click] ';
  if (!content.startsWith(prefix)) return undefined;
  try {
    return validateApprovalDecisionPayload(JSON.parse(content.slice(prefix.length)));
  } catch {
    return undefined;
  }
}
