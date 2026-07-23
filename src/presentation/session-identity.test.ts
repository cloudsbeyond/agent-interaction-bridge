import { describe, expect, it } from 'vitest';
import {
  appendSessionIdentityMarkdown,
  appendSessionIdentityPlainText,
  compactBridgeSessionIdentifier,
  compactDomainSessionIdentifier,
  renderSessionIdentityMarkdown,
} from './session-identity';

describe('session identity presentation', () => {
  it('keeps identifiers up to 8 characters unchanged', () => {
    expect(compactBridgeSessionIdentifier('12345678')).toBe('12345678');
    expect(compactDomainSessionIdentifier('12345678')).toBe('12345678');
  });

  it('uses the Bridge suffix and Domain prefix for long identifiers', () => {
    expect(compactBridgeSessionIdentifier('bridge-scope-prefix-50d3c05e'))
      .toBe('50d3c05e');
    expect(compactDomainSessionIdentifier('019f89b0-domain-session-suffix'))
      .toBe('019f89b0');
  });

  it('renders role-specific compaction in the footer', () => {
    expect(renderSessionIdentityMarkdown({
      bridge: 'bridge-scope-prefix-50d3c05e',
      domain: '019f89b0-domain-session-suffix',
      elapsedMs: 75_000,
    })).toBe(
      '> Session：📥 - 50d3c05e | 🤖 - 019f89b0 | ⏳ - 1m 15s',
    );
  });

  it('renders a missing Domain Agent reference explicitly', () => {
    expect(renderSessionIdentityMarkdown({ bridge: 'chat-1' })).toBe(
      '> Session：📥 - chat-1 | 🤖 - -',
    );
  });

  it('appends the identity after markdown and plain-text bodies', () => {
    expect(appendSessionIdentityMarkdown('完成。', { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\n> Session：📥 - bridge | 🤖 - domain');
    expect(appendSessionIdentityPlainText('完成。', { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\nSession：📥 - bridge | 🤖 - domain');
  });

  it('replaces a Domain-emitted trailing footer instead of duplicating it', () => {
    const markdownBody = [
      '完成。',
      '',
      '> Session：Bridge - old-bridge | Domain - old-domain | 耗时 - 2m 3s',
    ].join('\n');
    const plainBody = [
      '完成。',
      '',
      'Session：🌉 - old-bridge | 🤖 - old-domain | ⏱️ - 2m 3s',
    ].join('\n');

    expect(appendSessionIdentityMarkdown(markdownBody, { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\n> Session：📥 - bridge | 🤖 - domain');
    expect(appendSessionIdentityPlainText(plainBody, { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\nSession：📥 - bridge | 🤖 - domain');
  });

  it('replaces the previous footer format during rollout', () => {
    const body = '完成。\n\n> Bridge Session: old-bridge | Domain Session: old-domain';
    expect(appendSessionIdentityMarkdown(body, { bridge: 'bridge', domain: 'domain' }))
      .toBe('完成。\n\n> Session：📥 - bridge | 🤖 - domain');
  });
});
