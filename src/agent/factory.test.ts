import { describe, expect, test } from 'vitest';
import { CodexAdapter } from './codex/adapter';
import { CodexAppServerAdapter } from './codex/app-server-adapter';
import { createAgentAdapter } from './factory';

describe('agent adapter factory', () => {
  test('keeps exec as the default Codex endpoint', () => {
    expect(createAgentAdapter('exec')).toBeInstanceOf(CodexAdapter);
  });

  test('can select the Codex app-server endpoint', () => {
    expect(createAgentAdapter('app-server')).toBeInstanceOf(CodexAppServerAdapter);
  });
});
