import type { FeishuSendInput } from '../signal/feishu-delivery-support';

export interface FeishuSignalMessageSender<TOptions = unknown> {
  send(to: string, input: FeishuSendInput, options?: TOptions): Promise<unknown>;
}

export async function sendFeishuSignalInputs<TOptions>(
  sender: FeishuSignalMessageSender<TOptions>,
  to: string,
  inputs: FeishuSendInput[],
  options?: TOptions,
  onSecondaryError?: (error: unknown, input: FeishuSendInput) => void,
): Promise<void> {
  for (const [index, input] of inputs.entries()) {
    try {
      await sender.send(to, input, options);
    } catch (error) {
      if (index === 0) throw error;
      onSecondaryError?.(error, input);
    }
  }
}
