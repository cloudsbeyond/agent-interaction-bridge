import { describe, expect, test } from 'vitest';
import { renderFeishuSignal } from './feishu-renderer';

describe('Feishu signal renderer', () => {
  test('renders risk approval as a Feishu-private interactive card', () => {
    const rendered = renderFeishuSignal({
      id: 'risk-push',
      kind: 'risk_approval',
      title: 'Push branch?',
      summary: 'Codex wants to push commits to GitHub.',
      risk: 'remote write',
      proposedAction: 'git push github main',
      actions: ['approve', 'reject'],
    });

    expect(rendered.kind).toBe('card');
    expect(rendered.plan.representation.id).toBe('interactive_card');
    expect(rendered.plan.carrier.id).toBe('feishu.card');
    expect(JSON.stringify(rendered.body)).toContain('批准执行');
    expect(JSON.stringify(rendered.body)).toContain('git push github main');
  });

  test('keeps portable artifact representation while using a Feishu markdown carrier', () => {
    const rendered = renderFeishuSignal({
      id: 'artifact-report',
      kind: 'artifact_preview',
      title: 'HTML report ready',
      summary: 'Codex generated a local report.',
      artifact: { path: '/tmp/report.html', representationHint: 'html' },
    });

    expect(rendered.kind).toBe('markdown');
    expect(rendered.plan.representation.id).toBe('html');
    expect(rendered.plan.carrier.id).toBe('feishu.markdown');
    expect(rendered.supportRequest).toMatchObject({
      kind: 'render_html',
      outputStyle: 'html',
      authority: 'presentation_only',
      stateless: true,
    });
    expect(rendered.body).toContain('HTML report ready');
    expect(rendered.body).toContain('/tmp/report.html');
  });

  test('uses image representation for image artifact previews', () => {
    const rendered = renderFeishuSignal({
      id: 'artifact-image',
      kind: 'artifact_preview',
      title: 'Image ready',
      summary: 'Codex generated a local image.',
      artifact: { path: '/tmp/report.png', representationHint: 'image' },
    });

    expect(rendered.kind).toBe('markdown');
    expect(rendered.plan.representation.id).toBe('image');
    expect(rendered.supportRequest).toMatchObject({
      kind: 'generate_image',
      outputStyle: 'image',
    });
  });

  test('falls back to markdown when a Feishu card representation is not renderable', () => {
    const rendered = renderFeishuSignal({
      kind: 'progress',
      title: 'Codex running',
      summary: 'Analyzing files.',
    });

    expect(rendered.kind).toBe('markdown');
    expect(rendered.plan.representation.id).toBe('markdown');
    expect(rendered.plan.carrier.id).toBe('feishu.markdown');
    expect(rendered.body).toContain('Codex running');
  });
});
