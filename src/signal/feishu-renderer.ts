import { interactionCard } from '../card/interaction-card';
import {
  createDeliverySupportRequest,
  type DeliverySupportRequest,
} from './delivery-support';
import {
  chooseDeliveryPlan,
  type AgentSignal,
  type DeliveryPlan,
} from './router';
import { FEISHU_CAPABILITIES } from './channels';
import {
  canRenderSignalRepresentation,
  renderSignalPresentation,
} from './presentation';

export type FeishuRenderedSignal =
  | { kind: 'card'; body: object; plan: DeliveryPlan; supportRequest?: DeliverySupportRequest }
  | { kind: 'markdown'; body: string; plan: DeliveryPlan; supportRequest?: DeliverySupportRequest };

export function renderFeishuSignal(signal: AgentSignal): FeishuRenderedSignal {
  const plan = chooseDeliveryPlan(signal, FEISHU_CAPABILITIES, {
    canRepresent: (representation, candidate) =>
      canRenderSignalRepresentation(candidate, representation),
  });
  if (!plan) {
    throw new Error(`No Feishu delivery plan for signal kind ${signal.kind}`);
  }

  const presentation = renderSignalPresentation(signal, plan.representation);

  if (plan.carrier.id === 'feishu.card' && presentation.kind === 'interaction') {
    return { kind: 'card', body: interactionCard(presentation.request), plan };
  }

  return {
    kind: 'markdown',
    body: presentation.kind === 'markdown' ? presentation.body : presentation.request.summary,
    plan,
    supportRequest: createDeliverySupportRequest(signal, plan.representation.id),
  };
}
