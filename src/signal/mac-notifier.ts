import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MAC_CAPABILITIES } from './channels';
import { renderMarkdownSignal } from './presentation';
import { chooseDeliveryPlan, type AgentSignal, type DeliveryPlan } from './router';

const execFileAsync = promisify(execFile);
const MAX_NOTIFICATION_BODY = 220;

export interface MacNotificationPayload {
  title: string;
  subtitle: string;
  body: string;
  plan: DeliveryPlan;
}

export interface MacNotificationResult {
  sent: boolean;
  reason?: 'unsupported_platform' | 'unsupported_signal';
}

export function shouldNotifyMac(signal: AgentSignal): boolean {
  return signal.kind === 'risk_approval' || signal.kind === 'choice';
}

export function renderMacNotification(signal: AgentSignal): MacNotificationPayload | undefined {
  if (!shouldNotifyMac(signal)) return undefined;
  const plan = chooseDeliveryPlan(signal, MAC_CAPABILITIES);
  if (!plan) return undefined;
  return {
    title: signal.title,
    subtitle: labelForSignal(signal),
    body: truncate(toPlainText(renderMarkdownSignal(signal)), MAX_NOTIFICATION_BODY),
    plan,
  };
}

export async function sendMacNotification(signal: AgentSignal): Promise<MacNotificationResult> {
  if (process.platform !== 'darwin') return { sent: false, reason: 'unsupported_platform' };
  const notification = renderMacNotification(signal);
  if (!notification) return { sent: false, reason: 'unsupported_signal' };

  await execFileAsync(
    'osascript',
    [
      '-e',
      [
        'display notification',
        appleScriptString(notification.body),
        'with title',
        appleScriptString(notification.title),
        'subtitle',
        appleScriptString(notification.subtitle),
      ].join(' '),
    ],
    { timeout: 2_000 },
  );
  return { sent: true };
}

function labelForSignal(signal: AgentSignal): string {
  if (signal.kind === 'risk_approval') return 'Agent 风险审批';
  if (signal.kind === 'choice') return 'Agent 需要选择';
  return 'Agent';
}

function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
    .replace(/[*_`\\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function appleScriptString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}
