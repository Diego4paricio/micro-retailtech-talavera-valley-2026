import {
  maxQrTemplatesPerWorkspace,
  type QrDesign,
  type QrExportFormat,
  type QrTemplate,
  type TouchpointQrDesign,
} from "@kardo/contracts";
import { defaultQrDesign } from "../../features/touchpoints/qr/qr-design.js";
import { ApiRequestError } from "../api.js";

/**
 * Demo-mode data for the Estudio QR: the design library, the design source of
 * each Touchpoint (own → library → group → default, as the server resolves
 * it), group defaults and print tracking. `src/lib/demo.ts` routes matching
 * paths here first and lends its Touchpoint/group store through the context.
 */

export type QrDemoContext = {
  touchpoint(
    id: string,
  ): { groupId: string | null; kind: string; status: string } | null;
  group(id: string): { name: string; parentId: string | null } | null;
};

/** A QR prints its own code; an NFC its backup QR (relevo 38, model A). */
const hasQrDesign = (kind: string | undefined) =>
  kind === "qr" || kind === "nfc";

type TouchpointDesignState = {
  design?: QrDesign;
  updatedAt?: string;
  templateId?: string;
  lastExport?: { at: string; fingerprint: string; format: QrExportFormat };
};
type StoredTemplate = Omit<QrTemplate, "usage">;

const touchpointDesigns = new Map<string, TouchpointDesignState>();
const groupTemplates = new Map<string, string>();
// Two designs in the library, so the gallery on a QR's page has something to
// pick from in the demo (relevo 36).
let templates: StoredTemplate[] = [
  {
    id: "7d1e2c3b-4a5f-4e6d-8c7b-1a2b3c4d5e01",
    name: "Café Nube",
    design: {
      ...defaultQrDesign,
      modules: { shape: "rounded", fill: { kind: "solid", color: "#0a6c78" } },
      frame: {
        ...defaultQrDesign.frame,
        color: "#0a6c78",
        text: "Mira el menú",
      },
    },
    createdAt: "2026-09-26T12:00:00.000Z",
    updatedAt: "2026-09-26T12:00:00.000Z",
  },
  {
    id: "7d1e2c3b-4a5f-4e6d-8c7b-1a2b3c4d5e02",
    name: "Mesas de la terraza",
    design: {
      ...defaultQrDesign,
      modules: { shape: "square", fill: { kind: "solid", color: "#3b2a1a" } },
      eyes: {
        ...defaultQrDesign.eyes,
        frameShape: "square",
        ballShape: "square",
      },
      frame: {
        ...defaultQrDesign.frame,
        color: "#3b2a1a",
        text: "Escanea para pedir",
      },
    },
    createdAt: "2026-09-27T12:00:00.000Z",
    updatedAt: "2026-09-27T12:00:00.000Z",
  },
];

export type DemoResult = { value: unknown } | { error: ApiRequestError };

function conflict(code: string, message: string): DemoResult {
  return { error: new ApiRequestError(message, 409, code) };
}

function withUsage(template: StoredTemplate): QrTemplate {
  let touchpoints = 0;
  for (const state of touchpointDesigns.values())
    if (state.templateId === template.id && !state.design) touchpoints += 1;
  let groups = 0;
  for (const templateId of groupTemplates.values())
    if (templateId === template.id) groups += 1;
  return { ...template, usage: { touchpoints, groups } };
}

function ref(templateId: string | undefined) {
  const template = templates.find((item) => item.id === templateId);
  return template ? { id: template.id, name: template.name } : null;
}

/** The nearest group up the tree that has a design (ADR 021), as the API. */
function nearestGroupTemplate(
  groupId: string | null,
  ctx: QrDemoContext,
): string | undefined {
  let current = groupId;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const templateId = groupTemplates.get(current);
    if (templateId) return templateId;
    current = ctx.group(current)?.parentId ?? null;
  }
  return undefined;
}

