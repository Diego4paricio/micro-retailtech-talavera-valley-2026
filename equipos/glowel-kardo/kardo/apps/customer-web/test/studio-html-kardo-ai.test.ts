import { describe, expect, it } from "vitest";
import {
  formatElapsedSeconds,
  kardoAiFailure,
  kardoAiProgress,
  kardoAiStageLabel,
  kardoAiStatusMessage,
} from "../src/features/studio/html/kardo-ai.js";
import { ApiRequestError } from "../src/lib/api.js";

describe("kardoAiFailure", () => {
  it("says a 404 means the page is gone, not that the AI is missing", () => {
    expect(
      kardoAiFailure(new ApiRequestError("x", 404, "NOT_FOUND"), true),
    ).toEqual({ status: "gone" });
    const notice = kardoAiStatusMessage({ status: "gone" }, false);
    expect(notice?.text).toMatch(/Esta página ya no existe/);
  });

  it("only points to Copiar prompt or the modo HTML where they exist", () => {
    const plan = new ApiRequestError("x", 403, "PLAN_LIMIT");
    const withHtml = kardoAiFailure(plan, true);
    const without = kardoAiFailure(plan, false);
    expect(withHtml.status === "error" && withHtml.message).toMatch(
      /Copiar prompt/,
    );
    expect(without.status === "error" && without.message).not.toMatch(
      /Copiar prompt|modo HTML/,
    );
    for (const status of ["unavailable", "limit", "budget"] as const) {
      expect(kardoAiStatusMessage({ status }, true)?.text).toMatch(
        /Copiar prompt/,
      );
      expect(kardoAiStatusMessage({ status }, false)?.text).not.toMatch(
        /Copiar prompt|modo HTML/,
      );
    }
  });

  it("has no notice for the states each surface shows on its own", () => {
    for (const status of ["idle", "running", "done"] as const)
      expect(kardoAiStatusMessage({ status }, true)).toBeNull();
    expect(
      kardoAiStatusMessage({ status: "error", message: "Algo" }, false),
    ).toEqual({ tone: "warning", text: "Algo" });
  });

  it("treats a missing or unconfigured AI the same way", () => {
    expect(
      kardoAiFailure(new ApiRequestError("x", 503, "AI_UNAVAILABLE"), true),
    ).toEqual({ status: "unavailable" });
    expect(kardoAiFailure(new ApiRequestError("x", 501, null), true)).toEqual({
      status: "unavailable",
    });
  });

  it("tells the organization's daily limit from Kardo's global budget", () => {
    expect(
      kardoAiFailure(new ApiRequestError("x", 429, "CUSTOM_HTML_LIMIT"), true),
    ).toEqual({ status: "limit" });
    expect(
      kardoAiFailure(
        new ApiRequestError("x", 429, "CUSTOM_HTML_AI_BUDGET"),
        true,
      ),
    ).toEqual({ status: "budget" });
  });

  it("tells a per-user rate limit from the organization's daily quota", () => {
    expect(
      kardoAiFailure(new ApiRequestError("x", 429, "RATE_LIMITED"), true),
    ).toEqual({ status: "rate-limited" });
    expect(kardoAiFailure(new ApiRequestError("x", 429, null), true)).toEqual({
      status: "rate-limited",
    });
  });

  it("explains a plan limit and passes through any other error", () => {
    const plan = kardoAiFailure(
      new ApiRequestError("x", 403, "PLAN_LIMIT"),
      true,
    );
    expect(plan.status).toBe("error");
    expect(plan.status === "error" && plan.message).toMatch(/Tu plan/);
    expect(
      kardoAiFailure(
        new ApiRequestError("Sin permiso", 403, "FORBIDDEN"),
        true,
      ),
    ).toEqual({ status: "error", message: "Sin permiso" });
  });

  it("gives a generic message for anything that is not an ApiRequestError", () => {
    const result = kardoAiFailure(new Error("boom"), true);
    expect(result.status).toBe("error");
  });
});

describe("kardoAiStageLabel", () => {
  it("names each real stage, with the turn while fixing", () => {
    expect(kardoAiStageLabel("queued", 1, 1)).toMatch(/espera/);
    expect(kardoAiStageLabel("generating", 1, 1)).toMatch(/Diseñando/);
    expect(kardoAiStageLabel("reviewing", 1, 1)).toMatch(/Revisando/);
    expect(kardoAiStageLabel("fixing", 2, 3)).toBe(
      "Corrigiendo lo que se quitó (2 de 3)…",
    );
    expect(kardoAiStageLabel("fixing", 1, 1)).toBe(
      "Corrigiendo lo que se quitó…",
    );
  });
});

describe("kardoAiProgress", () => {
  it("gives an honest, stage-based fill instead of a timer", () => {
    expect(kardoAiProgress("queued", 1, 1)).toBeLessThan(
      kardoAiProgress("generating", 1, 1),
    );
    expect(kardoAiProgress("generating", 1, 1)).toBeLessThan(
      kardoAiProgress("reviewing", 1, 1),
    );
    expect(kardoAiProgress("fixing", 1, 2)).toBeLessThan(
      kardoAiProgress("fixing", 2, 2),
    );
    expect(kardoAiProgress("fixing", 2, 2)).toBeLessThanOrEqual(96);
  });
});

describe("formatElapsedSeconds", () => {
  it("shows seconds under a minute and minutes:seconds after", () => {
    expect(formatElapsedSeconds(0)).toBe("0 s");
    expect(formatElapsedSeconds(42)).toBe("42 s");
    expect(formatElapsedSeconds(60)).toBe("1:00 min");
    expect(formatElapsedSeconds(125)).toBe("2:05 min");
  });
});
