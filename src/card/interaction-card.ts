import type { InteractionRequest } from '../interaction/protocol';
import { escapeLarkMarkdown } from './card-text';

interface ButtonSpec {
  text: string;
  action: string;
  style?: 'primary' | 'danger' | 'default';
}

const CALLBACK_MARKER = '__agent_cb';

export function interactionCard(request: InteractionRequest): object {
  return {
    schema: '2.0',
    config: {
      update_multi: true,
      width_mode: 'default',
      summary: { content: request.title },
    },
    header: {
      title: { tag: 'plain_text', content: request.title },
    },
    body: {
      direction: 'vertical',
      padding: '12px 12px 20px 12px',
      vertical_spacing: '12px',
      elements: [
        markdown(renderBody(request)),
        { tag: 'hr' },
        buttonRow(buttonsFor(request).map((b) => button(request, b))),
      ],
    },
  };
}

function renderBody(request: InteractionRequest): string {
  const lines = [`**类型**：${labelForKind(request.kind)}`, `**摘要**：${escapeLarkMarkdown(request.summary)}`];
  if (request.risk) lines.push(`**风险**：${escapeLarkMarkdown(request.risk)}`);
  if (request.proposedAction) {
    lines.push(`**拟执行**：\n\`\`\`\n${escapeCodeBlock(request.proposedAction)}\n\`\`\``);
  }
  return lines.join('\n');
}

function buttonsFor(request: InteractionRequest): ButtonSpec[] {
  const requested = request.options?.length ? request.options : ['approve', 'modify', 'reject'];
  return requested.map((action) => {
    switch (action) {
      case 'approve':
        return { text: '批准执行', action, style: 'primary' };
      case 'modify':
        return { text: '修改方案', action };
      case 'reject':
        return { text: '拒绝', action, style: 'danger' };
      case 'patch_only':
        return { text: '只看 patch', action };
      default:
        return { text: action, action };
    }
  });
}

function button(request: InteractionRequest, spec: ButtonSpec): object {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: spec.text },
    type: spec.style === 'primary' ? 'primary_filled' : spec.style ?? 'default',
    behaviors: [{
      type: 'callback',
      value: {
        [CALLBACK_MARKER]: true,
        hitl_action: spec.action,
        interaction_id: request.id,
        interaction_kind: request.kind,
        instruction: instructionFor(spec.action, request),
      },
    }],
  };
}

function instructionFor(action: string, request: InteractionRequest): string {
  switch (action) {
    case 'approve':
      return `用户已批准交互请求 ${request.id}。请继续执行拟定方案。`;
    case 'modify':
      return `用户要求修改交互请求 ${request.id} 的方案。请先给出替代方案，不要立即执行风险操作。`;
    case 'reject':
      return `用户拒绝交互请求 ${request.id}。请停止该风险操作，并给出安全替代方案。`;
    case 'patch_only':
      return `用户要求只查看 patch。请不要执行写入、删除、发布或部署动作，只生成可审阅的补丁/方案。`;
    default:
      return `用户对交互请求 ${request.id} 选择了 ${action}。请按该反馈继续。`;
  }
}

function markdown(content: string): object {
  return { tag: 'markdown', content };
}

function buttonRow(buttons: object[]): object {
  return {
    tag: 'column_set',
    flex_mode: 'flow',
    horizontal_spacing: '8px',
    columns: buttons.map((button) => ({
      tag: 'column',
      elements: [button],
    })),
  };
}

function labelForKind(kind: string): string {
  return kind === 'risk_approval' ? '风险审批' : kind;
}

function escapeCodeBlock(s: string): string {
  return s.replace(/```/g, "'''");
}
