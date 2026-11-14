import type {
  StaffNotification,
  StaffServiceStatus,
  StaffStatusIncident,
} from "@kardo/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import {
  createStatusWorkerClient,
  StatusWorkerError,
} from "../src/clients/status-worker.js";
import {
  StaffDependencyError,
  StaffPermissionError,
} from "../src/http/errors.js";
import type { StaffNotificationRepository } from "../src/repositories/notifications.js";
import {
  audienceFromRow,
  permissionFor,
} from "../src/repositories/notifications.js";
import type { StaffStatusRepository } from "../src/repositories/status.js";
import { toPublicIncident } from "../src/repositories/status.js";
import { staffIdentity } from "./fixtures.js";

const notificationId = "7b9e2c1a-4d3f-4a5b-8c6d-1e2f3a4b5c6d";
const incidentId = "8c0f3d2b-5e4a-4b6c-9d7e-2f3a4b5c6d7e";

function sessionRepository() {
  return {
    getActiveStaffSession: async () => ({
      ...staffIdentity,
      displayName: "Staff",
      permissions: ["notifications.read", "notifications.send"],
    }),
    readDiagnostics: async () => {
      throw new Error("not used");
    },
  };
}

const notification: StaffNotification = {
  id: notificationId,
  category: "account",
  title: "Revisamos tu QR",
  body: "Hola",
  action: null,
  audience: {
    kind: "workspace",
    workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
  },
  audienceLabel: { workspaceName: "Florería Iris", profileEmail: null },
  pinned: false,
  state: "active",
  publishAt: "2026-10-03T18:00:00.000Z",
  expiresAt: null,
  editedAt: null,
  retiredAt: null,
  createdAt: "2026-10-03T18:00:00.000Z",
  createdBy: "Ana",
  reads: 0,
};

function notificationRepository(
  overrides: Partial<StaffNotificationRepository> = {},
): StaffNotificationRepository {
  const unused = async () => {
    throw new Error("not used");
  };
  return {
    list: unused,
    get: unused,
    create: unused,
    update: unused,
    retire: unused,
    estimate: unused,
    lookupProfiles: unused,
    ...overrides,
  };
}

function statusRepository(
  overrides: Partial<StaffStatusRepository> = {},
): StaffStatusRepository {
  const unused = async () => {
    throw new Error("not used");
  };
  return {
    requirePermission: async () => {},
    listIncidents: unused,
    createIncident: unused,
    addUpdate: unused,
    resync: unused,
    ...overrides,
  };
}

function app(input: {
  notifications?: StaffNotificationRepository;
  status?: StaffStatusRepository;
  statusWorker?: Parameters<typeof buildStaffApi>[0] extends infer T
    ? T extends { statusWorker?: infer W }
      ? W
      : never
    : never;
}) {
  return buildStaffApi({
    sessionVerifier: { verify: async () => staffIdentity },
    sessionRepository: sessionRepository(),
    notificationRepository: input.notifications ?? notificationRepository(),
    statusRepository: input.status ?? statusRepository(),
    statusWorker: input.statusWorker ?? null,
  });
}

const auth = { authorization: "Bearer test" };

