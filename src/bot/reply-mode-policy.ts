import type { MessageReplyMode } from '../config/schema';
import type { InteractionIntent } from '../interaction/intent';

export interface InteractionReplyModeInput {
  intent: InteractionIntent;
  userText: string;
}

export function replyModeForInteractionIntent(
  input: InteractionReplyModeInput,
): MessageReplyMode | undefined {
  if (
    input.intent.kind === 'task_request' &&
    input.intent.presentation?.source === 'dynamic_ui_heuristic'
  ) {
    return 'card';
  }
  if (input.intent.kind !== 'presentation_feedback') return undefined;
  if (input.intent.presentation?.representation !== 'interactive_card') return undefined;
  return 'card';
}
