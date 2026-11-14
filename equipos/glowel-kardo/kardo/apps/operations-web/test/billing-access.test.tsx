import type {
  StaffAccessWorkspace,
  StaffWorkspaceAccess,
  StaffWorkspaceBilling,
} from "@kardo/contracts";
import { staffAccessFilters } from "@kardo/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("../src/lib/api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api.js")>()),
  apiRequest: (...args: unknown[]) => request(...args),
}));
vi.mock("../src/lib/router.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/router.js")>()),
  Link: ({ children }: { children: ReactNode }) => <a href="#x">{children}</a>,
}));

import { billingApi } from "../src/api/billing.js";
import { AccessTable } from "../src/features/billing/AccessList.js";
import {
  AccessSection,
  InternalTag,
} from "../src/features/billing/AccessSection.js";
import {
  accessDateRows,
  accessEndsAt,
  accessFilterLabels,
  accessSourceLabels,
  accessStateLabels,
  accessStateView,
  accountTypeLabel,
  deletionCleanupText,
  deletionModeNote,
  deletionSummary,
  hasUnconvertedKardoTrial,
  isValidReason,
  noticeKindLabel,
} from "../src/features/billing/format.js";
import { formatDateTimeMx } from "../src/lib/format.js";

const baseAccess: StaffWorkspaceAccess = {
  state: "active",
  source: "subscription",
  lapsedAt: null,
  graceEndsAt: null,
  deleteAt: null,
  pagesPausedAt: null,
  internal: null,
  deletion: null,
};

const deletedAccess: StaffWorkspaceAccess = {
  ...baseAccess,
  state: "deleted",
  source: "none",
  deleteAt: "2026-09-20T12:00:00Z",
  deletion: {
    deletedAt: "2026-09-20T12:00:00Z",
    reason: "billing.retention_expired",
    counts: {
      touchpoints: 4,
      experiences: 6,
      assets: 0,
      leads: 37,
      invoicesKept: 2,
      cfdiKept: 0,
    },
    cleanupPending: 2,
    cleanupCompletedAt: null,
    lastCleanupError: "R2 respondió 503",
  },
};

function billing(
  overrides: Partial<StaffWorkspaceBilling> = {},
): StaffWorkspaceBilling {
  return {
    workspaceId: "20000000-0000-4000-8000-000000000001",
    workspaceName: "Café Nube",
    stripeCustomerId: null,
    stripeDashboardUrl: null,
    trialConsumedAt: null,
    trial: null,
    access: baseAccess,
    plan: null,
    manualPlanUntil: null,
    entitlements: {},
    usage: {},
    subscriptions: [],
    invoices: [],
    refunds: [],
    events: [],
    notices: [],
    ...overrides,
  };
}

const activeTrial = {
  planCode: "profesional",
  planName: "Profesional",
  interval: "month",
  startedAt: "2026-09-20T12:00:00.000Z",
  endsAt: "2026-10-05T12:00:00.000Z",
  daysLeft: 5,
  status: "active",
} as const;

function section(data: StaffWorkspaceBilling, canWrite: boolean): string {
  return renderToStaticMarkup(
    <AccessSection billing={data} canWrite={canWrite} onUpdated={() => {}} />,
  );
}

beforeEach(() => request.mockReset());

describe("access state labels", () => {
  it("names every state in Spanish", () => {
    expect(accessStateLabels).toEqual({
      internal: "Interna",
      active: "Activa",
      trial: "En prueba",
      limited: "Limitada",
      paused: "En pausa",
      deleted: "Eliminada",
      legacy: "Anterior (sin límites)",
    });
    expect(accessStateView("paused").tone).toBe("danger");
    expect(accessStateView("limited").tone).toBe("warning");
    expect(accessStateView("deleted")).toEqual({
      label: "Eliminada",
      tone: "neutral",
    });
  });

  it("names every source and filter", () => {
    expect(accessSourceLabels.trial).toBe("Prueba");
    expect(accessSourceLabels.subscription).toBe("Suscripción");
    expect(accessSourceLabels.manual).toBe("Cortesía");
    expect(accessSourceLabels.none).toBe("Sin plan");
    expect(staffAccessFilters.map((f) => accessFilterLabels[f])).toEqual([
      "En prueba",
      "Limitadas",
      "En pausa",
      "Por borrar",
      "Internas",
      "Eliminadas",
    ]);
  });
});

