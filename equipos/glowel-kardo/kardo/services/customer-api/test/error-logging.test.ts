import { describe, expect, it } from "vitest";
import { loggableError } from "../src/http/error-handler.js";

describe("error logging (security review 2026-10)", () => {
  it("keeps name, message, code and stack, never Postgres row values", () => {
    const duplicate = Object.assign(
      new Error("duplicate key value violates unique constraint"),
      {
        name: "PostgresError",
        code: "23505",
        detail: "Key (email)=(ana@example.com) already exists.",
        parameters: ["ana@example.com"],
      },
    );
    const logged = loggableError(duplicate);
    expect(logged).toMatchObject({
      name: "PostgresError",
      message: "duplicate key value violates unique constraint",
      code: "23505",
    });
    expect(JSON.stringify(logged)).not.toContain("ana@example.com");
  });

  it("copes with values that are not errors", () => {
    expect(loggableError("boom")).toEqual({ name: "Error", message: "boom" });
  });
});
