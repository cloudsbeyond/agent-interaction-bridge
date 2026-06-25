import { describe, expect, test } from 'vitest';
import {
  capabilityDescriptorFromMcpTool,
  mcpToolNameForCapability,
  rpcMethodForCapability,
} from './mappings';

describe('Runtime Services discovery contract', () => {
  test('keeps bridge mapping as transport naming only, not a local capability registry', () => {
    expect(rpcMethodForCapability('custom.capability')).toBe('custom.capability');
    expect(mcpToolNameForCapability('custom.capability')).toBe('runtime.custom.capability');
    expect(capabilityDescriptorFromMcpTool({
      name: 'runtime.custom.capability',
      description: 'Runtime-owned capability',
    })).toEqual({
      id: 'custom.capability',
      title: 'Runtime-owned capability',
    });
  });
});
