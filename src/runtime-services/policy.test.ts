import { describe, expect, test } from 'vitest';
import { decideRuntimeCapabilityAccess } from './policy';

describe('Runtime Services transport policy', () => {
  test('allows local RPC capability calls for build-agent collaboration', () => {
    expect(decideRuntimeCapabilityAccess({
      transport: 'rpc',
      capabilityId: 'artifact.save',
      consumer: 'build-agent',
      purpose: 'persist build artifact',
    })).toEqual({ allowed: true });
  });

  test('leaves non-secret MCP capability exposure to Runtime Services', () => {
    expect(decideRuntimeCapabilityAccess({
      transport: 'mcp',
      capabilityId: 'artifact.save',
      consumer: 'domain-agent',
      purpose: 'remote artifact write',
    })).toEqual({ allowed: true });
  });

  test('still blocks secret and admin capabilities at the bridge port boundary', () => {
    expect(decideRuntimeCapabilityAccess({
      transport: 'rpc',
      capabilityId: 'secrets.get',
      consumer: 'domain-agent',
    })).toMatchObject({ allowed: false });
    expect(decideRuntimeCapabilityAccess({
      transport: 'mcp',
      capabilityId: 'admin.reset',
      consumer: 'build-agent',
    })).toMatchObject({ allowed: false });
  });
});
