import { describe, expect, test } from 'vitest';
import {
  FEISHU_CARD_CAPABILITIES,
  HTML_PRESENTATION_CAPABILITIES,
  MARKDOWN_PRESENTATION_CAPABILITIES,
  supportsPresentationBlock,
} from './capabilities';

describe('presentation surface capabilities', () => {
  test('records Feishu card layout primitives explicitly', () => {
    expect(FEISHU_CARD_CAPABILITIES.components).toEqual(
      expect.arrayContaining(['markdown', 'div', 'column_set', 'interactive_container', 'collapsible_panel']),
    );
    expect(supportsPresentationBlock(FEISHU_CARD_CAPABILITIES, { kind: 'columns', columns: [] })).toBe(true);
    expect(supportsPresentationBlock(FEISHU_CARD_CAPABILITIES, { kind: 'html', html: '<b>x</b>' })).toBe(false);
  });

  test('keeps HTML as the broad default expression surface', () => {
    expect(HTML_PRESENTATION_CAPABILITIES.defaultForRichPresentation).toBe(true);
    expect(supportsPresentationBlock(HTML_PRESENTATION_CAPABILITIES, { kind: 'html', html: '<b>x</b>' })).toBe(true);
    expect(supportsPresentationBlock(MARKDOWN_PRESENTATION_CAPABILITIES, { kind: 'flow', steps: [] })).toBe(false);
  });
});
