import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  AGENT_STUDIO_INVOCATION_AUTH_VERSION,
  AGENT_STUDIO_INVOCATION_ID_HEADER,
  AGENT_STUDIO_INVOCATION_SECRET_BINDING,
  AGENT_STUDIO_INVOCATION_SIGNATURE_HEADER,
  AGENT_STUDIO_INVOCATION_TIMESTAMP_HEADER,
} from './invocation-headers';

export {
  AGENT_STUDIO_INVOCATION_AUTH_VERSION,
  AGENT_STUDIO_INVOCATION_ID_HEADER,
  AGENT_STUDIO_INVOCATION_SECRET_BINDING,
  AGENT_STUDIO_INVOCATION_SIGNATURE_HEADER,
  AGENT_STUDIO_INVOCATION_TIMESTAMP_HEADER,
} from './invocation-headers';

const INVOCATION_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const RESOURCE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface AgentStudioInvocationClaims {
  timestamp: number;
  invocationId: string;
  deploymentId: string;
  releaseKey: string;
  method: string;
  path: string;
}

export function assertAgentStudioInvocationSecret(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AGENT_STUDIO_INVOCATION_SECRET must be at least 32 bytes');
  }
}

export function canonicalAgentStudioInvocation(
  claims: AgentStudioInvocationClaims,
): string {
  if (!Number.isSafeInteger(claims.timestamp) || claims.timestamp <= 0) {
    throw new Error('Agent Studio invocation timestamp is invalid');
  }
  if (!INVOCATION_ID_RE.test(claims.invocationId)) {
    throw new Error('Agent Studio invocation ID is invalid');
  }
  if (
    !RESOURCE_ID_RE.test(claims.deploymentId) ||
    !RESOURCE_ID_RE.test(claims.releaseKey)
  ) {
    throw new Error('Agent Studio deployment identity is invalid');
  }
  const method = claims.method.trim().toUpperCase();
  if (!/^[A-Z]{1,16}$/.test(method)) {
    throw new Error('Agent Studio invocation method is invalid');
  }
  const path = claims.path.trim();
  if (!/^\/[^\r\n?#]{0,2047}$/.test(path)) {
    throw new Error('Agent Studio invocation path is invalid');
  }
  return [
    AGENT_STUDIO_INVOCATION_AUTH_VERSION,
    String(claims.timestamp),
    claims.invocationId,
    claims.deploymentId,
    claims.releaseKey,
    method,
    path,
  ].join('\n');
}

export function signAgentStudioInvocation(
  secret: string,
  claims: AgentStudioInvocationClaims,
): string {
  assertAgentStudioInvocationSecret(secret);
  return createHmac('sha256', secret)
    .update(canonicalAgentStudioInvocation(claims), 'utf8')
    .digest('base64url');
}

export function verifyAgentStudioInvocation(
  secret: string,
  claims: AgentStudioInvocationClaims,
  signature: string,
): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const expected = Buffer.from(
    signAgentStudioInvocation(secret, claims),
    'utf8',
  );
  const actual = Buffer.from(signature, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildAgentStudioInvocationHeaders(
  secret: string,
  claims: AgentStudioInvocationClaims,
): Record<string, string> {
  return {
    [AGENT_STUDIO_INVOCATION_ID_HEADER]: claims.invocationId,
    [AGENT_STUDIO_INVOCATION_TIMESTAMP_HEADER]: String(claims.timestamp),
    [AGENT_STUDIO_INVOCATION_SIGNATURE_HEADER]: signAgentStudioInvocation(
      secret,
      claims,
    ),
  };
}
