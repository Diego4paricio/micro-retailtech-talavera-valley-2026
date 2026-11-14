import { createHmac } from "node:crypto";
import type {
  QrDesign,
  QrTemplate,
  SaveTouchpointQrDesign,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { AssetRepository, AssetWorkerClient } from "../src/assets.js";
import {
  ConflictError,
  ContentValidationError,
  NotFoundError,
  WorkspaceAccessError,
} from "../src/errors.js";
import {
  createPostgresQrDesignRepository,
  hasQrDesign,
  normalizeQrDesign,
  normalizeQrTemplateName,
  type QrDesignRepository,
  resolveTouchpointDesign,
} from "../src/repositories/qr-designs.js";
import {
  assetId,
  authHeader,
  subjectId,
  touchpointId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

const templateId = "5e6f7081-92a3-4b4c-8d5e-6f708192a3b4";

function design(overrides: Partial<QrDesign> = {}): QrDesign {
  return {
    schema: 2,
    errorCorrection: "Q",
    minVersion: null,
    quietZone: 4,
    modules: { shape: "rounded", fill: { kind: "solid", color: "#16232e" } },
    eyes: {
      frameShape: "extra-rounded",
      ballShape: "circle",
      topLeft: { frame: null, ball: null },
      topRight: { frame: "#0a6c78", ball: null },
      bottomLeft: { frame: null, ball: "#064d56" },
    },
    background: { color: "#ffffff", transparent: false },
    logo: null,
    frame: {
      style: "panel-bottom",
      color: "#16232e",
      textColor: "#ffffff",
      text: "Escanea para ver el menú",
      font: "sans",
      uppercase: false,
      icon: "menu",
    },
    ...overrides,
  };
}

const emptyResolved = {
  source: "default" as const,
  design: null,
  updatedAt: null,
  template: null,
  group: null,
  lastExport: null,
};

function templateOf(name: string, design: QrDesign): QrTemplate {
  return {
    id: templateId,
    name,
    design,
    createdAt: "2026-09-25T20:00:00.000Z",
    updatedAt: "2026-09-25T20:00:00.000Z",
    usage: { touchpoints: 0, groups: 0 },
  };
}

function fakeRepository(
  overrides: Partial<QrDesignRepository> = {},
): QrDesignRepository & { saved: SaveTouchpointQrDesign[] } {
  const saved: SaveTouchpointQrDesign[] = [];
  return {
    saved,
    getTouchpointDesign: async () => emptyResolved,
    saveTouchpointDesign: async (_identity, _workspace, _touchpoint, input) => {
      saved.push(input);
      return "design" in input
        ? {
            ...emptyResolved,
            source: "custom",
            design: input.design,
            updatedAt: "2026-09-25T20:00:00.000Z",
          }
        : emptyResolved;
    },
    overview: async () => [],
    listTemplates: async () => [],
    getTemplate: async () => ({
      template: templateOf("Mesas", design()),
      touchpointIds: [],
      groupIds: [],
    }),
    createTemplate: async (_identity, _workspace, input) =>
      templateOf(input.name, input.design),
    updateTemplate: async (_identity, _workspace, _id, input) =>
      templateOf(input.name ?? "Mesas", input.design ?? design()),
    deleteTemplate: async () => {},
    applyTemplate: async (_identity, _workspace, _id, input) => ({
      touchpoints: input.touchpointIds.length,
      groups: input.groupIds.length,
      skipped: 0,
    }),
    setGroupTemplate: async () => {},
    recordExports: async () => {},
    ...overrides,
  };
}

const designUrl = `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/qr-design`;
const templatesUrl = `/v1/workspaces/${workspaceId}/qr-templates`;

describe("Estudio QR design routes", () => {
  it("reads an unsaved design as null", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: fakeRepository(),
    });
    const response = await app.inject({
      method: "GET",
      url: designUrl,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(emptyResolved);
    await app.close();
  });

  it("saves a full design, including linear and radial gradients", async () => {
    const repository = fakeRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: repository,
    });
    for (const fill of [
      { kind: "linear", from: "#16232e", to: "#0a6c78", angle: 135 },
      { kind: "radial", from: "#064d56", to: "#16232e" },
    ] as const) {
      const body = design({
        modules: { shape: "fluid", fill },
        logo: {
          source: "asset",
          assetId,
          size: 0.22,
          plate: "circle",
          padding: 1,
          plateColor: null,
        },
      });
      const response = await app.inject({
        method: "PUT",
        url: designUrl,
        headers: authHeader,
        payload: { design: body },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().design).toEqual(body);
    }
    expect(
      repository.saved.map((item) =>
        "design" in item ? item.design.modules.fill.kind : null,
      ),
    ).toEqual(["linear", "radial"]);
    await app.close();
  });

  it("never stores properties outside the schema", async () => {
    const repository = fakeRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: repository,
    });
    const body = {
      ...design(),
      script: "<script>alert(1)</script>",
      frame: { ...design().frame, onclick: "alert(1)" },
    };
    const response = await app.inject({
      method: "PUT",
      url: designUrl,
      headers: authHeader,
      payload: { design: body },
    });
    expect(response.statusCode).toBe(200);
    const stored = repository.saved[0];
    expect(stored && "design" in stored).toBe(true);
    if (stored && "design" in stored) {
      expect(stored.design).not.toHaveProperty("script");
      expect(stored.design.frame).not.toHaveProperty("onclick");
    }
    await app.close();
  });

  it.each([
    [
      "a color that is not #rrggbb",
      design({
        background: { color: "red;background:url(x)", transparent: false },
      }),
    ],
    [
      "an unknown module shape",
      design({
        modules: {
          // @ts-expect-error intentionally invalid
          shape: "stars",
          fill: { kind: "solid", color: "#000000" },
        },
      }),
    ],
    [
      "markup in the frame text",
      design({ frame: { ...design().frame, text: "<img src=x>" } }),
    ],
    [
      "a control character in the frame text",
      design({ frame: { ...design().frame, text: "Hola\u0007" } }),
    ],
    [
      "frame text over 40 characters",
      design({ frame: { ...design().frame, text: "x".repeat(41) } }),
    ],
    ["a quiet zone under 4 modules", design({ quietZone: 2 })],
    ["a version over 25", design({ minVersion: 30 })],
    [
      "a logo over 30 % of the code",
      design({
        logo: {
          source: "brand",
          size: 0.5,
          plate: "square",
          padding: 1,
          plateColor: null,
        },
      }),
    ],
    [
      "a gradient without its second color",
      design({
        modules: {
          shape: "square",
          // @ts-expect-error intentionally incomplete
          fill: { kind: "linear", from: "#000000", angle: 0 },
        },
      }),
    ],
    ["another schema version", { ...design(), schema: 1 }],
  ])("rejects %s", async (_label, body) => {
    const repository = fakeRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: repository,
    });
    const response = await app.inject({
      method: "PUT",
      url: designUrl,
      headers: authHeader,
      payload: { design: body },
    });
    expect(response.statusCode).toBe(400);
    expect(repository.saved).toHaveLength(0);
    await app.close();
  });

  it("maps repository refusals to stable codes", async () => {
    const cases: [Error, number, string][] = [
      [new WorkspaceAccessError(), 403, "WORKSPACE_ACCESS_DENIED"],
      [
        new ConflictError("TOUCHPOINT_NOT_QR", "Solo QR."),
        409,
        "TOUCHPOINT_NOT_QR",
      ],
      [
        new ConflictError("TOUCHPOINT_RETIRED", "Retirado."),
        409,
        "TOUCHPOINT_RETIRED",
      ],
      [new NotFoundError("Touchpoint was not found."), 404, "NOT_FOUND"],
      [
        new ContentValidationError("INVALID_QR_DESIGN", "Logo inválido."),
        400,
        "INVALID_QR_DESIGN",
      ],
    ];
    // One API for every case: building it costs seconds on a CI runner.
    let refusal: Error = new Error("unset");
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: fakeRepository({
        saveTouchpointDesign: async () => {
          throw refusal;
        },
      }),
    });
    for (const [error, status, code] of cases) {
      refusal = error;
      const response = await app.inject({
        method: "PUT",
        url: designUrl,
        headers: authHeader,
        payload: { design: design() },
      });
      expect(response.statusCode).toBe(status);
      expect(response.json().code).toBe(code);
    }
    await app.close();
  });

  it("requires a session", async () => {
    const app = buildCustomerApi({ qrDesignRepository: fakeRepository() });
    const response = await app.inject({ method: "GET", url: designUrl });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

describe("QR design library", () => {
  it("creates, lists and deletes organization designs", async () => {
    const templates: QrTemplate[] = [];
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: fakeRepository({
        listTemplates: async () => templates,
        createTemplate: async (_identity, _workspace, input) => {
          const template = templateOf(input.name, input.design);
          templates.push(template);
          return template;
        },
      }),
    });
    const created = await app.inject({
      method: "POST",
      url: templatesUrl,
      headers: authHeader,
      payload: { name: "Mesas terraza", design: design() },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().name).toBe("Mesas terraza");
    const listed = await app.inject({
      method: "GET",
      url: templatesUrl,
      headers: authHeader,
    });
    expect(listed.json()).toHaveLength(1);
    const deleted = await app.inject({
      method: "DELETE",
      url: `${templatesUrl}/${templateId}`,
      headers: authHeader,
    });
    expect(deleted.statusCode).toBe(204);
    await app.close();
  });

  it("rejects blank or markup names and reports the limit", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: fakeRepository({
        createTemplate: async () => {
          throw new ConflictError("QR_TEMPLATE_LIMIT", "Máximo 24.");
        },
      }),
    });
    for (const name of ["   ", "<b>x</b>", ""]) {
      const response = await app.inject({
        method: "POST",
        url: templatesUrl,
        headers: authHeader,
        payload: { name, design: design() },
      });
      expect(response.statusCode).toBe(400);
    }
    const limited = await app.inject({
      method: "POST",
      url: templatesUrl,
      headers: authHeader,
      payload: { name: "Otro", design: design() },
    });
    expect(limited.statusCode).toBe(409);
    expect(limited.json().code).toBe("QR_TEMPLATE_LIMIT");
    await app.close();
  });
});

