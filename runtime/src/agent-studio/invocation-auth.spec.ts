import {
  buildAgentStudioInvocationHeaders,
  canonicalAgentStudioInvocation,
  signAgentStudioInvocation,
  verifyAgentStudioInvocation,
} from './invocation-auth';

describe('Agent Studio invocation authentication', () => {
  const secret = 'test-agent-studio-invocation-secret-32-bytes';
  const claims = {
    timestamp: 1787878800,
    invocationId: 'receipt-01:attempt.1',
    deploymentId: '00000000-0000-0000-0000-000000000001',
    releaseKey: 'health-factor-v1',
    method: 'post',
    path: '/x402',
  };

  it('signs a stable versioned canonical message', () => {
    expect(canonicalAgentStudioInvocation(claims)).toBe(
      [
        'v2',
        '1787878800',
        'receipt-01:attempt.1',
        '00000000-0000-0000-0000-000000000001',
        'health-factor-v1',
        'POST',
        '/x402',
      ].join('\n'),
    );
    expect(signAgentStudioInvocation(secret, claims)).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it('emits only the invocation authentication headers', () => {
    expect(buildAgentStudioInvocationHeaders(secret, claims)).toEqual({
      'x-xapi-agent-invocation-id': claims.invocationId,
      'x-xapi-agent-invocation-ts': String(claims.timestamp),
      'x-xapi-agent-invocation-signature': expect.any(String),
    });
  });

  it('rejects a signature replayed for another deployment or method', () => {
    const signature = signAgentStudioInvocation(secret, claims);
    expect(verifyAgentStudioInvocation(secret, claims, signature)).toBe(true);
    expect(
      verifyAgentStudioInvocation(
        secret,
        { ...claims, deploymentId: 'another-deployment' },
        signature,
      ),
    ).toBe(false);
    expect(
      verifyAgentStudioInvocation(
        secret,
        { ...claims, path: '/a2a' },
        signature,
      ),
    ).toBe(false);
    expect(
      verifyAgentStudioInvocation(
        secret,
        { ...claims, method: 'GET' },
        signature,
      ),
    ).toBe(false);
  });
});
