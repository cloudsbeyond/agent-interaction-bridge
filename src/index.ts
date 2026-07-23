// Public exports — useful for smoke tests / debugging tools that want
// to reuse the same rendering logic the bot itself uses.
export { renderCard } from './card/run-renderer';
export { renderText } from './card/text-renderer';
export { normalizeChatMarkdown } from './card/chat-markdown';
export {
  CHAT_PRESENTATION_MAX_PARAGRAPH_CHARS,
  inspectChatPresentation,
  normalizeChatPresentation,
} from './card/chat-presentation-contract';
export type {
  ChatPresentationIssue,
  ChatPresentationIssueKind,
} from './card/chat-presentation-contract';
export {
  initialState,
  reduce,
  finalizeIfRunning,
  markInterrupted,
} from './card/run-state';
export type { RunState, ToolEntry, Block, ToolStatus, Terminal, FooterStatus } from './card/run-state';
export {
  chooseDeliveryPlan,
  chooseDeliveryStyle,
  isCarrierUsableOnChannel,
  isStyleUsableOnChannel,
  FEISHU_CHANNEL,
  MAC_CHANNEL,
  WEB_CHANNEL,
  CLI_CHANNEL,
} from './signal/router';
export type {
  AgentSignal,
  AgentSignalKind,
  CarrierStyle,
  ChannelCapabilities,
  ChannelId,
  DeliveryPlan,
  DeliveryPlanOptions,
  DeliveryStyle,
  RepresentationStyle,
} from './signal/router';
export {
  CHANNEL_CAPABILITIES,
  CLI_CAPABILITIES,
  FEISHU_CAPABILITIES,
  getChannelCapabilities,
  MAC_CAPABILITIES,
  WEB_CAPABILITIES,
} from './signal/channels';
export {
  canRenderSignalRepresentation,
  renderMarkdownSignal,
  renderSignalPresentation,
} from './signal/presentation';
export type { SignalPresentation } from './signal/presentation';
export { presentRunState } from './signal/run-presentation';
export type {
  RunPresentationSection,
  RunStreamPresentation,
} from './signal/run-presentation';
export {
  classifyInteractionIntent,
  renderInteractionIntentBlock,
} from './interaction/intent';
export type {
  InteractionIntent,
  InteractionIntentConfidence,
  InteractionIntentInput,
  InteractionIntentKind,
  InteractionIntentTarget,
  StatelessIntentJudge,
} from './interaction/intent';
export {
  planInteractionPresentation,
  renderInteractionPresentationPlanBlock,
} from './interaction/presentation-plan';
export type {
  ExpressionProfile,
  ExpressionProfileKind,
  InteractionPresentationPlan,
  InteractionPresentationSource,
} from './interaction/presentation-plan';
export {
  buildInteractionTurnPlan,
  renderContextBlock,
} from './runtime/interaction-runtime';
export type {
  InteractionAttachment,
  InteractionTurnInput,
  InteractionTurnPlan,
} from './runtime/interaction-runtime';
export {
  buildAgentProfileRunPlan,
  getDefaultAgentEndpointProfileId,
  prepareAgentProfileRunPlan,
} from './agent/profile-policy';
export type {
  AgentProfileRunPlan,
  AgentProfileRunPlanInput,
} from './agent/profile-policy';
export {
  checkArchitectureContracts,
  formatArchitectureCheck,
  readArchitectureContractInputs,
} from './architecture/contract-check';
export type {
  ArchitectureContractCheck,
  ArchitectureContractCheckResult,
  ArchitectureContractInputs,
} from './architecture/contract-check';
export {
  REQUIRED_CONTRACT_IDS,
  formatContractRegistry,
  loadContractRegistryFromDir,
  readContractRegistry,
  validateContractRegistry,
} from './architecture/contract-registry';
export type {
  ArchitectureContractCommand,
  ArchitectureContractCommandMode,
  ArchitectureContractFreezeStatus,
  ArchitectureContractLayer0,
  ArchitectureContractLayer1,
  ArchitectureContractLayer2,
  ArchitectureContractLayer3,
  ArchitectureContractLayer4,
  ArchitectureContractMode,
  ArchitectureContractOwner,
  ArchitectureContractRecord,
  ArchitectureContractRegistry,
  ArchitectureContractStatus,
  ArchitectureContractTier,
  ContractRegistryValidationOptions,
  ContractRegistryValidationResult,
} from './architecture/contract-registry';
export {
  CLI_COMMAND_SPECS,
  cliCommandNames,
  findCliCommandSpec,
} from './cli/commands/registry';
export type {
  CliCommandAuthority,
  CliCommandSpec,
  CliCommandStatus,
} from './cli/commands/registry';
export {
  renderMacNotification,
  sendMacNotification,
  shouldNotifyMac,
} from './signal/mac-notifier';
export type { MacNotificationPayload, MacNotificationResult } from './signal/mac-notifier';
export {
  bodyToLines,
  firstLine,
  isPresentationLayout,
} from './presentation/document';
export type {
  PresentationBlock,
  PresentationColumn,
  PresentationDocument,
  PresentationLayout,
  PresentationMetric,
} from './presentation/document';
export {
  FEISHU_CARD_CAPABILITIES,
  HTML_PRESENTATION_CAPABILITIES,
  MARKDOWN_PRESENTATION_CAPABILITIES,
  supportsPresentationBlock,
} from './presentation/capabilities';
export type {
  PresentationComponent,
  PresentationSurface,
  PresentationSurfaceCapabilities,
} from './presentation/capabilities';
export {
  answerPresentationToDocument,
} from './presentation/templates';
export type {
  AnswerPresentationLike,
  SectionLike,
} from './presentation/templates';
export { renderFeishuCardDocument } from './presentation/renderers/feishu-card';
export { renderPresentationHtmlDocument } from './presentation/renderers/html';
export { renderPresentationMarkdownDocument } from './presentation/renderers/markdown';
export {
  AGENT_PROFILE_CODEX_GUEST_ID,
  AGENT_PROFILE_CODEX_GUEST,
  AGENT_PROFILE_CODEX_HOST_ID,
  AGENT_PROFILE_CODEX_HOST,
  AGENT_RUNTIME_CODEX_CLI,
  CHANNEL_CLI,
  CHANNEL_FEISHU,
  CHANNEL_MAC,
  CHANNEL_WEB,
  getAgentEndpointProfile,
  getBridgeEntity,
  isAgentEndpointProfileId,
  listAgentEndpointProfiles,
  listBridgeEntities,
  listBridgeEntitiesByRole,
} from './topology/entities';
export type {
  AgentEndpointCapabilityProfile,
  AgentEndpointProfileId,
  BridgeEntity,
  BridgeEntityRole,
  EndpointAuthority,
  EndpointCapabilityLevel,
} from './topology/entities';
export type {
  BridgeChannel,
  InteractionChannelAdapter,
} from './bot/channel';
export { CodexAdapter, CodexAppServerAdapter, createAgentAdapter } from './agent';
export type {
  AgentAdapter,
  AgentEvent,
  AgentRun,
  AgentRunOptions,
  AgentRuntimeAdapter,
  AgentRuntimeEvent,
  AgentRuntimeRun,
  AgentRuntimeRunOptions,
} from './agent';
export { SignalTimelineStore } from './signal/timeline';
export type { SignalDecision, SignalRecord } from './signal/timeline';
export { extractToolResultSignals } from './signal/tool-events';
export type { ToolResultSnapshot } from './signal/tool-events';
export {
  APPROVAL_ACTION_SPECS,
  approvalActionNames,
  approvalActionSpec,
  isApprovalDecisionAction,
  validateApprovalDecisionPayload,
} from './task/approval-contract';
export type {
  ApprovalActionSpec,
  ApprovalDecision,
  ApprovalDecisionAction,
} from './task/approval-contract';
export {
  RUNTIME_DATA_ENTRIES,
  runtimeDataGitIgnorePatterns,
  validateRuntimeDataGitIgnore,
} from './runtime/data-contract';
export type { RuntimeDataEntry } from './runtime/data-contract';
export {
  createDeliverySupportRequest,
  executeDeliverySupport,
  isDeliverySupportAllowed,
} from './signal/delivery-support';
export type {
  DeliverySupportInput,
  DeliverySupportKind,
  DeliverySupportOutcome,
  DeliverySupportRequest,
} from './signal/delivery-support';
