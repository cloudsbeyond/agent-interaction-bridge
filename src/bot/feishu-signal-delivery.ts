import type { FeishuSendInput } from '../signal/feishu-delivery-support';

export interface FeishuSignalMessageSender<TOptions = unknown> {
  send(to: string, input: FeishuSendInput, options?: TOptions): Promise<unknown>;
}

export interface FeishuSignalDeliveryResult {
  primary: unknown;
  messageId?: string;
}

export async function sendFeishuSignalInputs<TOptions>(
  sender: FeishuSignalMessageSender<TOptions>,
  to: string,
  inputs: FeishuSendInput[],
  options?: TOptions,
  onSecondaryError?: (error: unknown, input: FeishuSendInput) => void,
): Promise<FeishuSignalDeliveryResult> {
  let primary: unknown;
  for (const [index, input] of inputs.entries()) {
    try {
      const result = await sender.send(to, input, options);
      if (index === 0) primary = result;
    } catch (error) {
      if (index === 0) throw error;
      onSecondaryError?.(error, input);
    }
  }
  return {
    primary,
    ...messageIdFromSendResult(primary),
  };
}

function messageIdFromSendResult(value: unknown): { messageId?: string } {
  if (!value || typeof value !== 'object') return {};
  const messageId = (value as { messageId?: unknown }).messageId;
  return typeof messageId === 'string' && messageId ? { messageId } : {};
}
