import { describe, expect, test } from 'vitest';
import type { StoredArtifact } from '../runtime-services/types';
import { runtimePortMock, runtimeResources } from '../test/runtime-services-fixtures';
import {
  applyFeishuDeliverySupport,
  feishuSendInputsForRenderedSignal,
} from './feishu-delivery-support';
import { renderFeishuSignal } from './feishu-renderer';

describe('Feishu delivery support', () => {
  test('automatically applies presentation model output to HTML artifact delivery', async () => {
    const rendered = renderFeishuSignal({
      id: 'artifact-html',
      kind: 'artifact_preview',
      title: 'HTML report ready',
      summary: 'Codex generated a report.',
      artifact: { path: '/tmp/report.html', representationHint: 'html' },
    });

    const enhanced = await applyFeishuDeliverySupport(rendered, {
      resources: runtimeResources([
        { id: 'model.language_completion', status: 'available', provider: 'runtime-services-rpc:text-model' },
      ]),
      runtime: runtimePortMock({
        'language.complete': async () => ({
            status: 'ok',
            capabilityId: 'language.complete',
            providerId: 'runtime-services-rpc',
            modelId: 'text-model',
            evidence: [],
            proposal: { kind: 'text', text: '已生成适合飞书阅读的报告摘要。', raw: {} },
          }),
      }),
    });

    expect(enhanced.kind).toBe('markdown');
    expect(enhanced.body).toBe('已生成适合飞书阅读的报告摘要。');
    expect(enhanced.supportOutcome).toMatchObject({
      status: 'ready',
      usedResourceId: 'model.language_completion',
    });
  });

  test('automatically stores generated image output and exposes only the artifact path', async () => {
    const rendered = renderFeishuSignal({
      id: 'artifact-image',
      kind: 'artifact_preview',
      title: '视觉产物',
      summary: '需要展示图。',
      artifact: { path: '/tmp/report.png', representationHint: 'image' },
    });
    const artifact = imageArtifact('/tmp/runtime-services/artifacts/generated.png');

    const enhanced = await applyFeishuDeliverySupport(rendered, {
      resources: runtimeResources([
        { id: 'model.image_generation', status: 'available', provider: 'runtime-services-rpc:image-model' },
      ]),
      runtime: imageRuntimePort('https://example.test/signed-image.png?token=secret-token', artifact),
    });

    expect(enhanced.body).toContain('展示产物：');
    expect(enhanced.body).toContain('/artifacts/');
    expect(enhanced.body).not.toContain('secret-token');
    expect(enhanced.supportOutcome).toMatchObject({
      status: 'ready',
      usedResourceId: 'model.image_generation',
      artifact: { mimeType: 'image/png' },
    });
  });

  test('adds a Feishu image payload for generated image artifacts', async () => {
    const rendered = renderFeishuSignal({
      id: 'artifact-image',
      kind: 'artifact_preview',
      title: '视觉产物',
      summary: '需要展示图。',
      artifact: { path: '/tmp/report.png', representationHint: 'image' },
    });
    const artifact = imageArtifact('/tmp/runtime-services/artifacts/image.png');

    const enhanced = await applyFeishuDeliverySupport(rendered, {
      resources: runtimeResources([
        { id: 'model.image_generation', status: 'available', provider: 'runtime-services-rpc:image-model' },
      ]),
      runtime: imageRuntimePort('https://example.test/image.png', artifact),
    });

    const inputs = feishuSendInputsForRenderedSignal(enhanced);

    expect(inputs).toEqual([
      { markdown: enhanced.body },
      { image: { source: enhanced.supportOutcome?.status === 'ready' ? enhanced.supportOutcome.artifact?.path : undefined } },
    ]);
  });

  test('keeps the original Feishu body when support resources are missing', async () => {
    const rendered = renderFeishuSignal({
      id: 'artifact-html',
      kind: 'artifact_preview',
      title: 'HTML report ready',
      summary: 'Codex generated a report.',
      artifact: { path: '/tmp/report.html', representationHint: 'html' },
    });

    const enhanced = await applyFeishuDeliverySupport(rendered, {
      resources: [],
    });

    expect(enhanced.body).toBe(rendered.body);
    expect(enhanced.supportOutcome).toMatchObject({
      status: 'missing_resource',
      resource: { id: 'model.language_completion' },
    });
  });
});

function imageRuntimePort(url: string, artifact: StoredArtifact) {
  return runtimePortMock({
    'vision.generateImage': async () => ({
        status: 'ok',
        capabilityId: 'vision.generateImage',
        providerId: 'runtime-services-rpc',
        modelId: 'image-model',
        evidence: [],
        artifact: { kind: 'image', url, raw: {} },
      }),
    'artifact.save': async () => ({
        status: 'ok',
        capabilityId: 'artifact.save',
        providerId: 'runtime-services-rpc',
        modelId: 'not-applicable',
        evidence: [],
        artifact,
      }),
  });
}

function imageArtifact(path: string): StoredArtifact {
  return {
    id: 'artifact-image',
    path,
    mimeType: 'image/png',
    sizeBytes: 11,
    sha256: 'hash',
    createdAt: '2026-05-28T10:00:00.000Z',
    source: {
      kind: 'delivery_support',
      moduleId: 'vision',
      modelId: 'image-model',
    },
  };
}