describe("dates in Mexico City time", () => {
  it("shows the date and the hour of the customer's clock", () => {
    const text = formatDateTimeMx("2026-09-30T02:00:00Z").replace(/\s/g, " ");
    expect(text).toMatch(/^29 /);
    expect(text).toContain("2026");
    expect(text).toMatch(/0?8:00/);
    expect(formatDateTimeMx(null)).toBe("—");
  });

  it("lists the relevant dates and flags a pending pause", () => {
    const rows = accessDateRows(
      {
        state: "paused",
        lapsedAt: "2026-07-01T12:00:00Z",
        graceEndsAt: "2026-07-08T12:00:00Z",
        deleteAt: "2026-09-29T12:00:00Z",
        pagesPausedAt: null,
      },
      null,
      (value) => `f:${value}`,
    );
    expect(rows.map((row) => row.label)).toEqual([
      "Terminó",
      "Las páginas se pausan",
      "En pausa desde",
      "Se borra",
    ]);
    expect(rows[2]?.value).toBe(
      "Pausa pendiente: el Resolver no está configurado",
    );
    const paused = accessDateRows(
      {
        state: "paused",
        lapsedAt: null,
        graceEndsAt: null,
        deleteAt: null,
        pagesPausedAt: "2026-07-08T12:00:00Z",
      },
      null,
      (value) => `f:${value}`,
    );
    expect(paused).toEqual([
      { label: "En pausa desde", value: "f:2026-07-08T12:00:00Z" },
    ]);
  });

  it("uses the trial end, or the courtesy end, as the end date", () => {
    expect(
      accessEndsAt(
        billing({
          trial: activeTrial,
          access: { ...baseAccess, state: "trial", source: "trial" },
        }),
      ),
    ).toBe(activeTrial.endsAt);
    expect(
      accessEndsAt(billing({ manualPlanUntil: "2026-11-01T00:00:00Z" })),
    ).toBe("2026-11-01T00:00:00Z");
  });
});

describe("Acceso section", () => {
  it("shows the state tag, the source and the dates", () => {
    const html = section(
      billing({
        trial: activeTrial,
        access: { ...baseAccess, state: "trial", source: "trial" },
      }),
      false,
    );
    expect(html).toContain("En prueba");
    expect(html).toContain("Origen: Prueba");
    expect(html).toContain("Fin de prueba o cortesía");
  });

  it("says when the pause is pending because the Resolver is not set up", () => {
    const html = section(
      billing({
        access: {
          ...baseAccess,
          state: "paused",
          source: "trial",
          lapsedAt: "2026-07-01T12:00:00Z",
        },
      }),
      false,
    );
    expect(html).toContain("En pausa");
    expect(html).toContain("Pausa pendiente: el Resolver no está configurado");
  });

  it("hides the switch and the extension without billing.write", () => {
    const html = section(billing({ trial: activeTrial }), false);
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("Extender prueba de Kardo");
  });

  it("offers the internal switch and the extension to writers", () => {
    const html = section(billing({ trial: activeTrial }), true);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Cuenta interna (demo)");
    expect(html).toContain("Extender prueba de Kardo");
  });

  it("does not offer the extension once the trial converted or without trial", () => {
    const converted = section(
      billing({ trial: { ...activeTrial, status: "converted" } }),
      true,
    );
    expect(converted).not.toContain("Extender prueba de Kardo");
    expect(section(billing(), true)).not.toContain("Extender prueba de Kardo");
    expect(hasUnconvertedKardoTrial({ ...activeTrial, status: "ended" })).toBe(
      true,
    );
  });

  it("shows the internal reason, who and when, with the tag by the name", () => {
    const data = billing({
      access: {
        ...baseAccess,
        state: "internal",
        source: "internal",
        internal: {
          reason: "Demo para ventas",
          setAt: "2026-09-30T02:00:00Z",
          setByName: "Ana Staff",
        },
      },
    });
    const html = section(data, true);
    expect(html).toContain("Interna");
    expect(html).toContain("Demo para ventas");
    expect(html).toContain("Por Ana Staff");
    expect(html).toContain('aria-checked="true"');
    expect(renderToStaticMarkup(<InternalTag billing={data} />)).toContain(
      "Interna",
    );
    expect(renderToStaticMarkup(<InternalTag billing={billing()} />)).toBe("");
  });
});

