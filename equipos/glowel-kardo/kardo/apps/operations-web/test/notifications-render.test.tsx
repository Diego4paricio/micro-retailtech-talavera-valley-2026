import type { StaffNotification } from "@kardo/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/router.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/router.js")>()),
  Link: ({ children }: { children: ReactNode }) => <a href="#x">{children}</a>,
}));

import { NotificationPreview } from "../src/features/notifications/NotificationPreview.js";
import { NotificationRow } from "../src/features/notifications/NotificationRow.js";
import { IncidentCard } from "../src/features/status/IncidentCard.js";
import { ProbesTable } from "../src/features/status/ProbesTable.js";
import { StatusAreas } from "../src/features/status/StatusAreas.js";

const id = "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01";

const notification: StaffNotification = {
  id,
  category: "account",
  title: "Tu prueba termina pronto",
  body: "Elige un plan.",
  action: { label: "Ver planes", url: "/billing" },
  audience: {
    kind: "segment",
    billingStates: ["trial"],
    accountTypes: ["business"],
    roles: ["owner"],
  },
  audienceLabel: { workspaceName: null, profileEmail: null },
  pinned: true,
  state: "active",
  publishAt: "2026-10-01T15:00:00.000Z",
  expiresAt: null,
  editedAt: "2026-10-02T15:00:00.000Z",
  retiredAt: null,
  createdAt: "2026-10-01T15:00:00.000Z",
  createdBy: "Staff Demo",
  reads: 12,
};

describe("NotificationRow", () => {
  it("shows category, audience, marks, reads and author", () => {
    const html = renderToStaticMarkup(
      <ul>
        <NotificationRow notification={notification} />
      </ul>,
    );
    expect(html).toContain("Tu cuenta");
    expect(html).toContain("Tu prueba termina pronto");
    expect(html).toContain("Segmento: en prueba y Negocio · solo Owners");
    expect(html).toContain("Fijada arriba");
    expect(html).toContain("Editada");
    expect(html).toContain("Leída por 12 personas");
    expect(html).toContain("Staff Demo");
    expect(html).toContain("No caduca");
  });

  it("hides reads while scheduled", () => {
    const html = renderToStaticMarkup(
      <ul>
        <NotificationRow
          notification={{ ...notification, state: "scheduled", reads: 0 }}
        />
      </ul>,
    );
    expect(html).toContain("Programada");
    expect(html).toContain("Se publica");
    expect(html).not.toContain("Lecturas");
  });
});

describe("NotificationPreview", () => {
  it("shows placeholders and the button", () => {
    const html = renderToStaticMarkup(
      <NotificationPreview
        actionLabel="Ver planes"
        body=""
        category="tip"
        pinned={false}
        title=""
      />,
    );
    expect(html).toContain("Consejo");
    expect(html).toContain("Aquí va el título");
    expect(html).toContain("Ver planes");
  });
});

describe("StatusAreas", () => {
  const now = new Date("2026-10-03T12:00:00Z").getTime();
  it("lists the areas with level words and the provider mark", () => {
    const html = renderToStaticMarkup(
      <StatusAreas
        now={now}
        status={{
          overall: "degraded",
          checkedAt: "2026-10-03T11:57:00Z",
          components: [
            { id: "pages", level: "operational", provider: false },
            { id: "files", level: "degraded", provider: true },
            { id: "ai", level: "major_outage", provider: false },
          ],
          incidents: [],
          upcoming: [],
        }}
      />,
    );
    expect(html).toContain("Páginas públicas (QR, NFC y Links)");
    expect(html).toContain("Funciona");
    expect(html).toContain("Lento");
    expect(html).toContain("No funciona");
    expect(html).toContain("(proveedor)");
    expect(html).toContain("Revisado hace 3 min");
  });
});

describe("ProbesTable and IncidentCard", () => {
  it("shows unconfigured probes and failures", () => {
    const base = {
      component: "files" as const,
      slow: false,
      latencyMs: null,
      httpStatus: null,
      error: null,
      detail: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      checkedAt: null,
    };
    const html = renderToStaticMarkup(
      <ProbesTable
        probes={[
          { ...base, id: "assets", configured: false, ok: null },
          {
            ...base,
            id: "api",
            configured: true,
            ok: false,
            httpStatus: 503,
            error: "Sin respuesta",
            consecutiveFailures: 3,
          },
        ]}
      />,
    );
    expect(html).toContain("Assets Worker");
    expect(html).toContain("Sin configurar");
    expect(html).toContain("Customer API");
    expect(html).toContain("Falla");
    expect(html).toContain("503");
    expect(html).toContain("Sin respuesta");
  });

  it("shows the timeline newest first and the update button", () => {
    const html = renderToStaticMarkup(
      <IncidentCard
        incident={{
          id,
          kind: "incident",
          title: "Imágenes lentas",
          impact: "degraded",
          components: ["files"],
          startsAt: "2026-10-03T10:00:00Z",
          endsAt: null,
          resolvedAt: null,
          createdBy: null,
          createdAt: "2026-10-03T10:00:00Z",
          updates: [
            {
              status: "investigating",
              message: "Revisando",
              at: "2026-10-03T10:00:00Z",
            },
            {
              status: "identified",
              message: "Causa encontrada ya",
              at: "2026-10-03T11:00:00Z",
            },
          ],
        }}
        onAddUpdate={() => undefined}
      />,
    );
    expect(html).toContain("Incidente");
    expect(html).toContain("Imágenes lentas");
    expect(html.indexOf("Causa encontrada")).toBeLessThan(
      html.indexOf("Investigando"),
    );
    expect(html).toContain("Agregar actualización");
  });
});
