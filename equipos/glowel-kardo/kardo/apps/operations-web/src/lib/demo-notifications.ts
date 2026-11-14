// Demo data for the Notificaciones and Estado sections (VITE_DEMO_MODE only).
// Kept apart from `demo.ts`; `demoRequest` delegates here first.
import { ApiRequestError } from "./api-errors.js";

type Obj = Record<string, unknown>;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), 200));
}

function clone<T>(value: unknown): T {
  return structuredClone(value) as T;
}

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

const day = 24 * 60;

const notifications: Obj[] = [
  {
    id: "70000000-0000-4000-8000-000000000001",
    category: "news",
    title: "Ya puedes subir fotos a tu menú",
    body: "Ahora cada platillo puede llevar su foto.\nEntra a Experiences, abre tu menú y toca «Agregar foto».",
    action: { label: "Ir a Experiences", url: "/experiences" },
    audience: { kind: "all" },
    audienceLabel: { workspaceName: null, profileEmail: null },
    pinned: true,
    state: "active",
    publishAt: iso(2 * day),
    expiresAt: null,
    editedAt: null,
    retiredAt: null,
    createdAt: iso(2 * day),
    createdBy: "Staff Demo",
    reads: 41,
  },
  {
    id: "70000000-0000-4000-8000-000000000002",
    category: "account",
    title: "Tu prueba gratis termina pronto",
    body: "Elige un plan para que tus códigos QR sigan funcionando sin interrupciones.",
    action: { label: "Ver planes", url: "/billing" },
    audience: {
      kind: "segment",
      billingStates: ["trial"],
      accountTypes: ["business"],
      roles: ["owner"],
    },
    audienceLabel: { workspaceName: null, profileEmail: null },
    pinned: false,
    state: "active",
    publishAt: iso(day),
    expiresAt: new Date(Date.now() + 5 * day * 60_000).toISOString(),
    editedAt: iso(day / 2),
    retiredAt: null,
    createdAt: iso(day),
    createdBy: "Staff Demo",
    reads: 12,
  },
  {
    id: "70000000-0000-4000-8000-000000000003",
    category: "maintenance",
    title: "Mantenimiento el sábado en la madrugada",
    body: "El sábado entre las 2:00 y las 3:00 de la mañana el panel puede tardar en abrir. Tus páginas públicas siguen funcionando.",
    action: null,
    audience: { kind: "all", roles: ["owner", "admin"] },
    audienceLabel: { workspaceName: null, profileEmail: null },
    pinned: false,
    state: "scheduled",
    publishAt: new Date(Date.now() + 2 * day * 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 5 * day * 60_000).toISOString(),
    editedAt: null,
    retiredAt: null,
    createdAt: iso(60),
    createdBy: "Staff Demo",
    reads: 0,
  },
  {
    id: "70000000-0000-4000-8000-000000000004",
    category: "tip",
    title: "Un QR por mesa te da mejores datos",
    body: "Pon un touchpoint en cada mesa y verás cuáles se usan más.",
    action: { label: "Ordenar touchpoints", url: "/touchpoints" },
    audience: {
      kind: "profile",
      profileId: "71000000-0000-4000-8000-000000000001",
    },
    audienceLabel: { workspaceName: null, profileEmail: "ana@floreriairis.mx" },
    pinned: false,
    state: "expired",
    publishAt: iso(20 * day),
    expiresAt: iso(10 * day),
    editedAt: null,
    retiredAt: null,
    createdAt: iso(20 * day),
    createdBy: "Staff Demo",
    reads: 1,
  },
  {
    id: "70000000-0000-4000-8000-000000000005",
    category: "news",
    title: "Aviso de prueba",
    body: "Se retiró porque tenía un error.",
    action: null,
    audience: {
      kind: "workspace",
      workspaceId: "20000000-0000-4000-8000-000000000001",
    },
    audienceLabel: { workspaceName: "Florería Iris", profileEmail: null },
    pinned: false,
    state: "retired",
    publishAt: iso(8 * day),
    expiresAt: null,
    editedAt: null,
    retiredAt: iso(7 * day),
    createdAt: iso(8 * day),
    createdBy: "Staff Demo",
    reads: 0,
  },
];

