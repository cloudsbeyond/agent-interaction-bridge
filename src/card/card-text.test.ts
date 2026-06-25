import { describe, expect, test } from 'vitest';
import {
  displayHomeRelativePath,
  escapeInlineCode,
  escapeLarkMarkdown,
  truncateText,
} from './card-text';

describe('card text helpers', () => {
  test('escapes Lark markdown control characters without changing content semantics', () => {
    expect(escapeLarkMarkdown('*_`\\')).toBe('\\*\\_\\`\\\\');
    expect(escapeLarkMarkdown('hello')).toBe('hello');
  });

  test('escapes inline code delimiters for card markdown', () => {
    expect(escapeInlineCode('model`name')).toBe("model'name");
  });

  test('displays paths relative to the configured home directory', () => {
    const home = ['/Users', 'alice'].join('/');
    expect(displayHomeRelativePath(home, home)).toBe('~');
    expect(displayHomeRelativePath(`${home}/project`, home)).toBe('~/project');
    expect(displayHomeRelativePath('/tmp/project', home)).toBe('/tmp/project');
  });

  test('truncates long text with an ellipsis only when needed', () => {
    expect(truncateText('abcdef', 4)).toBe('abcd…');
    expect(truncateText('abc', 4)).toBe('abc');
  });
});