describe("design source of a Touchpoint", () => {
  it("passes each save variant through: own design, library design, inherit", async () => {
    const repository = fakeRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: repository,
    });
    for (const payload of [
      { design: design() },
      { templateId },
      { inherit: true },
    ]) {
      const response = await app.inject({
        method: "PUT",
        url: designUrl,
        headers: authHeader,
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(200);
    }
    expect(repository.saved.map((item) => Object.keys(item)[0])).toEqual([
      "design",
      "templateId",
      "inherit",
    ]);
  });

  it.each([
    ["an empty body", {}],
    ["inherit: false", { inherit: false }],
    ["a template id that is not a uuid", { templateId: "mesas" }],
  ])("rejects %s", async (_label, payload) => {
    const repository = fakeRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: repository,
    });
    const response = await app.inject({
      method: "PUT",
      url: designUrl,
      headers: authHeader,
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(repository.saved).toHaveLength(0);
  });

  it("resolves own design → library design → group design → Kardo default", () => {
    const own = design({ quietZone: 5 });
    const library = design({ quietZone: 6 });
    const groupDesign = design({ quietZone: 7 });
    const row = {
      qr_design: own as QrDesign | null,
      qr_design_updated_at: new Date("2026-09-27T10:00:00Z") as Date | null,
      qr_template_id: templateId as string | null,
      template_name: "Biblioteca" as string | null,
      template_design: library as QrDesign | null,
      group_id: "7c1e2a90-1b2c-4d3e-8f40-5a6b7c8d9e01" as string | null,
      group_name: "Terraza" as string | null,
      group_template_id: "8d2f3b01-2c3d-4e5f-9a51-6b7c8d9e0f12" as
        | string
        | null,
      group_template_name: "Mesas" as string | null,
      group_template_design: groupDesign as QrDesign | null,
      qr_last_export_at: new Date("2026-09-27T11:00:00Z") as Date | null,
      qr_last_export_fingerprint: "a".repeat(64) as string | null,
      qr_last_export_format: "pdf" as string | null,
    };
    const custom = resolveTouchpointDesign(row);
    expect(custom.source).toBe("custom");
    expect(custom.design).toBe(own);
    expect(custom.group?.template?.name).toBe("Mesas");
    expect(custom.lastExport?.format).toBe("pdf");
    const linked = resolveTouchpointDesign({ ...row, qr_design: null });
    expect(linked.source).toBe("library");
    expect(linked.design).toBe(library);
    expect(linked.template?.name).toBe("Biblioteca");
    const inherited = resolveTouchpointDesign({
      ...row,
      qr_design: null,
      qr_template_id: null,
    });
    expect(inherited.source).toBe("group");
    expect(inherited.design).toBe(groupDesign);
    const fallback = resolveTouchpointDesign({
      ...row,
      qr_design: null,
      qr_template_id: null,
      group_template_id: null,
    });
    expect(fallback.source).toBe("default");
    expect(fallback.design).toBeNull();
    expect(
      resolveTouchpointDesign({
        ...fallback,
        ...row,
        qr_design: null,
        qr_template_id: null,
        group_template_id: null,
        qr_last_export_at: null,
        qr_last_export_fingerprint: null,
        qr_last_export_format: null,
      }).lastExport,
    ).toBeNull();
  });
});

