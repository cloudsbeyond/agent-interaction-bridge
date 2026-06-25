import { PRESENTATION_SECTION_LABELS } from './section-profiles';

export type PresentationLayout =
  | 'generic'
  | 'architecture'
  | 'report'
  | 'comparison'
  | 'visual';

export interface PresentationDocument {
  title: string;
  layout: PresentationLayout;
  blocks: PresentationBlock[];
}

export type PresentationBlock =
  | PresentationLeadBlock
  | PresentationSectionBlock
  | PresentationFlowBlock
  | PresentationMetricGridBlock
  | PresentationColumnsBlock
  | PresentationDividerBlock
  | PresentationHtmlBlock;

export interface PresentationLeadBlock {
  kind: 'lead';
  title?: string;
  text: string;
}

export interface PresentationSectionBlock {
  kind: 'section';
  title: string;
  lines: string[];
}

export interface PresentationFlowBlock {
  kind: 'flow';
  title?: string;
  steps: PresentationColumn[];
}

export interface PresentationMetricGridBlock {
  kind: 'metric_grid';
  metrics: PresentationMetric[];
}

export interface PresentationColumnsBlock {
  kind: 'columns';
  columns: PresentationColumn[];
}

export interface PresentationDividerBlock {
  kind: 'divider';
}

export interface PresentationHtmlBlock {
  kind: 'html';
  html: string;
}

export interface PresentationColumn {
  title: string;
  lines: string[];
}

export interface PresentationMetric {
  label: string;
  value: string;
}

const INLINE_LABELS = PRESENTATION_SECTION_LABELS;

const INLINE_LABEL_PATTERN = new RegExp(
  `\\*\\*\\s*(?:${INLINE_LABELS.map(escapeRegExp).join('|')})\\s*\\*\\*\\s*[-:：]?`,
  'gu',
);

const LEADING_LABEL_PATTERN = new RegExp(
  `^(?:${INLINE_LABELS.map(escapeRegExp).join('|')})\\s*[-:：]\\s*`,
  'u',
);

const STRUCTURAL_SEPARATOR_PATTERN = new RegExp(
  '[-–—]\\s*(?=[\\p{Script=Han}A-Z])',
  'gu',
);

export function isPresentationLayout(value: unknown): value is PresentationLayout {
  return (
    value === 'generic' ||
    value === 'architecture' ||
    value === 'report' ||
    value === 'comparison' ||
    value === 'visual'
  );
}

export function bodyToLines(body: string): string[] {
  const seen = new Set<string>();
  return normalizeBodyText(body)
    .split('\n')
    .flatMap(splitStructuralLine)
    .map(cleanLine)
    .filter((line) => {
      if (!line || seen.has(line)) return false;
      seen.add(line);
      return true;
    });
}

export function firstLine(body: string): string {
  return bodyToLines(body)[0] ?? '';
}

export function compactLine(body: string, maxChars = 80): string {
  const line = firstLine(body) || cleanLine(body);
  if (line.length <= maxChars) return line;
  return `${line.slice(0, maxChars).trimEnd()}...`;
}

function normalizeBodyText(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(INLINE_LABEL_PATTERN, '\n')
    .replace(/^#{1,6}\s+/gmu, '')
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1');
}

function splitStructuralLine(line: string): string[] {
  return line
    .replace(STRUCTURAL_SEPARATOR_PATTERN, (separator, offset: number, input: string) => {
      const previous = input.charAt(offset - 1);
      return previous === ':' || previous === '：' ? separator : '\n';
    })
    .split('\n');
}

function cleanLine(line: string): string {
  const cleaned = line
    .replace(/^\s*[-*•]\s+/, '')
    .replace(LEADING_LABEL_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || INLINE_LABELS.includes(cleaned)) return '';
  return cleaned;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
