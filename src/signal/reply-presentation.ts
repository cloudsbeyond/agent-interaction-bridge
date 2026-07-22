import type { RunState } from '../card/run-state';
import { normalizeChatPresentation } from '../card/chat-presentation-contract';
import { PRESENTATION_SECTION_LABELS } from '../presentation/section-profiles';
import { stripTrailingSessionIdentity } from '../presentation/session-identity';

const MAX_SECTION_BODY_CHARS = 420;
const MAX_SECTIONS = 5;
const DYNAMIC_UI_MIN_SECTIONS = 3;
const SECTION_LABELS = PRESENTATION_SECTION_LABELS;
const SECTION_LABEL_ALTERNATION = SECTION_LABELS.map(escapeRegExp).join('|');
const INLINE_BOLD_SECTION_LABEL_RE = new RegExp(
  `\\*\\*\\s*(${SECTION_LABEL_ALTERNATION})\\s*\\*\\*\\s*[-:：]?`,
  'gu',
);
const INLINE_PLAIN_SECTION_LABEL_RE = new RegExp(
  `(^|[\\s，,。;；])(${SECTION_LABEL_ALTERNATION})\\s*[-:：]\\s*`,
  'gu',
);

export interface AnswerCardPresentation {
  title: string;
  layout?: 'generic' | 'architecture' | 'report' | 'comparison' | 'visual';
  sections: AnswerCardSection[];
}

export interface AnswerCardSection {
  title: string;
  body: string;
}

export interface AnswerCardPresentationOptions {
  mode?: 'default' | 'dynamic_ui';
  userText?: string;
}

export function presentAnswerCard(
  state: RunState,
  options: AnswerCardPresentationOptions = {},
): AnswerCardPresentation {
  const content = finalText(state);
  const parsed = parsePresentationText(content);
  if (options.mode !== 'dynamic_ui') return parsed;
  if (hasUsefulCardShape(parsed)) return withDynamicLayout(parsed, options.userText);
  return presentDynamicUiCard(content, options.userText);
}

function finalText(state: RunState): string {
  return normalizeChatPresentation(stripTrailingSessionIdentity(
    state.blocks
      .filter((block) => block.kind === 'text')
      .map((block) => block.content)
      .join('\n\n'),
  ));
}

function parsePresentationText(content: string): AnswerCardPresentation {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      title: 'Agent 回复',
      sections: [{ title: '内容', body: '_（未返回内容）_' }],
    };
  }

  const firstHeading = headingText(lines[0]!);
  const title = firstHeading ?? 'Agent 回复';
  const rest = firstHeading ? lines.slice(1) : lines;
  const sections = sectionsFromLines(rest);
  return {
    title,
    sections: sections.length > 0 ? sections.slice(0, MAX_SECTIONS) : [{ title: '内容', body: rest.join('\n') }],
  };
}

function sectionsFromLines(lines: string[]): AnswerCardSection[] {
  const sections: AnswerCardSection[] = [];
  let current: AnswerCardSection | undefined;

  for (const rawLine of lines) {
    for (const line of splitInlineSectionLines(rawLine)) {
      const heading = headingText(line) ?? labelHeading(line);
      if (heading) {
        if (current && current.body.trim()) sections.push(compactSection(current));
        current = { title: heading, body: '' };
        continue;
      }

      if (!current) current = { title: '摘要', body: '' };
      current.body = current.body ? `${current.body}\n${line}` : line;
    }
  }

  if (current && current.body.trim()) sections.push(compactSection(current));
  return sections;
}

function splitInlineSectionLines(line: string): string[] {
  return line
    .replace(INLINE_BOLD_SECTION_LABEL_RE, '\n**$1**\n')
    .replace(INLINE_PLAIN_SECTION_LABEL_RE, (_match, prefix: string, label: string) => `${prefix}\n${label}\n`)
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);
}