describe("deleted organization", () => {
  it("lists only non-zero deleted counts and the kept records", () => {
    const summary = deletionSummary(
      deletedAccess.deletion as NonNullable<typeof deletedAccess.deletion>,
    );
    expect(summary.deleted).toEqual([
      { label: "Touchpoints", count: 4 },
      { label: "Experiences", count: 6 },
      { label: "Leads", count: 37 },
    ]);
    expect(summary.kept).toEqual([
      { label: "Facturas conservadas", count: 2 },
      { label: "CFDI conservados", count: 0 },
    ]);
  });

  it("says whether the cleanup is done or pending", () => {
    const deletion = deletedAccess.deletion as NonNullable<
      typeof deletedAccess.deletion
    >;
    const format = (value: string) => `f:${value}`;
    expect(deletionCleanupText(deletion, format)).toBe(
      "Limpieza pendiente: 2 objetos",
    );
    expect(
      deletionCleanupText({ ...deletion, cleanupPending: 1 }, format),
    ).toBe("Limpieza pendiente: 1 objeto");
    expect(
      deletionCleanupText(
        { ...deletion, cleanupCompletedAt: "2026-09-21T12:00:00Z" },
        format,
      ),
    ).toBe("Limpieza terminada el f:2026-09-21T12:00:00Z");
  });

  it("shows the deletion in the Acceso section and hides the actions", () => {
    const html = section(
      billing({ access: deletedAccess, trial: activeTrial }),
      true,
    );
    expect(html).toContain("Eliminada el");
    expect(html).toContain("Se cumplieron 90 días sin plan");
    expect(html).not.toContain("billing.retention_expired");
    expect(html).toContain("Touchpoints: 4");
    expect(html).not.toContain("Archivos: 0");
    expect(html).toContain("Facturas conservadas: 2");
    expect(html).toContain("CFDI conservados: 0");
    expect(html).toContain("Limpieza pendiente: 2 objetos");
    expect(html).toContain("R2 respondió 503");
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("Extender prueba de Kardo");
    expect(html).not.toContain("Sin fechas pendientes");
  });

  it("shows the finished cleanup without the last error", () => {
    const deletion = deletedAccess.deletion as NonNullable<
      typeof deletedAccess.deletion
    >;
    const html = section(
      billing({
        access: {
          ...deletedAccess,
          deletion: {
            ...deletion,
            cleanupPending: 0,
            cleanupCompletedAt: "2026-09-21T12:00:00Z",
            lastCleanupError: "viejo",
          },
        },
      }),
      false,
    );
    expect(html).toContain("Limpieza terminada el");
    expect(html).not.toContain("viejo");
  });
});

