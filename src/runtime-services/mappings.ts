import type {
  RuntimeCapabilityDescriptor,
  RuntimeCapabilityId,
} from './types';

const MCP_TOOL_PREFIX = 'runtime.';

export function rpcMethodForCapability(capabilityId: RuntimeCapabilityId): string {
  return capabilityId;
}

export function mcpToolNameForCapability(capabilityId: RuntimeCapabilityId): string {
  return `${MCP_TOOL_PREFIX}${capabilityId}`;
}

export function capabilityIdFromMcpToolName(toolName: string): RuntimeCapabilityId | undefined {
  return toolName.startsWith(MCP_TOOL_PREFIX) ? toolName.slice(MCP_TOOL_PREFIX.length) : undefined;
}

export function capabilityDescriptorFromMcpTool(
  tool: { name: string; description?: string },
): RuntimeCapabilityDescriptor | undefined {
  const id = capabilityIdFromMcpToolName(tool.name);
  if (!id) return undefined;
  return {
    id,
    ...(tool.description ? { title: tool.description } : {}),
  };
}
