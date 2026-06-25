export type CliCommandStatus = 'implemented';
export type CliCommandAuthority = 'local_operator' | 'secret_owner' | 'service_owner';

export interface CliCommandSpec {
  name: string;
  status: CliCommandStatus;
  authority: CliCommandAuthority;
  summary: string;
}

export const CLI_COMMAND_SPECS: CliCommandSpec[] = [
  {
    name: 'start',
    status: 'implemented',
    authority: 'local_operator',
    summary: 'start the interaction gateway process',
  },
  {
    name: 'ps',
    status: 'implemented',
    authority: 'local_operator',
    summary: 'list local gateway processes',
  },
  {
    name: 'stop',
    status: 'implemented',
    authority: 'local_operator',
    summary: 'stop a selected local gateway process',
  },
  {
    name: 'secrets',
    status: 'implemented',
    authority: 'secret_owner',
    summary: 'manage encrypted local app secrets',
  },
  {
    name: 'status',
    status: 'implemented',
    authority: 'local_operator',
    summary: 'show runtime status',
  },
  {
    name: 'resources',
    status: 'implemented',
    authority: 'local_operator',
    summary: 'list long-term resource requirements and stubs',
  },
  {
    name: 'models',
    status: 'implemented',
    authority: 'local_operator',
    summary: 'proxy Runtime Services model resource status and smoke checks without owning provider config',
  },
  {
    name: 'storage',
    status: 'implemented',
    authority: 'local_operator',
    summary: 'proxy Runtime Services artifact and vector storage without granting agent authority',
  },
  {
    name: 'architecture',
    status: 'implemented',
    authority: 'local_operator',
    summary: 'inspect architecture contracts and durable gates',
  },
  {
    name: 'doctor',
    status: 'implemented',
    authority: 'local_operator',
    summary: 'check local config, Codex endpoint, and bridge runtime resources',
  },
  {
    name: 'service',
    status: 'implemented',
    authority: 'service_owner',
    summary: 'manage the macOS LaunchAgent service adapter',
  },
];

export function cliCommandNames(): string[] {
  return CLI_COMMAND_SPECS.map((command) => command.name);
}

export function findCliCommandSpec(name: string): CliCommandSpec | undefined {
  return CLI_COMMAND_SPECS.find((command) => command.name === name.trim());
}
