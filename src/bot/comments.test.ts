import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommentEvent, LarkChannel } from '@larksuiteoapi/node-sdk';
import { describe, expect, test, vi } from 'vitest';
import type { AgentAdapter, AgentRunOptions } from '../agent/types';
import { SessionStore } from '../session/store';
import { WorkspaceStore } from '../workspace/store';
import { AGENT_PROFILE_CODEX_HOST_ID } from '../topology/entities';
import { handleCommentMention } from './comments';

describe('cloud-doc comment mentions', () => {
  test('applies endpoint profile policy before running the agent', async () => {
    const runOptions: AgentRunOptions[] = [];
    const sessions = new SessionStore(join(await mkdtemp(join(tmpdir(), 'aib-comment-sessions-')), 'sessions.json'));
    const workspaces = new WorkspaceStore(join(await mkdtemp(join(tmpdir(), 'aib-comment-workspaces-')), 'workspaces.json'));
    const channel = commentChannel();

    await handleCommentMention({
      channel,
      evt: {
        fileToken: 'doc_token',
        fileType: 'docx',
        commentId: 'comment_1',
        replyId: 'reply_1',
        mentionedBot: true,
        operator: { openId: 'ou_123' },
      } as CommentEvent,
      agent: agentCapturingRuns(runOptions),
      sessions,
      workspaces,
      cfg: {
        accounts: {
          app: {
            id: 'cli_test',
            tenant: 'feishu',
            secret: 'secret',
          },
        },
      },
    });

    expect(runOptions).toHaveLength(1);
    expect(runOptions[0]).toMatchObject({
      endpointProfileId: AGENT_PROFILE_CODEX_HOST_ID,
      permissionMode: 'bypassPermissions',
      sandboxMode: 'danger-full-access',
      approvalPolicy: 'never',
    });
    expect(sessions.resumeFor(
      'doc:doc_token',
      runOptions[0]?.cwd ?? '',
      `codex-test:${AGENT_PROFILE_CODEX_HOST_ID}`,
    )).toBe('session_1');
  });
});

function commentChannel(): LarkChannel {
  return {
    rawClient: {
      wiki: {
        v2: {
          space: {
            getNode: vi.fn(async () => {
              throw new Error('not a wiki node');
            }),
          },
        },
      },
      drive: {
        v1: {
          fileComment: {
            get: vi.fn(async () => ({
              data: {
                reply_list: {
                  replies: [{
                    reply_id: 'reply_1',
                    content: {
                      elements: [{
                        type: 'text_run',
                        text_run: { text: 'please answer this doc comment' },
                      }],
                    },
                  }],
                },
                is_whole: false,
              },
            })),
            create: vi.fn(async () => ({})),
          },
        },
      },
      request: vi.fn(async () => ({})),
    },
  } as unknown as LarkChannel;
}

function agentCapturingRuns(runOptions: AgentRunOptions[]): AgentAdapter {
  return {
    id: 'codex-test',
    displayName: 'Codex Test',
    isAvailable: async () => true,
    run(opts: AgentRunOptions) {
      runOptions.push(opts);
      return {
        pid: 123,
        events: (async function* () {
          yield { type: 'system' as const, sessionId: 'session_1', cwd: opts.cwd };
          yield { type: 'text' as const, delta: '**done**' };
          yield { type: 'done' as const, sessionId: 'session_1' };
        })(),
        stop: async () => {},
        waitForExit: async () => true,
      };
    },
  };
}
