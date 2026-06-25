import { describe, expect, it } from 'vitest';
import { extractInteractionRequests, stripInteractionBlocks } from './protocol';

describe('interaction protocol', () => {
  it('extracts agent interaction requests from fenced JSON blocks', () => {
    const text = [
      'I need approval.',
      '```json',
      '{',
      '  "agent_interaction": {',
      '    "id": "risk-1",',
      '    "kind": "risk_approval",',
      '    "title": "Delete dist?",',
      '    "summary": "Clean build output before rebuilding.",',
      '    "risk": "destructive filesystem change",',
      '    "proposedAction": "rm -rf dist",',
      '    "options": ["approve", "modify", "reject"]',
      '  }',
      '}',
      '```',
    ].join('\n');

    expect(extractInteractionRequests(text)).toEqual([
      {
        id: 'risk-1',
        kind: 'risk_approval',
        title: 'Delete dist?',
        summary: 'Clean build output before rebuilding.',
        risk: 'destructive filesystem change',
        proposedAction: 'rm -rf dist',
        options: ['approve', 'modify', 'reject'],
      },
    ]);
  });

  it('does not treat unrelated interaction aliases as the current protocol', () => {
    const text = '```json\n{"surface_interaction":{"id":"q1","kind":"choice","title":"Pick","summary":"Choose one"}}\n```';

    expect(extractInteractionRequests(text)).toEqual([]);
    expect(stripInteractionBlocks(text)).toBe(text);
  });

  it('removes interaction protocol blocks from visible text', () => {
    const text = 'Before\n```json\n{"agent_interaction":{"id":"q1","kind":"choice","title":"Pick","summary":"Choose one"}}\n```\nAfter';

    expect(stripInteractionBlocks(text)).toBe('Before\nAfter');
  });

  it('does not leak unsupported interaction JSON to chat output', () => {
    const text =
      '```json\n{"agent_interaction":{"id":"retry-context","kind":"human_feedback","title":"需要重试目标","summary":"请补充要重试的具体目标。","risk":"none","proposedAction":"等待用户补充"}}\n```';

    expect(extractInteractionRequests(text)).toEqual([]);
    expect(stripInteractionBlocks(text)).toBe('**需要重试目标**\n请补充要重试的具体目标。');
  });
});