function headingText(line: string): string | undefined {
  const heading = line.match(/^#{1,6}\s+(.+)$/);
  const headingBody = heading?.[1];
  if (headingBody) return stripMarkdown(headingBody);

  const boldOnly = line.match(/^\*\*(.+?)\*\*[:：]?$/);
  const boldBody = boldOnly?.[1];
  if (boldBody) return stripMarkdown(boldBody);

  return undefined;
}

function labelHeading(line: string): string | undefined {
  const normalized = stripMarkdown(line);
  if (
    new RegExp(`^(?:${SECTION_LABEL_ALTERNATION}|模块[一二三四五六七八九十\\d]+|要点\\s*[一二三四五六七八九十\\d]+)$`).test(normalized)
  ) {
    return normalized;
  }
  return undefined;
}

function compactSection(section: AnswerCardSection): AnswerCardSection {
  const body = section.body.trim();
  return {
    title: section.title,
    body: body.length > MAX_SECTION_BODY_CHARS ? `${body.slice(0, MAX_SECTION_BODY_CHARS)}...` : body,
  };
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s+/, '')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasUsefulCardShape(presentation: AnswerCardPresentation): boolean {
  if (presentation.sections.length >= DYNAMIC_UI_MIN_SECTIONS) return true;
  const longestBody = presentation.sections.reduce(
    (max, section) => Math.max(max, section.body.length),
    0,
  );
  return presentation.sections.length > 1 && longestBody <= 260;
}

function withDynamicLayout(
  presentation: AnswerCardPresentation,
  userText = '',
): AnswerCardPresentation {
  if (isReportRequest(userText)) {
    return { ...presentation, title: presentation.title || '进展报告', layout: 'report' };
  }
  if (isComparisonRequest(userText)) {
    return { ...presentation, title: presentation.title || '对比', layout: 'comparison' };
  }
  if (isArchitectureRequest(userText)) {
    return { ...presentation, title: presentation.title || '架构说明', layout: 'architecture' };
  }
  return { ...presentation, layout: 'visual' };
}

function presentDynamicUiCard(content: string, userText = ''): AnswerCardPresentation {
  const chunks = contentChunks(content);
  if (isReportRequest(userText)) {
    return {
      title: '进展报告',
      layout: 'report',
      sections: compactSections([], chunks),
    };
  }

  if (isComparisonRequest(userText)) {
    return {
      title: '对比',
      layout: 'comparison',
      sections: compactSections([], chunks),
    };
  }

  if (isArchitectureRequest(userText)) {
    return {
      title: '架构说明',
      layout: 'architecture',
      sections: compactSections([], chunks),
    };
  }

  return {
    title: '可视化回答',
    layout: 'visual',
    sections: compactSections([], chunks),
  };
}

function compactSections(
  preferred: Array<AnswerCardSection | undefined>,
  chunks: string[],
): AnswerCardSection[] {
  if (chunks.length === 0) return [{ title: '内容', body: '_（未返回内容）_' }];

  const sections = preferred.filter((section): section is AnswerCardSection =>
    Boolean(section?.body.trim()),
  );
  if (sections.length >= DYNAMIC_UI_MIN_SECTIONS) {
    return sections.slice(0, MAX_SECTIONS).map(compactSection);
  }

  const fallback = fallbackSections(chunks);
  return [...sections, ...fallback]
    .filter(uniqueSection())
    .slice(0, MAX_SECTIONS)
    .map(compactSection);
}

function fallbackSections(chunks: string[]): AnswerCardSection[] {
  return chunks.slice(0, MAX_SECTIONS).map((chunk, index) => ({
    title: `要点 ${index + 1}`,
    body: bulletBody([chunk]),
  }));
}

function uniqueSection(): (section: AnswerCardSection) => boolean {
  const seenTitles = new Set<string>();
  const seenBodies = new Set<string>();
  return (section) => {
    const title = section.title.trim();
    const body = section.body.trim();
    if (seenTitles.has(title) || seenBodies.has(body)) return false;
    seenTitles.add(title);
    seenBodies.add(body);
    return true;
  };
}

function bulletBody(chunks: string[]): string {
  return chunks.map((chunk) => `- ${chunk}`).join('\n');
}

function contentChunks(content: string): string[] {
  const cleaned = stripMarkdown(content)
    .replace(/([。！？!?；;])/g, '$1\n')
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .map((chunk) => stripMarkdown(chunk).replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (cleaned.length > 1) return cleaned.map(limitChunk);
  const single = cleaned[0] ?? '';
  if (!single) return [];
  return splitLongChunk(single).map(limitChunk);
}

function splitLongChunk(chunk: string): string[] {
  if (chunk.length <= 120) return [chunk];
  const out: string[] = [];
  for (let i = 0; i < chunk.length; i += 120) {
    out.push(chunk.slice(i, i + 120).trim());
  }
  return out.filter(Boolean);
}

function limitChunk(chunk: string): string {
  return chunk.length > 180 ? `${chunk.slice(0, 180)}...` : chunk;
}

function isArchitectureRequest(text: string): boolean {
  return /(架构|architecture|画)/i.test(text);
}

function isReportRequest(text: string): boolean {
  return /(报告|report|进展|周报|状态)/i.test(text);
}

function isComparisonRequest(text: string): boolean {
  return /(对比|比较|差异|取舍|vs\.?|versus)/i.test(text);
}
