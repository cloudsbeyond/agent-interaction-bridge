import { describe, expect, it } from 'vitest';
import { assessToolRisk, riskSignature } from './risk-policy';

describe('risk policy', () => {
  it('flags destructive shell commands', () => {
    const risk = assessToolRisk('shell', { command: 'rm -rf dist && pnpm build' });

    expect(risk).toMatchObject({
      kind: 'risk_approval',
      risk: 'destructive filesystem change',
      proposedAction: 'rm -rf dist && pnpm build',
    });
    expect(risk?.id).toContain('shell-');
  });

  it('flags publish and deploy style commands', () => {
    expect(assessToolRisk('shell', { command: 'npm publish' })?.risk).toBe('package publish');
    expect(assessToolRisk('shell', { command: 'git push origin main' })?.risk).toBe('remote git write');
    expect(assessToolRisk('shell', { command: 'kubectl apply -f prod.yaml' })?.risk).toBe('infrastructure mutation');
  });

  it('does not flag read-only shell commands', () => {
    expect(assessToolRisk('shell', { command: 'pnpm test' })).toBeUndefined();
    expect(assessToolRisk('shell', { command: 'git status --short' })).toBeUndefined();
  });

  it('creates stable signatures for equivalent risky commands', () => {
    expect(riskSignature('shell', { command: ' rm -rf dist ' })).toBe(
      riskSignature('shell', { command: 'rm -rf dist' }),
    );
  });
});
