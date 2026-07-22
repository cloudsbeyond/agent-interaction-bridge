import {
  isSessionIdentityLine,
  renderSessionIdentityMarkdown,
  type InteractionSessionIdentity,
} from '../presentation/session-identity';

interface CardKitCard {
  body: {
    elements: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface LegacyCard {
  elements: unknown[];
  [key: string]: unknown;
}

function isCardKitCard(card: object): card is CardKitCard {
  const body = (card as { body?: unknown }).body;
  return Boolean(
    body
    && typeof body === 'object'
    && Array.isArray((body as { elements?: unknown }).elements),
  );
}

function isLegacyCard(card: object): card is LegacyCard {
  return Array.isArray((card as { elements?: unknown }).elements);
}

function isCardKitSessionIdentityElement(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  const candidate = element as { tag?: unknown; content?: unknown };
  return candidate.tag === 'markdown' && isSessionIdentityLine(candidate.content);
}

function isLegacySessionIdentityElement(element: unknown): boolean {
  if (!element || typeof element !== 'object') return false;
  const candidate = element as {
    tag?: unknown;
    content?: unknown;
    text?: { tag?: unknown; content?: unknown };
  };
  return (
    candidate.tag === 'markdown'
    && isSessionIdentityLine(candidate.content)
  ) || (
    candidate.tag === 'div'
    && candidate.text?.tag === 'lark_md'
    && isSessionIdentityLine(candidate.text.content)
  );
}

export function appendSessionIdentityCard(
  card: object,
  identity: InteractionSessionIdentity,
): object {
  const footer = renderSessionIdentityMarkdown(identity);
  if (isCardKitCard(card)) {
    return {
      ...card,
      body: {
        ...card.body,
        elements: [
          ...card.body.elements.filter((element) => !isCardKitSessionIdentityElement(element)),
          { tag: 'markdown', content: footer, text_size: 'notation' },
        ],
      },
    };
  }
  if (isLegacyCard(card)) {
    return {
      ...card,
      elements: [
        ...card.elements.filter((element) => !isLegacySessionIdentityElement(element)),
        { tag: 'markdown', content: footer, text_size: 'notation' },
      ],
    };
  }
  return card;
}
