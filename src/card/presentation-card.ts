import type { AnswerCardPresentation } from '../signal/reply-presentation';
import { answerPresentationToDocument } from '../presentation/templates';
import { renderFeishuCardDocument } from '../presentation/renderers/feishu-card';

export function renderPresentationCard(presentation: AnswerCardPresentation): object {
  return renderFeishuCardDocument(answerPresentationToDocument(presentation));
}