describe("library editing, applying and group defaults", () => {
  it("edits, applies and reports usage of a library design", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: fakeRepository(),
    });
    const renamed = await app.inject({
      method: "PATCH",
      url: `${templatesUrl}/${templateId}`,
      headers: authHeader,
      payload: { name: "Mesas terraza" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe("Mesas terraza");
    const empty = await app.inject({
      method: "PATCH",
      url: `${templatesUrl}/${templateId}`,
      headers: authHeader,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
    const applied = await app.inject({
      method: "POST",
      url: `${templatesUrl}/${templateId}/applications`,
      headers: authHeader,
      payload: { touchpointIds: [touchpointId], groupIds: [] },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json()).toEqual({ touchpoints: 1, groups: 0, skipped: 0 });
    const duplicated = await app.inject({
      method: "POST",
      url: `${templatesUrl}/${templateId}/applications`,
      headers: authHeader,
      payload: { touchpointIds: [touchpointId, touchpointId], groupIds: [] },
    });
    expect(duplicated.statusCode).toBe(400);
    const detail = await app.inject({
      method: "GET",
      url: `${templatesUrl}/${templateId}`,
      headers: authHeader,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().template.usage).toEqual({ touchpoints: 0, groups: 0 });
    await app.close();
  });

  it("refuses to delete a design in use", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: fakeRepository({
        deleteTemplate: async () => {
          throw new ConflictError("QR_TEMPLATE_IN_USE", "En uso.");
        },
      }),
    });
    const response = await app.inject({
      method: "DELETE",
      url: `${templatesUrl}/${templateId}`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("QR_TEMPLATE_IN_USE");
    await app.close();
  });

  it("sets or clears a group's default design", async () => {
    const calls: (string | null)[] = [];
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: fakeRepository({
        setGroupTemplate: async (_identity, _workspace, _group, id) => {
          calls.push(id);
        },
      }),
    });
    const groupUrl = `/v1/workspaces/${workspaceId}/touchpoint-groups/7c1e2a90-1b2c-4d3e-8f40-5a6b7c8d9e01/qr-design`;
    for (const payload of [{ templateId }, { templateId: null }]) {
      const response = await app.inject({
        method: "PUT",
        url: groupUrl,
        headers: authHeader,
        payload,
      });
      expect(response.statusCode).toBe(204);
    }
    const invalid = await app.inject({
      method: "PUT",
      url: groupUrl,
      headers: authHeader,
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);
    expect(calls).toEqual([templateId, null]);
    await app.close();
  });

  it("records exports only with a SHA-256 fingerprint and a known format", async () => {
    const recorded: unknown[] = [];
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      qrDesignRepository: fakeRepository({
        recordExports: async (_identity, _workspace, input) => {
          recorded.push(input);
        },
      }),
    });
    const url = `/v1/workspaces/${workspaceId}/qr-exports`;
    const ok = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: {
        format: "sheet",
        items: [{ touchpointId, fingerprint: "b".repeat(64) }],
      },
    });
    expect(ok.statusCode).toBe(204);
    for (const payload of [
      { format: "sheet", items: [] },
      { format: "gif", items: [{ touchpointId, fingerprint: "b".repeat(64) }] },
      { format: "png", items: [{ touchpointId, fingerprint: "xyz" }] },
    ]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers: authHeader,
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(recorded).toHaveLength(1);
    await app.close();
  });
});

