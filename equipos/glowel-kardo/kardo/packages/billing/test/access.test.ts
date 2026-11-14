import { describe, expect, it, vi } from "vitest";
import {
  type AccessRow,
  accessNoticeFor,
  createBillingPauseClient,
  isRestrictedAccess,
  toMirroredAccess,
} from "../src/access.js";
import { checkoutSubmitMessage } from "../src/gateway.js";
import { CONVERSION_COUPON, renderNotice } from "../src/notices.js";

const DAY = 86_400_000;
const now = Date.parse("2026-10-20T18:00:00.000Z");
const at = (days: number) => new Date(now + days * DAY);
const workspaceId = "11111111-1111-4111-8111-111111111111";

function row(overrides: Partial<AccessRow>): AccessRow {
  return {
    state: "limited",
    source: "trial",
    plan_code: "negocio",
    plan_name: "Negocio",
    ends_at: null,
    lapsed_at: at(-1),
    grace_ends_at: at(6),
    delete_at: at(89),
    offer_until: at(6),
    ...overrides,
  };
}

describe("toMirroredAccess", () => {
  it("trial: days left rounded up", () => {
    const access = toMirroredAccess(
      row({
        state: "trial",
        ends_at: new Date(now + 7.2 * DAY),
        lapsed_at: null,
        grace_ends_at: null,
        delete_at: null,
        offer_until: null,
      }),
      { deletionEnabled: false, now },
    );
    expect(access.state).toBe("trial");
    expect(access.daysLeft).toBe(8);
    expect(access.offer).toBeNull();
  });

  it("limited after the trial: dates and the conversion offer", () => {
    const access = toMirroredAccess(row({}), { deletionEnabled: false, now });
    expect(access.graceEndsAt).toBe(at(6).toISOString());
    expect(access.offer).toEqual({
      percentOff: 20,
      months: 3,
      interval: "month",
      validUntil: at(6).toISOString(),
    });
    expect(access.deletionSoon).toBe(false);
  });

  it("an expired offer is not offered", () => {
    const access = toMirroredAccess(row({ offer_until: at(-1) }), {
      deletionEnabled: false,
      now,
    });
    expect(access.offer).toBeNull();
  });

  it("deletion is announced only while deletion is enabled", () => {
    const soon = row({ state: "paused", delete_at: at(10) });
    expect(
      toMirroredAccess(soon, { deletionEnabled: false, now }).deletionSoon,
    ).toBe(false);
    expect(
      toMirroredAccess(soon, { deletionEnabled: true, now }).deletionSoon,
    ).toBe(true);
    expect(
      toMirroredAccess(row({ state: "paused", delete_at: at(40) }), {
        deletionEnabled: true,
        now,
      }).deletionSoon,
    ).toBe(false);
  });

  it("restricted states are limited and paused only", () => {
    expect(isRestrictedAccess("limited")).toBe(true);
    expect(isRestrictedAccess("paused")).toBe(true);
    for (const state of ["internal", "active", "trial", "legacy"] as const) {
      expect(isRestrictedAccess(state)).toBe(false);
    }
  });
});

