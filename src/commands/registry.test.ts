import { describe, expect, test } from 'vitest';
import {
  COMMAND_SPECS,
  HANDLED_CHAT_COMMANDS,
  adminCommandNames,
  findCommandSpec,
  handledChatCommandNames,
  helpCommandLines,
  isAdminCommandName,
} from './registry';

describe('command registry', () => {
  test('keeps chat command metadata unique and queryable', () => {
    const names = COMMAND_SPECS.map((command) => command.name);

    expect(new Set(names).size).toBe(names.length);
    expect(findCommandSpec('/doctor')).toMatchObject({
      name: '/doctor',
      admin: true,
      surface: 'chat',
    });
    expect(findCommandSpec('doctor')).toMatchObject({ name: '/doctor' });
  });

  test('derives admin command decisions from command metadata', () => {
    expect(adminCommandNames()).toEqual([
      '/account',
      '/config',
      '/exit',
      '/reconnect',
      '/doctor',
      '/cd',
      '/ws',
    ]);
    expect(isAdminCommandName('/ws')).toBe(true);
    expect(isAdminCommandName('status')).toBe(false);
  });

  test('separates handled chat commands from directive-only commands', () => {
    expect(handledChatCommandNames()).toEqual(HANDLED_CHAT_COMMANDS);
    expect(handledChatCommandNames()).toContain('/doctor');
    expect(handledChatCommandNames()).toContain('/gatewayMode');
    expect(handledChatCommandNames()).not.toContain('/visual');
    expect(handledChatCommandNames()).not.toContain('/new chat');
  });

  test('renders help lines from the command registry without hiding directives', () => {
    const help = helpCommandLines().join('\n');

    expect(help).toContain('/new');
    expect(help).toContain('/visual');
    expect(help).toContain('Dynamic UI');
    expect(help).toContain('/model');
    expect(help).toContain('Agent endpoint');
    expect(help).toContain('/gatewayMode');
    expect(help).toContain('/help');
  });
});
