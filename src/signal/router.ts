export const FEISHU_CHANNEL = 'feishu';
export const MAC_CHANNEL = 'mac';
export const WEB_CHANNEL = 'web';
export const CLI_CHANNEL = 'cli';

export type ChannelId =
  | typeof FEISHU_CHANNEL
  | typeof MAC_CHANNEL
  | typeof WEB_CHANNEL
  | typeof CLI_CHANNEL
  | (string & {});

export type AgentSignalKind =
  | 'progress'
  | 'risk_approval'
  | 'choice'
  | 'artifact_preview'
  | 'patch_preview'
  | 'test_report'
  | 'status'
  | 'final_result';

export type SignalSeverity = 'info' | 'warning' | 'danger';

interface BaseSignal<K extends AgentSignalKind> {
  id?: string;
  kind: K;
  title: string;
  summary: string;
  severity?: SignalSeverity;
}

export interface ProgressSignal extends BaseSignal<'progress'> {
  phase?: string;
  cwd?: string;
  pid?: number;
}

export interface RiskApprovalSignal extends BaseSignal<'risk_approval'> {
  risk?: string;
  proposedAction?: string;
  actions?: string[];
}

export interface ChoiceSignal extends BaseSignal<'choice'> {
  actions?: string[];
}

export interface ArtifactDescriptor {
  path: string;
  mimeType?: string;
  representationHint?: string;
  sourceToolId?: string;
}

export interface ArtifactPreviewSignal extends BaseSignal<'artifact_preview'> {
  artifact: ArtifactDescriptor;
}

export interface PatchPreviewSignal extends BaseSignal<'patch_preview'> {
  patch: {
    command?: string;
    fileCount: number;
    outputPreview?: string;
    sourceToolId?: string;
  };
}

export interface TestReportSignal extends BaseSignal<'test_report'> {
  test: {
    command: string;
    passed: boolean;
    outputPreview?: string;
    sourceToolId?: string;
  };
}

export interface StatusSignal extends BaseSignal<'status'> {
  state?: string;
}

export interface FinalResultSignal extends BaseSignal<'final_result'> {
  lifecycle?: string;
  cwd?: string;
}

export type AgentSignal =
  | ProgressSignal
  | RiskApprovalSignal
  | ChoiceSignal
  | ArtifactPreviewSignal
  | PatchPreviewSignal
  | TestReportSignal
  | StatusSignal
  | FinalResultSignal;

export interface RepresentationStyle {
  id: string;
}

export interface CarrierStyle {
  id: string;
  channel: ChannelId;
  representations: string[];
}

export interface ChannelCapabilities {
  id: ChannelId;
  representations: RepresentationStyle[];
  carriers: CarrierStyle[];
  preferredRepresentations?: Partial<Record<AgentSignalKind, string[]>>;
  preferredCarriers?: Partial<Record<AgentSignalKind, string[]>>;
}

export interface DeliveryPlan {
  channel: ChannelId;
  signal: AgentSignalKind;
  representation: RepresentationStyle;
  carrier: CarrierStyle;
  reason: string;
}

export interface DeliveryPlanOptions {
  canRepresent?: (representation: RepresentationStyle, signal: AgentSignal) => boolean;
}

export type DeliveryStyle = RepresentationStyle;

const DEFAULT_REPRESENTATION_PREFERENCES: Record<AgentSignalKind, string[]> = {
  risk_approval: ['interactive_card', 'markdown'],
  choice: ['interactive_card', 'markdown'],
  progress: ['interactive_card', 'markdown'],
  artifact_preview: ['html', 'image', 'file', 'markdown'],
  patch_preview: ['html', 'file', 'markdown'],
  test_report: ['html', 'interactive_card', 'markdown'],
  status: ['interactive_card', 'markdown'],
  final_result: ['markdown', 'html'],
};