describe("accessNoticeFor (ADR 020 §4 calendar)", () => {
  const opts = { deletionEnabled: false, now };

  it("a trial that just ended has no access notice (trial_ended covers it)", () => {
    expect(accessNoticeFor(workspaceId, row({}), opts)).toBeNull();
  });

  it("a subscription that just ended: plan_ended once per end date", () => {
    const notice = accessNoticeFor(
      workspaceId,
      row({ source: "subscription" }),
      opts,
    );
    expect(notice?.kind).toBe("plan_ended");
    expect(notice?.dedupeKey).toBe(
      `plan_ended:${workspaceId}:${at(-1).toISOString().slice(0, 10)}`,
    );
    expect(notice?.payload.endedKind).toBe("subscription");
  });

  it("days 18 and 21 of a 15-day trial: pause_upcoming 3 and 6", () => {
    const day18 = accessNoticeFor(
      workspaceId,
      row({ lapsed_at: at(-3.1), grace_ends_at: at(3.9) }),
      opts,
    );
    expect(day18?.kind).toBe("pause_upcoming");
    expect(day18?.dedupeKey.endsWith(":3")).toBe(true);
    const day21 = accessNoticeFor(
      workspaceId,
      row({ lapsed_at: at(-6.1), grace_ends_at: at(0.9) }),
      opts,
    );
    expect(day21?.dedupeKey.endsWith(":6")).toBe(true);
  });

  it("paused pages: no pause notice (pages_paused is sent when they pause)", () => {
    expect(
      accessNoticeFor(
        workspaceId,
        row({ state: "paused", lapsed_at: at(-8), grace_ends_at: at(-1) }),
        opts,
      ),
    ).toBeNull();
  });

  it("deletion notice 15 days before, only when enabled", () => {
    const late = row({
      state: "paused",
      lapsed_at: at(-80),
      grace_ends_at: at(-73),
      delete_at: at(10),
    });
    expect(accessNoticeFor(workspaceId, late, opts)).toBeNull();
    expect(
      accessNoticeFor(workspaceId, late, { deletionEnabled: true, now })?.kind,
    ).toBe("deletion_upcoming");
  });

  it("courtesy ending: 7 days and 1 day before, never after", () => {
    const courtesy = (days: number) =>
      row({
        state: "active",
        source: "manual",
        ends_at: at(days),
        lapsed_at: null,
        grace_ends_at: null,
        delete_at: null,
        offer_until: null,
      });
    expect(accessNoticeFor(workspaceId, courtesy(9), opts)).toBeNull();
    const week = accessNoticeFor(workspaceId, courtesy(6.5), opts);
    expect(week?.kind).toBe("courtesy_ending");
    expect(week?.dedupeKey.endsWith(":7")).toBe(true);
    expect(
      accessNoticeFor(workspaceId, courtesy(0.5), opts)?.dedupeKey.endsWith(
        ":1",
      ),
    ).toBe(true);
    expect(accessNoticeFor(workspaceId, courtesy(-0.5), opts)).toBeNull();
  });

  it("internal, active, trial and legacy organizations get nothing", () => {
    for (const state of ["internal", "active", "trial", "legacy"] as const) {
      expect(
        accessNoticeFor(
          workspaceId,
          row({ state, source: state === "active" ? "subscription" : "trial" }),
          opts,
        ),
      ).toBeNull();
    }
  });
});

