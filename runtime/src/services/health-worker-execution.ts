// This bridge is emitted only for the v7 Health runtime; v6 bundles are unchanged.
export const HEALTH_WORKER_EXECUTION = String.raw`
async function executeHealthAnalysis(structuredInput, env, invocationId, requestSignal) {
  const startedAt = Date.now();
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(30_000)]);
  const tools = manifestTools();
  const tool = tools.find((candidate) => candidate.id === "getDeFiPositions");
  if (!tool) throw new Error("health_positions_unavailable");
  const args = { body: { addresses: [structuredInput.walletAddress], binanceChainIds: [structuredInput.chainId] } };
  if (!validateSchema(args, tool.inputSchema) || !toolArgumentsAuthorized(tool, args, structuredInput, new Map())) {
    throw new Error("tool_arguments_not_authorized");
  }
  const raw = await executeToolCall({
    id: "health-position-hydration", function: { name: tool.name, arguments: JSON.stringify(args) },
  }, tools, env, invocationId, signal);
  signal.throwIfAborted();
  const hydrated = JSON.parse(raw.content);
  logAgentEvent("agent_studio_health_positions", invocationId, {
    ok: hydrated.ok === true, upstreamCode: hydrated.upstreamCode || null,
    durationMs: Date.now() - startedAt, toolResponseBytes: raw.bytes,
  });
  if (!hydrated.ok) throw new Error("health_positions_unavailable");
  const result = XAPI_HEALTH.runtime.analyze(hydrated.data, structuredInput, new Date().toISOString());
  if (!validateSchema(result, OUTPUT_SCHEMA)) throw new Error("invalid_deterministic_output");
  let modelCalls = 0;
  if (structuredInput.includeExplanation !== false && result.execution_status !== "needs_input") {
    modelCalls = 1;
    const explanationSignal = AbortSignal.any([signal, AbortSignal.timeout(18_000)]);
    // Model writes position-specific prose and strategy tradeoffs. Numbers
    // enter through unit-bound references generated and checked by code.
    const context = XAPI_HEALTH.runtime.narrativeContext(result);
    const modelTask = async () => {
      const response = await fetch(env.XAPI_MODEL_BASE_URL + "/chat/completions", {
        method: "POST", signal: explanationSignal,
        headers: {
          authorization: "Bearer " + env.XAPI_MODEL_API_KEY, "content-type": "application/json",
          "x-xapi-agent-deployment-id": DEPLOYMENT_ID, "x-xapi-agent-release": RELEASE_KEY,
          [INVOCATION_ID_HEADER]: invocationId,
        },
        body: JSON.stringify({
          model: MANIFEST.model.name, temperature: 0.2, max_tokens: MANIFEST.model.maxOutputTokens,
          ...(MANIFEST.model.name.startsWith("deepseek-") ? { thinking: { type: "disabled" }, reasoning_effort: "none" } : {}),
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: MANIFEST.systemPrompt },
            { role: "user", content: JSON.stringify({ objective: structuredInput.objective, evidence: context }) },
          ],
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("explanation_upstream_failed");
      }
      const payload = parseJson(await readBoundedBody(response.body, 32_000, "explanation_too_large"));
      if (payload?.choices?.[0]?.finish_reason !== "stop") throw new Error("explanation_incomplete");
      const analysis = XAPI_HEALTH.runtime.parseNarrative(payload?.choices?.[0]?.message?.content, result);
      if (!analysis) throw new Error("narrative_validation_failed");
      return analysis;
    };
    const explanationStarted = Date.now();
    let onAbort;
    try {
      explanationSignal.throwIfAborted();
      const cancelled = new Promise((_, reject) => {
        onAbort = () => reject(new Error("explanation_timeout_or_cancelled"));
        explanationSignal.addEventListener("abort", onAbort, { once: true });
      });
      result.analysis = await Promise.race([modelTask(), cancelled]);
    } catch (error) {
      signal.throwIfAborted(); // client cancellation must not turn into success
      result.analysis.generation.source = "template_fallback";
      result.analysis.generation.failure = explanationSignal.aborted ? "timeout" : error?.message === "narrative_validation_failed" ? "narrative_validation_failed" : "invalid_or_unavailable";
    } finally {
      if (onAbort) explanationSignal.removeEventListener("abort", onAbort);
    }
    logAgentEvent("agent_studio_health_explanation", invocationId, {
      source: result.analysis.generation.source, failure: result.analysis.generation.failure,
      durationMs: Date.now() - explanationStarted,
    });
  }
  signal.throwIfAborted();
  if (!validateSchema(result, OUTPUT_SCHEMA)) throw new Error("invalid_deterministic_output");
  logAgentEvent("agent_studio_execution_complete", invocationId, {
    engine: "health-deterministic-v1", modelCalls, toolCalls: 1, hydrationToolCalls: 1,
    status: result.execution_status, toolResponseBytes: raw.bytes, durationMs: Date.now() - startedAt,
  });
  return JSON.stringify(result);
}
`;
