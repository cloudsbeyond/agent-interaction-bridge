import type { MessageReplyMode } from '../config/schema';
import type { InteractionPresentationPlan } from '../interaction/presentation-plan';

export function replyModeForPresentationPlan(
  plan: InteractionPresentationPlan | undefined,
): MessageReplyMode | undefined {
  return plan?.representation === 'interactive_card' ? 'card' : undefined;
}
