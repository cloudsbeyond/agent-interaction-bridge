import type { PresentationBlock } from './document';

export type PresentationSurface = 'feishu_card' | 'html' | 'markdown';

export type PresentationComponent =
  | 'markdown'
  | 'div'
  | 'column_set'
  | 'interactive_container'
  | 'collapsible_panel'
  | 'hr'
  | 'html';

export interface PresentationSurfaceCapabilities {
  surface: PresentationSurface;
  defaultForRichPresentation: boolean;
  components: PresentationComponent[];
}

export const FEISHU_CARD_CAPABILITIES: PresentationSurfaceCapabilities = {
  surface: 'feishu_card',
  defaultForRichPresentation: false,
  components: [
    'markdown',
    'div',
    'column_set',
    'interactive_container',
    'collapsible_panel',
    'hr',
  ],
};

export const HTML_PRESENTATION_CAPABILITIES: PresentationSurfaceCapabilities = {
  surface: 'html',
  defaultForRichPresentation: true,
  components: [
    'markdown',
    'div',
    'column_set',
    'interactive_container',
    'collapsible_panel',
    'hr',
    'html',
  ],
};

export const MARKDOWN_PRESENTATION_CAPABILITIES: PresentationSurfaceCapabilities = {
  surface: 'markdown',
  defaultForRichPresentation: false,
  components: ['markdown', 'hr'],
};

export function supportsPresentationBlock(
  capabilities: PresentationSurfaceCapabilities,
  block: PresentationBlock,
): boolean {
  switch (block.kind) {
    case 'lead':
    case 'section':
      return capabilities.components.includes('markdown');
    case 'divider':
      return capabilities.components.includes('hr');
    case 'flow':
    case 'columns':
    case 'metric_grid':
      return capabilities.components.includes('column_set');
    case 'html':
      return capabilities.components.includes('html');
  }
}
