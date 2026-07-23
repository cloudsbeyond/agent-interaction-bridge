import { describe, expect, it } from 'vitest';
import { appendSessionIdentityCard } from './session-identity';

describe('appendSessionIdentityCard', () => {
  it('appends a notation footer to CardKit 2.0 cards without mutating input', () => {
    const card = { schema: '2.0', body: { elements: [{ tag: 'markdown', content: 'body' }] } };
    const result = appendSessionIdentityCard(card, { bridge: 'bridge', domain: 'domain' }) as {
      body: { elements: Array<Record<string, unknown>> };
    };

    expect(card.body.elements).toHaveLength(1);
    expect(result.body.elements.at(-1)).toEqual({
      tag: 'markdown',
      content: '> Session：📥 - bridge | 🤖 - domain',
      text_size: 'notation',
    });
  });

  it('uses the full Markdown component for legacy cards so quote syntax is rendered', () => {
    const card = { elements: [{ tag: 'div', text: { tag: 'lark_md', content: 'body' } }] };
    const result = appendSessionIdentityCard(card, { bridge: 'bridge', domain: 'domain' }) as {
      elements: Array<Record<string, unknown>>;
    };

    expect(card.elements).toHaveLength(1);
    expect(result.elements.at(-1)).toEqual({
      tag: 'markdown',
      content: '> Session：📥 - bridge | 🤖 - domain',
      text_size: 'notation',
    });
  });

  it('replaces a legacy lark_md footer with one native Markdown footer', () => {
    const card = {
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: 'body' } },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '> Session：Bridge - old-bridge | Domain - old-domain',
          },
        },
      ],
    };
    const result = appendSessionIdentityCard(card, { bridge: 'bridge', domain: 'domain' }) as {
      elements: Array<Record<string, unknown>>;
    };

    expect(result.elements).toHaveLength(2);
    expect(JSON.stringify(result).match(/Session：📥 -/g)).toHaveLength(1);
    expect(result.elements.at(-1)).toEqual({
      tag: 'markdown',
      content: '> Session：📥 - bridge | 🤖 - domain',
      text_size: 'notation',
    });
  });

  it('replaces an existing top-level footer so card decoration is idempotent', () => {
    const card = {
      schema: '2.0',
      body: {
        elements: [
          { tag: 'markdown', content: 'body' },
          {
            tag: 'markdown',
            content: '> Session：🌉 - old-bridge | 🤖 - old-domain | ⏱️ - 2m 3s',
            text_size: 'notation',
          },
        ],
      },
    };
    const result = appendSessionIdentityCard(card, { bridge: 'bridge', domain: 'domain' }) as {
      body: { elements: Array<Record<string, unknown>> };
    };

    expect(result.body.elements).toHaveLength(2);
    expect(JSON.stringify(result).match(/Session：📥 -/g)).toHaveLength(1);
    expect(result.body.elements.at(-1)).toEqual({
      tag: 'markdown',
      content: '> Session：📥 - bridge | 🤖 - domain',
      text_size: 'notation',
    });
  });
});
