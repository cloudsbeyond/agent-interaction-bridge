import {
  CLI_CHANNEL,
  FEISHU_CHANNEL,
  MAC_CHANNEL,
  WEB_CHANNEL,
  type ChannelCapabilities,
  type ChannelId,
} from './router';

export const FEISHU_CAPABILITIES: ChannelCapabilities = {
  id: FEISHU_CHANNEL,
  representations: [
    { id: 'interactive_card' },
    { id: 'markdown' },
    { id: 'text' },
    { id: 'html' },
    { id: 'image' },
    { id: 'file' },
  ],
  carriers: [
    { id: 'feishu.card', channel: FEISHU_CHANNEL, representations: ['interactive_card'] },
    { id: 'feishu.markdown', channel: FEISHU_CHANNEL, representations: ['markdown', 'text', 'html', 'image', 'file'] },
  ],
};

export const MAC_CAPABILITIES: ChannelCapabilities = {
  id: MAC_CHANNEL,
  representations: [{ id: 'text' }, { id: 'markdown' }],
  carriers: [
    { id: 'mac.notification', channel: MAC_CHANNEL, representations: ['text', 'markdown'] },
  ],
  preferredRepresentations: {
    risk_approval: ['text'],
    choice: ['text'],
    progress: ['text'],
    status: ['text'],
    final_result: ['text'],
  },
  preferredCarriers: {
    risk_approval: ['mac.notification'],
    choice: ['mac.notification'],
    progress: ['mac.notification'],
    status: ['mac.notification'],
    final_result: ['mac.notification'],
  },
};

export const WEB_CAPABILITIES: ChannelCapabilities = {
  id: WEB_CHANNEL,
  representations: [
    { id: 'interactive_card' },
    { id: 'html' },
    { id: 'markdown' },
    { id: 'text' },
    { id: 'image' },
    { id: 'file' },
  ],
  carriers: [
    { id: 'web.inline', channel: WEB_CHANNEL, representations: ['interactive_card', 'html', 'markdown', 'text', 'image', 'file'] },
  ],
};

export const CLI_CAPABILITIES: ChannelCapabilities = {
  id: CLI_CHANNEL,
  representations: [{ id: 'markdown' }, { id: 'text' }, { id: 'html' }, { id: 'file' }],
  carriers: [
    { id: 'cli.stdout', channel: CLI_CHANNEL, representations: ['markdown', 'text', 'html', 'file'] },
  ],
};

export const CHANNEL_CAPABILITIES: Record<string, ChannelCapabilities> = {
  [FEISHU_CHANNEL]: FEISHU_CAPABILITIES,
  [MAC_CHANNEL]: MAC_CAPABILITIES,
  [WEB_CHANNEL]: WEB_CAPABILITIES,
  [CLI_CHANNEL]: CLI_CAPABILITIES,
};

export function getChannelCapabilities(channelId: ChannelId): ChannelCapabilities | undefined {
  return CHANNEL_CAPABILITIES[channelId];
}
