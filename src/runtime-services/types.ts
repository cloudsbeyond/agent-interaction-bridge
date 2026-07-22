export type RuntimeConsumer = 'bridge-agent' | 'domain-agent' | 'build-agent';
export type RuntimeServicesTransport = 'rpc' | 'mcp';

export type RuntimeCapabilityId = string;

export type RuntimeServiceStatus = 'ok' | 'missing_resource' | 'failed';

export interface RuntimeServiceEvidence {
  kind: string;
  message?: string;
  data?: unknown;
}

export interface RuntimeServiceEnvelopeBase {
  status: RuntimeServiceStatus;
  capabilityId: string;
  providerId: string;
  modelId: string;
  evidence: RuntimeServiceEvidence[];
}

export type RuntimeServiceEnvelope<TOutput extends object = Record<string, never>> =
  RuntimeServiceEnvelopeBase & TOutput;

export type RuntimeCapabilityRisk = 'read' | 'write' | 'live_call' | 'admin';

export interface RuntimeCapabilityDescriptor {
  id: RuntimeCapabilityId;
  title?: string;
  risk?: RuntimeCapabilityRisk;
}

export interface RuntimeCapabilityIndex {
  schemaVersion: 1;
  transport?: RuntimeServicesTransport;
  capabilities: RuntimeCapabilityDescriptor[];
}

export interface RuntimeServicesVersion {
  name?: string;
  version?: string;
  [key: string]: unknown;
}

export type ResourceKind = 'model' | 'storage' | 'compute';
export type ResourceStatus = 'available' | 'stubbed';

export interface ResourceRequirement {
  id: string;
  kind: ResourceKind;
  capability: string;
  purpose: string;
  status: ResourceStatus;
  provider?: string;
  operatorAction: string;
}

export interface TypedTextProposal {
  kind: 'text';
  text: string;
  raw: unknown;
}

export interface RuntimeImageArtifact {
  kind: 'image';
  url?: string;
  b64Json?: string;
  raw: unknown;
}

export interface ArtifactSource {
  [key: string]: unknown;
}

export interface StoredArtifact {
  id: string;
  namespace?: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  expiresAt?: string;
  sourceUrl?: string;
  source: ArtifactSource;
}

export type RuntimeArtifactSaveInput =
  | {
      namespace: string;
      body: string | number[];
      mimeType: string;
      extension?: string;
      source?: ArtifactSource;
      sourceUrl?: string;
      expiresAt?: string;
    }
  | {
      namespace: string;
      sourceUrl: string;
      mimeType?: string;
      extension?: string;
      source?: ArtifactSource;
      expiresAt?: string;
    };

export interface VectorIndexRecord {
  id: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface VectorSearchOptions {
  limit?: number;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RuntimeRecord {
  namespace: string;
  tableName: string;
  id: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  version?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecordUpsertOutput {
  record?: RuntimeRecord;
}

export interface LanguageCompleteOutput {
  proposal?: TypedTextProposal;
}

export interface EmbeddingCreateOutput {
  embedding?: number[];
}

export interface VisionGenerateImageOutput {
  artifact?: RuntimeImageArtifact;
}

export interface ArtifactSaveOutput {
  artifact?: StoredArtifact;
}

export interface ArtifactListOutput {
  artifacts: StoredArtifact[];
}

export interface ArtifactCleanupOutput {
  deleted: StoredArtifact[];
}

export interface VectorUpsertOutput {
  id?: string;
}

export interface VectorSearchOutput {
  results: VectorSearchResult[];
}

export interface ResourcesListOutput {
  resources: ResourceRequirement[];
}
