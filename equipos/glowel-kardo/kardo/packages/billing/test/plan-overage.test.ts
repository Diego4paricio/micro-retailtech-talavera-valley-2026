import { describe, expect, it } from "vitest";
import { renderNotice } from "../src/notices.js";
import {
  defaultKeep,
  type PlanSelectionCandidate,
} from "../src/plan-overage.js";

const candidate = (
  id: string,
  kind: string,
  updatedAt: string,
): PlanSelectionCandidate => ({
  id,
  publicId: `pub${id.padStart(16, "0")}`,
  kind,
  name: null,
  excluded: false,
  updatedAt: new Date(updatedAt),
});

const candidates = [
  candidate("1", "qr", "2026-09-01"),
  candidate("2", "nfc", "2026-09-20"),
  candidate("3", "qr", "2026-09-10"),
  candidate("4", "link", "2026-09-05"),
  candidate("5", "link", "2026-09-25"),
];

describe("default rule of a downgrade (ADR 023)", () => {
  it("keeps the most visited of each kind, up to its limit", () => {
    const visits = new Map([
      ["pub0000000000000001", 50],
      ["pub0000000000000004", 9],
    ]);
    expect(
      defaultKeep(candidates, visits, { touchpoints: 1, links: 1 }),
    ).toEqual(["1", "4"]);
  });

  it("without visits, keeps the most recently updated", () => {
    expect(
      defaultKeep(candidates, new Map(), { touchpoints: 2, links: 1 }),
    ).toEqual(["2", "3", "5"]);
  });

  it("keeps everything of a kind without a limit", () => {
    expect(
      defaultKeep(candidates, new Map(), { touchpoints: null, links: 0 }),
    ).toEqual(["2", "3", "1"]);
  });
});

describe("downgrade emails", () => {
  const payload = {
    workspaceName: "Florería Lila",
    planName: "Esencial",
    amount: null,
    currency: "mxn",
    interval: null,
    chooseBy: "2026-10-17T18:00:00.000Z",
    touchpointsOver: 12,
    linksOver: 1,
    touchpointsLimit: 15,
    linksLimit: 2,
  };
  const links = { appOrigin: "https://app.kardo.test", termsUrl: null };

  it("tells what is over, until when to choose and that nothing is deleted", () => {
    const notice = renderNotice("plan_overage_opened", payload, links);
    expect(notice.subject).toBe("Elige qué sigue activo con el plan Esencial");
    expect(notice.text).toContain("12 QR y etiquetas y 1 link de más");
    expect(notice.text).toContain("15 QR y etiquetas y 2 links");
    expect(notice.text).toContain("17 de octubre");
    expect(notice.text).toContain("Nada se borra");
    expect(notice.text).toContain("Esta página no está disponible por ahora");
    expect(notice.html).toContain("https://app.kardo.test/settings/plan");
  });

  it("reminds before the deadline", () => {
    expect(renderNotice("plan_overage_reminder", payload, links).subject).toBe(
      "Quedan pocos días para elegir qué sigue activo con Esencial",
    );
  });

  it("explains the rule it applied and that it can be changed", () => {
    const notice = renderNotice("plan_overage_applied", payload, links);
    expect(notice.text).toContain("más visitas en los últimos 30 días");
    expect(notice.text).toContain("Puedes cambiar cuáles quedan activos");
  });
});

describe("organizations in the downgrade (ADR 024)", () => {
  const org = (id: string, updatedAt: string): PlanSelectionCandidate => ({
    ...candidate(id, "organization", updatedAt),
    workspaceId: id,
  });
  const inOrg = (id: string, workspaceId: string, kind: string) => ({
    ...candidate(id, kind, "2026-09-01"),
    workspaceId,
  });

  it("keeps the most visited organizations, then codes only from those", () => {
    const list = [
      org("a", "2026-09-01"),
      org("b", "2026-09-02"),
      inOrg("1", "a", "qr"),
      inOrg("2", "b", "qr"),
      inOrg("3", "b", "link"),
    ];
    const visits = new Map([
      ["pub0000000000000001", 40],
      ["pub0000000000000002", 5],
    ]);
    expect(
      defaultKeep(list, visits, { organizations: 1, touchpoints: 5, links: 5 }),
    ).toEqual(["a", "1"]);
  });

  it("names organizations first in the email", () => {
    const notice = renderNotice(
      "plan_overage_opened",
      {
        workspaceName: "Estética Brillo",
        planName: "Esencial",
        amount: null,
        currency: "mxn",
        interval: null,
        chooseBy: "2026-10-22T18:00:00.000Z",
        organizationsOver: 2,
        organizationsLimit: 1,
        touchpointsOver: 0,
        linksOver: 0,
        touchpointsLimit: 15,
        linksLimit: 2,
      },
      { appOrigin: "https://app.kardo.test", termsUrl: null },
    );
    expect(notice.text).toContain("2 organizaciones de más");
    expect(notice.text).toContain(
      "1 organización, 15 QR y etiquetas y 2 links",
    );
  });
});
