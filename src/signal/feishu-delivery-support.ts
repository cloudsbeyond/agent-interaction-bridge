import { basename } from 'node:path';
import {
  executeDeliverySupport,
  type DeliverySupportExecutorOptions,
  type DeliverySupportOutcome,
} from './delivery-support';
import type { FeishuRenderedSignal } from './feishu-renderer';

export type FeishuRenderedSignalWithSupport = FeishuRenderedSignal & {
  supportOutcome?: DeliverySupportOutcome;
};

export type FeishuSendInput =
  | { markdown: string }
  | { card: object }
  | { image: { source: string } }
  | { file: { source: string; fileName: string } };

export interface FeishuDeliverySupportOptions extends DeliverySupportExecutorOptions {
  onError?: (error: unknown) => void;
}

export async function applyFeishuDeliverySupport(
  rendered: FeishuRenderedSignal,
  options: FeishuDeliverySupportOptions = {},
): Promise<FeishuRenderedSignalWithSupport> {
  if (!rendered.supportRequest || rendered.kind !== 'markdown') return rendered;
  let outcome: DeliverySupportOutcome;
  try {
    outcome = await executeDeliverySupport(rendered.supportRequest, options);
  } catch (error) {
    options.onError?.(error);
    return rendered;
  }
  if (outcome.status !== 'ready') {
    return { ...rendered, supportOutcome: outcome };
  }
  return {
    ...rendered,
    body: feishuBodyForSupportOutcome(rendered.body, outcome),
    supportOutcome: outcome,
  };
}

function feishuBodyForSupportOutcome(
  fallbackBody: string,
  outcome: Extract<DeliverySupportOutcome, { status: 'ready' }>,
): string {
  if (outcome.artifact) {
    return [
      fallbackBody,
      `展示产物：\`${outcome.artifact.path}\``,
    ].filter(Boolean).join('\n\n');
  }
  return outcome.body.trim() || fallbackBody;
}

export function feishuSendInputsForRenderedSignal(
  rendered: FeishuRenderedSignalWithSupport,
): FeishuSendInput[] {
  const inputs: FeishuSendInput[] = rendered.kind === 'card'
    ? [{ card: rendered.body }]
    : [{ markdown: rendered.body }];
  const artifact = rendered.supportOutcome?.status === 'ready'
    ? rendered.supportOutcome.artifact
    : undefined;
  if (!artifact) return inputs;
  if (artifact.mimeType.toLowerCase().startsWith('image/')) {
    inputs.push({ image: { source: artifact.path } });
    return inputs;
  }
  inputs.push({
    file: {
      source: artifact.path,
      fileName: basename(artifact.path),
    },
  });
  return inputs;
}