describe("staff notification routes", () => {
  it("creates a notification and answers 201", async () => {
    const create = vi.fn().mockResolvedValue(notification);
    const response = await app({
      notifications: notificationRepository({ create }),
    }).inject({
      method: "POST",
      url: "/v1/staff/notifications",
      headers: auth,
      payload: {
        category: "account",
        title: "Revisamos tu QR",
        body: "Hola",
        audience: {
          kind: "workspace",
          workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
        },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      staffIdentity.subject,
      expect.objectContaining({
        audience: {
          kind: "workspace",
          workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
        },
      }),
    );
  });

  it("keeps every audience field (no union stripped by removeAdditional)", async () => {
    const create = vi.fn().mockResolvedValue(notification);
    await app({ notifications: notificationRepository({ create }) }).inject({
      method: "POST",
      url: "/v1/staff/notifications",
      headers: auth,
      payload: {
        category: "tip",
        title: "Tu prueba",
        body: "Quedan días",
        audience: {
          kind: "segment",
          billingStates: ["trial"],
          accountTypes: ["business"],
          roles: ["owner"],
        },
      },
    });
    expect(create.mock.calls[0]?.[1].audience).toEqual({
      kind: "segment",
      billingStates: ["trial"],
      accountTypes: ["business"],
      roles: ["owner"],
    });
  });

  it("rejects unknown categories and too-long titles", async () => {
    const api = app({});
    const bad = await api.inject({
      method: "POST",
      url: "/v1/staff/notifications",
      headers: auth,
      payload: {
        category: "promo",
        title: "x",
        body: "y",
        audience: { kind: "all" },
      },
    });
    expect(bad.statusCode).toBe(400);
    const long = await api.inject({
      method: "POST",
      url: "/v1/staff/notifications",
      headers: auth,
      payload: {
        category: "news",
        title: "x".repeat(121),
        body: "y",
        audience: { kind: "all" },
      },
    });
    expect(long.statusCode).toBe(400);
  });

  it("passes a permission refusal through as 403", async () => {
    const response = await app({
      notifications: notificationRepository({
        retire: async () => {
          throw new StaffPermissionError();
        },
      }),
    }).inject({
      method: "POST",
      url: `/v1/staff/notifications/${notificationId}/retire`,
      headers: auth,
    });
    expect(response.statusCode).toBe(403);
  });

  it("refuses an empty patch", async () => {
    const response = await app({}).inject({
      method: "PATCH",
      url: `/v1/staff/notifications/${notificationId}`,
      headers: auth,
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("estimates an audience and looks people up by email", async () => {
    const estimate = vi.fn().mockResolvedValue({ profiles: 12, workspaces: 5 });
    const lookupProfiles = vi.fn().mockResolvedValue({ items: [] });
    const api = app({
      notifications: notificationRepository({ estimate, lookupProfiles }),
    });
    const est = await api.inject({
      method: "POST",
      url: "/v1/staff/notifications/estimate",
      headers: auth,
      payload: { kind: "all", roles: ["owner"] },
    });
    expect(est.json()).toEqual({ profiles: 12, workspaces: 5 });
    const look = await api.inject({
      method: "GET",
      url: "/v1/staff/notification-recipients?email=ana",
      headers: auth,
    });
    expect(look.statusCode).toBe(200);
    expect(lookupProfiles).toHaveBeenCalledWith(staffIdentity.subject, "ana");
  });
});

describe("notification helpers", () => {
  it("needs broadcast for all and segments, send for the rest", () => {
    expect(permissionFor({ kind: "all" })).toBe("notifications.broadcast");
    expect(permissionFor({ kind: "segment", planCodes: ["negocio"] })).toBe(
      "notifications.broadcast",
    );
    expect(permissionFor({ kind: "profile", profileId: notificationId })).toBe(
      "notifications.send",
    );
  });

  it("reads enum arrays that come back as text", () => {
    const audience = audienceFromRow({
      audience: "all",
      workspace_id: null,
      profile_id: null,
      plan_codes: null,
      billing_states: null,
      account_types: null,
      roles: "{owner,admin}" as unknown as string[],
    } as Parameters<typeof audienceFromRow>[0]);
    expect(audience).toEqual({ kind: "all", roles: ["owner", "admin"] });
  });
});

const incident: StaffStatusIncident = {
  id: incidentId,
  kind: "incident",
  title: "Falla en páginas públicas",
  impact: "partial_outage",
  components: ["pages"],
  startsAt: "2026-10-03T18:00:00.000Z",
  endsAt: null,
  resolvedAt: null,
  updates: [
    {
      status: "investigating",
      message: "Estamos revisando.",
      at: "2026-10-03T18:00:00.000Z",
    },
  ],
  createdAt: "2026-10-03T18:00:00.000Z",
  createdBy: "Ana",
};

describe("staff status routes", () => {
  it("answers 503 when the status Worker is not configured", async () => {
    const response = await app({}).inject({
      method: "GET",
      url: "/v1/staff/status",
      headers: auth,
    });
    expect(response.statusCode).toBe(503);
  });

  it("checks status.read before asking the Worker", async () => {
    const getDetail = vi.fn();
    const response = await app({
      status: statusRepository({
        requirePermission: async () => {
          throw new StaffPermissionError();
        },
      }),
      statusWorker: {
        getDetail,
        publishIncidents: vi.fn(),
        runChecks: vi.fn(),
      },
    }).inject({ method: "GET", url: "/v1/staff/status", headers: auth });
    expect(response.statusCode).toBe(403);
    expect(getDetail).not.toHaveBeenCalled();
  });

  it("returns the Worker's technical detail", async () => {
    const detail: StaffServiceStatus = {
      status: {
        overall: "operational",
        checkedAt: "2026-10-03T18:00:00.000Z",
        components: [{ id: "pages", level: "operational", provider: false }],
        incidents: [],
        upcoming: [],
      },
      probes: [],
      providers: [],
      incidentsVersion: 0,
    };
    const response = await app({
      statusWorker: {
        getDetail: async () => detail,
        publishIncidents: vi.fn(),
        runChecks: vi.fn(),
      },
    }).inject({ method: "GET", url: "/v1/staff/status", headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(detail);
  });

  it("opens an incident through the repository with the Worker", async () => {
    const worker = {
      getDetail: vi.fn(),
      publishIncidents: vi.fn(),
      runChecks: vi.fn(),
    };
    const createIncident = vi.fn().mockResolvedValue(incident);
    const response = await app({
      status: statusRepository({ createIncident }),
      statusWorker: worker,
    }).inject({
      method: "POST",
      url: "/v1/staff/status/incidents",
      headers: auth,
      payload: {
        kind: "incident",
        title: "Falla en páginas públicas",
        impact: "partial_outage",
        components: ["pages"],
        message: "Estamos revisando.",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(createIncident.mock.calls[0]?.[2]).toBe(worker);
  });

  it("rejects an unknown area", async () => {
    const response = await app({
      statusWorker: {
        getDetail: vi.fn(),
        publishIncidents: vi.fn(),
        runChecks: vi.fn(),
      },
    }).inject({
      method: "POST",
      url: "/v1/staff/status/incidents",
      headers: auth,
      payload: {
        kind: "incident",
        title: "x",
        impact: "degraded",
        components: ["database"],
        message: "y",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("surfaces a push the Worker refused as 503", async () => {
    const response = await app({
      status: statusRepository({
        addUpdate: async () => {
          throw new StaffDependencyError("no");
        },
      }),
      statusWorker: {
        getDetail: vi.fn(),
        publishIncidents: vi.fn(),
        runChecks: vi.fn(),
      },
    }).inject({
      method: "POST",
      url: `/v1/staff/status/incidents/${incidentId}/updates`,
      headers: auth,
      payload: { status: "identified", message: "Ya sabemos." },
    });
    expect(response.statusCode).toBe(503);
  });

  it("never sends staff names to the public set", () => {
    const pub = toPublicIncident(incident);
    expect(pub).not.toHaveProperty("createdBy");
    expect(pub).not.toHaveProperty("createdAt");
    expect(pub.updates).toHaveLength(1);
  });
});

describe("status Worker client", () => {
  it("refuses plain http except on this machine", () => {
    expect(() =>
      createStatusWorkerClient({
        statusUrl: "http://status.example.com",
        commandKey: "k".repeat(40),
      }),
    ).toThrow(StatusWorkerError);
    expect(() =>
      createStatusWorkerClient({
        statusUrl: "http://127.0.0.1:8797",
        commandKey: "k".repeat(40),
      }),
    ).not.toThrow();
  });

  it("sends the key and the full set", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = createStatusWorkerClient({
      statusUrl: "https://status.example.com",
      commandKey: "secret-key",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await client.publishIncidents({ version: 3, incidents: [] });
    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://status.example.com/internal/incidents");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer secret-key",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      version: 3,
      incidents: [],
    });
  });

  it("turns a refusal or a network error into StatusWorkerError", async () => {
    const refused = createStatusWorkerClient({
      statusUrl: "https://status.example.com",
      commandKey: "k",
      fetchFn: (async () =>
        new Response("no", { status: 409 })) as typeof fetch,
    });
    await expect(refused.runChecks()).rejects.toThrow(StatusWorkerError);
    const down = createStatusWorkerClient({
      statusUrl: "https://status.example.com",
      commandKey: "k",
      fetchFn: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await expect(down.getDetail()).rejects.toThrow(StatusWorkerError);
  });
});
