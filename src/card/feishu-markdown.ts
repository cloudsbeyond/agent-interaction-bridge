const FENCE_LINE_RE = /^\s*(```|~~~)/;

export function formatFeishuCardMarkdown(content: string): string {
  return formatFeishuMarkdownWithHardBreaks(content);
}

export function formatFeishuFinalMarkdown(content: string): string {
  return formatFeishuMarkdownWithHardBreaks(content);
}

function formatFeishuMarkdownWithHardBreaks(content: string): string {
  let insideFence = false;
  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (FENCE_LINE_RE.test(line)) {
        insideFence = !insideFence;
        return line;
      }
      if (insideFence || line.trim() === '') return line;
      return ensureHardBreak(line);
    })
    .join('\n');
}

function ensureHardBreak(line: string): string {
  return line.endsWith('  ') ? line : `${line.replace(/[ \t]+$/g, '')}  `;
}
