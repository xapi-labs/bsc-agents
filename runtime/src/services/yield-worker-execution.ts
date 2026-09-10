// Emitted only for the v8 Yield runtime. Discovery and dependent detail calls
// use the same allowlisted, authenticated read-only gateway as Pi tools.
export const YIELD_WORKER_EXECUTION = String.raw`
async function executeYieldAnalysis(structuredInput, env, invocationId, requestSignal) {
  const startedAt = Date.now();
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(60_000)]);
  const tools = manifestTools();
  const evidence = new Map();
  let toolCalls = 0, totalBytes = 0;
  const call = async (id, args) => {
    signal.throwIfAborted();
    const tool = tools.find(t => t.id === id);
    if (!tool || !validateSchema(args, tool.inputSchema) || !toolArgumentsAuthorized(tool, args, structuredInput, evidence)) throw new Error('tool_arguments_not_authorized');
    if (toolCalls >= 10) throw new Error('yield_tool_budget_exceeded');
    const callId = 'yield-hydration-' + (++toolCalls);
    try {
      const raw = await executeToolCall({ id: callId, function: { name: tool.name, arguments: JSON.stringify(args) } }, tools, env, invocationId, signal);
      totalBytes += raw.bytes;
      if (totalBytes > MAX_TOTAL_TOOL_BYTES) throw new Error('yield_evidence_budget_exceeded');
      const result = JSON.parse(raw.content);
      logAgentEvent('agent_studio_yield_evidence', invocationId, { tool: id, ok: result.ok === true, bytes: raw.bytes });
      if (!result.ok) return null;
      evidence.set(id, [...(evidence.get(id) || []), { ...result, _xapiToolArguments: args }]);
      return result.data;
    } catch (error) {
      signal.throwIfAborted();
      if (error?.message === 'yield_evidence_budget_exceeded') throw error;
      logAgentEvent('agent_studio_yield_evidence', invocationId, { tool: id, ok: false, reason: 'tool_unavailable' });
      return null;
    }
  };
  const lists = [];
  for (const investType of ['Earn', 'LiquidityPool']) {
    lists.push(await call('listDeFiInvestments', { body: { binanceChainId: structuredInput.chainId, tokenAddressList: [structuredInput.assetTokenAddress], investType, page: 1, size: 20, sortField: 'apy', sortDirection: 'DESC' } }));
  }
  const details = {};
  for (const product of XAPI_YIELD.runtime.shortlist(lists, structuredInput.chainId)) {
    details[product.investmentId] = await call('getInvestmentDetail', { body: { investmentId: product.investmentId } });
  }
  const result = XAPI_YIELD.runtime.analyze(structuredInput, lists, details, new Date().toISOString());
  if (!validateSchema(result, OUTPUT_SCHEMA)) throw new Error('invalid_deterministic_output');
  let modelCalls = 0;
  if (structuredInput.includeExplanation !== false && result.candidates.some(c => c.comparable)) {
    modelCalls = 1;
    const explanationSignal = AbortSignal.any([signal, AbortSignal.timeout(18_000)]);
    try {
      const response = await fetch(env.XAPI_MODEL_BASE_URL + '/chat/completions', {
        method: 'POST', signal: explanationSignal,
        headers: { authorization: 'Bearer ' + env.XAPI_MODEL_API_KEY, 'content-type': 'application/json', 'x-xapi-agent-deployment-id': DEPLOYMENT_ID, 'x-xapi-agent-release': RELEASE_KEY, [INVOCATION_ID_HEADER]: invocationId },
        body: JSON.stringify({ model: MANIFEST.model.name, temperature: 0.2, max_tokens: MANIFEST.model.maxOutputTokens,
          ...(MANIFEST.model.name.startsWith('deepseek-') ? { thinking: { type: 'disabled' }, reasoning_effort: 'none' } : {}),
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: MANIFEST.systemPrompt }, { role: 'user', content: JSON.stringify({ objective: structuredInput.objective, evidence: XAPI_YIELD.runtime.narrativeContext(result) }) }],
        }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('explanation_unavailable'); }
      const body = JSON.parse(await readBoundedBody(response.body, 32_000, 'explanation_too_large'));
      if (body?.choices?.[0]?.finish_reason !== 'stop') throw new Error('explanation_incomplete');
      const analysis = XAPI_YIELD.runtime.parseNarrative(body?.choices?.[0]?.message?.content, result);
      if (!analysis) throw new Error('narrative_validation_failed');
      result.analysis = analysis;
    } catch (error) {
      logAgentEvent('agent_studio_yield_explanation_fallback', invocationId, { reason: error?.message === 'narrative_validation_failed' ? 'narrative_validation_failed' : 'model_unavailable_or_incomplete' });
      signal.throwIfAborted();
      result.analysis.generation = 'template_fallback';
    }
  }
  signal.throwIfAborted();
  if (!validateSchema(result, OUTPUT_SCHEMA)) throw new Error('invalid_deterministic_output');
  logAgentEvent('agent_studio_execution_complete', invocationId, { engine: 'yield-evidence-v1', modelCalls, toolCalls, toolResponseBytes: totalBytes, status: result.execution_status, durationMs: Date.now() - startedAt });
  return JSON.stringify(result);
}
`;