const DEFAULT_CARRIER_PREFERENCES: Record<AgentSignalKind, string[]> = {
  risk_approval: ['feishu.card', 'mac.notification', 'web.inline', 'cli.stdout'],
  choice: ['feishu.card', 'web.inline', 'cli.stdout'],
  progress: ['feishu.card', 'feishu.markdown', 'web.inline', 'cli.stdout'],
  artifact_preview: ['web.inline', 'feishu.markdown', 'feishu.file', 'cli.stdout'],
  patch_preview: ['feishu.markdown', 'web.inline', 'cli.stdout'],
  test_report: ['feishu.card', 'feishu.markdown', 'web.inline', 'cli.stdout'],
  status: ['feishu.card', 'feishu.markdown', 'web.inline', 'cli.stdout'],
  final_result: ['feishu.markdown', 'web.inline', 'cli.stdout'],
};

export function chooseDeliveryPlan(
  signal: AgentSignal,
  channel: ChannelCapabilities,
  options: DeliveryPlanOptions = {},
): DeliveryPlan | undefined {
  const representation = chooseRepresentation(signal, channel, options.canRepresent);
  if (!representation) return undefined;
  const carrier = chooseCarrier(signal, channel, representation);
  if (!carrier) return undefined;
  const representationReason = isPreferred(
    representation.id,
    channel.preferredRepresentations?.[signal.kind],
    DEFAULT_REPRESENTATION_PREFERENCES[signal.kind],
  )
    ? `preferred:${representation.id}`
    : `fallback:${representation.id}`;
  const carrierReason = isPreferred(
    carrier.id,
    channel.preferredCarriers?.[signal.kind],
    DEFAULT_CARRIER_PREFERENCES[signal.kind],
  )
    ? carrier.id
    : `fallback:${carrier.id}`;
  return {
    channel: channel.id,
    signal: signal.kind,
    representation,
    carrier,
    reason: `${representationReason}/${carrierReason}`,
  };
}

export const chooseDeliveryStyle = chooseDeliveryPlan;

function chooseRepresentation(
  signal: AgentSignal,
  channel: ChannelCapabilities,
  canRepresent?: DeliveryPlanOptions['canRepresent'],
): RepresentationStyle | undefined {
  if (channel.representations.length === 0) return undefined;

  const preferredIds = [
    ...(channel.preferredRepresentations?.[signal.kind] ?? []),
    ...DEFAULT_REPRESENTATION_PREFERENCES[signal.kind],
  ];
  for (const id of preferredIds) {
    const representation = channel.representations.find((candidate) => candidate.id === id);
    if (representation && canRepresentStyle(representation, signal, canRepresent)) {
      return representation;
    }
  }

  const text = channel.representations.find((style) => style.id === 'text');
  if (text && canRepresentStyle(text, signal, canRepresent)) return text;
  return channel.representations.find((style) => canRepresentStyle(style, signal, canRepresent));
}

function chooseCarrier(
  signal: AgentSignal,
  channel: ChannelCapabilities,
  representation: RepresentationStyle,
): CarrierStyle | undefined {
  const compatible = channel.carriers.filter(
    (carrier) => isCarrierUsableOnChannel(carrier, channel.id) && carrier.representations.includes(representation.id),
  );
  if (compatible.length === 0) return undefined;

  const preferredIds = [
    ...(channel.preferredCarriers?.[signal.kind] ?? []),
    ...DEFAULT_CARRIER_PREFERENCES[signal.kind],
  ];
  for (const id of preferredIds) {
    const carrier = compatible.find((candidate) => candidate.id === id);
    if (carrier) return carrier;
  }

  return compatible[0];
}

export function isCarrierUsableOnChannel(carrier: CarrierStyle, channelId: ChannelId): boolean {
  return carrier.channel === channelId;
}

export function isStyleUsableOnChannel(_style: DeliveryStyle, _channelId: ChannelId): boolean {
  return true;
}

function isPreferred(id: string, channelPreferred: string[] | undefined, defaults: string[]): boolean {
  return [...(channelPreferred ?? []), ...defaults].includes(id);
}

function canRepresentStyle(
  representation: RepresentationStyle,
  signal: AgentSignal,
  canRepresent: DeliveryPlanOptions['canRepresent'] | undefined,
): boolean {
  return canRepresent ? canRepresent(representation, signal) : true;
}
