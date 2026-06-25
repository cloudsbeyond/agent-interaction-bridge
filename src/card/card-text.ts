import { homedir } from 'node:os';

export function escapeLarkMarkdown(value: string): string {
  return value.replace(/([*_`\\])/g, '\\$1');
}

export function escapeInlineCode(value: string): string {
  return value.replace(/`/g, "'");
}

export function displayHomeRelativePath(value: string, home: string = homedir()): string {
  if (!home) return value;
  if (value === home) return '~';
  if (value.startsWith(`${home}/`)) return `~/${value.slice(home.length + 1)}`;
  return value;
}

export function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}
