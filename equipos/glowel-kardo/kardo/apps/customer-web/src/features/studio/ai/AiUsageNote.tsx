import type { DesignAiUsage } from "@kardo/contracts";
import { usageLine } from "./use-ai-usage.js";
import "./ai-panel.css";

/**
 * The counter of Kardo's AI in one line, the same one on every surface (the
 * blocks rail has its own bar around `usageLine`; modo HTML and the
 * html-block dialog use this). Day, month and, when few are left, this
 * hour's requests (domain audit A2-37). Nothing while it loads or when the
 * API cannot say.
 */
export function AiUsageNote({ usage }: { usage: DesignAiUsage | null }) {
  if (!usage) return null;
  const line = usageLine(usage);
  return (
    <p aria-live="polite" className="es-ai-quiet">
      {line.main}.{line.detail ? ` ${line.detail}` : ""}
    </p>
  );
}
