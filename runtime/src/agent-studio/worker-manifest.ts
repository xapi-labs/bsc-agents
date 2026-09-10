import {
  LIQUIDITY_ANALYSIS_PROFILE,
  LIQUIDITY_ANALYSIS_RUNTIME,
} from './liquidity-analysis-contract';
import {
  GRID_ANALYSIS_PROFILE,
  GRID_ANALYSIS_RUNTIME,
} from './grid-analysis-contract';
import {
  YIELD_ANALYSIS_PROFILE,
  YIELD_ANALYSIS_RUNTIME,
} from './yield-analysis-contract';
import { createHash } from 'node:crypto';
import {
  HEALTH_ANALYSIS_PROFILE,
  HEALTH_ANALYSIS_RUNTIME,
} from './health-analysis-contract';
import {
  AgentStudioWorkerTool,
  resolveAgentStudioBinanceWeb3Tool,
} from './binance-web3-tools';
import {
  AgentStudioWorkerInputProfile,
  resolveAgentStudioWorkerInputProfile,
} from './input-profiles';

export const AGENT_STUDIO_WORKER_MANIFEST_VERSION_V1 = 1 as const;
export const AGENT_STUDIO_WORKER_MANIFEST_VERSION = 2 as const;
export const AGENT_STUDIO_WORKER_PROTOCOLS = ['a2a', 'x402'] as const;
export const AGENT_STUDIO_PI_ENGINE = 'pi-agent-core@0.85.1' as const;
export const AGENT_STUDIO_PI_RUNTIME_PROFILE =
  'agent-studio-worker-v6' as const;

export type AgentStudioWorkerProtocol =
  (typeof AGENT_STUDIO_WORKER_PROTOCOLS)[number];

export interface AgentStudioWorkerManifestV1 {
  schemaVersion: typeof AGENT_STUDIO_WORKER_MANIFEST_VERSION_V1;
  engine?: typeof AGENT_STUDIO_PI_ENGINE;
  slug: string;
  displayName: string;
  description: string;
  tags: string[];
  systemPrompt: string;
  protocols: AgentStudioWorkerProtocol[];
  model: {
    name: string;
    temperature: number;
    maxOutputTokens: number;
  };
}

export interface AgentStudioWorkerManifestV2
  extends Omit<AgentStudioWorkerManifestV1, 'schemaVersion'> {
  schemaVersion: typeof AGENT_STUDIO_WORKER_MANIFEST_VERSION;
  tools: AgentStudioWorkerTool[];
  inputProfile?: AgentStudioWorkerInputProfile;
}

export type AgentStudioWorkerManifest =
  | AgentStudioWorkerManifestV1
  | AgentStudioWorkerManifestV2;

export function agentStudioRuntimeForManifest(
  manifest: AgentStudioWorkerManifest,
): string {
  if (
    manifest.schemaVersion === 2 &&
    manifest.inputProfile?.id === HEALTH_ANALYSIS_PROFILE
  ) {
    if (manifest.slug !== 'health-factor-monitoring')
      throw new Error('Health v3 profile requires the Health Agent');
    return HEALTH_ANALYSIS_RUNTIME;
  }
  if (
    manifest.schemaVersion === 2 &&
    manifest.inputProfile?.id === YIELD_ANALYSIS_PROFILE
  ) {
    if (manifest.slug !== 'yield-optimisation')
      throw new Error('Yield v3 profile requires the Yield Agent');
    return YIELD_ANALYSIS_RUNTIME;
  }
  if (
    manifest.schemaVersion === 2 &&
    manifest.inputProfile?.id === GRID_ANALYSIS_PROFILE
  ) {
    if (manifest.slug !== 'grid-trading')
      throw new Error('Grid v3 profile requires the Grid Agent');
    return GRID_ANALYSIS_RUNTIME;
  }
  if (
    manifest.schemaVersion === 2 &&
    manifest.inputProfile?.id === LIQUIDITY_ANALYSIS_PROFILE
  ) {
    if (manifest.slug !== 'liquidity-rebalancing')
      throw new Error('Liquidity v3 profile requires the Liquidity Agent');
    return LIQUIDITY_ANALYSIS_RUNTIME;
  }
  return AGENT_STUDIO_PI_RUNTIME_PROFILE;
}

