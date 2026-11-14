import type { StaffNotification } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  actionIssue,
  buildAudience,
  emptyForm,
  formFromNotification,
  isoToLocalInput,
  localInputToIso,
  toCreateBody,
  toUpdateBody,
  validateForm,
} from "../src/features/notifications/form.js";
import {
  audienceDescription,
  canManageAudience,
  estimateText,
  previewSnippet,
  readsText,
  rolesPhrase,
} from "../src/features/notifications/format.js";

const id = "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01";
const labels = { workspaceName: null, profileEmail: null };

function notification(
  overrides: Partial<StaffNotification> = {},
): StaffNotification {
  return {
    id,
    category: "news",
    title: "Hola",
    body: "Mensaje",
    action: null,
    audience: { kind: "all" },
    audienceLabel: labels,
    pinned: false,
    state: "active",
    publishAt: "2026-10-01T15:00:00.000Z",
    expiresAt: null,
    editedAt: null,
    retiredAt: null,
    createdAt: "2026-10-01T15:00:00.000Z",
    createdBy: "Staff",
    reads: 0,
    ...overrides,
  };
}

describe("audienceDescription", () => {
  it("describes every audience in words", () => {
    expect(
      audienceDescription({
        audience: { kind: "all", roles: ["owner"] },
        audienceLabel: labels,
      }),
    ).toBe("Todos los clientes · solo Owners");
    expect(
      audienceDescription({
        audience: {
          kind: "segment",
          billingStates: ["trial"],
          planCodes: ["negocio"],
        },
        audienceLabel: labels,
      }),
    ).toBe("Segmento: negocio y en prueba");
    expect(
      audienceDescription({
        audience: { kind: "workspace", workspaceId: id },
        audienceLabel: { workspaceName: "Florería Iris", profileEmail: null },
      }),
    ).toBe("Organización: Florería Iris");
    expect(
      audienceDescription({
        audience: { kind: "profile", profileId: id },
        audienceLabel: { workspaceName: null, profileEmail: "ana@iris.mx" },
      }),
    ).toBe("Persona: ana@iris.mx");
  });

  it("ignores roles that cover everyone", () => {
    expect(rolesPhrase(["owner", "admin", "editor", "viewer"])).toBeNull();
    expect(rolesPhrase([])).toBeNull();
    expect(rolesPhrase(["viewer", "owner"])).toBe("solo Owners y Lectores");
  });
});

