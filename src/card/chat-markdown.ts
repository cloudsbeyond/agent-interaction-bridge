const TEXT_FENCE_RE = /```(?:text|txt|plain)\s*\n([\s\S]*?)```/gi;
const CODE_FENCE_RE = /```[\s\S]*?```/g;
const HEADING_WITHOUT_SPACE_RE = /^(#{1,6})(?!#)(?=\S)/gm;
const CJK_BULLET_WITHOUT_SPACE_RE = /^([ \t]*)-(?=[\u3400-\u9fff])/gm;
const CJK_INLINE_BULLET_RE = /([^\s\n])-\s+(?=[\u3400-\u9fff])/g;

export function normalizeChatMarkdown(content: string): string {
  const withoutTextFences = content.replace(TEXT_FENCE_RE, (_full, body: string) => String(body).trim());
  return transformOutsideCodeFences(withoutTextFences, normalizeMarkdownChunk)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeMarkdownChunk(content: string): string {
  return content
    .replace(HEADING_WITHOUT_SPACE_RE, '$1 ')
    .replace(CJK_BULLET_WITHOUT_SPACE_RE, '$1- ')
    .replace(CJK_INLINE_BULLET_RE, '$1\n- ');
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
