import type { Notification, ServiceStatus } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  badgeText,
  categoryView,
  followPanelUrl,
  markReadLocally,
  needsExpand,
  previewText,
  sortNotifications,
} from "../src/features/notifications/model.js";
import { NotificationPanelView } from "../src/features/notifications/NotificationBell.js";
import { NotificationItem } from "../src/features/notifications/NotificationItem.js";
import {
  StatusIndicator,
  StatusPanelView,
} from "../src/features/status/StatusIndicator.js";
import {
  componentView,
  displayLevel,
  formatWindow,
  headline,
  isStale,
  levelView,
} from "../src/features/status/status-model.js";
import { setDatePreferences } from "../src/lib/date-preferences.js";
import {
  demoNotificationInbox,
  demoServiceStatus,
  handleNotificationsDemo,
} from "../src/lib/demo/notifications.js";

const base: Notification = {
  id: "n1",
  category: "news",
  title: "Nuevo: Visor de PDF",
  body: "Muestra tu menú en PDF.",
  action: null,
  pinned: false,
  publishedAt: "2026-10-03T18:00:00.000Z",
  editedAt: null,
  expiresAt: null,
  readAt: null,
  workspace: null,
};

const noop = () => undefined;

function renderItem(notification: Notification) {
  return renderToStaticMarkup(
    <NotificationItem
      navigate={noop}
      notification={notification}
      onRead={noop}
    />,
  );
}

describe("notification model", () => {
  it("folds long or multi-paragraph texts only", () => {
    expect(needsExpand({ body: "Corto." })).toBe(false);
    expect(needsExpand({ body: "Uno.\n\nDos." })).toBe(true);
    expect(needsExpand({ body: "x".repeat(141) })).toBe(true);
  });

  it("cuts the preview on a word and keeps short texts whole", () => {
    expect(previewText("Hola")).toBe("Hola");
    const long = `${"palabra ".repeat(30)}fin`;
    const preview = previewText(long);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(141);
    expect(preview).not.toMatch(/palabr…$/);
    expect(previewText("Primer párrafo.\n\nSegundo.")).toBe("Primer párrafo.");
  });

  it("caps the badge at 9+", () => {
    expect(badgeText(3)).toBe("3");
    expect(badgeText(9)).toBe("9");
    expect(badgeText(12)).toBe("9+");
  });

  it("keeps pinned first and marks read without reordering", () => {
    const items = sortNotifications([
      { ...base, id: "a", publishedAt: "2026-10-03T10:00:00.000Z" },
      {
        ...base,
        id: "b",
        pinned: true,
        publishedAt: "2026-09-01T10:00:00.000Z",
      },
      { ...base, id: "c", publishedAt: "2026-10-03T12:00:00.000Z" },
    ]);
    expect(items.map((n) => n.id)).toEqual(["b", "c", "a"]);
    const read = markReadLocally(
      items,
      new Set(["c"]),
      "2026-10-03T13:00:00.000Z",
    );
    expect(read.map((n) => n.readAt !== null)).toEqual([false, true, false]);
    expect(
      markReadLocally(items, "all", "x").every((n) => n.readAt === "x"),
    ).toBe(true);
  });
});

