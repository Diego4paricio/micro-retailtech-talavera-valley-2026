import type { CustomerApiConfig } from "@kardo/config";
import { createAnthropicCustomHtmlModel } from "./anthropic-model.js";
import { createDevBridgeCustomHtmlModel } from "./dev-bridge-model.js";
import type { CustomHtmlModel } from "./model.js";

/**
 * Chooses (and, for `dev-bridge`, builds and validates) the Kardo AI
 * provider from configuration — exactly what `app.ts` wires into
 * `AppDependencies.customHtmlModel`. Pulled out into its own function, since
 * `app.ts` itself is additive-only shared wiring, so the selection logic
 * (and the `dev-bridge` production refusal) stays fully unit-testable here.
 *
 * `anthropic` is the default once `ANTHROPIC_API_KEY` is set; `dev-bridge`
 * needs `KARDO_AI_BRIDGE_DIR` and only ever builds outside production (see
 * `dev-bridge-model.ts`); `CUSTOM_HTML_AI_ENABLED=false` turns the whole
 * feature off regardless of what else is configured.
 *
 * With `KARDO_ENV=production` the AI is off unless `CUSTOM_HTML_AI_ENABLED`
 * is exactly "true": every plan has `custom_html.enabled`, so a key alone
 * would open a feature that is not sold yet (security review 2026-10, V9).
 * The dev bridge is refused there too, whatever `NODE_ENV` says.
 */
export function selectCustomHtmlModel(input: {
  config: Pick<
    CustomerApiConfig,
    | "ANTHROPIC_API_KEY"
    | "CUSTOM_HTML_AI_PROVIDER"
    | "CUSTOM_HTML_AI_ENABLED"
    | "KARDO_AI_BRIDGE_DIR"
    | "KARDO_AI_BRIDGE_TIMEOUT_MS"
  > & { KARDO_ENV?: CustomerApiConfig["KARDO_ENV"] };
  /** `CUSTOM_HTML_AI_MODEL`, read by the caller (see `app.ts`). */
  modelId: string;
}): CustomHtmlModel | null {
  const { config } = input;
  const production = config.KARDO_ENV === "production";
  if (config.CUSTOM_HTML_AI_ENABLED === "false") return null;
  if (production && config.CUSTOM_HTML_AI_ENABLED !== "true") return null;

  const provider =
    config.CUSTOM_HTML_AI_PROVIDER ??
    (config.ANTHROPIC_API_KEY
      ? "anthropic"
      : config.KARDO_AI_BRIDGE_DIR
        ? "dev-bridge"
        : undefined);

  if (provider === "anthropic" && config.ANTHROPIC_API_KEY) {
    return createAnthropicCustomHtmlModel({
      apiKey: config.ANTHROPIC_API_KEY,
      model: input.modelId,
    });
  }
  if (provider === "dev-bridge") {
    if (production) {
      throw new Error("The Kardo AI dev bridge never runs in production.");
    }
    return createDevBridgeCustomHtmlModel({
      dir: config.KARDO_AI_BRIDGE_DIR ?? "",
      timeoutMs: config.KARDO_AI_BRIDGE_TIMEOUT_MS,
    });
  }
  return null;
}