describe("QR design normalization", () => {
  it("requires an asset id for library logos and drops it for the brand logo", () => {
    expect(() =>
      normalizeQrDesign(
        design({
          logo: {
            source: "asset",
            size: 0.2,
            plate: "rounded",
            padding: 1,
            plateColor: null,
          },
        }),
      ),
    ).toThrow(ContentValidationError);
    const brand = normalizeQrDesign(
      design({
        logo: {
          source: "brand",
          assetId,
          size: 0.2,
          plate: "rounded",
          padding: 1,
          plateColor: "#ffffff",
        },
      }),
    );
    expect(brand.logo).not.toHaveProperty("assetId");
  });

  it("collapses whitespace in the frame text and template names", () => {
    const normalized = normalizeQrDesign(
      design({ frame: { ...design().frame, text: "  Ver   el menú  " } }),
    );
    expect(normalized.frame.text).toBe("Ver el menú");
    expect(normalizeQrTemplateName("  Mesas   terraza ")).toBe("Mesas terraza");
    expect(() => normalizeQrTemplateName("   ")).toThrow(
      ContentValidationError,
    );
  });

  it("does not mutate the caller's design", () => {
    const input = design({ frame: { ...design().frame, text: " a " } });
    normalizeQrDesign(input);
    expect(input.frame.text).toBe(" a ");
  });
});