export function parseAgentStudioWorkerManifest(
  value: unknown,
): AgentStudioWorkerManifest {
  if (
    !isRecord(value) ||
    (value.schemaVersion !== 1 && value.schemaVersion !== 2)
  ) {
    throw new Error('Worker manifest schemaVersion must be 1 or 2');
  }
  const slug = requireString(value.slug, 'slug', 64);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) {
    throw new Error('Worker manifest slug must be a lowercase resource slug');
  }
  const displayName = requireString(value.displayName, 'displayName', 120);
  const description = requireString(value.description, 'description', 500);
  const systemPrompt = requireString(
    value.systemPrompt,
    'systemPrompt',
    24_000,
  );
  const tags = requireStringArray(value.tags, 'tags', 12, 40).map((tag) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(tag)) {
      throw new Error(`Worker manifest contains an invalid tag: ${tag}`);
    }
    return tag;
  });
  const protocols = requireStringArray(
    value.protocols,
    'protocols',
    AGENT_STUDIO_WORKER_PROTOCOLS.length,
    16,
  ) as AgentStudioWorkerProtocol[];
  if (protocols.length === 0 || new Set(protocols).size !== protocols.length) {
    throw new Error('Worker manifest protocols must be unique and non-empty');
  }
  for (const protocol of protocols) {
    if (
      !(AGENT_STUDIO_WORKER_PROTOCOLS as readonly string[]).includes(protocol)
    ) {
      throw new Error(`Worker manifest protocol is unsupported: ${protocol}`);
    }
  }
  if (!isRecord(value.model)) {
    throw new Error('Worker manifest model is required');
  }
  const modelName = requireString(value.model.name, 'model.name', 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(modelName)) {
    throw new Error(
      'Worker manifest model.name contains unsupported characters',
    );
  }
  const temperature = requireFiniteNumber(
    value.model.temperature,
    'model.temperature',
    0,
    2,
  );
  const maxOutputTokens = requireInteger(
    value.model.maxOutputTokens,
    'model.maxOutputTokens',
    1,
    16_384,
  );

  const base = {
    ...(value.engine !== undefined
      ? { engine: parseEngine(value.engine) }
      : {}),
    slug,
    displayName,
    description,
    tags: [...tags],
    systemPrompt,
    protocols: [...protocols].sort(),
    model: { name: modelName, temperature, maxOutputTokens },
  };
  if (value.schemaVersion === 1) {
    return { schemaVersion: 1, ...base };
  }

  const toolIds = requireToolIds(value.tools);
  if (toolIds.length === 0 || new Set(toolIds).size !== toolIds.length) {
    throw new Error('Worker manifest tools must be unique and non-empty');
  }
  const tools = toolIds.map((id) => {
    const tool = resolveAgentStudioBinanceWeb3Tool(id);
    if (!tool) {
      throw new Error(`Worker manifest tool is unsupported: ${id}`);
    }
    return tool;
  });

  const inputProfileId = optionalCatalogId(value.inputProfile, 'inputProfile');
  const inputProfile = inputProfileId
    ? resolveAgentStudioWorkerInputProfile(inputProfileId)
    : null;
  if (inputProfileId && !inputProfile) {
    throw new Error(
      `Worker manifest inputProfile is unsupported: ${inputProfileId}`,
    );
  }
  if (inputProfile) {
    for (const toolId of inputProfile.autoHydrationTools) {
      if (!toolIds.includes(toolId)) {
        throw new Error(
          `Worker manifest inputProfile requires missing tool: ${toolId}`,
        );
      }
    }
  }

  return {
    schemaVersion: 2,
    ...base,
    tools,
    ...(inputProfile ? { inputProfile } : {}),
  };
}

function parseEngine(value: unknown): typeof AGENT_STUDIO_PI_ENGINE {
  if (value !== AGENT_STUDIO_PI_ENGINE) {
    throw new Error(`Worker manifest engine must be ${AGENT_STUDIO_PI_ENGINE}`);
  }
  return value;
}

export function canonicalAgentStudioWorkerManifest(value: unknown): string {
  return JSON.stringify(parseAgentStudioWorkerManifest(value));
}

export function digestAgentStudioWorkerManifest(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalAgentStudioWorkerManifest(value), 'utf8')
    .digest('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new Error(`Worker manifest ${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new Error(
      `Worker manifest ${field} must contain 1 to ${max} characters`,
    );
  }
  return normalized;
}

function requireStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(
      `Worker manifest ${field} must be an array with at most ${maxItems} items`,
    );
  }
  return value.map((entry) => requireString(entry, field, maxLength));
}

function requireToolIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 12) {
    throw new Error(
      'Worker manifest tools must be an array with at most 12 items',
    );
  }
  return value.map((entry) => {
    if (typeof entry === 'string') {
      return requireString(entry, 'tools', 80);
    }
    if (isRecord(entry)) {
      return requireString(entry.id, 'tools.id', 80);
    }
    throw new Error('Worker manifest tools must contain tool ids');
  });
}

function optionalCatalogId(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return requireString(value, field, 80);
  if (isRecord(value)) return requireString(value.id, `${field}.id`, 80);
  throw new Error(`Worker manifest ${field} must contain a catalog id`);
}

function requireFiniteNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Worker manifest ${field} must be a finite number`);
  }
  if (value < min || value > max) {
    throw new Error(
      `Worker manifest ${field} must be between ${min} and ${max}`,
    );
  }
  return value;
}

function requireInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const parsed = requireFiniteNumber(value, field, min, max);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Worker manifest ${field} must be an integer`);
  }
  return parsed;
}
