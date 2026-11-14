import { describe, expect, it } from "vitest";
import {
  cancellationFolio,
  type NoticePayload,
  renderNotice,
  TERMS_VERSION,
} from "../src/notices.js";

const links = {
  appOrigin: "https://app.kardo.test/",
  termsUrl: "https://kardo.test/terminos",
};

const base: NoticePayload = {
  workspaceName: "Florería Lila",
  planName: "Negocio",
  amount: 19900,
  currency: "mxn",
  interval: "month",
  termsVersion: TERMS_VERSION,
};

describe("renderNotice (LFPC art. 76 Bis)", () => {
  it("renewal: amount with IVA, date, periodicity and how to cancel", () => {
    const notice = renderNotice(
      "renewal_upcoming",
      { ...base, chargeAt: "2026-10-29T18:00:00.000Z" },
      links,
    );
    expect(notice.subject).toBe(
      "Tu plan Negocio se renueva el 29 de octubre de 2026",
    );
    expect(notice.text).toContain("$199 MXN, IVA incluido");
    expect(notice.text).toContain("cada mes");
    expect(notice.text).toContain("https://app.kardo.test/settings/plan");
    expect(notice.text).toContain("versión 1.1: https://kardo.test/terminos");
    expect(notice.text).toContain("Florería Lila");
  });

  it("contract: says it renews automatically and how to cancel", () => {
    const notice = renderNotice(
      "subscription_started",
      {
        ...base,
        interval: "year",
        amount: 199000,
        chargeAt: "2027-09-29T00:00:00.000Z",
      },
      links,
    );
    expect(notice.text).toContain("renovación automática cada año");
    expect(notice.text).toContain("$1,990 MXN, IVA incluido");
    expect(notice.text).toContain("al menos 7 días antes");
  });

  it("trial without card: no charge and what happens after (no free plan)", () => {
    const notice = renderNotice(
      "trial_ending",
      { ...base, trialEnd: "2026-10-13T12:00:00.000Z" },
      links,
    );
    expect(notice.text).toContain("no haremos ningún cargo");
    expect(notice.text).toContain("siguen abiertas 7 días más");
    expect(notice.text).not.toMatch(/Gratis/);
  });

  it("Kardo trial start: end date, price, no card and keeping the days", () => {
    const notice = renderNotice(
      "trial_started",
      {
        ...base,
        planName: "Profesional",
        amount: 44900,
        trialEnd: "2026-10-14T18:00:00.000Z",
      },
      links,
    );
    expect(notice.subject).toBe("Tu prueba del plan Profesional ya empezó");
    expect(notice.text).toContain("hasta el 14 de octubre de 2026");
    expect(notice.text).toContain("sin tarjeta y sin cargos");
    expect(notice.text).toContain("$449 MXN, IVA incluido cada mes");
    expect(notice.text).toContain("5 días o más de anticipación");
    expect(notice.text).toContain("borramos la organización");
  });

  it("Kardo trial reminders: days left in the subject", () => {
    const three = renderNotice(
      "trial_reminder",
      { ...base, daysLeft: 3, trialEnd: "2026-10-14T18:00:00.000Z" },
      links,
    );
    expect(three.subject).toBe("Te quedan 3 días de prueba del plan Negocio");
    const one = renderNotice(
      "trial_reminder",
      { ...base, daysLeft: 1, trialEnd: "2026-10-14T18:00:00.000Z" },
      links,
    );
    expect(one.subject).toBe("Mañana termina tu prueba del plan Negocio");
  });

  it("Kardo trial end: no charge, limited panel and the grace date", () => {
    const notice = renderNotice(
      "trial_ended",
      {
        ...base,
        trialEnd: "2026-10-14T18:00:00.000Z",
        graceEndsAt: "2026-10-21T18:00:00.000Z",
      },
      links,
    );
    expect(notice.text).toContain("no se hizo ningún cargo");
    expect(notice.text).toContain("descargar tu información");
    expect(notice.text).toContain("siguen abiertas hasta el 21 de octubre");
    expect(notice.text).toContain("también tus QR impresos");
  });

  it("cancellation: folio, end date and no more charges", () => {
    const notice = renderNotice(
      "cancellation_confirmed",
      { ...base, folio: "KC-1A2B3C4D", endsAt: "2026-10-29T18:00:00.000Z" },
      links,
    );
    expect(notice.subject).toBe(
      "Cancelaste el plan Negocio (folio KC-1A2B3C4D)",
    );
    expect(notice.text).toContain(
      "sigue activo hasta el 29 de octubre de 2026",
    );
    expect(notice.text).toContain("no habrá más cargos");
    expect(notice.text).toContain("tu panel queda limitado");
    expect(notice.text).not.toMatch(/Gratis/);
  });

  it("escapes names in HTML", () => {
    const notice = renderNotice(
      "renewal_upcoming",
      { ...base, workspaceName: '<script>"x"</script>' },
      links,
    );
    expect(notice.html).not.toContain("<script>");
    expect(notice.html).toContain("&lt;script&gt;");
  });
});

describe("cancellationFolio", () => {
  it("is short, stable and tied to the moment of cancellation", () => {
    const at = new Date("2026-09-29T20:00:00.000Z");
    const folio = cancellationFolio("sub_Kardo0001", at);
    expect(folio).toMatch(/^KC-[0-9A-F]{8}$/);
    expect(cancellationFolio("sub_Kardo0001", at)).toBe(folio);
    expect(
      cancellationFolio("sub_Kardo0001", new Date(at.getTime() + 1000)),
    ).not.toBe(folio);
  });
});
