import { describe, expect, it } from 'vitest';
import {
  appendSessionIdentityMarkdown,
  appendSessionIdentityPlainText,
  compactSessionIdentifier,
  renderSessionIdentityMarkdown,
} from './session-identity';

describe('session identity presentation', () => {
  it('keeps identifiers up to 12 characters unchanged', () => {
    expect(compactSessionIdentifier('123456789012')).toBe('123456789012');
  });

  it('preserves the suffix and caps long identifiers at 12 characters', () => {
    expect(compactSessionIdentifier('scope-12345678901234567890')).toBe('901234567890');
    expect(compactSessionIdentifier('scope-12345678901234567890')).toHaveLength(12);
    expect(compactSessionIdentifier('domain-session-prefix-dc54e20e89da'))
      .toBe('dc54e20e89da');
    expect(compactSessionIdentifier('bridge-session-prefix-096950d3c05e'))
      .toBe('096950d3c05e');
  });

  it('renders a missing Domain Agent reference explicitly', () => {
    expect(renderSessionIdentityMarkdown({ bridge: 'chat-1' })).toBe(
      '> Session：Bridge - chat-1 | Domain - -',
    );
  });

  it('appends the identity after markdown and plain-text bodies', () => {
    expect(appendSessionIdentityMarkdown('完成。', { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\n> Session：Bridge - bridge | Domain - domain');
    expect(appendSessionIdentityPlainText('完成。', { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\nSession：Bridge - bridge | Domain - domain');
  });

  it('replaces a Domain-emitted trailing footer instead of duplicating it', () => {
    const markdownBody = [
      '完成。',
      '',
      '> Session：Bridge - old-bridge | Domain - old-domain',
    ].join('\n');
    const plainBody = [
      '完成。',
      '',
      'Session：Bridge - old-bridge | Domain - old-domain',
    ].join('\n');

    expect(appendSessionIdentityMarkdown(markdownBody, { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\n> Session：Bridge - bridge | Domain - domain');
    expect(appendSessionIdentityPlainText(plainBody, { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\nSession：Bridge - bridge | Domain - domain');
  });

  it('replaces the previous footer format during rollout', () => {
    const body = '完成。\n\n> Bridge Session: old-bridge | Domain Session: old-domain';
    expect(appendSessionIdentityMarkdown(body, { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\n> Session：Bridge - bridge | Domain - domain');
  });
});
