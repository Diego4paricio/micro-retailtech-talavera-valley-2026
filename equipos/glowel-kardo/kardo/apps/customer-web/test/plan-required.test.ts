import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveErrorMessage } from "../src/lib/api.js";
import {
  notifyPlanRequired,
  onPlanRequired,
} from "../src/lib/plan-required.js";

type Listener = () => void;

function fakeWindow() {
  const listeners = new Set<Listener>();
  const target = {
    dispatchEvent: vi.fn(() => {
      for (const listener of listeners) listener();
      return true;
    }),
    addEventListener: (_: string, listener: Listener) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) =>
      listeners.delete(listener),
  };
  vi.stubGlobal("window", target);
  vi.stubGlobal("Event", class {});
  return target;
}

afterEach(() => vi.unstubAllGlobals());

describe("PLAN_REQUIRED", () => {
  it("has its own customer-facing message", () => {
    expect(resolveErrorMessage(403, "PLAN_REQUIRED")).toBe(
      "Esta organización no tiene un plan. Elige uno para seguir editando.",
    );
    expect(resolveErrorMessage(403, "PLAN_REQUIRED")).not.toBe(
      resolveErrorMessage(403, "WORKSPACE_ACCESS_DENIED"),
    );
  });

  it("opens the dialog through a global event, only for that refusal", () => {
    fakeWindow();
    const opened = vi.fn();
    const off = onPlanRequired(opened);
    expect(notifyPlanRequired(403, "WORKSPACE_ACCESS_DENIED")).toBe(false);
    expect(notifyPlanRequired(409, "PLAN_REQUIRED")).toBe(false);
    expect(opened).not.toHaveBeenCalled();
    expect(notifyPlanRequired(403, "PLAN_REQUIRED")).toBe(true);
    expect(opened).toHaveBeenCalledTimes(1);
    off();
    notifyPlanRequired(403, "PLAN_REQUIRED");
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
