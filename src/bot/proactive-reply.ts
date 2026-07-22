import type { LarkChannel, NormalizedMessage } from '@larksuiteoapi/node-sdk';
import type { AppConfig } from '../config/schema';
import { getAgentEndpointProfileId } from '../config/schema';
import { log } from '../core/logger';
import { appendSessionIdentityMarkdown } from '../presentation/session-identity';
import type { RuntimeServicesPortContext } from '../runtime-services/selector';
import type { SessionStore } from '../session/store';
import { ProactiveActionLog } from '../signal/action-log';
import {
  type ProactiveCorrelationRecord,
  type ProactiveCorrelationStore,
} from '../signal/correlation-store';
import { normalizeFeishuRawInboundEvent } from './feishu-raw-event-contract';
import { sendReplyMarkdown } from './reply-mentions';

export type ProactiveReplyResolution =
  | { status: 'none' }
  | { status: 'rejected' }
  | { status: 'resolved'; correlation: ProactiveCorrelationRecord };

/**
 * Resolve a human reply to a previously delivered proactive signal. This
 * boundary fails closed before channel intake can select a Domain session.
 */
export async function resolveProactiveReply(input: {
  channel: LarkChannel;
  msg: NormalizedMessage;
  cfg: AppConfig;
  sessions: SessionStore;
  correlations: ProactiveCorrelationStore;
  getRuntimeServicesContext: () => Promise<RuntimeServicesPortContext | undefined>;
}): Promise<ProactiveReplyResolution> {
  const rawInbound = normalizeFeishuRawInboundEvent(input.msg.raw);
  const correlation = input.correlations.findReplyCandidate({
    chatId: input.msg.chatId,
    candidateMessageIds: [
      input.msg.replyToMessageId,
      rawInbound?.parentId,
      rawInbound?.rootId,
    ].filter((id): id is string => Boolean(id)),
  });
  if (!correlation) return { status: 'none' };

  const currentProfileId = getAgentEndpointProfileId(input.cfg);
  const resumable = input.sessions.resumeFor(
    correlation.scope,
    correlation.cwd,
    correlation.agentRuntimeId,
    correlation.contextVersion,
  );
  const rejectionReason = correlation.endpointProfileId !== currentProfileId
    ? 'endpoint_profile_mismatch'
    : resumable !== correlation.sessionId
      ? 'origin_session_unavailable'
      : undefined;
  const actionLog = new ProactiveActionLog({
    context: await input.getRuntimeServicesContext(),
    config: input.cfg,
  });

  if (rejectionReason) {
    await actionLog.append({
      type: 'reply_rejected',
      correlationId: correlation.correlationId,
      data: {
        reason: rejectionReason,
        replyMessageId: input.msg.messageId,
        carrierMessageId: correlation.carrierMessageId,
        scope: correlation.scope,
      },
    }).catch((error) => {
      log.warn('correlation', 'reply-rejection-audit-failed', {
        correlationId: correlation.correlationId,
        err: error instanceof Error ? error.message : String(error),
      });
    });
    await sendReplyMarkdown(
      input.channel,
      input.msg.chatId,
      appendSessionIdentityMarkdown(
        '无法安全恢复这条主动消息对应的原会话，请重新发送任务。',
        { bridge: correlation.scope, domain: correlation.sessionId },
      ),
      { replyTo: input.msg.messageId },
    );
    log.warn('correlation', 'reply-rejected', {
      correlationId: correlation.correlationId,
      reason: rejectionReason,
    });
    return { status: 'rejected' };
  }

  try {
    await actionLog.append({
      type: 'reply_correlated',
      correlationId: correlation.correlationId,
      data: {
        replyMessageId: input.msg.messageId,
        carrierMessageId: correlation.carrierMessageId,
        scope: correlation.scope,
        sessionId: correlation.sessionId,
        endpointProfileId: correlation.endpointProfileId,
      },
    });
  } catch (error) {
    log.warn('correlation', 'reply-audit-unavailable', {
      correlationId: correlation.correlationId,
      err: error instanceof Error ? error.message : String(error),
    });
    await sendReplyMarkdown(
      input.channel,
      input.msg.chatId,
      appendSessionIdentityMarkdown(
        '审计服务当前不可用，未恢复原会话。请稍后重试。',
        { bridge: correlation.scope, domain: correlation.sessionId },
      ),
      { replyTo: input.msg.messageId },
    );
    return { status: 'rejected' };
  }

  log.info('correlation', 'reply-resolved', {
    correlationId: correlation.correlationId,
    scope: correlation.scope,
    sessionId: correlation.sessionId,
  });
  return { status: 'resolved', correlation };
}