describe("createBillingPauseClient", () => {
  it("sends batches of 100 unique ids with the billing key", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}"));
    const client = createBillingPauseClient({
      resolverUrl: "https://resolver.kardo.test",
      commandKey: "billing-key-000000",
      fetchFn,
    });
    const ids = Array.from({ length: 150 }, (_, i) => `tp${i}`);
    await client.setPaused({ publicIds: [...ids, "tp1"], paused: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(
      "https://resolver.kardo.test/internal/billing-pause",
    );
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer billing-key-000000",
    );
    const first = JSON.parse(String(init.body));
    expect(first.publicIds).toHaveLength(100);
    expect(first.paused).toBe(true);
    const second = JSON.parse(
      String((fetchFn.mock.calls[1] as [URL, RequestInit])[1].body),
    );
    expect(second.publicIds).toHaveLength(50);
  });

  it("fails loudly when the Resolver refuses", async () => {
    const client = createBillingPauseClient({
      resolverUrl: "https://resolver.kardo.test",
      commandKey: "billing-key-000000",
      fetchFn: vi.fn().mockResolvedValue(new Response("no", { status: 401 })),
    });
    await expect(
      client.setPaused({ publicIds: ["tp1"], paused: false }),
    ).rejects.toThrow(/401/);
  });

  it("requires HTTPS except on localhost", () => {
    expect(() =>
      createBillingPauseClient({
        resolverUrl: "http://resolver.kardo.test",
        commandKey: "x".repeat(16),
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      createBillingPauseClient({
        resolverUrl: "http://localhost:8787",
        commandKey: "x".repeat(16),
      }),
    ).not.toThrow();
  });
});

describe("Checkout submit text", () => {
  it("first charge on the trial end, nothing today", () => {
    expect(
      checkoutSubmitMessage({
        trialEnd: new Date("2026-10-15T05:00:00.000Z"),
        interval: "year",
      }),
    ).toBe(
      "Hoy no se cobra nada: tu primer cargo es el 14 de octubre de 2026 y después se renueva cada año hasta que lo canceles.",
    );
  });

  it("charged today, with or without the coupon", () => {
    expect(checkoutSubmitMessage({ trialEnd: null, interval: "month" })).toBe(
      "Se cobra hoy y se renueva cada mes hasta que lo canceles.",
    );
    expect(
      checkoutSubmitMessage({
        trialEnd: null,
        interval: "month",
        couponId: CONVERSION_COUPON.id,
      }),
    ).toContain("con tu descuento");
  });
});

describe("access notice templates", () => {
  const links = { appOrigin: "https://app.kardo.test", termsUrl: null };
  const base = {
    workspaceName: "Florería Lila",
    planName: "Negocio",
    amount: null,
    currency: "mxn",
    interval: null,
    graceEndsAt: "2026-10-22T18:00:00.000Z",
    deleteAt: "2027-01-13T18:00:00.000Z",
  } as const;

  it("trial_ended announces the coupon only when it applies", () => {
    const withOffer = renderNotice(
      "trial_ended",
      { ...base, offerUntil: "2026-10-22T18:00:00.000Z" },
      links,
    );
    expect(withOffer.text).toContain(
      "tienes 20 % de descuento en tus 3 primeros meses",
    );
    const without = renderNotice("trial_ended", { ...base }, links);
    expect(without.text).not.toContain("descuento");
  });

  it("pause_upcoming and pages_paused never blame a payment on the public page", () => {
    const upcoming = renderNotice("pause_upcoming", { ...base }, links);
    expect(upcoming.subject).toBe(
      "Tus páginas se pausan el 22 de octubre de 2026",
    );
    expect(upcoming.text).toContain(
      '"Esta página no está disponible por ahora", sin ninguna mención a pagos',
    );
    const paused = renderNotice("pages_paused", { ...base }, links);
    expect(paused.subject).toBe("Tus páginas están en pausa");
    expect(paused.text).toContain(
      "vuelven al instante, también tus QR impresos",
    );
  });

  it("plan_ended distinguishes a courtesy from a paid plan", () => {
    expect(
      renderNotice("plan_ended", { ...base, endedKind: "manual" }, links)
        .subject,
    ).toBe("Terminó tu plan Negocio de cortesía");
    expect(
      renderNotice("plan_ended", { ...base, endedKind: "subscription" }, links)
        .text,
    ).toContain("no habrá más cargos");
  });

  it("deletion_upcoming keeps the user account and offers the export", () => {
    const notice = renderNotice("deletion_upcoming", { ...base }, links);
    expect(notice.subject).toBe(
      "Borraremos Florería Lila el 13 de enero de 2027",
    );
    expect(notice.text).toContain("Tu cuenta de usuario se conserva");
    expect(notice.text).toContain("descargar tu información");
  });

  it("courtesy_ending says nothing is charged automatically", () => {
    const notice = renderNotice(
      "courtesy_ending",
      { ...base, endsAt: "2026-10-27T05:59:59.000Z", daysLeft: 7 },
      links,
    );
    expect(notice.subject).toBe(
      "Tu plan Negocio de cortesía termina el 26 de octubre de 2026",
    );
    expect(notice.text).toContain("No se hará ningún cargo automático");
    expect(
      renderNotice("courtesy_ending", { ...base, daysLeft: 1 }, links).subject,
    ).toBe("Mañana termina tu plan Negocio de cortesía");
  });
});

describe("cfdi_issued notice", () => {
  it("gives the SAT folio and where the XML and PDF went", () => {
    const notice = renderNotice(
      "cfdi_issued",
      {
        workspaceName: "Florería Lila",
        planName: "Kardo",
        amount: 44900,
        currency: "mxn",
        interval: null,
        invoiceNumber: "KARDO-0012",
        paidAt: "2026-10-05T18:00:00.000Z",
        satUuid: "5f0c2d6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
        fiscalEmail: "contabilidad@florerialila.mx",
      },
      { appOrigin: "https://app.kardo.test", termsUrl: null },
    );
    expect(notice.subject).toBe(
      "Emitimos tu factura del pago del 5 de octubre de 2026",
    );
    expect(notice.text).toContain("$449 MXN, IVA incluido");
    expect(notice.text).toContain("(recibo KARDO-0012)");
    expect(notice.text).toContain(
      "Folio fiscal (UUID): 5f0c2d6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f.",
    );
    expect(notice.text).toContain(
      "Enviamos el XML y el PDF a contabilidad@florerialila.mx.",
    );
  });

  it("with Facturapi: download in the panel, and a test CFDI says so", () => {
    const notice = renderNotice(
      "cfdi_issued",
      {
        workspaceName: "Florería Lila",
        planName: "Kardo",
        amount: 44900,
        currency: "mxn",
        interval: null,
        paidAt: "2026-10-05T18:00:00.000Z",
        satUuid: "5f0c2d6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
        fiscalEmail: "contabilidad@florerialila.mx",
        cfdiInPanel: true,
        cfdiTest: true,
      },
      { appOrigin: "https://app.kardo.test", termsUrl: null },
    );
    expect(notice.text).toContain(
      "Descarga el XML y el PDF en Configuración, Plan",
    );
    expect(notice.text).toContain("no tiene validez fiscal");
    expect(notice.text).not.toContain("Enviamos el XML");
  });
});
