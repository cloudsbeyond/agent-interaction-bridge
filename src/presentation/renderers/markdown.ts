import type {
  PresentationBlock,
  PresentationColumn,
  PresentationDocument,
  PresentationMetric,
} from '../document';

export function renderPresentationMarkdownDocument(document: PresentationDocument): string {
  return [
    `## ${document.title}`,
    ...document.blocks.map(renderBlock),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function renderBlock(block: PresentationBlock): string {
  switch (block.kind) {
    case 'lead':
      return [`**${block.title ?? '摘要'}**`, block.text].join('\n');
    case 'section':
      return [`**${block.title}**`, renderLines(block.lines)].join('\n');
    case 'flow':
      return [
        block.title ? `**${block.title}**` : '',
        ...block.steps.map(renderColumn),
      ].filter(Boolean).join('\n\n');
    case 'metric_grid':
      return block.metrics.map(renderMetric).join('\n');
    case 'columns':
      return block.columns.map(renderColumn).join('\n\n');
    case 'divider':
      return '---';
    case 'html':
      return block.html;
  }
}

function renderColumn(column: PresentationColumn): string {
  return [`**${column.title}**`, renderLines(column.lines)].join('\n');
}

function renderMetric(metric: PresentationMetric): string {
  return `- **${metric.label}**：${metric.value}`;
}

function renderLines(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join('\n');
}
