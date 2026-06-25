import type {
  PresentationBlock,
  PresentationColumn,
  PresentationDocument,
  PresentationMetric,
} from '../document';

export function renderPresentationHtmlDocument(document: PresentationDocument): string {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(document.title)}</title>`,
    '<style>',
    css(),
    '</style>',
    '</head>',
    `<body class="layout-${escapeHtml(document.layout)}">`,
    '<main class="presentation">',
    `<header><h1>${escapeHtml(document.title)}</h1></header>`,
    ...document.blocks.map(renderBlock),
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

function renderBlock(block: PresentationBlock): string {
  switch (block.kind) {
    case 'lead':
      return `<section class="lead">${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ''}<p>${escapeHtml(block.text)}</p></section>`;
    case 'section':
      return `<section class="section"><h2>${escapeHtml(block.title)}</h2>${renderList(block.lines)}</section>`;
    case 'flow':
      return `<section class="flow">${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ''}<div class="flow-grid">${block.steps.map(renderColumn).join('')}</div></section>`;
    case 'metric_grid':
      return `<section class="metric-grid">${block.metrics.map(renderMetric).join('')}</section>`;
    case 'columns':
      return `<section class="columns">${block.columns.map(renderColumn).join('')}</section>`;
    case 'divider':
      return '<hr>';
    case 'html':
      return `<section class="html-block">${block.html}</section>`;
  }
}

function renderColumn(column: PresentationColumn): string {
  return `<article class="panel"><h3>${escapeHtml(column.title)}</h3>${renderList(column.lines)}</article>`;
}

function renderMetric(metric: PresentationMetric): string {
  return `<article class="metric"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong></article>`;
}

function renderList(lines: string[]): string {
  if (lines.length === 0) return '';
  return `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
}

function css(): string {
  return `
:root { color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; background: #f7f8fa; color: #1f2329; }
.presentation { max-width: 960px; margin: 0 auto; padding: 32px 20px 48px; }
header { margin-bottom: 20px; }
h1 { font-size: 30px; line-height: 1.2; margin: 0; letter-spacing: 0; }
h2 { font-size: 17px; margin: 0 0 10px; letter-spacing: 0; }
h3 { font-size: 14px; margin: 0 0 8px; letter-spacing: 0; }
.lead, .section, .flow, .columns, .metric-grid { margin-top: 14px; }
.lead, .section, .panel, .metric { background: #fff; border: 1px solid #dee0e3; border-radius: 8px; padding: 14px; }
.lead p { margin: 0; line-height: 1.6; }
.flow-grid, .columns, .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.panel, .metric { min-width: 0; }
.metric span { display: block; color: #646a73; font-size: 12px; margin-bottom: 6px; }
.metric strong { display: block; font-size: 15px; line-height: 1.4; }
ul { margin: 0; padding-left: 18px; }
li { margin: 4px 0; line-height: 1.55; }
hr { border: 0; border-top: 1px solid #dee0e3; margin: 16px 0; }
`.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
