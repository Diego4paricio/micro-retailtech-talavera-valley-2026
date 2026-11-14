import type { WorkspaceMember } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  currentTeamRecipients,
  maxLeadRecipients,
  recipientChoices,
  toggleRecipient,
} from "../src/features/leads/delivery-recipients.js";
import { leadRetentionNote } from "../src/features/leads/lead-retention-note.js";
import { webhookUrlProblem } from "../src/features/leads/webhook-url.js";

function member(email: string | null, displayName: string | null = null) {
  return {
    profileId: "00000000-0000-4000-8000-000000000001",
    displayName,
    email,
    role: "admin",
    joinedAt: "2026-10-01T00:00:00.000Z",
    isCurrentUser: false,
  } as WorkspaceMember;
}

describe("webhookUrlProblem (las reglas del API, en español)", () => {
  it("accepts an empty value and a normal https address", () => {
    expect(webhookUrlProblem("")).toBeNull();
    expect(webhookUrlProblem("   ")).toBeNull();
    expect(webhookUrlProblem("https://hooks.miempresa.com/kardo")).toBeNull();
    expect(webhookUrlProblem("https://hooks.miempresa.com:443/x")).toBeNull();
  });

  it("rejects what is not https", () => {
    expect(webhookUrlProblem("http://hooks.miempresa.com")).toMatch(/https/);
    expect(webhookUrlProblem("hooks.miempresa.com")).toMatch(/completa/);
  });

  it("rejects credentials, IPs, localhost, .local and .internal", () => {
    expect(webhookUrlProblem("https://a:b@hooks.com/x")).toMatch(/usuario/);
    expect(webhookUrlProblem("https://192.168.0.4/x")).toMatch(/IP/);
    expect(webhookUrlProblem("https://[::1]/x")).toMatch(/IP/);
    expect(webhookUrlProblem("https://localhost/x")).toMatch(
      /no está permitida/,
    );
    expect(webhookUrlProblem("https://crm.local/x")).toMatch(
      /no está permitida/,
    );
    expect(webhookUrlProblem("https://crm.internal/x")).toMatch(
      /no está permitida/,
    );
  });

  it("rejects a port other than 443", () => {
    expect(webhookUrlProblem("https://hooks.miempresa.com:8443/x")).toMatch(
      /443/,
    );
  });
});

describe("recipients are people of the team", () => {
  const team = [
    member("ana@negocio.com", "Ana"),
    member("beto@negocio.com"),
    member(null, "Sin correo"),
    member("ANA@negocio.com", "Ana otra vez"),
  ];

  it("lists only members with an email, once", () => {
    expect(recipientChoices(team)).toEqual([
      { email: "ana@negocio.com", label: "Ana" },
      { email: "beto@negocio.com", label: "beto@negocio.com" },
    ]);
  });

  it("drops saved recipients who left the team", () => {
    expect(
      currentTeamRecipients(
        ["ana@negocio.com", "salio@negocio.com", "BETO@negocio.com"],
        team,
      ),
    ).toEqual(["ana@negocio.com", "BETO@negocio.com"]);
  });

  it("toggles one and stops at the maximum", () => {
    expect(toggleRecipient([], "ana@negocio.com")).toEqual(["ana@negocio.com"]);
    expect(toggleRecipient(["ana@negocio.com"], "ANA@negocio.com")).toEqual([]);
    const full = Array.from(
      { length: maxLeadRecipients },
      (_, i) => `p${i}@x.com`,
    );
    expect(toggleRecipient(full, "otro@x.com")).toEqual(full);
  });
});

describe("leadRetentionNote", () => {
  it("says how long Kardo keeps the requests", () => {
    expect(leadRetentionNote(90)).toBe(
      "Kardo guarda tus solicitudes 90 días y después las borra.",
    );
    expect(leadRetentionNote(null)).toMatch(/sin límite/);
  });
});
