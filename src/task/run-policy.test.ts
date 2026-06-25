import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/schema';
import { decideRunPolicy } from './run-policy';

const baseConfig: AppConfig = {
  accounts: { app: { id: 'cli_xxx', secret: { source: 'env', id: 'FEISHU_APP_SECRET' }, tenant: 'feishu' } },
};

describe('decideRunPolicy', () => {
  it('auto-runs normal messages without forcing full card visualization', () => {
    expect(decideRunPolicy(baseConfig, '修复登录失败')).toMatchObject({
      prompt: '修复登录失败',
      approval: 'auto',
      replyMode: undefined,
      model: undefined,
    });
  });

  it('uses command directives to control approval and visualization', () => {
    expect(decideRunPolicy(baseConfig, '/approve 修复登录失败')).toMatchObject({
      prompt: '修复登录失败',
      approval: 'required',
      replyMode: 'card',
    });

    expect(decideRunPolicy(baseConfig, '/run 修复登录失败')).toMatchObject({
      prompt: '修复登录失败',
      approval: 'auto',
    });

    expect(decideRunPolicy(baseConfig, '/visual 修复登录失败')).toMatchObject({
      prompt: '修复登录失败',
      approval: 'auto',
      replyMode: 'card',
    });

    expect(decideRunPolicy(baseConfig, '/quiet 修复登录失败')).toMatchObject({
      prompt: '修复登录失败',
      approval: 'auto',
      replyMode: 'text',
    });
  });

  it('parses model directives and can require approval for configured models', () => {
    expect(decideRunPolicy(baseConfig, '/model gpt-5.4 修复登录失败')).toMatchObject({
      prompt: '修复登录失败',
      model: 'gpt-5.4',
      approval: 'auto',
    });

    expect(
      decideRunPolicy(
        {
          ...baseConfig,
          preferences: { approvalModels: ['gpt-5.5', 'gpt-5.4'] },
        },
        '/model gpt-5.4 修复登录失败',
      ),
    ).toMatchObject({
      prompt: '修复登录失败',
      model: 'gpt-5.4',
      approval: 'required',
    });
  });

  it('keeps approval keyword configuration working', () => {
    expect(
      decideRunPolicy(
        {
          ...baseConfig,
          preferences: { approvalKeywords: ['/review'] },
        },
        '/review 修复登录失败',
      ),
    ).toMatchObject({
      prompt: '修复登录失败',
      approval: 'required',
      replyMode: 'card',
    });
  });
});
