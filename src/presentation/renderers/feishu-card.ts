import type {
  PresentationBlock,
  PresentationColumn,
  PresentationDocument,
  PresentationMetric,
} from '../document';
import { formatFeishuCardMarkdown } from '../../card/feishu-markdown';

export function renderFeishuCardDocument(document: PresentationDocument): object {
  const elements: object[] = [
    titleBlock(document.title),
    ...document.blocks.flatMap((block) => renderBlock(block, document.layout === 'generic')),
  ];

  return {
    schema: '2.0',
    config: {
      streaming_mode: false,
      summary: { content: document.title },
    },
    body: { elements },
  };
}

function renderBlock(block: PresentationBlock, generic: boolean): object[] {
  switch (block.kind) {
    case 'lead':
      return [markdown(`**${escapeMd(block.title ?? '摘要')}**\n${escapeMd(block.text)}`)];
    case 'section':
      return generic ? [collapsiblePanel(block.title, block.lines)] : [openSection(block.title, block.lines)];
    case 'flow':
      return [
        ...(block.title ? [markdown(`**${escapeMd(block.title)}**`)] : []),
        columnSet(block.steps.map(visualColumn)),
      ];
    case 'metric_grid':
      return metricRows(block.metrics).map((row) => columnSet(row.map(metricColumn)));
    case 'columns':
      return [columnSet(block.columns.map(visualColumn))];
    case 'divider':
      return [hr()];
    case 'html':
      return [markdown(block.html)];
  }
}

function titleBlock(title: string): object {
  return {
    tag: 'markdown',
    content: formatFeishuCardMarkdown(`**${escapeMd(title)}**`),
  };
}

function openSection(title: string, lines: string[]): object {
  return markdown(`**${escapeMd(title)}**\n${renderLines(lines)}`);
}

function visualColumn(column: PresentationColumn): object {
  return {
    tag: 'column',
    width: 'weighted',
    weight: 1,
    elements: [
      {
        tag: 'interactive_container',
        elements: [markdown(`**${escapeMd(column.title)}**\n${renderLines(column.lines)}`)],
        has_border: true,
        border_color: 'grey',
        corner_radius: '6px',
        padding: '8px 8px 8px 8px',
      },
    ],
  };
}

function metricColumn(metric: PresentationMetric): object {
  return {
    tag: 'column',
    width: 'weighted',
    weight: 1,
    elements: [
      {
        tag: 'interactive_container',
        elements: [markdown(`**${escapeMd(metric.label)}**\n${escapeMd(metric.value || '-')}`)],
        has_border: true,
        border_color: 'blue',
        corner_radius: '6px',
        padding: '8px 8px 8px 8px',
      },
    ],
  };
}

function metricRows(metrics: PresentationMetric[]): PresentationMetric[][] {
  const rows: PresentationMetric[][] = [];
  for (let index = 0; index < metrics.length; index += 2) {
    rows.push(metrics.slice(index, index + 2));
  }
  return rows;
}

function columnSet(columns: object[]): object {
  return {
    tag: 'column_set',
    flex_mode: 'flow',
    horizontal_spacing: 'small',
    columns,
  };
}

function collapsiblePanel(title: string, lines: string[]): object {
  return {
    tag: 'collapsible_panel',
    expanded: true,
    header: {
      title: { tag: 'markdown', content: formatFeishuCardMarkdown(`**${escapeMd(title)}**`) },
      vertical_align: 'center',
      icon: { tag: 'standard_icon', token: 'down-small-ccm_outlined', size: '16px 16px' },
      icon_position: 'follow_text',
      icon_expanded_angle: -180,
    },
    border: { color: 'grey', corner_radius: '5px' },
    vertical_spacing: '8px',
    padding: '8px 8px 8px 8px',
    elements: [markdown(renderLines(lines))],
  };
}

function markdown(content: string): object {
  return { tag: 'markdown', content: formatFeishuCardMarkdown(content), text_size: 'notation' };
}

function hr(): object {
  return { tag: 'hr' };
}

function renderLines(lines: string[]): string {
  return lines.length > 0
    ? lines.map((line) => `- ${escapeMd(line)}`).join('\n')
    : '-';
}

function escapeMd(value: string): string {
  return value.replace(/([*_`\\])/g, '\\$1');
}
