import { describe, expect, test } from 'vitest';
import { runtimeResources } from '../test/runtime-services-fixtures';
import type { RuntimeServicesPort } from '../runtime-services/port';
import { executeDeliverySupport } from './delivery-support';

describe('delivery support runtime services integration', () => {
  test('uses typed runtime service proposals for presentation-only transforms', async () => {
    const calls: string[] = [];
    const runtime = {
      describe: async () => ({ schemaVersion: 1, capabilities: [] }),
      call: async (_capabilityId: string, input: unknown) => {
          calls.push((input as { input: string }).input);
          return {
            status: 'ok',
            capabilityId: 'language.complete',
            providerId: 'mock-provider',
            modelId: 'mock-model',
            evidence: [{ kind: 'mock' }],
            proposal: { kind: 'text', text: '<section>clean card</section>', raw: {} },
          } as const;
      },
    } as RuntimeServicesPort;

    const result = await executeDeliverySupport({
      id: 'support-html',
      kind: 'render_html',
      outputStyle: 'html',
      input: {
        title: 'Report',
        summary: 'Needs a compact report.',
        sourceSignalKind: 'test_report',
      },
      authority: 'presentation_only',
      stateless: true,
    }, {
      runtime,
      resources: runtimeResources([
        { id: 'model.language_completion', status: 'available', provider: 'mock-provider:mock-model' },
      ]),
    });

    expect(result).toMatchObject({
      status: 'ready',
      outputStyle: 'html',
      body: '<section>clean card</section>',
    });
    expect(calls[0]).toContain('Needs a compact report.');
  });
});
