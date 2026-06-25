import { Command } from 'commander';
import pkg from '../../package.json';
import { APP_NAME, paths } from '../config/paths';
import { runPs, runStopCli } from './commands/ps';
import {
  runSecretsGet,
  runSecretsList,
  runSecretsRemove,
  runSecretsSet,
} from './commands/secrets';
import { runServiceCommand } from './commands/service';
import { runStart } from './commands/start';
import { runStatusCli } from './commands/status';
import { parseAgentEndpointKind } from '../config/schema';
import { runResourcesCli } from './commands/resources';
import { runDoctorCli } from './commands/doctor';
import { runModelsListCli, runModelsSmokeCli } from './commands/models';
import {
  runStorageArtifactsCleanupCli,
  runStorageArtifactsListCli,
  runStorageStatusCli,
  runStorageVectorsSearchCli,
  runStorageVectorsUpsertCli,
} from './commands/storage';
import { runArchitectureCheckCli } from '../architecture/contract-check';
import { runArchitectureContractsCli } from './commands/architecture';

const program = new Command();

program
  .name(APP_NAME)
  .description('Human-agent interaction bridge with pluggable channels and local agent runtimes')
  .version(pkg.version, '-v, --version');

program
  .command('start')
  .description('Start the bot (runs first-run wizard if bot config is missing)')
  .option('-c, --config <path>', 'path to config file')
  .option('--agent-endpoint <kind>', 'agent endpoint: exec | app-server')
  .action(async (opts: { config?: string; agentEndpoint?: string }) => {
    await runStart({
      config: opts.config,
      agentEndpoint: parseAgentEndpointKind(opts.agentEndpoint),
    });
  });

program
  .command('ps')
  .description('List running bridge start processes on this machine')
  .action(() => {
    runPs();
  });

program
  .command('stop <target>')
  .description('Stop a running start process by short id or list index (SIGTERM, then SIGKILL after 2s)')
  .action(async (target: string) => {
    await runStopCli(target);
  });

const secrets = program
  .command('secrets')
  .description(`Manage the bridge's encrypted secret keystore (${paths.secretsFile})`);

secrets
  .command('get')
  .description('Exec-provider protocol: read JSON request from stdin, write JSON response to stdout. Used by lark-cli SecretRef exec providers.')
  .action(async () => {
    await runSecretsGet();
  });

secrets
  .command('set')
  .description('Encrypt and store a Feishu/Lark App Secret. Prompts without echoing.')
  .option('--app-id <id>', 'App ID (stores as app-<id>)')
  .action(async (opts: { appId?: string; id?: string }) => {
    await runSecretsSet(opts);
  });

secrets
  .command('list')
  .description('List the IDs of secrets in the encrypted keystore (no secrets shown)')
  .action(async () => {
    await runSecretsList();
  });

secrets
  .command('remove')
  .description('Delete a Feishu/Lark App Secret entry from the encrypted keystore')
  .option('--app-id <id>', 'App ID to remove (stored as app-<id>)')
  .action(async (opts: { appId?: string; id?: string }) => {
    await runSecretsRemove(opts);
  });

program
  .command('status')
  .description('Show runtime status (WS connection, agent availability)')
  .action(async () => {
    await runStatusCli();
  });

program
  .command('resources')
  .description('List long-term model, storage, and compute resources and current stub status')
  .action(async () => {
    await runResourcesCli();
  });

const models = program
  .command('models')
  .description('Proxy Runtime Services model resources through JSON-RPC');

models
  .command('list')
  .description('List Runtime Services model resource status')
  .action(async () => {
    await runModelsListCli();
  });

models
  .command('smoke')
  .description('Show Runtime Services model resource smoke/status')
  .option('--module <module>', 'language | embedding | vision | all', 'all')
  .action(async (opts: { module?: string }) => {
    await runModelsSmokeCli({ module: opts.module });
  });

const storage = program
  .command('storage')
  .description('Proxy Runtime Services artifact and vector storage');

storage
  .command('status')
  .description('Show Runtime Services storage paths and resource availability')
  .action(async () => {
    await runStorageStatusCli();
  });

const storageArtifacts = storage
  .command('artifacts')
  .description('Inspect generated delivery artifacts stored under the Runtime Services home');

storageArtifacts
  .command('list')
  .description('List generated artifact metadata and paths without printing artifact contents')
  .option('--namespace <namespace>', 'Runtime Services artifact namespace; defaults to config runtimeServices.artifact_namespace')
  .option('--limit <n>', 'maximum artifact rows to print', '20')
  .action(async (opts: { limit?: string; namespace?: string }) => {
    await runStorageArtifactsListCli({ limit: opts.limit, namespace: opts.namespace });
  });

storageArtifacts
  .command('cleanup')
  .description('Delete expired generated artifacts from disk and manifest')
  .option('--namespace <namespace>', 'Runtime Services artifact namespace; defaults to config runtimeServices.artifact_namespace')
  .action(async (opts: { namespace?: string }) => {
    await runStorageArtifactsCleanupCli({ namespace: opts.namespace });
  });

const storageVectors = storage
  .command('vectors')
  .description('Index and search Runtime Services vector content');

storageVectors
  .command('upsert <id> <text...>')
  .description('Embed text and upsert it into the Runtime Services vector index')
  .option('--table-name <tableName>', 'Runtime Services vector table; defaults to config runtimeServices.vector_tableName')
  .action(async (id: string, text: string[], opts: { tableName?: string }) => {
    await runStorageVectorsUpsertCli(id, text, { tableName: opts.tableName });
  });

storageVectors
  .command('search <text...>')
  .description('Embed a query and search the Runtime Services vector index')
  .option('--limit <n>', 'maximum vector rows to print', '10')
  .option('--table-name <tableName>', 'Runtime Services vector table; defaults to config runtimeServices.vector_tableName')
  .action(async (text: string[], opts: { limit?: string; tableName?: string }) => {
    await runStorageVectorsSearchCli(text, { limit: opts.limit, tableName: opts.tableName });
  });

const architecture = program
  .command('architecture')
  .description('Inspect architecture contracts and durable implementation gates');

architecture
  .command('check')
  .description('Validate frozen registry records, AI Contract Index, package inclusion, and harness evidence')
  .action(() => {
    runArchitectureCheckCli();
  });

architecture
  .command('contracts')
  .description('List YAML L0-L4 contracts and current L3-L4 status')
  .action(() => {
    runArchitectureContractsCli();
  });

program
  .command('doctor')
  .description('Check config, agent runtime availability, and required platform scopes')
  .action(async () => {
    await runDoctorCli();
  });

program
  .command('service <action> <type>')
  .description('Manage the macOS LaunchAgent service')
  .option('-c, --config <path>', 'path to config file')
  .option('--agent-endpoint <kind>', 'agent endpoint used by the service: exec | app-server')
  .action(async (action: string, type: string, opts: { config?: string; agentEndpoint?: string }) => {
    await runServiceCommand(action, type, opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
