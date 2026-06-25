import { describe, expect, test } from 'vitest';
import { classifyInteractionIntent } from '../interaction/intent';
import { replyModeForInteractionIntent } from './reply-mode-policy';

describe('replyModeForInteractionIntent', () => {
  test('routes explicit presentation feedback for cards to card reply mode', () => {
    const userText = '信息密度很高，且是有层次的，应该用飞书卡片嘛';
    const intent = classifyInteractionIntent({
      text: userText,
      hasPriorContext: true,
      channel: 'feishu',
    });

    expect(replyModeForInteractionIntent({ intent, userText })).toBe('card');
  });

  test('does not force cards for generic readability criticism', () => {
    const userText = '格式不好，密密麻麻的';
    const intent = classifyInteractionIntent({
      text: userText,
      hasPriorContext: true,
      channel: 'feishu',
    });

    expect(replyModeForInteractionIntent({ intent, userText })).toBeUndefined();
  });

  test('routes explicit visualization feedback to card reply mode', () => {
    const userText = '没有结构化和可视化';
    const intent = classifyInteractionIntent({
      text: userText,
      hasPriorContext: true,
      channel: 'feishu',
    });

    expect(replyModeForInteractionIntent({ intent, userText })).toBe('card');
  });

  test('does not force cards for ordinary task requests', () => {
    const userText = '帮我检查 git 状态并总结';
    const intent = classifyInteractionIntent({
      text: userText,
      hasPriorContext: false,
      channel: 'feishu',
    });

    expect(replyModeForInteractionIntent({ intent, userText })).toBeUndefined();
  });

  test('routes Dynamic UI task requests to card reply mode', () => {
    const userText = '分析一下本周转化率和活跃用户趋势';
    const intent = classifyInteractionIntent({
      text: userText,
      hasPriorContext: false,
      channel: 'feishu',
    });

    expect(replyModeForInteractionIntent({ intent, userText })).toBe('card');
  });
});
