import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { WorkspaceAccessError } from "../src/errors.js";
import { createPostgresExperienceRepository } from "../src/repositories/experiences.js";
import { experienceId, subjectId, versionId, workspaceId } from "./helpers.js";

// Security review 2026-10: republishing an old version makes its content
// live again, so a version with active modo HTML (or `html` blocks) needs
// `experiences.custom_html`, like a publish.

function fakeSql(role: string, content: unknown) {
  const queries: string[] = [];
  const tx = ((strings: TemplateStringsArray) => {
    const text = strings.join("?");
    queries.push(text);
    if (text.includes("set_config")) return Promise.resolve([]);
    if (text.includes("workspace_memberships"))
      return Promise.resolve([{ role }]);
    if (text.includes("kardo_billing.workspace_access"))
      return Promise.resolve([{ state: "active" }]);
    if (text.includes("experience_versions"))
      return Promise.resolve([{ id: versionId, revision: 3, content }]);
    return Promise.resolve([]);
  }) as unknown as Sql;
  const sql = tx as unknown as Sql & {
    begin: (fn: (t: Sql) => Promise<unknown>) => Promise<unknown>;
  };
  sql.begin = (fn) => fn(tx);
  return { sql, queries };
}

const identity = { subject: subjectId, email: "editor@kardo.test" };
const withHtml = {
  title: "Links",
  links: [],
  customHtml: { schema: 1, active: true, html: "<p>hola</p>", css: "" },
};

describe("rollback of a version with custom HTML", () => {
  it("an editor without experiences.custom_html cannot make it live again", async () => {
    const { sql, queries } = fakeSql("editor", withHtml);
    const repository = createPostgresExperienceRepository(sql);
    await expect(
      repository.createRollbackPublicationIntent(
        identity,
        workspaceId,
        experienceId,
        versionId,
        "8f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6b",
      ),
    ).rejects.toBeInstanceOf(WorkspaceAccessError);
    // Refused before resolving targets or writing a publication request.
    expect(
      queries.some((text) => text.includes("publication_requests (")),
    ).toBe(false);
  });

  it("a version without custom HTML is not gated", async () => {
    const { sql } = fakeSql("editor", { title: "Links", links: [] });
    const repository = createPostgresExperienceRepository(sql);
    // It gets past the gate; this fake has no real targets, so it stops
    // later for another reason, never for the permission.
    const error = await repository
      .createRollbackPublicationIntent(
        identity,
        workspaceId,
        experienceId,
        versionId,
        "8f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6c",
      )
      .catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(WorkspaceAccessError);
  });
});
