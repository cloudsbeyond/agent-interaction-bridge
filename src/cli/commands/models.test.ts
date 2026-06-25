import { describe, expect, test } from 'vitest';
import { runtimePortMock, runtimeResources } from '../../test/runtime-services-fixtures';
import { formatModelProviders, formatModelSmokeResults, smokeModelProviders } from './models';

describe('models cli helpers', () => {
  test('formats Runtime Services model resources without exposing provider config', () => {
    const output = formatModelProviders(runtimeResources([
      { id: 'model.language_completion', status: 'available', provider: 'runtime-language-provider:primary' },
      { id: 'model.embedding', status: 'available', provider: 'runtime-embedding-provider:primary' },
      { id: 'model.image_generation' },
    ]));

    expect(output).toContain('Bridge runtime services model providers');
    expect(output).toContain('provider config is owned by agent-runtime-services');
    expect(output).toContain('model.language_completion: available via runtime-language-provider:primary');
    expect(output).toContain('model.embedding: available via runtime-embedding-provider:primary');
    expect(output).toContain('model.image_generation: stubbed');
    expect(output).not.toContain('apiKey');
    expect(output).not.toContain('baseUrl');
  });

  test('proxies Runtime Services model smoke as resource status without model side effects', async () => {
    const consumers: Array<string | undefined> = [];
    const runtime = runtimePortMock({
      'resources.smoke': async (_input, options) => {
        consumers.push(options?.consumer);
        return {
          status: 'ok',
          capabilityId: 'resources.smoke',
          providerId: 'runtime-services',
          modelId: 'not-applicable',
          evidence: [],
          resources: runtimeResources([
            { id: 'model.language_completion', status: 'available', provider: 'runtime-language-provider:primary' },
            { id: 'model.embedding', status: 'available', provider: 'runtime-embedding-provider:primary' },
            { id: 'model.image_generation' },
          ]),
        };
      },
    });

    const results = await smokeModelProviders({
      module: 'all',
      runtime,
    });
    const output = formatModelSmokeResults(results);

    expect(output).toContain('Bridge runtime services model smoke');
    expect(output).toContain('language model.language_completion: available via runtime-language-provider:primary');
    expect(output).toContain('embedding model.embedding: available via runtime-embedding-provider:primary');
    expect(output).toContain('vision model.image_generation: stubbed');
    expect(output).not.toContain('secret-value');
    expect(output).not.toContain('/artifacts/');
    expect(consumers).toEqual(['domain-agent']);
  });

  test('does not report model smoke failed envelopes as empty success', async () => {
    const runtime = runtimePortMock({
      'resources.smoke': async () => ({
        status: 'failed',
        capabilityId: 'resources.smoke',
        providerId: 'runtime-services',
        modelId: 'not-applicable',
        evidence: [{ kind: 'smoke_error', message: 'model endpoint unavailable' }],
      }),
    });

    await expect(smokeModelProviders({
      module: 'all',
      runtime,
    })).rejects.toThrow('model endpoint unavailable');
  });
});