describe("internal switch and trial extension requests", () => {
  it("requires a reason of 3 to 500 characters", () => {
    expect(isValidReason("ab")).toBe(false);
    expect(isValidReason("   ab  ")).toBe(false);
    expect(isValidReason("abc")).toBe(true);
    expect(isValidReason("x".repeat(500))).toBe(true);
    expect(isValidReason("x".repeat(501))).toBe(false);
  });

  it("sends the internal mark with PUT", async () => {
    request.mockResolvedValue(billing());
    await billingApi.setInternal("ws-1", { internal: true, reason: "Demo" });
    expect(request).toHaveBeenCalledWith("/v1/staff/workspaces/ws-1/internal", {
      method: "PUT",
      body: { internal: true, reason: "Demo" },
    });
  });

  it("extends the Kardo trial with POST", async () => {
    request.mockResolvedValue(billing());
    await billingApi.extendKardoTrial("ws-1", { days: 7, reason: "Pidió más" });
    expect(request).toHaveBeenCalledWith(
      "/v1/staff/workspaces/ws-1/kardo-trial/extend",
      { method: "POST", body: { days: 7, reason: "Pidió más" } },
    );
  });

  it("asks the access list by state", async () => {
    request.mockResolvedValue([]);
    await billingApi.accessList("deletion");
    expect(request.mock.calls[0]?.[0]).toBe(
      "/v1/staff/billing/access?state=deletion",
    );
  });
});

describe("access list", () => {
  const row: StaffAccessWorkspace = {
    ...baseAccess,
    state: "limited",
    source: "none",
    lapsedAt: "2026-09-27T12:00:00Z",
    graceEndsAt: "2026-10-04T12:00:00Z",
    deleteAt: "2026-12-26T12:00:00Z",
    workspaceId: "20000000-0000-4000-8000-000000000015",
    workspaceName: "Óptica Faro",
    ownerEmail: "faro@kardodemo.mx",
    planName: null,
    endsAt: null,
  };

  it("shows organization, Owner email, state, plan and dates", () => {
    const html = renderToStaticMarkup(<AccessTable items={[row]} />);
    expect(html).toContain("Óptica Faro");
    expect(html).toContain("faro@kardodemo.mx");
    expect(html).toContain("Limitada");
    expect(html).toContain("Sin plan");
    expect(html).toContain("Las páginas se pausan");
    expect(html).toContain("Se borra");
  });

  it("explains the deletion list by mode", () => {
    expect(deletionModeNote("off")).toBe(
      "El borrado automático está apagado; esta lista es para revisión.",
    );
    expect(deletionModeNote("dry-run")).toBe(
      "Modo de ensayo: la tarea cuenta lo que borraría, sin borrar.",
    );
    expect(deletionModeNote("on")).toBe(
      "Se borran solas al cumplir su fecha, con aviso 15 días antes.",
    );
  });

  it("shows a deleted organization with its deletion date", () => {
    const html = renderToStaticMarkup(
      <AccessTable
        items={[
          {
            ...deletedAccess,
            workspaceId: "20000000-0000-4000-8000-000000000016",
            workspaceName: "Florería Eliminada",
            ownerEmail: null,
            planName: null,
            endsAt: null,
          },
        ]}
      />,
    );
    expect(html).toContain("Eliminada");
    expect(html).not.toContain("Se borra");
  });
});

describe("new customer notices", () => {
  it("labels the access notices in Spanish", () => {
    expect(noticeKindLabel("plan_ended")).toBe("Fin del plan");
    expect(noticeKindLabel("pause_upcoming")).toBe("Páginas por pausarse");
    expect(noticeKindLabel("pages_paused")).toBe("Páginas en pausa");
    expect(noticeKindLabel("deletion_upcoming")).toBe("Aviso de borrado");
    expect(noticeKindLabel("courtesy_ending")).toBe("Fin de cortesía");
  });
});

describe("account type declared at sign up", () => {
  it("names personal and business accounts, and nothing when unknown", () => {
    expect(accountTypeLabel("personal")).toBe("Cuenta personal");
    expect(accountTypeLabel("business")).toBe("Cuenta de negocio");
    expect(accountTypeLabel(null)).toBeNull();
    expect(accountTypeLabel(undefined)).toBeNull();
  });
});