const profiles = [
  { email: "ana@floreriairis.mx", displayName: "Ana Ruiz", workspaces: 1 },
  {
    email: "andres@tacosdonlalo.mx",
    displayName: "Andrés Soto",
    workspaces: 2,
  },
  { email: "beto@cafelaplaza.mx", displayName: null, workspaces: 1 },
].map((profile, index) => ({
  id: `71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ...profile,
}));

const probes = [
  ["api", "panel", 118, 200],
  ["queue", "publishing", null, null],
  ["resolver", "pages", 96, 200],
  ["publisher", "publishing", 73, 200],
  ["assets", "files", 88, 200],
  ["analytics", "analytics", 131, 200],
  ["panel-app", "panel", 64, 200],
].map(([id, component, latencyMs, httpStatus]) => ({
  id,
  component,
  configured: true,
  ok: true,
  slow: false,
  latencyMs,
  httpStatus,
  error: null,
  // The queue is read from the API's answer: no request of its own.
  detail: id === "queue" ? "0 en cola · la más vieja lleva 0 s" : null,
  consecutiveFailures: 0,
  consecutiveSuccesses: 24,
  checkedAt: iso(2),
}));

const incidents: Obj[] = [
  {
    id: "72000000-0000-4000-8000-000000000001",
    kind: "incident",
    title: "Las imágenes tardan en cargar",
    impact: "degraded",
    components: ["files"],
    startsAt: iso(95),
    endsAt: null,
    resolvedAt: null,
    createdBy: "Staff Demo",
    createdAt: iso(95),
    updates: [
      {
        status: "investigating",
        message:
          "Estamos revisando por qué las imágenes tardan más de lo normal.",
        at: iso(95),
      },
      {
        status: "identified",
        message:
          "Encontramos la causa con un proveedor. Ya trabajamos en ello.",
        at: iso(40),
      },
    ],
  },
  {
    id: "72000000-0000-4000-8000-000000000002",
    kind: "maintenance",
    title: "Mantenimiento programado del panel",
    impact: "maintenance",
    components: ["panel"],
    startsAt: new Date(Date.now() + 2 * day * 60_000).toISOString(),
    endsAt: new Date(Date.now() + (2 * day + 60) * 60_000).toISOString(),
    resolvedAt: null,
    createdBy: "Staff Demo",
    createdAt: iso(300),
    updates: [
      {
        status: "scheduled",
        message: "El panel puede tardar en abrir durante una hora.",
        at: iso(300),
      },
    ],
  },
  {
    id: "72000000-0000-4000-8000-000000000003",
    kind: "incident",
    title: "Falló el inicio de sesión por unos minutos",
    impact: "partial_outage",
    components: ["panel"],
    startsAt: iso(6 * day),
    endsAt: null,
    resolvedAt: iso(6 * day - 50),
    createdBy: "Staff Demo",
    createdAt: iso(6 * day),
    updates: [
      {
        status: "investigating",
        message: "Algunas personas no pueden iniciar sesión.",
        at: iso(6 * day),
      },
      {
        status: "resolved",
        message: "Ya funciona con normalidad.",
        at: iso(6 * day - 50),
      },
    ],
  },
];

const componentIds = [
  "pages",
  "panel",
  "publishing",
  "files",
  "analytics",
  "ai",
] as const;
const rank: Record<string, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

function serviceStatus(checkedMinutesAgo = 2): Obj {
  const levels: Record<string, string> = {};
  for (const incident of incidents) {
    if (incident.resolvedAt || incident.kind === "maintenance") continue;
    for (const id of incident.components as string[]) {
      const current = levels[id] ?? "operational";
      const impact = incident.impact as string;
      if ((rank[impact] ?? 0) > (rank[current] ?? 0)) levels[id] = impact;
    }
  }
  const components = componentIds.map((id) => ({
    id,
    level: levels[id] ?? "operational",
    provider: id === "files" && levels[id] !== undefined,
  }));
  const overall = components.reduce(
    (worst, item) =>
      (rank[item.level] ?? 0) > (rank[worst] ?? 0) ? item.level : worst,
    "operational",
  );
  return {
    status: {
      overall,
      checkedAt: iso(checkedMinutesAgo),
      components,
      incidents: incidents.filter((item) => !item.resolvedAt),
      upcoming: [],
    },
    probes: probes.map((probe) => ({
      ...probe,
      checkedAt: iso(checkedMinutesAgo),
    })),
    providers: [
      {
        provider: "cloudflare",
        ok: true,
        checkedAt: iso(3),
        error: null,
        issues: [
          {
            name: "R2",
            level: "degraded",
            components: ["pages", "files"],
          },
        ],
      },
      {
        provider: "supabase",
        ok: true,
        checkedAt: iso(3),
        error: null,
        issues: [],
      },
      {
        provider: "google-cloud",
        ok: true,
        checkedAt: iso(3),
        error: null,
        issues: [],
      },
      {
        provider: "anthropic",
        ok: false,
        checkedAt: iso(3),
        error: "No pudimos leer su página de estado.",
        issues: [],
      },
    ],
    incidentsVersion: incidents.length,
  };
}

function estimateFor(audience: Obj): { profiles: number; workspaces: number } {
  if (audience.kind === "profile") return { profiles: 1, workspaces: 1 };
  if (audience.kind === "workspace") return { profiles: 3, workspaces: 1 };
  let profiles = 214;
  let workspaces = 96;
  if (audience.kind === "segment") {
    const filters = ["planCodes", "billingStates", "accountTypes"].filter(
      (key) => Array.isArray(audience[key]),
    ).length;
    for (let index = 0; index < filters; index += 1) {
      profiles = Math.round(profiles * 0.35);
      workspaces = Math.round(workspaces * 0.35);
    }
  }
  if (Array.isArray(audience.roles)) {
    profiles = Math.max(
      workspaces,
      Math.round(profiles * (audience.roles.length / 4)),
    );
  }
  return { profiles, workspaces };
}

function notFound(): never {
  throw new ApiRequestError(
    "No encontramos este elemento.",
    404,
    "STAFF_NOT_FOUND",
  );
}

function stateOf(item: Obj): string {
  if (item.retiredAt) return "retired";
  if (new Date(item.publishAt as string).getTime() > Date.now())
    return "scheduled";
  if (
    item.expiresAt &&
    new Date(item.expiresAt as string).getTime() <= Date.now()
  )
    return "expired";
  return "active";
}

let counter = 100;

/** Returns undefined when the path is not one of the new sections. */
export function demoNotificationsRequest(
  path: string,
  method: string,
  body: Obj,
  workspaceName: (id: string) => string | null,
): Promise<unknown> | undefined {
  const url = new URL(path, "https://demo.local");
  const pathname = url.pathname;
  const params = url.searchParams;

  if (pathname === "/v1/staff/notifications" && method === "GET") {
    const state = params.get("state") ?? "active";
    const items = notifications.filter((item) => item.state === state);
    return delay(clone({ items, nextCursor: null }));
  }

  if (pathname === "/v1/staff/notifications" && method === "POST") {
    counter += 1;
    const audience = (body.audience ?? { kind: "all" }) as Obj;
    const publishAt =
      (body.publishAt as string | null | undefined) ?? new Date().toISOString();
    const profile = profiles.find((item) => item.id === audience.profileId);
    const item: Obj = {
      id: `70000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
      category: body.category,
      title: body.title,
      body: body.body,
      action: body.action ?? null,
      audience,
      audienceLabel: {
        workspaceName:
          typeof audience.workspaceId === "string"
            ? (workspaceName(audience.workspaceId) ?? "Organización")
            : null,
        profileEmail: profile?.email ?? null,
      },
      pinned: body.pinned === true,
      publishAt,
      expiresAt: (body.expiresAt as string | null | undefined) ?? null,
      editedAt: null,
      retiredAt: null,
      createdAt: new Date().toISOString(),
      createdBy: "Staff Demo",
      reads: 0,
    };
    item.state = stateOf(item);
    notifications.unshift(item);
    return delay(clone(item));
  }

  if (pathname === "/v1/staff/notifications/estimate")
    return delay(clone(estimateFor(body)));

  if (pathname === "/v1/staff/notification-recipients") {
    const prefix = (params.get("email") ?? "").toLowerCase();
    return delay(
      clone({
        items: profiles.filter((item) => item.email.startsWith(prefix)),
      }),
    );
  }

  const match = /^\/v1\/staff\/notifications\/([^/]+?)(\/retire)?$/.exec(
    pathname,
  );
  if (match?.[1]) {
    const item = notifications.find((entry) => entry.id === match[1]);
    if (!item) notFound();
    if (match[2] && method === "POST") {
      item.retiredAt = new Date().toISOString();
      item.state = "retired";
    } else if (method === "PATCH") {
      const wasPublished = stateOf(item) !== "scheduled";
      for (const key of [
        "category",
        "title",
        "body",
        "action",
        "pinned",
        "publishAt",
        "expiresAt",
      ])
        if (key in body) item[key] = body[key];
      if (wasPublished) item.editedAt = new Date().toISOString();
      item.state = stateOf(item);
    }
    return delay(clone(item));
  }

  if (pathname === "/v1/staff/status" && method === "GET")
    return delay(clone(serviceStatus()));
  if (pathname === "/v1/staff/status/check" && method === "POST")
    return delay(clone(serviceStatus(0)));

  if (pathname === "/v1/staff/status/incidents" && method === "GET") {
    const thirtyDays = Date.now() - 30 * day * 60_000;
    return delay(
      clone({
        open: incidents.filter((item) => !item.resolvedAt),
        recent: incidents.filter(
          (item) =>
            item.resolvedAt &&
            new Date(item.resolvedAt as string).getTime() >= thirtyDays,
        ),
      }),
    );
  }

  if (pathname === "/v1/staff/status/incidents" && method === "POST") {
    counter += 1;
    const now = new Date().toISOString();
    const incident: Obj = {
      id: `72000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
      kind: body.kind,
      title: body.title,
      impact: body.impact,
      components: body.components,
      startsAt: (body.startsAt as string | undefined) ?? now,
      endsAt: (body.endsAt as string | null | undefined) ?? null,
      resolvedAt: null,
      createdBy: "Staff Demo",
      createdAt: now,
      updates: [
        {
          status: body.kind === "maintenance" ? "scheduled" : "investigating",
          message: body.message,
          at: now,
        },
      ],
    };
    incidents.unshift(incident);
    return delay(clone(incident));
  }

  const update = /^\/v1\/staff\/status\/incidents\/([^/]+)\/updates$/.exec(
    pathname,
  );
  if (update?.[1] && method === "POST") {
    const incident = incidents.find((entry) => entry.id === update[1]);
    if (!incident) notFound();
    const now = new Date().toISOString();
    (incident.updates as Obj[]).push({
      status: body.status,
      message: body.message,
      at: now,
    });
    if (typeof body.impact === "string") incident.impact = body.impact;
    if (body.status === "resolved" || body.status === "completed")
      incident.resolvedAt = now;
    return delay(clone(incident));
  }

  if (pathname === "/v1/staff/status/sync" && method === "POST")
    return delay({
      incidents: incidents.filter((item) => !item.resolvedAt).length,
    });

  return undefined;
}