describe("library image read authorization", () => {
  const readUrl = `/v1/workspaces/${workspaceId}/assets/${assetId}/read-authorizations`;
  const derivativeKey = `assets/${"c".repeat(64)}`;

  function assets(overrides: Partial<AssetRepository> = {}): AssetRepository {
    return {
      lookupReadableImage: async () => ({
        derivativeKey,
        mediaType: "image/png",
      }),
      ...overrides,
    } as AssetRepository;
  }

  it("returns 503 when the asset worker is not configured", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetRepository: assets(),
    });
    const response = await app.inject({
      method: "POST",
      url: readUrl,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("ASSET_STORAGE_UNAVAILABLE");
    await app.close();
  });

  it("signs a short-lived read the asset Worker accepts", async () => {
    const signingKey = "k".repeat(32);
    const { createAssetWorkerClient } = await import("../src/assets.js");
    const worker: AssetWorkerClient = createAssetWorkerClient({
      workerUrl: "https://assets.example.com",
      signingKey,
    });
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetRepository: assets(),
      assetWorker: worker,
    });
    const response = await app.inject({
      method: "POST",
      url: readUrl,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{
      url: string;
      mediaType: string;
      expiresAt: string;
    }>();
    expect(body.mediaType).toBe("image/png");
    const url = new URL(body.url);
    expect(url.origin).toBe("https://assets.example.com");
    expect(url.pathname).toBe(`/content/${assetId}`);
    expect(url.searchParams.get("key")).toBe(derivativeKey);
    const expires = Number(url.searchParams.get("expires"));
    const lifetime = expires - Date.now() / 1000;
    expect(lifetime).toBeGreaterThan(60);
    expect(lifetime).toBeLessThanOrEqual(120);
    // Same payload the Worker verifies (see services/assets-worker readContent).
    const expected = createHmac("sha256", signingKey)
      .update(`read\n${assetId}\n${derivativeKey}\n${expires}`)
      .digest("hex");
    expect(url.searchParams.get("signature")).toBe(expected);
    await app.close();
  });

  it("does not sign images the requester cannot read", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetRepository: assets({
        lookupReadableImage: async () => {
          throw new NotFoundError("Asset was not found.");
        },
      }),
      assetWorker: {
        readUrl: () => {
          throw new Error("must not sign");
        },
      } as unknown as AssetWorkerClient,
    });
    const response = await app.inject({
      method: "POST",
      url: readUrl,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe("the backup QR of an NFC (relevo 38, model A)", () => {
  it("carries a design like a QR; a Link and «Otro» do not", () => {
    expect(hasQrDesign("qr")).toBe(true);
    expect(hasQrDesign("nfc")).toBe(true);
    expect(hasQrDesign("link")).toBe(false);
    expect(hasQrDesign("other")).toBe(false);
  });
});

describe("library usage only counts QR and NFC touchpoints (A9-3)", () => {
  const identity = { subject: subjectId, email: "owner@kardo.test" };

  /** A fake postgres.js transaction that records every query's text and
   * answers the ones `readTemplates`/`getTemplate` need. */
  function fakeSql() {
    const queries: string[] = [];
    const tx = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) => {
        const text = strings.join("?");
        queries.push(text);
        if (text.includes("workspace_memberships"))
          return Promise.resolve([{ role: "owner" }]);
        if (text.includes("from kardo_core.qr_design_templates t"))
          return Promise.resolve([
            {
              id: templateId,
              name: "Mesas",
              design: design(),
              created_at: new Date("2026-09-25T20:00:00.000Z"),
              updated_at: new Date("2026-09-25T20:00:00.000Z"),
              touchpoints: 1,
              groups: 0,
            },
          ]);
        return Promise.resolve([]);
      },
      { json: (value: unknown) => value },
    );
    const sql = Object.assign(tx, {
      begin: (action: (transaction: unknown) => Promise<unknown>) => action(tx),
    }) as unknown as Sql;
    return { sql, queries };
  }

  it("filters the usage count by kind in ('qr', 'nfc'), like overview()", async () => {
    const { sql, queries } = fakeSql();
    const repository = createPostgresQrDesignRepository(sql);
    await repository.listTemplates(identity, workspaceId);
    const templateQuery = queries.find((q) =>
      q.includes("from kardo_core.qr_design_templates t"),
    );
    expect(templateQuery).toContain("tp.kind in ('qr', 'nfc')");
  });

  it("filters getTemplate's touchpoint list the same way", async () => {
    const { sql, queries } = fakeSql();
    const repository = createPostgresQrDesignRepository(sql);
    await repository.getTemplate(identity, workspaceId, templateId);
    const touchpointsQuery = queries.find((q) =>
      q.includes("select id from kardo_core.touchpoints"),
    );
    expect(touchpointsQuery).toContain("kind in ('qr', 'nfc')");
  });
});