describe("NotificationItem", () => {
  it("shows a short notification whole, with its unread mark", () => {
    const html = renderItem(base);
    expect(html).toContain("Nuevo: Visor de PDF");
    expect(html).toContain("Muestra tu menú en PDF.");
    expect(html).toContain("is-unread");
    expect(html).toContain("Marcar como leída");
    expect(html).not.toContain("Ver más");
  });

  it("folds a long one behind «Ver más» and hides its button until opened", () => {
    const html = renderItem({
      ...base,
      body: `${"Texto largo ".repeat(20)}\n\nSegundo párrafo.`,
      action: { label: "Ver Experiences", url: "/experiences" },
    });
    expect(html).toContain("Ver más");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Segundo párrafo.");
    expect(html).not.toContain("Ver Experiences");
  });

  it("links panel paths in place and https addresses in a new tab", () => {
    const panel = renderItem({
      ...base,
      action: { label: "Ir a Touchpoints", url: "/touchpoints" },
    });
    expect(panel).toContain('href="/touchpoints"');
    expect(panel).not.toContain('target="_blank"');
    const external = renderItem({
      ...base,
      action: { label: "Leer más", url: "https://kardo.mx/novedades" },
    });
    expect(external).toContain('href="https://kardo.mx/novedades"');
    expect(external).toContain('target="_blank"');
    expect(external).toContain('rel="noopener noreferrer"');
  });

  it("never renders an unsafe address as a link", () => {
    const html = renderItem({
      ...base,
      action: { label: "Clic", url: "javascript:alert(1)" },
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain(">Clic<");
  });

  it("shows text, never HTML", () => {
    const html = renderItem({ ...base, body: "<img src=x onerror=alert(1)>" });
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });

  it("names the organization, the pin and «Editada» when they apply", () => {
    const html = renderItem({
      ...base,
      category: "account",
      pinned: true,
      readAt: "2026-10-03T19:00:00.000Z",
      editedAt: "2026-10-03T18:30:00.000Z",
      workspace: { id: "w1", name: "Florería Iris" },
    });
    expect(html).toContain("Tu cuenta");
    expect(html).toContain("Fijada");
    expect(html).toContain("Florería Iris");
    expect(html).toContain("Editada");
    expect(html).not.toContain("is-unread");
  });
});

describe("NotificationPanelView", () => {
  const props = {
    navigate: noop,
    onRead: noop,
    onMarkAllRead: noop,
    onNavigate: noop,
    onRetry: noop,
    onSeeAll: noop,
    seeAllHref: "/notifications",
  };

  it("offers «Marcar todas como leídas» only with unread ones", () => {
    const html = renderToStaticMarkup(
      <NotificationPanelView
        {...props}
        error={false}
        isLoading={false}
        items={[base]}
        unreadCount={1}
      />,
    );
    expect(html).toContain("1 sin leer");
    expect(html).toContain("Marcar todas como leídas");
    expect(html).toContain('href="/notifications"');
    const none = renderToStaticMarkup(
      <NotificationPanelView
        {...props}
        error={false}
        isLoading={false}
        items={[{ ...base, readAt: "2026-10-03T19:00:00.000Z" }]}
        unreadCount={0}
      />,
    );
    expect(none).not.toContain("Marcar todas como leídas");
  });

  it("explains an empty bell and a failed load", () => {
    const empty = renderToStaticMarkup(
      <NotificationPanelView
        {...props}
        error={false}
        isLoading={false}
        items={[]}
        unreadCount={0}
      />,
    );
    expect(empty).toContain("No tienes notificaciones");
    const failed = renderToStaticMarkup(
      <NotificationPanelView
        {...props}
        error
        isLoading={false}
        items={[]}
        unreadCount={0}
      />,
    );
    expect(failed).toContain("No pudimos cargar tus notificaciones");
    expect(failed).toContain("Reintentar");
  });
});

const operational: ServiceStatus = {
  overall: "operational",
  checkedAt: "2026-10-03T18:00:00.000Z",
  components: [
    { id: "pages", level: "operational", provider: false },
    { id: "panel", level: "operational", provider: false },
  ],
  incidents: [],
  upcoming: [],
};
const now = Date.parse("2026-10-03T18:02:00.000Z");

describe("status model", () => {
  it("speaks in customer words", () => {
    expect(levelView.operational.pill).toBe("Todo funciona");
    expect(levelView.major_outage.word).toBe("No funciona");
  });

  it("says offline, unknown or stale before trusting a level", () => {
    expect(
      displayLevel(operational, { online: false, failed: false, nowMs: now }),
    ).toBe("offline");
    expect(
      displayLevel(null, { online: true, failed: false, nowMs: now }),
    ).toBe("unknown");
    expect(
      displayLevel(operational, { online: true, failed: true, nowMs: now }),
    ).toBe("unknown");
    expect(
      displayLevel(operational, { online: true, failed: false, nowMs: now }),
    ).toBe("operational");
    const old = Date.parse("2026-10-03T18:30:00.000Z");
    expect(isStale(operational, old)).toBe(true);
    expect(
      displayLevel(operational, { online: true, failed: false, nowMs: old }),
    ).toBe("unknown");
  });

  it("blames a provider only when a provider alone explains it", () => {
    const providerOnly: ServiceStatus = {
      ...operational,
      overall: "partial_outage",
      components: [
        { id: "panel", level: "partial_outage", provider: true },
        { id: "pages", level: "operational", provider: false },
      ],
    };
    expect(headline(providerOnly, "partial_outage")).toContain("Un proveedor");
    expect(
      headline(
        {
          ...providerOnly,
          components: [
            ...providerOnly.components,
            { id: "files", level: "degraded", provider: false },
          ],
        },
        "partial_outage",
      ),
    ).toBe("Algunas partes tienen fallas.");
  });

  it("writes a maintenance window in local words", () => {
    const window = formatWindow(
      "2026-10-04T08:00:00.000Z",
      "2026-10-04T09:00:00.000Z",
    );
    // Without a preference the browser decides 12 or 24 h.
    expect(window).toMatch(/\d{1,2}:00.* a \d{1,2}:00/);
  });

  it("follows the person's zone and hour format in a window", () => {
    setDatePreferences({ timeZone: "UTC", hourCycle: "h23" });
    try {
      expect(
        formatWindow("2026-10-04T14:00:00.000Z", "2026-10-04T15:00:00.000Z"),
      ).toContain("14:00 a 15:00");
      setDatePreferences({ timeZone: "UTC", hourCycle: "h12" });
      expect(
        formatWindow("2026-10-04T14:00:00.000Z", "2026-10-04T15:00:00.000Z"),
      ).toMatch(/2:00.*p\.\s?m\./);
    } finally {
      setDatePreferences({ timeZone: undefined, hourCycle: undefined });
    }
  });

  it("shows an area nobody measured as «Sin datos», never «Funciona»", () => {
    const now = Date.parse("2026-10-03T18:00:00.000Z");
    expect(
      componentView(operational, { id: "ai", level: "unknown" }, now),
    ).toEqual({ word: "Sin datos", tone: "neutral" });
    expect(
      componentView(operational, { id: "ai", level: "operational" }, now),
    ).toEqual({ word: "Funciona", tone: "success" });
    // Every area unmeasured: no «Todo funciona».
    expect(
      displayLevel(
        {
          ...operational,
          components: [
            { id: "ai", level: "unknown" as never, provider: false },
          ],
        },
        { online: true, failed: false, nowMs: now },
      ),
    ).toBe("unknown");
  });

  it("does not keep an old level as current beside an open incident", () => {
    const old = Date.parse("2026-10-03T19:00:00.000Z");
    const withIncident: ServiceStatus = {
      ...operational,
      overall: "degraded",
      components: [
        { id: "panel", level: "degraded", provider: false },
        { id: "files", level: "operational", provider: false },
      ],
      incidents: [
        {
          id: "i1",
          kind: "incident",
          title: "Lento",
          impact: "degraded",
          components: ["panel"],
          startsAt: "2026-10-03T17:00:00.000Z",
          endsAt: null,
          resolvedAt: null,
          updates: [],
        },
      ],
    };
    // The checks are old: the area the incident names keeps its level, the
    // others say they have no recent data.
    expect(
      componentView(withIncident, withIncident.components[0]!, old).word,
    ).toBe("Lento");
    expect(
      componentView(withIncident, withIncident.components[1]!, old).word,
    ).toBe("Sin datos recientes");
    // Fresh checks: the level stands.
    const fresh = Date.parse("2026-10-03T18:01:00.000Z");
    expect(
      componentView(withIncident, withIncident.components[1]!, fresh).word,
    ).toBe("Funciona");
  });
});

describe("StatusIndicator", () => {
  it("says «Status» with a plain dot and keeps the state in its label", () => {
    const html = renderToStaticMarkup(<StatusIndicator />);
    expect(html).toContain(">Status<");
    expect(html).toContain('class="status-dot"');
    // Before the first answer the state is unknown, said in words.
    expect(html).toContain(
      'aria-label="Estado del servicio: Estado no disponible"',
    );
    expect(html).not.toContain("status-pill");
  });
});

describe("StatusPanelView", () => {
  it("lists every area with its state and no technical detail", () => {
    const html = renderToStaticMarkup(
      <StatusPanelView level="operational" status={operational} />,
    );
    expect(html).toContain("Todo funciona con normalidad.");
    expect(html).toContain("Páginas públicas (QR, NFC y Links)");
    expect(html).toContain("Panel e inicio de sesión");
    expect(html).not.toMatch(/ms\b|https?:\/\//);
  });

  it("shows an open incident with its latest update", () => {
    const html = renderToStaticMarkup(
      <StatusPanelView
        level="partial_outage"
        status={{
          ...operational,
          overall: "partial_outage",
          incidents: [
            {
              id: "i1",
              kind: "incident",
              title: "Falla al subir imágenes",
              impact: "partial_outage",
              components: ["files"],
              startsAt: "2026-10-03T17:00:00.000Z",
              endsAt: null,
              resolvedAt: null,
              updates: [
                {
                  status: "identified",
                  message: "Ya encontramos la causa.",
                  at: "2026-10-03T17:30:00.000Z",
                },
                {
                  status: "investigating",
                  message: "Estamos revisando.",
                  at: "2026-10-03T17:00:00.000Z",
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Falla al subir imágenes");
    expect(html).toContain("Causa encontrada");
    expect(html).toContain("Ya encontramos la causa.");
    expect(html).not.toContain("Estamos revisando.");
    expect(html).toContain("Imágenes y archivos");
  });

  it("does not list areas while the status is unknown", () => {
    const html = renderToStaticMarkup(
      <StatusPanelView level="unknown" status={null} />,
    );
    expect(html).toContain("no podemos consultar el estado");
    expect(html).not.toContain("Páginas públicas");
  });
});

describe("demo notifications", () => {
  it("mixes business types and starts with an unread pinned maintenance", () => {
    const inbox = demoNotificationInbox({ unread: false });
    expect(inbox.items[0]?.pinned).toBe(true);
    expect(inbox.autoOpen).toBe(true);
    const text = inbox.items.map((n) => n.body).join(" ");
    expect(text).toMatch(/florería/i);
    expect(text).toMatch(/salón|hotel|clínica|tienda/i);
  });

  it("marks read and remembers the bell was opened", () => {
    handleNotificationsDemo("/v1/notifications/opened", "POST");
    expect(demoNotificationInbox({ unread: false }).autoOpen).toBe(false);
    handleNotificationsDemo("/v1/notifications/read-all", "POST");
    expect(demoNotificationInbox({ unread: true }).items).toEqual([]);
  });

  it("has a calm status with planned maintenance", () => {
    const status = demoServiceStatus();
    expect(status.overall).toBe("operational");
    expect(status.upcoming).toHaveLength(1);
  });
});

describe("the bell: Tu cuenta and Ver solicitud", () => {
  const leadId = "0b9f3a4e-0000-4000-8000-0000000000aa";

  it("reads «Tu cuenta» with its own icon, as a warning", () => {
    expect(categoryView.account).toEqual({
      label: "Tu cuenta",
      icon: "profile",
      tone: "warning",
    });
    const html = renderItem({ ...base, category: "account" });
    expect(html).toContain("Tu cuenta");
    expect(html).toContain("tone-warning");
  });

  it("goes to the notice's organization first, then to the request", () => {
    const calls: string[] = [];
    followPanelUrl(`/leads?lead=${leadId}`, {
      noticeWorkspaceId: "org-b",
      currentWorkspaceId: "org-a",
      selectWorkspace: (id) => calls.push(`select:${id}`),
      navigate: (route) => calls.push(JSON.stringify(route)),
    });
    expect(calls).toEqual([
      "select:org-b",
      JSON.stringify({ name: "leads", leadId }),
    ]);
  });

  it("does not switch when it is the open organization or has none", () => {
    for (const noticeWorkspaceId of ["org-a", null]) {
      const calls: string[] = [];
      followPanelUrl(`/leads?lead=${leadId}`, {
        noticeWorkspaceId,
        currentWorkspaceId: "org-a",
        selectWorkspace: (id) => calls.push(`select:${id}`),
        navigate: () => calls.push("navigate"),
      });
      expect(calls).toEqual(["navigate"]);
    }
  });

  it("keeps ?lead= in the link for a middle click or another tab", () => {
    const html = renderItem({
      ...base,
      category: "lead",
      workspace: { id: "org-b", name: "Terraza" },
      action: { label: "Ver solicitud", url: `/leads?lead=${leadId}` },
    });
    expect(html).toContain(`href="/leads?lead=${leadId}"`);
  });
});
