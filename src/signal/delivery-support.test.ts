import { describe, expect, test } from 'vitest';
import {
  createDeliverySupportRequest,
  isDeliverySupportAllowed,
  type DeliverySupportRequest,
} from './delivery-support';

describe('delivery support model boundary', () => {
  test('creates stateless presentation-only support requests from artifact signals', () => {
    const request = createDeliverySupportRequest(
      {
        id: 'artifact-1',
        kind: 'artifact_preview',
        title: 'HTML 产物',
        summary: '/tmp/report.html',
        artifact: {
          path: '/tmp/report.html',
          representationHint: 'html',
        },
      },
      'html',
    );

    expect(request).toMatchObject({
      sourceSignalId: 'artifact-1',
      kind: 'render_html',
      outputStyle: 'html',
      authority: 'presentation_only',
      stateless: true,
    });
    expect(request?.input).toMatchObject({
      title: 'HTML 产物',
      summary: '/tmp/report.html',
      artifactPath: '/tmp/report.html',
      sourceSignalKind: 'artifact_preview',
    });
  });

  test('does not create support requests for judgment-bearing signals', () => {
    const request = createDeliverySupportRequest(
      {
        id: 'risk-1',
        kind: 'risk_approval',
        title: 'Push branch?',
        summary: 'Codex wants to push commits.',
        risk: 'remote write',
      },
      'html',
    );

    expect(request).toBeUndefined();
  });

  test('rejects stateful or decision-making support requests', () => {
    const request: DeliverySupportRequest = {
      id: 'support-1',
      kind: 'summarize',
      outputStyle: 'markdown',
      input: { title: 'Risk', summary: 'Should we deploy?', sourceSignalKind: 'risk_approval' },
      authority: 'presentation_only',
      stateless: false,
    };

    expect(isDeliverySupportAllowed(request)).toBe(false);
    expect(
      isDeliverySupportAllowed({
        ...request,
        stateless: true,
        authority: 'decision_making',
      }),
    ).toBe(false);
  });
});