function resolve(touchpointId: string, ctx: QrDemoContext): TouchpointQrDesign {
  const state = touchpointDesigns.get(touchpointId) ?? {};
  const groupId = ctx.touchpoint(touchpointId)?.groupId ?? null;
  const groupTemplateId = nearestGroupTemplate(groupId, ctx);
  const group = groupId
    ? {
        id: groupId,
        name: ctx.group(groupId)?.name ?? "Grupo",
        template: ref(groupTemplateId),
      }
    : null;
  const base = {
    group,
    lastExport: state.lastExport ?? null,
  };
  if (state.design)
    return {
      ...base,
      source: "custom",
      design: state.design,
      updatedAt: state.updatedAt ?? null,
      template: null,
    };
  const linked = templates.find((item) => item.id === state.templateId);
  if (linked)
    return {
      ...base,
      source: "library",
      design: linked.design,
      updatedAt: null,
      template: { id: linked.id, name: linked.name },
    };
  const inherited = templates.find((item) => item.id === groupTemplateId);
  if (inherited)
    return {
      ...base,
      source: "group",
      design: inherited.design,
      updatedAt: null,
      template: { id: inherited.id, name: inherited.name },
    };
  return {
    ...base,
    source: "default",
    design: null,
    updatedAt: null,
    template: null,
  };
}

/** The library design a group gives its Touchpoints (for the group list). */
/** When this QR was last downloaded: the first QR step (relevo 36). */
export function demoQrLastExportAt(touchpointId: string): string | null {
  return touchpointDesigns.get(touchpointId)?.lastExport?.at ?? null;
}

/** Another format is another object: nothing of it was downloaded yet. */
export function demoForgetQrExport(touchpointId: string): void {
  const state = touchpointDesigns.get(touchpointId);
  if (state) delete state.lastExport;
}

export function demoGroupQrTemplateId(groupId: string): string | null {
  return groupTemplates.get(groupId) ?? null;
}

/** A Touchpoint created with `qrTemplateId` starts linked to that design. */
export function demoLinkTouchpointDesign(
  touchpointId: string,
  templateId: unknown,
): void {
  if (typeof templateId === "string" && ref(templateId))
    touchpointDesigns.set(touchpointId, { templateId });
}

