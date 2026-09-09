/**
 * Model factory — emitted user code shared by every runtime entrypoint.
 *
 * This file is **your project's code**, scaffolded by `bag` and emitted at
 * `src/model.ts` for every project, whatever `[llm].provider` you chose.
 * It is yours to edit, fork, or replace — studio will not silently rewrite
 * it.
 *
 * What it does:
 *
 * - Exposes {@link buildModel}, the factory called by the sibling entrypoint
 *   to construct the right AI SDK `LanguageModel` for the project's `[llm]`
 *   config. For every provider it resolves a plain model via
 *   `@bnbagent/studio-runtime/llm` `resolveModel`; for `pieverse-llm` (with
 *   auto-renew on) it additionally wraps it with a credit-ensure middleware.
 * - The middleware awaits a Pieverse credit-ensure hook before every
 *   generate/stream call — inert unless the provider is `pieverse-llm`.
 *
 * The wallet-bearing credit-refresh / auto-allocate / auto-topup logic lives
 * behind the fixed {@link createPieverseCreditEnsure} signing boundary. This
 * shell receives only a no-argument callback and wires it into the AI SDK's
 * generate-call path. The wallet never enters model middleware or an LLM tool.
 */

import { loadStudioToml, type TomlTable } from "@bnbagent/studio-runtime/config";
import { resolveModel } from "@bnbagent/studio-runtime/llm";
import {
  type LanguageModel,
  type LanguageModelMiddleware,
  wrapLanguageModel,
} from "ai";
import { createPieverseCreditEnsure } from "./signing.js";

/**
 * Build the AI SDK model object for this project's `[llm]` config.
 *
 * Called by the sibling entrypoint. Reads `studio.toml` via
 * `loadStudioToml`, resolves the provider via
 * `@bnbagent/studio-runtime/llm` `resolveModel`, and (when the provider is
 * `pieverse-llm` and auto-renew is enabled) wraps it with the credit-ensure
 * middleware.
 *
 * For non-Pieverse providers — or when `[llm.auto_renew].enabled = false` —
 * returns the raw inner model unwrapped.
 */
export function buildModel(): LanguageModel {
  const cfg = loadStudioToml();
  const llmCfg = (cfg.llm ?? {}) as TomlTable;
  const inner = resolveModel(llmCfg);

  if (String(llmCfg.provider ?? "openrouter") !== "pieverse-llm") {
    return inner;
  }

  const ensureCredits = createPieverseCreditEnsure(cfg, llmCfg);
  if (!ensureCredits) return inner;

  // The AI SDK middleware seam: ensure credits BEFORE each generate/stream
  // call, then delegate untouched through the AI SDK middleware seam.
  const creditEnsure: LanguageModelMiddleware = {
    wrapGenerate: async ({ doGenerate }) => {
      await ensureCredits();
      return doGenerate();
    },
    wrapStream: async ({ doStream }) => {
      await ensureCredits();
      return doStream();
    },
  };

  // resolveModel always returns a provider model object (never a bare model
  // id string), so it satisfies wrapLanguageModel's model parameter.
  return wrapLanguageModel({
    model: inner as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: creditEnsure,
  });
}