describe("wording", () => {
  it("handles singular and plural", () => {
    expect(estimateText({ profiles: 1, workspaces: 1 })).toBe(
      "Llegará a 1 persona de 1 organización",
    );
    expect(estimateText({ profiles: 12, workspaces: 3 })).toBe(
      "Llegará a 12 personas de 3 organizaciones",
    );
    expect(readsText(0)).toBe("Nadie la ha leído");
    expect(readsText(1)).toBe("Leída por 1 persona");
    expect(readsText(5)).toBe("Leída por 5 personas");
  });

  it("cuts the preview at a word", () => {
    expect(previewSnippet("corto")).toBe("corto");
    const long = "palabra ".repeat(40);
    const snippet = previewSnippet(long, 140);
    expect(snippet.length).toBeLessThanOrEqual(141);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("requires broadcast for all and segment only", () => {
    const can = { send: true, broadcast: false };
    expect(canManageAudience({ kind: "all" }, can)).toBe(false);
    expect(canManageAudience({ kind: "workspace", workspaceId: id }, can)).toBe(
      true,
    );
  });
});

describe("form", () => {
  const filled = {
    ...emptyForm("all"),
    title: "  Novedad  ",
    body: "Texto",
  };

  it("builds each audience", () => {
    expect(buildAudience({ ...filled, roles: ["owner"] })).toEqual({
      kind: "all",
      roles: ["owner"],
    });
    expect(
      buildAudience({
        ...filled,
        audienceKind: "segment",
        billingStates: ["trial"],
      }),
    ).toEqual({ kind: "segment", billingStates: ["trial"] });
    expect(
      buildAudience({
        ...filled,
        audienceKind: "profile",
        roles: ["owner"],
        profile: { id, email: "a@b.mx" },
      }),
    ).toEqual({ kind: "profile", profileId: id });
  });

  it("validates the audience, text and button", () => {
    const now = new Date("2026-10-03T12:00:00");
    expect(validateForm(filled, now)).toEqual({});
    expect(
      validateForm({ ...filled, audienceKind: "segment" }, now).audience,
    ).toMatch(/al menos un filtro/);
    expect(
      validateForm({ ...filled, audienceKind: "workspace" }, now).audience,
    ).toMatch(/organización/);
    expect(
      validateForm({ ...filled, title: " ", body: "" }, now),
    ).toMatchObject({ title: expect.any(String), body: expect.any(String) });
    expect(
      validateForm(
        { ...filled, actionLabel: "Ver", actionUrl: "http://x.mx" },
        now,
      ).action,
    ).toMatch(/https/);
  });

  it("validates dates", () => {
    const now = new Date("2026-10-03T12:00:00");
    expect(
      validateForm(
        { ...filled, publishMode: "later", publishAt: "2026-10-01T10:00" },
        now,
      ).publishAt,
    ).toMatch(/futura/);
    expect(
      validateForm(
        {
          ...filled,
          publishMode: "later",
          publishAt: "2026-10-05T10:00",
          expiresAt: "2026-10-04T10:00",
        },
        now,
      ).expiresAt,
    ).toMatch(/después de publicarse/);
  });

  it("checks the button destination", () => {
    expect(actionIssue("", "")).toBeNull();
    expect(actionIssue("Ver", "")).toMatch(/a dónde/);
    expect(actionIssue("", "/billing")).toMatch(/texto/);
    expect(actionIssue("Ver", "/billing")).toBeNull();
    expect(actionIssue("Ver", "https://kardo.app/x")).toBeNull();
    expect(actionIssue("Ver", "javascript:alert(1)")).not.toBeNull();
  });

  it("maps the form to a create body", () => {
    const body = toCreateBody({
      ...filled,
      actionLabel: " Ver planes ",
      actionUrl: "/billing",
      pinned: true,
      publishMode: "later",
      publishAt: "2026-10-05T10:00",
    });
    expect(body).toMatchObject({
      category: "news",
      title: "Novedad",
      body: "Texto",
      action: { label: "Ver planes", url: "/billing" },
      audience: { kind: "all" },
      pinned: true,
    });
    expect(body.publishAt).toBe(new Date("2026-10-05T10:00").toISOString());
    expect(body.expiresAt).toBeUndefined();
    expect(toCreateBody(filled).publishAt).toBeUndefined();
  });

  it("round-trips local date inputs", () => {
    const local = "2026-10-05T10:30";
    expect(isoToLocalInput(localInputToIso(local))).toBe(local);
    expect(localInputToIso("")).toBeNull();
  });
});

describe("toUpdateBody", () => {
  it("sends only what changed", () => {
    const original = notification();
    const form = formFromNotification(original);
    expect(toUpdateBody(form, original)).toEqual({});
    expect(
      toUpdateBody({ ...form, title: "Nuevo", pinned: true }, original),
    ).toEqual({ title: "Nuevo", pinned: true });
  });

  it("clears the button and expiry with null", () => {
    const original = notification({
      action: { label: "Ver", url: "/billing" },
      expiresAt: "2026-10-20T15:00:00.000Z",
    });
    const form = {
      ...formFromNotification(original),
      actionLabel: "",
      actionUrl: "",
      expiresAt: "",
    };
    expect(toUpdateBody(form, original)).toEqual({
      action: null,
      expiresAt: null,
    });
  });

  it("changes the publish date only while scheduled", () => {
    const scheduled = notification({
      state: "scheduled",
      publishAt: "2026-10-10T15:00:00.000Z",
    });
    const form = {
      ...formFromNotification(scheduled),
      publishAt: "2026-10-12T09:00",
    };
    expect(toUpdateBody(form, scheduled).publishAt).toBe(
      new Date("2026-10-12T09:00").toISOString(),
    );
    const active = notification();
    expect(
      toUpdateBody(
        { ...formFromNotification(active), publishAt: "2026-12-01T09:00" },
        active,
      ),
    ).toEqual({});
  });
});