export function handleQrDemo(
  path: string,
  method: string,
  body: Record<string, unknown>,
  ctx: QrDemoContext & {
    qrTouchpointIds(): string[];
    /** Recorded downloads (an NFC's backup marks «Respaldo»). */
    exported(touchpointIds: string[]): void;
  },
): DemoResult | undefined {
  if (path.endsWith("/qr-designs") && method === "GET")
    return {
      value: ctx.qrTouchpointIds().map((touchpointId) => {
        const resolved = resolve(touchpointId, ctx);
        return {
          touchpointId,
          source: resolved.source,
          templateId: resolved.template?.id ?? null,
          design: resolved.source === "custom" ? resolved.design : null,
          lastExport: resolved.lastExport,
        };
      }),
    };

  const design = /\/touchpoints\/([^/]+)\/qr-design$/.exec(path);
  if (design?.[1]) {
    const touchpointId = design[1];
    if (method === "GET") return { value: resolve(touchpointId, ctx) };
    if (method === "PUT") {
      if (!hasQrDesign(ctx.touchpoint(touchpointId)?.kind))
        return conflict(
          "TOUCHPOINT_NOT_QR",
          "Solo un QR, o el QR de respaldo de un NFC, lleva diseño.",
        );
      const state = touchpointDesigns.get(touchpointId) ?? {};
      if (body.design) {
        state.design = structuredClone(body.design) as QrDesign;
        state.updatedAt = new Date().toISOString();
        delete state.templateId;
      } else if (typeof body.templateId === "string") {
        if (!ref(body.templateId))
          return {
            error: new ApiRequestError(
              "Ese diseño ya no existe.",
              404,
              "NOT_FOUND",
            ),
          };
        state.templateId = body.templateId;
        delete state.design;
        delete state.updatedAt;
      } else {
        delete state.design;
        delete state.updatedAt;
        delete state.templateId;
      }
      touchpointDesigns.set(touchpointId, state);
      return { value: resolve(touchpointId, ctx) };
    }
  }

  const groupDesign = /\/touchpoint-groups\/([^/]+)\/qr-design$/.exec(path);
  if (groupDesign?.[1] && method === "PUT") {
    if (typeof body.templateId === "string")
      groupTemplates.set(groupDesign[1], body.templateId);
    else groupTemplates.delete(groupDesign[1]);
    return { value: undefined };
  }

  if (path.endsWith("/qr-exports") && method === "POST") {
    const format = body.format as QrExportFormat;
    const items = (
      (body.items as { touchpointId: string; fingerprint: string }[]) ?? []
    ).filter((item) => {
      const touchpoint = ctx.touchpoint(item.touchpointId);
      return hasQrDesign(touchpoint?.kind) && touchpoint?.status !== "retired";
    });
    for (const item of items) {
      const state = touchpointDesigns.get(item.touchpointId) ?? {};
      state.lastExport = {
        at: new Date().toISOString(),
        fingerprint: item.fingerprint,
        format,
      };
      touchpointDesigns.set(item.touchpointId, state);
    }
    ctx.exported(items.map((item) => item.touchpointId));
    return { value: undefined };
  }

  if (path.endsWith("/qr-templates")) {
    if (method === "GET") return { value: templates.map(withUsage) };
    if (method === "POST") {
      if (templates.length >= maxQrTemplatesPerWorkspace)
        return conflict(
          "QR_TEMPLATE_LIMIT",
          `Tu biblioteca admite hasta ${maxQrTemplatesPerWorkspace} diseños. Borra uno para guardar otro.`,
        );
      const now = new Date().toISOString();
      const template: StoredTemplate = {
        id: crypto.randomUUID(),
        name: String(body.name ?? "Diseño"),
        design: structuredClone(body.design) as QrDesign,
        createdAt: now,
        updatedAt: now,
      };
      templates = [template, ...templates];
      return { value: withUsage(template) };
    }
  }

  const applications = /\/qr-templates\/([^/]+)\/applications$/.exec(path);
  if (applications?.[1] && method === "POST") {
    const templateId = applications[1];
    if (!ref(templateId))
      return {
        error: new ApiRequestError(
          "Ese diseño ya no existe.",
          404,
          "NOT_FOUND",
        ),
      };
    let applied = 0;
    let skipped = 0;
    for (const touchpointId of (body.touchpointIds as string[]) ?? []) {
      const touchpoint = ctx.touchpoint(touchpointId);
      if (!hasQrDesign(touchpoint?.kind) || touchpoint?.status === "retired") {
        skipped += 1;
        continue;
      }
      touchpointDesigns.set(touchpointId, {
        ...touchpointDesigns.get(touchpointId),
        templateId,
      });
      const state = touchpointDesigns.get(touchpointId);
      if (state) {
        delete state.design;
        delete state.updatedAt;
      }
      applied += 1;
    }
    let groups = 0;
    for (const groupId of (body.groupIds as string[]) ?? []) {
      if (!ctx.group(groupId)) {
        skipped += 1;
        continue;
      }
      groupTemplates.set(groupId, templateId);
      groups += 1;
    }
    return { value: { touchpoints: applied, groups, skipped } };
  }

  const template = /\/qr-templates\/([^/]+)$/.exec(path);
  if (template?.[1]) {
    const current = templates.find((item) => item.id === template[1]);
    if (!current)
      return {
        error: new ApiRequestError(
          "Ese diseño ya no existe.",
          404,
          "NOT_FOUND",
        ),
      };
    if (method === "GET") {
      const touchpointIds = [...touchpointDesigns.entries()]
        .filter(([, state]) => state.templateId === current.id && !state.design)
        .map(([id]) => id);
      const groupIds = [...groupTemplates.entries()]
        .filter(([, templateId]) => templateId === current.id)
        .map(([id]) => id);
      return {
        value: { template: withUsage(current), touchpointIds, groupIds },
      };
    }
    if (method === "PATCH") {
      if (typeof body.name === "string") current.name = body.name.trim();
      if (body.design)
        current.design = structuredClone(body.design) as QrDesign;
      current.updatedAt = new Date().toISOString();
      return { value: withUsage(current) };
    }
    if (method === "DELETE") {
      const usage = withUsage(current).usage;
      if (usage.touchpoints + usage.groups > 0)
        return conflict(
          "QR_TEMPLATE_IN_USE",
          `Este diseño lo usan ${usage.touchpoints} Touchpoints y ${usage.groups} grupos. Asígnales otro antes de borrarlo.`,
        );
      templates = templates.filter((item) => item.id !== current.id);
      return { value: undefined };
    }
  }

  if (/\/assets\/[^/]+\/read-authorizations$/.test(path))
    return {
      error: new ApiRequestError(
        "Las imágenes de la biblioteca no se pueden leer en el modo demo.",
        503,
        "ASSET_STORAGE_UNAVAILABLE",
      ),
    };

  return undefined;
}
