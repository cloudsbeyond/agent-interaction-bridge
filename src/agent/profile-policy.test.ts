import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { AGENT_PROFILE_CODEX_GUEST, AGENT_PROFILE_CODEX_HOST } from '../topology/entities';
import { buildAgentProfileRunPlan, getDefaultAgentEndpointProfileId } from './profile-policy';

describe('agent endpoint profile run policy', () => {
  test('keeps the host profile compatible with the operator runtime', () => {
    const plan = buildAgentProfileRunPlan({
      profileId: AGENT_PROFILE_CODEX_HOST.id,
      runtimeHome: '/bridge-home',
      scope: 'chat-1',
      run: { prompt: 'status', cwd: '/repo', sessionId: 'thread-1' },
    });

    expect(plan.profile.id).toBe(AGENT_PROFILE_CODEX_HOST.id);
    expect(plan.run).toMatchObject({
      cwd: '/repo',
      sessionId: 'thread-1',
      permissionMode: 'bypassPermissions',
      sandboxMode: 'danger-full-access',
      approvalPolicy: 'never',
    });
    expect(plan.notes).toEqual([]);
  });

  test('isolates guest profile cwd, codex home, and unsafe permission defaults', () => {
    const plan = buildAgentProfileRunPlan({
      profileId: AGENT_PROFILE_CODEX_GUEST.id,
      runtimeHome: '/bridge-home',
      scope: 'oc_a:topic/42',
      run: { prompt: 'review this', cwd: '/repo', sessionId: 'thread-1' },
    });

    expect(plan.profile.id).toBe(AGENT_PROFILE_CODEX_GUEST.id);
    expect(plan.run).toMatchObject({
      cwd: join('/bridge-home', 'profiles', 'codex-guest', 'workspaces', 'oc_a_topic_42'),
      codexHome: join('/bridge-home', 'profiles', 'codex-guest', 'codex-home'),
      sessionId: undefined,
      permissionMode: 'default',
      sandboxMode: 'workspace-write',
      approvalPolicy: 'on-request',
    });
    expect(plan.notes).toContain('cwd rewritten from /repo to profile workspace');
    expect(plan.notes).toContain('session cleared because guest profile uses isolated workspace state');
  });

  test('falls back to host profile for unknown config values', () => {
    expect(getDefaultAgentEndpointProfileId({ preferences: { agentProfile: 'bad' } })).toBe(
      AGENT_PROFILE_CODEX_HOST.id,
    );
  });
});
