import type { PendingApproval } from '../task/approval-store';
import {
  displayHomeRelativePath,
  escapeInlineCode,
  escapeLarkMarkdown,
  truncateText,
} from './card-text';

interface ButtonSpec {
  text: string;
  value: Record<string, unknown>;
  style?: 'primary' | 'danger' | 'default';
}

const CALLBACK_MARKER = '__agent_cb';

export function taskApprovalCard(
  approval: Pick<
    PendingApproval,
    'id' | 'task' | 'cwd' | 'sessionId' | 'model' | 'agentProfileId' | 'createdAt'
  >,
): object {
  const session = approval.sessionId ? `\`${escapeInlineCode(approval.sessionId.slice(0, 8))}…\`` : '(新会话)';
  const model = approval.model ? `\`${escapeInlineCode(approval.model)}\`` : '(默认)';
  const profile = approval.agentProfileId ? `\`${escapeInlineCode(approval.agentProfileId)}\`` : '(默认)';
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: { title: { tag: 'plain_text', content: 'Agent 执行审批' } },
    elements: [
      divMd(
        [
          `**任务**：${escapeLarkMarkdown(truncateText(approval.task, 600))}`,
          '**状态**：待审批',
          '**计划**：点击执行后启动 agent runtime；点击修改会取消本次审批，重新发送修改后的任务即可。',
          `**cwd**：\`${escapeInlineCode(displayHomeRelativePath(approval.cwd))}\``,
          `**session**：${session}`,
          `**model**：${model}`,
          `**profile**：${profile}`,
        ].join('\n'),
      ),
      { tag: 'hr' },
      actions([
        { text: '执行', value: callbackValue('execute', approval.id), style: 'primary' },
        { text: '修改', value: callbackValue('modify', approval.id) },
        { text: '停止', value: callbackValue('cancel', approval.id), style: 'danger' },
      ]),
    ],
  };
}

function callbackValue(action: 'execute' | 'modify' | 'cancel', id: string): Record<string, unknown> {
  return {
    [CALLBACK_MARKER]: true,
    approval_action: action,
    approval_id: id,
  };
}

function divMd(content: string): object {
  return { tag: 'div', text: { tag: 'lark_md', content } };
}

function actions(buttons: ButtonSpec[]): object {
  return { tag: 'action', actions: buttons.map(button) };
}

function button(spec: ButtonSpec): object {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: spec.text },
    type: spec.style ?? 'default',
    value: spec.value,
  };
}
