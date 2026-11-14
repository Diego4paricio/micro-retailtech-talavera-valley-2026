import type { ImageMediaType } from "@kardo/contracts";

/**
 * Estudio de Experiences, modo HTML: "Pídele a la IA de Kardo" (ADR 018,
 * extended 2026-09-29). `CustomHtmlModel` is the provider-agnostic seam the
 * review loop (`generate.ts`) talks to: one call in, one answer out, with
 * enough usage detail to price it and audit it. Two implementations exist
 * today (`anthropic-model.ts`, the real Claude API; `dev-bridge-model.ts`,
 * a local file-based bridge for development without an API key), chosen in
 * `createCustomHtmlModel` below by `CUSTOM_HTML_AI_PROVIDER`.
 */

export type CustomHtmlModelTextBlock = { type: "text"; text: string };
export type CustomHtmlModelImageBlock = {
  type: "image";
  mediaType: ImageMediaType;
  base64: string;
  /** Where the image came from, when it is a local file (the test bench's
   * screenshots of a draft): the bench shows it to the answering agent.
   * The Anthropic provider never sends it. */
  sourcePath?: string | undefined;
};
export type CustomHtmlModelContentBlock =
  | CustomHtmlModelTextBlock
  | CustomHtmlModelImageBlock;

export type CustomHtmlModelMessage = {
  role: "user" | "assistant";
  content: CustomHtmlModelContentBlock[];
};

export type CustomHtmlModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** Why the model stopped. Anthropic's own `stop_reason` values pass through
 * as-is (`end_turn`, `max_tokens`, `refusal`, `stop_sequence`, ...); the
 * dev bridge always answers `end_turn` since a human/agent decides when a
 * turn is "done" by writing the done file. */
export type CustomHtmlModelStopReason = string;

export type CustomHtmlModelResult = {
  /** The model's raw text answer for this turn (parsed by the caller). */
  text: string;
  usage: CustomHtmlModelUsage;
  stopReason: CustomHtmlModelStopReason;
};

export type CustomHtmlModelCompleteInput = {
  /** One id per generation (every turn of the same review loop shares it).
   * The dev bridge uses it to name its job files; the Anthropic provider
   * ignores it. */
  jobId: string;
  /** 1-based: which turn of the review loop this is. */
  turn: number;
  /** Total turns the review loop may use (today always 3); the dev bridge
   * passes it through to the answering agent for context. */
  maxTurns: number;
  /** Static, customer-text-free instructions (cacheable). */
  system: string;
  /** Full conversation so far, oldest first. */
  messages: CustomHtmlModelMessage[];
  /** Per-turn output cap (16000 for the Anthropic provider, see the ADR). */
  maxTokens: number;
  signal?: AbortSignal | undefined;
  /** Called (possibly several times) while the answer is not ready yet:
   * "queued" while nobody has picked the turn up, then "working" once when
   * someone does. Only the dev bridge reports stages; the Anthropic
   * provider never calls this since a streamed request has no separate
   * queueing phase. */
  onStage?: (stage: "queued" | "working") => void;
  /**
   * Which JSON contract the answer must follow (2026-09-30, AI in blocks):
   * "custom-html" is the modo HTML page (`{ html, css, notes }`), "design"
   * is a full `PageDesign` (`{ design, notes }`), "html-block" is one
   * `html` block's source, sized smaller than a whole page
   * (`{ html, css, notes }`). The dev bridge writes this into the turn file
   * so the answering agent knows which schema to produce without having to
   * infer it from the system prompt's prose; the Anthropic provider ignores
   * it (its system prompt already states the contract on its own).
   * Defaults to "custom-html" when absent, for callers written before this
   * field existed.
   */
  responseContract?:
    | "custom-html"
    | "design"
    | "design-concepts"
    | "design-review"
    | "html-block";
};

export type CustomHtmlModelProvider = "anthropic" | "dev-bridge";

export type CustomHtmlModel = {
  readonly provider: CustomHtmlModelProvider;
  readonly model: string;
  complete(input: CustomHtmlModelCompleteInput): Promise<CustomHtmlModelResult>;
};

/** Raised by either provider when the caller's own `AbortSignal` fired (the
 * client disconnected, or the generation's own deadline passed): the review
 * loop and the route stop immediately instead of treating this as a
 * provider failure worth auditing or retrying. */
export class CustomHtmlGenerationAbortedError extends Error {}
