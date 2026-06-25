import { describe, expect, test } from 'vitest';
import type { StoredArtifact } from '../runtime-services/types';
import { runtimePortMock, runtimeResources } from '../test/runtime-services-fixtures';
import {
  createDeliverySupportRequest,
  executeDeliverySupport,
  type DeliverySupportRequest,
} from './delivery-support';

describe('delivery support executor', () => {
  test('summarizes with a local stateless fallback for markdown delivery', async () => {
    const request = createDeliverySupportRequest(
      {
        id: 'test-1',
        kind: 'test_report',
        title: '测试通过',
        summary: '102 tests passed.',
        test: { command: 'pnpm test', passed: true },
      },
      'markdown',
    );

    await expect(executeDeliverySupport(request!)).resolves.toMatchObject({
      status: 'ready',
      outputStyle: 'markdown',
      body: '**测试通过**\n102 tests passed.',
      usedResourceId: 'local.rule_based_summary',
    });
  });

  test('returns a missing-resource outcome for rich transforms without resources', async () => {
    const request = htmlRequest();

    await expect(executeDeliverySupport(request, { resources: [] })).resolves.toMatchObject({
      status: 'missing_resource',
      resource: {
        id: 'model.language_completion',
        status: 'stubbed',
      },
    });
  });

  test('does not fake a presentation transform when Runtime Services RPC is unavailable', async () => {
    await expect(executeDeliverySupport(htmlRequest(), {
      resources: runtimeResources([
        {
          id: 'model.language_completion',
          status: 'available',
          provider: 'runtime-services-rpc:mock-model',
        },
      ]),
      runtimeServicesUrl: 'http://127.0.0.1:1',
      rpcTimeoutMs: 10,
    })).resolves.toMatchObject({
      status: 'missing_resource',
      outputStyle: 'html',
      resource: {
        id: 'model.language_completion',
      },
    });
  });

  test('uses Runtime Services language proposals for presentation transforms', async () => {
    const runtime = runtimePortMock({
      'language.complete': async () => ({
          status: 'ok',
          capabilityId: 'language.complete',
          providerId: 'runtime-services-rpc',
          modelId: 'mock-model',
          evidence: [],
          proposal: { kind: 'text', text: '<section>报告</section>', raw: {} },
        }),
    });

    await expect(
      executeDeliverySupport(htmlRequest(), {
        resources: runtimeResources([
          {
            id: 'model.language_completion',
            status: 'available',
            provider: 'runtime-services-rpc:mock-model',
          },
        ]),
        runtime,
        storage: {
          artifact_namespace: 'tenant-alpha',
          vector_tableName: 'tenant_alpha_vectors',
          record_namespace: 'tenant-alpha',
          record_tableName: 'tenant_alpha_records',
        },
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      outputStyle: 'html',
      usedResourceId: 'model.language_completion',
      body: '<section>报告</section>',
    });
  });

  test('does not fake an image artifact when Runtime Services RPC is unavailable', async () => {
    await expect(executeDeliverySupport(imageRequest(), {
      resources: runtimeResources([
        {
          id: 'model.image_generation',
          status: 'available',
          provider: 'runtime-services-rpc:image-model',
        },
      ]),
      runtimeServicesUrl: 'http://127.0.0.1:1',
      rpcTimeoutMs: 10,
    })).resolves.toMatchObject({
      status: 'missing_resource',
      outputStyle: 'image',
      resource: {
        id: 'model.image_generation',
      },
    });
  });

  test('uses Runtime Services image generation and artifact save for image support', async () => {
    const imageUrl = 'https://example.test/generated-image.png';
    const calls: Array<{ capabilityId: string; input: unknown }> = [];
    const savedArtifact: StoredArtifact = {
      id: 'artifact-image',
      path: '/tmp/runtime-services/artifacts/artifact-image.png',
      mimeType: 'image/png',
      sizeBytes: 11,
      sha256: 'hash',
      createdAt: '2026-05-28T06:30:00.000Z',
      source: {
        kind: 'delivery_support',
        moduleId: 'vision',
        modelId: 'mock-image-model',
      },
    };
    const runtime = runtimePortMock({
      'vision.generateImage': async (input) => {
        calls.push({ capabilityId: 'vision.generateImage', input });
        return {
          status: 'ok',
          capabilityId: 'vision.generateImage',
          providerId: 'runtime-services-rpc',
          modelId: 'mock-image-model',
          evidence: [],
          artifact: { kind: 'image', url: imageUrl, raw: {} },
        };
      },
      'artifact.save': async (input) => {
        calls.push({ capabilityId: 'artifact.save', input });
        return {
          status: 'ok',
          capabilityId: 'artifact.save',
          providerId: 'runtime-services-rpc',
          modelId: 'not-applicable',
          evidence: [],
          artifact: savedArtifact,
        };
      },
    });

    await expect(
      executeDeliverySupport(imageRequest(), {
        resources: runtimeResources([
          {
            id: 'model.image_generation',
            status: 'available',
            provider: 'runtime-services-rpc:image-model',
          },
        ]),
        runtime,
        storage: {
          artifact_namespace: 'tenant-alpha',
          vector_tableName: 'tenant_alpha_vectors',
          record_namespace: 'tenant-alpha',
          record_tableName: 'tenant_alpha_records',
        },
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      outputStyle: 'image',
      usedResourceId: 'model.image_generation',
      body: imageUrl,
      artifact: {
        mimeType: 'image/png',
        sizeBytes: 11,
      },
    });
    expect(calls.find((call) => call.capabilityId === 'artifact.save')?.input).toMatchObject({
      namespace: 'tenant-alpha',
      sourceUrl: imageUrl,
      source: {
        kind: 'delivery_support',
        moduleId: 'vision',
        modelId: 'mock-image-model',
      },
    });
  });
});

function htmlRequest(): DeliverySupportRequest {
  return {
    id: 'support-html',
    kind: 'render_html',
    outputStyle: 'html',
    input: {
      title: '报告',
      summary: '需要 HTML 视图。',
      artifactPath: '/tmp/report.md',
      sourceSignalKind: 'artifact_preview',
    },
    authority: 'presentation_only',
    stateless: true,
  };
}

function imageRequest(): DeliverySupportRequest {
  return {
    id: 'support-image',
    kind: 'generate_image',
    outputStyle: 'image',
    input: {
      title: '图片',
      summary: '需要视觉产物。',
      sourceSignalKind: 'artifact_preview',
    },
    authority: 'presentation_only',
    stateless: true,
  };
}
