import { normalizeChatMarkdown } from './chat-markdown';
import { stripInteractionBlocks } from '../interaction/protocol';

export const CHAT_PRESENTATION_MAX_PARAGRAPH_CHARS = 280;

export type ChatPresentationIssueKind =
  | 'text_fence'
  | 'heading_without_space'
  | 'raw_interaction_json'
  | 'dense_paragraph';

export interface ChatPresentationIssue {
  kind: ChatPresentationIssueKind;
  detail: string;
  sample: string;
}

const TEXT_FENCE_RE = /```(?:text|txt|plain)\s*\n/i;
const CODE_FENCE_RE = /```[\s\S]*?```/g;
const HEADING_WITHOUT_SPACE_RE = /^(#{1,6})(?!#)(?=\S)/m;
const RAW_INTERACTION_JSON_RE = /"agent_interaction"\s*:/i;
const HARD_SENTENCE_BOUNDARY = /[。！？!?；;]/;
const SOFT_BOUNDARY = /[，,、]/;

export function normalizeChatPresentation(content: string): string {
  return transformOutsideCodeFences(normalizeChatMarkdown(stripInteractionBlocks(content)), splitDenseParagraphs)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function inspectChatPresentation(content: string): ChatPresentationIssue[] {
  const issues: ChatPresentationIssue[] = [];
  const proseOnly = content.replace(CODE_FENCE_RE, '\n\n');

  if (TEXT_FENCE_RE.test(content)) {
    issues.push(issue('text_fence', 'Text fences render poorly in chat surfaces.', content));
  }
  if (HEADING_WITHOUT_SPACE_RE.test(proseOnly)) {
    issues.push(issue('heading_without_space', 'Markdown headings need a space after #.', content));
  }
  if (RAW_INTERACTION_JSON_RE.test(content)) {
    issues.push(
      issue('raw_interaction_json', 'Structured interaction JSON must not be visible chat text.', content),
    );
  }

  for (const paragraph of inspectableParagraphs(content)) {
    if (paragraph.length > CHAT_PRESENTATION_MAX_PARAGRAPH_CHARS) {
      issues.push(issue('dense_paragraph', 'Chat prose should be split into readable chunks.', paragraph));
    }
  }

  return issues;
}

function issue(kind: ChatPresentationIssueKind, detail: string, content: string): ChatPresentationIssue {
  return {
    kind,
    detail,
    sample: content.trim().replace(/\s+/g, ' ').slice(0, 120),
  };
}

function transformOutsideCodeFences(
  content: string,
  transform: (chunk: string) => string,
): string {
  let out = '';
  let last = 0;
  for (const match of content.matchAll(CODE_FENCE_RE)) {
    const index = match.index ?? 0;
    out += transform(content.slice(last, index));
    out += match[0];
    last = index + match[0].length;
  }
  out += transform(content.slice(last));
  return out;
}

function splitDenseParagraphs(content: string): string {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => {
      const trimmed = paragraph.trim();
      if (!trimmed || shouldKeepParagraphShape(trimmed)) return paragraph;
      return packReadableChunks(sentenceChunks(trimmed)).join('\n\n');
    })
    .join('\n\n');
}

function inspectableParagraphs(content: string): string[] {
  return content
    .replace(CODE_FENCE_RE, '\n\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !shouldKeepParagraphShape(paragraph));
}

function shouldKeepParagraphShape(paragraph: string): boolean {
  return paragraph
    .split('\n')
    .some((line) => /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|[|])/.test(line.trim()));
}

function sentenceChunks(paragraph: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  for (let i = 0; i < paragraph.length; i += 1) {
    const char = paragraph.charAt(i);
    const next = charAtOrUndefined(paragraph, i + 1);
    if (!isBoundary(char, next, HARD_SENTENCE_BOUNDARY)) continue;
    chunks.push(paragraph.slice(start, i + 1).trim());
    start = i + 1;
  }
  if (start < paragraph.length) chunks.push(paragraph.slice(start).trim());

  if (chunks.length > 1) return chunks.flatMap((chunk) => splitOversizedChunk(chunk));
  return splitOversizedChunk(paragraph.trim());
}

function splitOversizedChunk(chunk: string): string[] {
  if (chunk.length <= CHAT_PRESENTATION_MAX_PARAGRAPH_CHARS) return [chunk];

  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < chunk.length; i += 1) {
    const char = chunk.charAt(i);
    const next = charAtOrUndefined(chunk, i + 1);
    if (!isBoundary(char, next, SOFT_BOUNDARY)) continue;
    out.push(chunk.slice(start, i + 1).trim());
    start = i + 1;
  }
  if (start < chunk.length) out.push(chunk.slice(start).trim());
  return out.length > 1 ? out : [chunk];
}

function packReadableChunks(chunks: string[]): string[] {
  const out: string[] = [];
  let current = '';

  for (const chunk of chunks.filter(Boolean)) {
    if (!current) {
      current = chunk;
      continue;
    }
    const candidate = `${current} ${chunk}`;
    if (candidate.length > CHAT_PRESENTATION_MAX_PARAGRAPH_CHARS) {
      out.push(current);
      current = chunk;
    } else {
      current = candidate;
    }
  }

  if (current) out.push(current);
  return out.length > 0 ? out : chunks;
}

function isBoundary(char: string, next: string | undefined, re: RegExp): boolean {
  if (!re.test(char)) return false;
  return /[。！？；，、]/.test(char) || next === undefined || /\s/.test(next);
}

function charAtOrUndefined(value: string, index: number): string | undefined {
  return index < value.length ? value.charAt(index) : undefined;
}
