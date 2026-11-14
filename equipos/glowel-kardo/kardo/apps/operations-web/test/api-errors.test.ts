import { describe, expect, it } from "vitest";
import {
  ApiRequestError,
  errorMessage,
  isAbortError,
  messageFor,
} from "../src/lib/api-errors.js";

describe("Staff API error mapping", () => {
  it("maps every documented Staff API code to safe Spanish copy", () => {
    expect(messageFor(401, "STAFF_SESSION_REQUIRED")).toMatch(/sesión/);
    expect(messageFor(403, "STAFF_MFA_REQUIRED")).toMatch(/dos factores/);
    expect(messageFor(403, "STAFF_ACCESS_DENIED")).toMatch(/staff activo/);
    expect(messageFor(403, "STAFF_PERMISSION_DENIED")).toMatch(/permiso/);
    expect(messageFor(404, "STAFF_NOT_FOUND")).toMatch(/encontramos/);
    expect(messageFor(409, "STAFF_CONFLICT")).toMatch(/cambió/);
    expect(messageFor(503, "STAFF_SERVICE_UNAVAILABLE")).toMatch(/disponible/);
  });

  it("falls back to a status-based message when the code is unknown", () => {
    expect(messageFor(400, null)).toMatch(/Revisa los campos/);
    expect(messageFor(401, null)).toMatch(/sesión/);
    expect(messageFor(500, null)).toBe(
      "No pudimos completar esta acción. Intenta de nuevo.",
    );
  });

  it("prefers the code-specific message even for an unusual status", () => {
    expect(messageFor(418, "STAFF_CONFLICT")).toMatch(/cambió/);
  });

  it("errorMessage() extracts the safe message from ApiRequestError only", () => {
    const error = new ApiRequestError(
      "Mensaje seguro",
      403,
      "STAFF_ACCESS_DENIED",
    );
    expect(errorMessage(error)).toBe("Mensaje seguro");
    expect(errorMessage(new Error("detalle interno"))).toBe(
      "No pudimos completar esta acción. Intenta de nuevo.",
    );
    expect(errorMessage("cualquier cosa")).toBe(
      "No pudimos completar esta acción. Intenta de nuevo.",
    );
  });

  it("carries status, code and requestId on the error instance", () => {
    const error = new ApiRequestError("x", 404, "STAFF_NOT_FOUND", "req-1");
    expect(error.status).toBe(404);
    expect(error.code).toBe("STAFF_NOT_FOUND");
    expect(error.requestId).toBe("req-1");
    expect(error.name).toBe("ApiRequestError");
  });

  it("isAbortError() recognizes only DOMException aborts", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("aborted"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
