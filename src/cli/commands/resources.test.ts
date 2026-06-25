import { describe, expect, test } from 'vitest';
import { runtimeResources } from '../../test/runtime-services-fixtures';
import { formatResources } from './resources';
import {
  formatRuntimeServiceFailure,
  formatRuntimeServicesUnavailable,
} from './runtime-services-errors';

describe('formatResources', () => {
  test('lists stubbed resources with operator actions', () => {
    const output = formatResources(runtimeResources([
      {
        id: 'model.language_completion',
        operatorAction: 'Provide a small stateless model endpoint',
      },
    ]));

    expect(output).toContain('model.language_completion');
    expect(output).toContain('stubbed');
    expect(output).toContain('Provide a small stateless model endpoint');
  });

  test('marks available resources distinctly', () => {
    const output = formatResources(
      runtimeResources([
        {
          id: 'model.language_completion',
          status: 'available',
          provider: 'codex-lightweight',
        },
      ]),
    );

    expect(output).toContain('model.language_completion');
    expect(output).toContain('available via codex-lightweight');
  });

  test('formats Runtime Services transport and envelope failures explicitly', () => {
    const unavailable = formatRuntimeServicesUnavailable(new TypeError('fetch failed', {
      cause: new Error('connect ECONNREFUSED 127.0.0.1:8765'),
    }));
    const failed = formatRuntimeServiceFailure('Bridge runtime services resources', {
      status: 'failed',
      capabilityId: 'resources.list',
      providerId: 'runtime-services-rpc',
      evidence: [{ kind: 'transport_error', message: 'rpc failed' }],
    });

    expect(unavailable).toContain('Runtime Services unavailable');
    expect(unavailable).toContain('ECONNREFUSED');
    expect(failed).toContain('status: failed');
    expect(failed).toContain('resources.list');
    expect(failed).toContain('rpc failed');
  });
});
