import type { RuntimeServicesPort } from '../runtime-services/port';
import {
  hasAvailableRuntimeResource,
  RUNTIME_RESOURCE_IDS,
} from '../runtime-services/resources';
import type {
  ArtifactSaveOutput,
  ResourceRequirement,
  StoredArtifact,
} from '../runtime-services/types';

export const TURN_TRACE_SCHEMA = 'agent-interaction-bridge.turn-trace.v1';

export type TurnTraceFlushResult =
  | { status: 'disabled' }
  | { status: 'missing_resource' }
  | { status: 'failed'; message: string }
  | { status: 'stored'; artifactId: string; artifact?: StoredArtifact };

export interface TurnTraceRecorderOptions {
  enabled: boolean;
  scope: string;
  chatId: string;
  previousArtifactId?: string;
  runtime?: RuntimeServicesPort;
  resources?: ResourceRequirement[];
  artifactNamespace: string;
  now?: () => Date;
}

export interface TurnTraceRecorder {
  record(stage: string, data: Record<string, unknown>): void;
  flush(): Promise<TurnTraceFlushResult>;
}

interface TurnTraceStage {
  ts: string;
  stage: string;
  data: Record<string, unknown>;
}

export function createTurnTraceRecorder(options: TurnTraceRecorderOptions): TurnTraceRecorder {
  const now = options.now ?? (() => new Date());
  const stages: TurnTraceStage[] = [];

  return {
    record(stage: string, data: Record<string, unknown>): void {
      stages.push({
        ts: now().toISOString(),
        stage,
        data: sanitizeData(data),
      });
    },

    async flush(): Promise<TurnTraceFlushResult> {
      if (!options.enabled) return { status: 'disabled' };
      if (!options.runtime || !hasAvailableRuntimeResource(options.resources ?? [], RUNTIME_RESOURCE_IDS.artifactStore)) {
        return { status: 'missing_resource' };
      }

      const body = renderTurnTraceJsonl({
        scope: options.scope,
        chatId: options.chatId,
        previousArtifactId: options.previousArtifactId,
        stages,
        createdAt: now().toISOString(),
      });
      const result = await options.runtime.call<
        {
          namespace: string;
          body: string;
          mimeType: string;
          extension: string;
          source: Record<string, unknown>;
        },
        ArtifactSaveOutput
      >(
        'artifact.save',
        {
          namespace: options.artifactNamespace,
          body,
          mimeType: 'application/jsonl',
          extension: 'jsonl',
          source: {
            kind: 'turn_trace',
            schema: TURN_TRACE_SCHEMA,
            scope: options.scope,
            chatId: options.chatId,
            previousArtifactId: options.previousArtifactId,
          },
        },
        { consumer: 'domain-agent', purpose: 'persist bridge turn trace' },
      );
      if (result.status !== 'ok' || !result.artifact) {
        return {
          status: 'failed',
          message: result.evidence.find((item) => item.message)?.message ?? result.status,
        };
      }
      return {
        status: 'stored',
        artifactId: result.artifact.id,
        artifact: result.artifact,
      };
    },
  };
}

function renderTurnTraceJsonl(input: {
  scope: string;
  chatId: string;
  previousArtifactId?: string;
  stages: TurnTraceStage[];
  createdAt: string;
}): string {
  return [
    {
      type: 'turn_trace',
      schema: TURN_TRACE_SCHEMA,
      createdAt: input.createdAt,
      scope: input.scope,
      chatId: input.chatId,
      previousArtifactId: input.previousArtifactId ?? null,
    },
    ...input.stages.map((stage) => ({
      type: 'stage',
      ts: stage.ts,
      stage: stage.stage,
      data: stage.data,
    })),
  ]
    .map((line) => JSON.stringify(line))
    .join('\n')
    .concat('\n');
}

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}
