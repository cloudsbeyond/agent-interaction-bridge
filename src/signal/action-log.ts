import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/schema';
import {
  getRuntimeServicesRecordNamespace,
  getRuntimeServicesRecordTableName,
} from '../config/schema';
import { hasAvailableRuntimeResource, RUNTIME_RESOURCE_IDS } from '../runtime-services/resources';
import type { RuntimeServicesPortContext } from '../runtime-services/selector';
import type { RecordUpsertOutput } from '../runtime-services/types';

export type ProactiveActionLogEventType =
  | 'outbound_intent_accepted'
  | 'outbound_intent_rejected'
  | 'delivery_succeeded'
  | 'delivery_failed'
  | 'reply_correlated'
  | 'reply_rejected';

export interface ProactiveActionLogEvent {
  type: ProactiveActionLogEventType;
  correlationId: string;
  occurredAt?: string;
  data: Record<string, unknown>;
}

export interface ProactiveActionLogOptions {
  context?: RuntimeServicesPortContext;
  config: Pick<AppConfig, 'runtimeServices'>;
  createId?: () => string;
  now?: () => Date;
}

export class ProactiveActionLog {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(private readonly options: ProactiveActionLogOptions) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async append(event: ProactiveActionLogEvent): Promise<string> {
    const context = this.options.context;
    if (!context || !hasAvailableRuntimeResource(context.resources, RUNTIME_RESOURCE_IDS.recordStore)) {
      throw new Error('Runtime Services storage.record_store is unavailable for proactive ActionLog');
    }

    const eventId = `action-log-${this.createId()}`;
    const result = await context.runtime.call<
      {
        namespace: string;
        tableName: string;
        id: string;
        data: Record<string, unknown>;
        metadata: Record<string, unknown>;
      },
      RecordUpsertOutput
    >(
      'record.upsert',
      {
        namespace: getRuntimeServicesRecordNamespace(this.options.config),
        tableName: getRuntimeServicesRecordTableName(this.options.config),
        id: eventId,
        data: {
          schemaVersion: 1,
          objectType: 'ActionLog',
          eventType: event.type,
          correlationId: event.correlationId,
          occurredAt: event.occurredAt ?? this.now().toISOString(),
          ...event.data,
        },
        metadata: {
          owner: 'bridge-agent',
          stateClass: 'durable-state',
        },
      },
      { consumer: 'bridge-agent', purpose: 'proactive interaction ActionLog' },
    );
    if (result.status !== 'ok' || !result.record) {
      const message = result.evidence.find((item) => item.message)?.message ?? result.status;
      throw new Error(`Runtime Services ActionLog write failed: ${message}`);
    }
    return result.record.id;
  }
}
