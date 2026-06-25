import { describe, expect, it } from 'vitest';
import { interactionCard } from './interaction-card';
import type { InteractionRequest } from '../interaction/protocol';

function collectButtons(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  const own = obj.tag === 'button' ? [obj] : [];
  return own.concat(Object.values(obj).flatMap(collectButtons));
}

describe('interactionCard', () => {
  it('renders risk approval with structured callback payloads', () => {
    const request: InteractionRequest = {
      id: 'risk-1',
      kind: 'risk_approval',
      title: 'Delete dist?',
      summary: 'Clean build output before rebuilding.',
      risk: 'destructive filesystem change',
      proposedAction: 'rm -rf dist',
      options: ['approve', 'modify', 'reject', 'patch_only'],
    };

    const card = interactionCard(request);
    const buttons = collectButtons(card);

    expect(JSON.stringify(card)).toContain('Delete dist?');
    expect(JSON.stringify(card)).toContain('rm -rf dist');
    expect(buttons.map((b) => (b.text as { content?: string }).content)).toEqual([
      '批准执行',
      '修改方案',
      '拒绝',
      '只看 patch',
    ]);
    expect(buttons.map((b) => b.value)).toEqual([
      expect.objectContaining({ __agent_cb: true, hitl_action: 'approve', interaction_id: 'risk-1' }),
      expect.objectContaining({ __agent_cb: true, hitl_action: 'modify', interaction_id: 'risk-1' }),
      expect.objectContaining({ __agent_cb: true, hitl_action: 'reject', interaction_id: 'risk-1' }),
      expect.objectContaining({ __agent_cb: true, hitl_action: 'patch_only', interaction_id: 'risk-1' }),
    ]);
  });
});
