// Local-only visual walkthrough. `VITE_DEMO_MODE` is replaced at build time,
// so production bundles never contain a reachable demo branch unless the flag
// is explicitly enabled for a local build.
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

import {
  type CustomHtmlGeneration,
  type CustomHtmlGenerationEvent,
  type CustomHtmlGenerationStage,
  type ExperienceSummary,
  legalVersions,
  type PieceModel,
  type Touchpoint,
  type TouchpointGroup,
  type TouchpointKind,
} from "@kardo/contracts";
import { planPublication } from "../features/experiences/targets.js";
import { effectiveKind } from "../features/touchpoints/kind.js";
import { ApiRequestError, resolveErrorMessage } from "./api.js";
import { handleAccountDemo } from "./demo/account.js";
import {
  demoMainLinkId,
  handleLinksDemo,
  setDemoMainLink,
} from "./demo/links.js";
import { handleNotificationsDemo } from "./demo/notifications.js";
import { demoPieceClaim, demoPiecePreview } from "./demo/pieces.js";
import {
  demoForgetQrExport,
  demoGroupQrTemplateId,
  demoLinkTouchpointDesign,
  handleQrDemo,
} from "./demo/qr.js";
import {
  demoWorkspaceSlug,
  demoWorkspaceSlugChangedAt,
  handleSettingsDemo,
  listCreatedDemoOrganizations,
  setDemoWorkspaceSlug,
} from "./demo/settings.js";
import {
  demoMarkBackup,
  demoProbeObject,
  demoResetObject,
  demoTouchpointObject,
  demoUpdateObject,
} from "./demo/touchpoint-object.js";

type DemoOptions = { method?: string; body?: unknown };

/** Legacy form factor → the NFC/QR/Otro format (one Touchpoint, one format). */
function demoKind(body: Record<string, unknown>): string {
  if (typeof body.kind === "string") return body.kind;
  if (body.physicalType === "card") return "nfc";
  if (body.physicalType === "other") return "other";
  return "qr";
}

/** A touchpoint as the API returns it: its format and its object. */
function demoTouchpointView(item: Record<string, unknown>) {
  const kind = demoKind(item);
  return {
    ...item,
    kind,
    ...(kind === "link"
      ? {}
      : { object: demoTouchpointObject(String(item.id)) }),
  };
}

type DemoDashboard = {
  layout: Record<string, unknown> | null;
  updatedAt: string | null;
};

type Store = {
  dashboard: DemoDashboard;
  groups: Record<string, unknown>[];
  touchpoints: Record<string, unknown>[];
  experiences: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  leadRetention: { days: number | null };
  leadDelivery: {
    notifyEmail: boolean;
    notifyRecipients: string[];
    webhookUrl: string | null;
    webhookConfigured: boolean;
    emailAvailable: boolean;
  };
};

const workspaceId = "f6399f75-b398-41cd-a299-92b6d236c1fd";
const groupId = "7c1e2a90-1b2c-4d3e-8f40-5a6b7c8d9e01";
// Groups nest (ADR 021): Local Centro (a location) holds the Terraza zone.
const terrazaGroupId = "7c1e2a90-1b2c-4d3e-8f40-5a6b7c8d9e02";
const norteGroupId = "7c1e2a90-1b2c-4d3e-8f40-5a6b7c8d9e03";
const store: Store = {
  dashboard: { layout: null, updatedAt: null },
  groups: [
    {
      id: groupId,
      name: "Local Centro",
      description: "Mesas y mostrador de la sucursal Centro",
      touchpointCount: 2,
      parentId: null,
      kind: "location",
    },
    {
      id: terrazaGroupId,
      name: "Terraza",
      description: null,
      touchpointCount: 2,
      parentId: groupId,
      kind: "group",
    },
    {
      id: norteGroupId,
      name: "Local Norte",
      description: "Sucursal recién abierta",
      touchpointCount: 0,
      parentId: null,
      kind: "location",
    },
  ],
  touchpoints: [
    {
      id: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
      publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
      operationalName: "Tarjeta de bienvenida",
      physicalType: "card",
      status: "active",
      groupId,
      createdAt: "2026-09-20T15:00:00.000Z",
      live: {
        experienceId: "0d4a8c73-0a52-4a0e-8b7a-0c2f0e4b1a02",
        experienceName: "Menú de temporada",
        experienceType: "menu",
        revision: 3,
        publishedAt: "2026-09-23T18:10:00.000Z",
      },
    },
    {
      id: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a03",
      publicId: "a7e91b0c55d34f7aa0e2c1b9d3f4e5a6",
      operationalName: "Etiqueta de mostrador",
      physicalType: "label",
      status: "assigned",
      groupId,
      createdAt: "2026-09-22T12:00:00.000Z",
      live: null,
    },
    // A Kardo piece already activated (ADR 026): its picture shows in the
    // list, its page, Resumen and Analítica.
    {
      id: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a07",
      publicId: "kp_DemoStandCaja0000001",
      operationalName: "Stand de la caja",
      physicalType: "card",
      kind: "kardo",
      pieceModel: "stand",
      status: "active",
      groupId,
      createdAt: "2026-10-13T12:00:00.000Z",
      live: {
        experienceId: "0d4a8c73-0a52-4a0e-8b7a-0c2f0e4b1a02",
        experienceName: "Menú de temporada",
        experienceType: "menu",
        revision: 3,
        publishedAt: "2026-10-13T12:10:00.000Z",
      },
    },
    ...[1, 2].map((number) => ({
      id: `5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0b0${number}`,
      publicId: `b8f02c1d66e44a8bb1f3d2c0e4a5f6b${number}`,
      operationalName: `Mesa terraza ${number}`,
      physicalType: "label",
      status: "active",
      groupId: terrazaGroupId,
      createdAt: "2026-09-25T12:00:00.000Z",
      // Reached by «Menú de temporada», published on Local Centro.
      live: {
        experienceId: "0d4a8c73-0a52-4a0e-8b7a-0c2f0e4b1a02",
        experienceName: "Menú de temporada",
        experienceType: "menu",
        revision: 3,
        publishedAt: "2026-09-25T12:05:00.000Z",
      },
    })),
  ],
  experiences: [
    {
      id: "0d4a8c73-0a52-4a0e-8b7a-0c2f0e4b1a02",
      touchpointId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
      name: "Menú de temporada",
      type: "menu",
      targets: { touchpointIds: [], groupIds: [groupId] },
      publicationStatus: "published",
      hasUnpublishedChanges: false,
      liveRevision: 3,
      liveTouchpointCount: 1,
      archivedAt: null,
      updatedAt: "2026-09-23T18:00:00.000Z",
      content: {
        title: "Café Nube",
        description: "Temporada de otoño",
        currency: "MXN",
        sections: [
          {
            id: "bebidas",
            name: "Bebidas",
            items: [
              {
                id: "latte",
                name: "Latte",
                description: "Leche entera o vegetal",
                price: 58,
              },
              { id: "americano", name: "Americano", price: 42 },
            ],
          },
        ],
      },
    },
  ],
  // Sample library: the asset detail shows a validated image and PDF, one
  // still in quarantine and one the scanner rejected (demo only).
  assets: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      filename: "foto-cappuccino.jpg",
      mediaType: "image/jpeg",
      byteSize: 482_133,
      sha256: "a".repeat(64),
      status: "validated",
      createdAt: "2026-09-21T16:12:00.000Z",
    },
    {
      id: "30000000-0000-4000-8000-000000000002",
      filename: "carta-otono.pdf",
      mediaType: "application/pdf",
      byteSize: 1_204_551,
      sha256: "b".repeat(64),
      status: "validated",
      createdAt: "2026-09-18T19:40:00.000Z",
    },
    {
      id: "30000000-0000-4000-8000-000000000003",
      filename: "promocion-con-formulario.pdf",
      mediaType: "application/pdf",
      byteSize: 845_002,
      sha256: "c".repeat(64),
      status: "rejected",
      rejectedReason: "The PDF includes active content.",
      createdAt: "2026-09-25T14:05:00.000Z",
    },
    {
      id: "30000000-0000-4000-8000-000000000004",
      filename: "logo-terraza.png",
      mediaType: "image/png",
      byteSize: 0,
      sha256: "0".repeat(64),
      status: "quarantined",
      createdAt: "2026-10-02T17:55:00.000Z",
    },
  ],
  leads: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      touchpointId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
      touchpointName: "Tarjeta de bienvenida",
      email: "ana@example.com",
      name: "Ana Ruiz",
      phone: "+52 55 1234 5678",
      message: "Quiero información para un evento.",
      revision: 3,
      status: "new",
      createdAt: "2026-09-23T19:45:00.000Z",
      updatedAt: "2026-09-23T19:45:00.000Z",
    },
  ],
  leadRetention: { days: null },
  leadDelivery: {
    notifyEmail: false,
    notifyRecipients: [],
    webhookUrl: null,
    webhookConfigured: false,
    emailAvailable: false,
  },
};

// ---------------------------------------------------------------------------
// Disponibilidad: a restaurant menu and a florist's catalog with live item
// states (sold out, hidden, units left). Every other demo Menu or Catalog
// starts with all of its items available.
// ---------------------------------------------------------------------------
const demoTerrazaId = "3f7d2c1a-8b4e-4f6a-9c0d-2e1f3a4b5c61";
const demoArreglosId = "8a2b6c4d-1e3f-4a5b-8c7d-9e0f1a2b3c72";
const demoMinutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

store.experiences.unshift(
  {
    id: demoTerrazaId,
    touchpointId: null,
    name: "Menú Terraza",
    type: "menu",
    targets: { touchpointIds: [], groupIds: [groupId] },
    publicationStatus: "published",
    hasUnpublishedChanges: false,
    liveRevision: 5,
    liveTouchpointCount: 2,
    archivedAt: null,
    updatedAt: demoMinutesAgo(60 * 26),
    content: {
      title: "Terraza Café Nube",
      description: "Cocina mexicana de temporada",
      currency: "MXN",
      sections: [
        {
          id: "entradas",
          name: "Entradas",
          items: [
            {
              id: "guacamole",
              name: "Guacamole de la casa",
              description: "Aguacate, chile serrano y totopos recién hechos",
              price: 145,
            },
            {
              id: "tostadas-atun",
              name: "Tostadas de atún",
              description:
                "Atún aleta amarilla, mayonesa de chipotle y poro frito",
              price: 189,
            },
            {
              id: "esquites",
              name: "Esquites tatemados",
              description: "Elote, mayonesa de limón y chile piquín",
              price: 95,
            },
          ],
        },
        {
          id: "platos-fuertes",
          name: "Platos fuertes",
          items: [
            {
              id: "tacos-pescado",
              name: "Tacos de pescado estilo Ensenada",
              description: "Tres piezas con col morada y salsa de la casa",
              price: 210,
            },
            {
              id: "arrachera",
              name: "Arrachera a la parrilla",
              description: "300 g con cebollitas, nopal y frijoles charros",
              price: 365,
            },
            {
              id: "enchiladas-suizas",
              name: "Enchiladas suizas",
              description: "Pollo, salsa verde cremosa y queso gratinado",
              price: 185,
            },
            {
              id: "pesca-del-dia",
              name: "Pesca del día",
              description: "Pregunta por la preparación del chef",
              price: 290,
            },
          ],
        },
        // «Menú del día» (relevo 37, D1): one price, guisados to choose
        // from, each sold out on its own in Disponibilidad — one of them
        // (chicharrón) already is, below.
        {
          id: "menu-del-dia",
          name: "Menú del día",
          items: [
            {
              id: "comida-corrida",
              name: "Comida corrida",
              description: "Sopa, guisado, postre y agua",
              price: 85,
              choices: [
                { id: "guisado-mole", name: "Mole con pollo" },
                { id: "guisado-chicharron", name: "Chicharrón en salsa verde" },
                { id: "guisado-bistec", name: "Bistec a la mexicana" },
                { id: "guisado-chiles", name: "Chiles rellenos" },
              ],
            },
          ],
        },
        {
          id: "postres",
          name: "Postres",
          items: [
            {
              id: "churros",
              name: "Churros con cajeta",
              description: "Cinco piezas con azúcar y canela",
              price: 85,
            },
            { id: "flan", name: "Flan napolitano", price: 75 },
            {
              id: "pay-limon",
              name: "Pay de limón",
              description: "Galleta María y merengue tostado",
              price: 80,
            },
          ],
        },
        {
          id: "bebidas-terraza",
          name: "Bebidas",
          items: [
            {
              id: "agua-jamaica",
              name: "Agua de jamaica",
              description: "Vaso de 500 ml",
              price: 45,
            },
            { id: "limonada", name: "Limonada mineral", price: 55 },
            {
              id: "mezcal",
              name: "Mezcal espadín",
              description: "Copa de 45 ml con naranja y sal de gusano",
              price: 120,
            },
            { id: "cafe-olla", name: "Café de olla", price: 50 },
          ],
        },
      ],
    },
  },
  {
    id: demoArreglosId,
    touchpointId: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a03",
    name: "Arreglos del día",
    type: "catalog",
    targets: {
      touchpointIds: ["5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a03"],
      groupIds: [],
    },
    publicationStatus: "published",
    hasUnpublishedChanges: true,
    liveRevision: 2,
    liveTouchpointCount: 1,
    archivedAt: null,
    updatedAt: demoMinutesAgo(90),
    content: {
      title: "Arreglos del día",
      description: "Flores frescas para llevar o regalar",
      currency: "MXN",
      items: [
        {
          id: "ramo-rosas",
          name: "Ramo de 12 rosas rojas",
          description: "Envuelto en papel kraft con listón",
          price: 650,
        },
        {
          id: "girasoles",
          name: "Bouquet de girasoles",
          description: "Cinco girasoles con eucalipto",
          price: 480,
        },
        {
          id: "orquidea",
          name: "Orquídea blanca en maceta",
          description: "Maceta de cerámica, dos varas",
          price: 890,
        },
        {
          id: "tulipanes",
          name: "Caja de tulipanes",
          description: "Diez tulipanes de temporada",
          price: 720,
        },
        {
          id: "suculentas",
          name: "Terrario de suculentas",
          description: "Base de vidrio con piedra volcánica",
          price: 350,
        },
        {
          id: "peonias",
          name: "Ramo de peonías",
          description: "Solo bajo pedido",
          price: 980,
        },
      ],
    },
  },
);

// Drafts designed before choosing where they go: one without any target
// (a gentle "Sin destinos" in the list) and one assigned but never published.
store.experiences.push(
  {
    id: "6e1c9a2b-4d5f-4a7b-9c8d-1e2f3a4b5c81",
    touchpointId: null,
    name: "Tarjeta de presentación",
    type: "profile",
    targets: { touchpointIds: [], groupIds: [] },
    publicationStatus: "draft",
    hasUnpublishedChanges: true,
    liveRevision: null,
    liveTouchpointCount: 0,
    archivedAt: null,
    updatedAt: demoMinutesAgo(35),
    content: {
      displayName: "Café Nube",
      headline: "Café de especialidad y cocina de temporada",
      links: [
        {
          id: "reservas",
          label: "Reservar una mesa",
          url: "https://cafenube.example/reservas",
        },
      ],
    },
  },
  {
    id: "9b3d7e1f-2a4c-4e6b-8d0f-3a5b7c9d1e92",
    touchpointId: null,
    name: "Eventos privados",
    type: "form",
    targets: { touchpointIds: [], groupIds: [groupId] },
    publicationStatus: "draft",
    hasUnpublishedChanges: true,
    liveRevision: null,
    liveTouchpointCount: 0,
    archivedAt: null,
    updatedAt: demoMinutesAgo(60 * 50),
    content: {
      title: "Cuéntanos de tu evento",
      description: "Te respondemos en menos de un día.",
      fields: { name: "required", phone: "optional", message: "optional" },
      submitLabel: "Enviar",
      successMessage: "¡Gracias! Te contactaremos pronto.",
      consentText:
        "Acepto que se usen mis datos para responder a este mensaje.",
    },
  },
);

// Documento PDF e Imagen (ADR 018, addendum 3): both open the Estudio like
// every other Experience with a page. The demo cannot read the library, so
// the assets these reference never resolve to a real picture — the same
// placeholder every other image reference in this demo shows — but the
// content, the Estudio and its design work the same either way.
store.experiences.push(
  {
    id: "ce0827ea-83eb-42a5-9182-a878a5c18ac5",
    touchpointId: null,
    name: "Fachada del local",
    type: "image",
    targets: { touchpointIds: [], groupIds: [] },
    publicationStatus: "draft",
    hasUnpublishedChanges: true,
    liveRevision: null,
    liveTouchpointCount: 0,
    archivedAt: null,
    updatedAt: demoMinutesAgo(120),
    content: {
      assetId: "c01270e0-9361-4118-9af5-b1f862fcd430",
      alt: "Fachada de Café Nube al atardecer, con la terraza iluminada",
    },
  },
  {
    id: "8902d7c6-006d-490b-930e-084533162ec3",
    touchpointId: null,
    name: "Carta completa en PDF",
    type: "document",
    targets: { touchpointIds: [], groupIds: [] },
    publicationStatus: "draft",
    hasUnpublishedChanges: true,
    liveRevision: null,
    liveTouchpointCount: 0,
    archivedAt: null,
    updatedAt: demoMinutesAgo(200),
    content: {
      assetId: "7ac7a069-4eb9-4f12-8e48-d4b8380e3382",
      title: "Carta completa",
      description: "Todos nuestros platillos, temporada de otoño.",
      display: "viewer",
      allowDownload: false,
      pages: [
        {
          assetId: "bdca0df9-29d5-4351-8622-0c5a2d7335e2",
          width: 1240,
          height: 1754,
        },
        {
          assetId: "ecf9fa74-34b7-4fb1-b3c9-e28b7652312f",
          width: 1240,
          height: 1754,
        },
        {
          assetId: "d86a5a4d-a721-4c8b-b0fb-16e9ffd6ddb1",
          width: 1240,
          height: 1754,
        },
      ],
    },
  },
);

// Estudio de Experiences (ADR 018): a designed Página de enlaces, a Link
// with its designed página de enlaces, and the Perfil above still without a
// design (it opens on the Estudio's start screen). The demo cannot read
// library images, so these designs use colors and gradients only.
const demoLinkTouchpointId = "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a07";
const demoLinkPageId = "a1c3e5f7-2b4d-4f6a-8c0e-1d3f5a7b9c11";
const demoDesignedLinksId = "c7e9a1b3-5d7f-4a2c-9e4b-6f8a0c2e4d13";
store.touchpoints.push({
  id: demoLinkTouchpointId,
  publicId: "d4e5f6a7b8c94d0e9f1a2b3c4d5e6f70",
  operationalName: "/redes",
  kind: "link",
  handle: "cafenube",
  slug: "redes",
  slugChangedAt: null,
  status: "active",
  groupId: null,
  createdAt: "2026-09-21T10:00:00.000Z",
  live: {
    experienceId: demoLinkPageId,
    experienceName: "Café Nube en redes",
    experienceType: "linkpage",
    revision: 1,
    publishedAt: "2026-09-22T09:00:00.000Z",
  },
});
setDemoMainLink(demoLinkTouchpointId);

// Links redesign (relevo 34): the business already has its address (as
// after Primeros pasos) and a few links: /menu is the main one and /terraza
// is paused, with its address changed two days ago (the 7 days show).
const demoSeasonalMenuId = "0d4a8c73-0a52-4a0e-8b7a-0c2f0e4b1a02";
const demoMenuLinkId = "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a08";
const demoTerrazaLinkId = "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a09";
store.touchpoints.push(
  {
    id: demoMenuLinkId,
    publicId: "e5f6a7b8c9d04e1f8a2b3c4d5e6f7a81",
    operationalName: "/menu",
    kind: "link",
    handle: null,
    slug: "menu",
    slugChangedAt: null,
    status: "active",
    groupId: null,
    createdAt: "2026-09-24T10:00:00.000Z",
    live: {
      experienceId: demoSeasonalMenuId,
      experienceName: "Menú de temporada",
      experienceType: "menu",
      revision: 3,
      publishedAt: "2026-09-24T10:05:00.000Z",
    },
  },
  {
    id: demoTerrazaLinkId,
    publicId: "f6a7b8c9d0e14f2a9b3c4d5e6f7a8b92",
    operationalName: "/terraza",
    kind: "link",
    handle: null,
    slug: "terraza",
    slugChangedAt: demoMinutesAgo(2 * 24 * 60),
    status: "paused",
    groupId: null,
    createdAt: "2026-09-26T10:00:00.000Z",
    live: {
      experienceId: demoTerrazaId,
      experienceName: "Menú Terraza",
      experienceType: "menu",
      revision: 5,
      publishedAt: "2026-09-26T10:05:00.000Z",
    },
  },
);
for (const [experienceId, linkId] of [
  [demoSeasonalMenuId, demoMenuLinkId],
  [demoTerrazaId, demoTerrazaLinkId],
] as const) {
  const experience = store.experiences.find((item) => item.id === experienceId);
  if (!experience) continue;
  const targets = (experience.targets as
    | { touchpointIds: string[]; groupIds: string[] }
    | undefined) ?? { touchpointIds: [], groupIds: [] };
  experience.targets = {
    touchpointIds: [...targets.touchpointIds, linkId],
    groupIds: targets.groupIds,
  };
}
setDemoMainLink(demoMenuLinkId);
store.experiences.push(
  {
    id: demoDesignedLinksId,
    touchpointId: null,
    name: "Enlaces de la terraza",
    type: "links",
    targets: { touchpointIds: [], groupIds: [] },
    publicationStatus: "draft",
    hasUnpublishedChanges: true,
    liveRevision: null,
    liveTouchpointCount: 0,
    archivedAt: null,
    updatedAt: demoMinutesAgo(18),
    content: {
      title: "Terraza Café Nube",
      description: "Todo lo que necesitas, a un toque.",
      links: [
        {
          id: "t-menu",
          label: "Ver el menú del día",
          url: "https://cafenube.example/menu",
        },
        {
          id: "t-reservar",
          label: "Reservar una mesa",
          url: "https://cafenube.example/reservas",
        },
        {
          id: "t-pedidos",
          label: "Pedir para llevar",
          url: "https://cafenube.example/pedidos",
        },
      ],
      design: {
        schema: 1,
        style: {
          palette: {
            background: "#f3ede4",
            surface: "#fffaf3",
            text: "#2b2118",
            muted: "#7d6a58",
            accent: "#b5533c",
          },
          fonts: { heading: "playfair", body: "dm-sans" },
          radius: 18,
          buttonStyle: "solid",
          buttonShape: "pill",
          shadow: "soft",
          background: {
            kind: "gradient",
            color: "#f6efe6",
            colorTo: "#ead8c4",
            angle: 180,
          },
          maxWidth: 600,
        },
        sections: [
          {
            id: "s-portada",
            layout: "1",
            columns: [
              [
                {
                  id: "b-kicker",
                  kind: "text",
                  runs: [{ text: "TERRAZA · COLONIA ROMA", bold: true }],
                  style: { fontSize: 12, letterSpacing: 18, color: "accent" },
                },
                { id: "b-titulo", kind: "contentTitle" },
                {
                  id: "b-texto",
                  kind: "text",
                  runs: [
                    {
                      text: "Desayunos hasta las 13:00, cocina de temporada y ",
                    },
                    { text: "mezcal de la casa", italic: true },
                    { text: " al atardecer." },
                  ],
                },
              ],
            ],
            paddingTop: 56,
            paddingBottom: 16,
            gap: 12,
            align: "center",
          },
          {
            id: "s-enlaces",
            layout: "1",
            columns: [
              [{ id: "b-enlaces", kind: "contentLinks", layout: "list" }],
            ],
            card: true,
            paddingTop: 24,
            paddingBottom: 24,
            gap: 12,
            align: "center",
          },
          {
            id: "s-horario",
            layout: "1-1",
            columns: [
              [
                {
                  id: "b-h-titulo",
                  kind: "heading",
                  text: "Horario",
                  level: 3,
                },
                {
                  id: "b-h-texto",
                  kind: "text",
                  runs: [{ text: "Lunes a domingo\n8:00 a 23:00" }],
                },
              ],
              [
                {
                  id: "b-d-titulo",
                  kind: "heading",
                  text: "Dónde estamos",
                  level: 3,
                },
                {
                  id: "b-d-texto",
                  kind: "text",
                  runs: [{ text: "Álvaro Obregón 120\nRoma Norte, CDMX" }],
                },
              ],
            ],
            paddingTop: 32,
            paddingBottom: 16,
            gap: 12,
            align: "start",
          },
          {
            id: "s-cierre",
            layout: "1",
            columns: [
              [
                { id: "b-separador", kind: "divider" },
                {
                  id: "b-whatsapp",
                  kind: "button",
                  label: "Escríbenos por WhatsApp",
                  href: "https://wa.me/5215512345678",
                  variant: "secondary",
                },
              ],
            ],
            paddingTop: 8,
            paddingBottom: 40,
            gap: 16,
            align: "center",
          },
        ],
      },
    },
  },
  {
    id: demoLinkPageId,
    touchpointId: demoLinkTouchpointId,
    name: "Café Nube en redes",
    type: "linkpage",
    targets: { touchpointIds: [demoLinkTouchpointId], groupIds: [] },
    publicationStatus: "published",
    hasUnpublishedChanges: true,
    liveRevision: 1,
    liveTouchpointCount: 1,
    archivedAt: null,
    updatedAt: demoMinutesAgo(64),
    content: {
      displayName: "Café Nube",
      bio: "Café de especialidad y cocina de temporada en la Roma.",
      socials: [
        {
          id: "r-instagram",
          network: "instagram",
          value: "https://instagram.com/cafenube",
        },
        {
          id: "r-whatsapp",
          network: "whatsapp",
          value: "https://wa.me/5215512345678",
        },
        {
          id: "r-tiktok",
          network: "tiktok",
          value: "https://tiktok.com/@cafenube",
        },
      ],
      links: [
        {
          id: "l-menu",
          label: "Menú del día",
          url: "https://cafenube.example/menu",
          highlight: true,
        },
        {
          id: "l-reservar",
          label: "Reservar una mesa",
          url: "https://cafenube.example/reservas",
        },
        {
          id: "l-pedidos",
          label: "Pedir para llevar",
          url: "https://cafenube.example/pedidos",
        },
      ],
      design: {
        schema: 1,
        style: {
          palette: {
            background: "#0e2430",
            surface: "#16323f",
            text: "#f2f6f5",
            muted: "#a9c3c3",
            accent: "#8ce0dc",
          },
          fonts: { heading: "geist", body: "dm-sans" },
          radius: 16,
          buttonStyle: "solid",
          buttonShape: "rounded",
          shadow: "none",
          background: {
            kind: "gradient",
            color: "#0e2430",
            colorTo: "#0a4d56",
            angle: 165,
          },
          maxWidth: 520,
        },
        sections: [
          {
            id: "s-lp-encabezado",
            layout: "1",
            columns: [
              [
                {
                  id: "b-lp-perfil",
                  kind: "profileHeader",
                  layout: "stacked",
                  avatarShape: "circle",
                },
                { id: "b-lp-redes", kind: "contentSocials", size: "medium" },
              ],
            ],
            paddingTop: 64,
            paddingBottom: 16,
            gap: 16,
            align: "center",
          },
          {
            id: "s-lp-botones",
            layout: "1",
            columns: [
              [{ id: "b-lp-botones", kind: "contentLinks", layout: "list" }],
            ],
            paddingTop: 8,
            paddingBottom: 24,
            gap: 12,
            align: "center",
          },
          {
            id: "s-lp-nota",
            layout: "1",
            columns: [
              [
                {
                  id: "b-lp-nota",
                  kind: "text",
                  runs: [{ text: "Abierto todos los días de 8:00 a 23:00." }],
                  style: { color: "muted", fontSize: 14 },
                },
              ],
            ],
            paddingTop: 8,
            paddingBottom: 48,
            gap: 8,
            align: "center",
          },
        ],
      },
    },
  },
);

type DemoItemAvailability = {
  status: "available" | "sold_out" | "hidden";
  quantity: number | null;
  updatedAt: string | null;
};

/** Keyed by `experienceId:itemId`; items not listed are available. */
const demoAvailability = new Map<string, DemoItemAvailability>([
  [
    `${demoTerrazaId}:tostadas-atun`,
    { status: "sold_out", quantity: null, updatedAt: demoMinutesAgo(18) },
  ],
  [
    `${demoTerrazaId}:arrachera`,
    { status: "available", quantity: 2, updatedAt: demoMinutesAgo(6) },
  ],
  [
    `${demoTerrazaId}:pesca-del-dia`,
    { status: "hidden", quantity: null, updatedAt: demoMinutesAgo(140) },
  ],
  [
    `${demoTerrazaId}:flan`,
    { status: "sold_out", quantity: null, updatedAt: demoMinutesAgo(42) },
  ],
  [
    // One guisado already out (D1): Doña Rosa's case, so it shows nested
    // under «Comida corrida» in the demo panel as sold out on its own.
    `${demoTerrazaId}:guisado-chicharron`,
    { status: "sold_out", quantity: null, updatedAt: demoMinutesAgo(50) },
  ],
  [
    `${demoArreglosId}:ramo-rosas`,
    { status: "available", quantity: 3, updatedAt: demoMinutesAgo(25) },
  ],
  [
    `${demoArreglosId}:girasoles`,
    { status: "available", quantity: 1, updatedAt: demoMinutesAgo(12) },
  ],
  [
    `${demoArreglosId}:orquidea`,
    { status: "available", quantity: 0, updatedAt: demoMinutesAgo(8) },
  ],
  [
    `${demoArreglosId}:suculentas`,
    { status: "sold_out", quantity: null, updatedAt: demoMinutesAgo(75) },
  ],
  [
    `${demoArreglosId}:peonias`,
    { status: "hidden", quantity: null, updatedAt: demoMinutesAgo(300) },
  ],
]);

type DemoAvailabilitySourceItem = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  imageAssetId?: string;
  /** «Menú del día» guisados (relevo 37, D1); each sells out on its own. */
  choices?: { id: string; name: string }[];
};

/** One dish (or guisado, via `choiceOf`) with its live state. */
function demoAvailabilityItem(
  experienceId: unknown,
  item: Omit<DemoAvailabilitySourceItem, "choices">,
  choiceOf?: string,
) {
  const state = demoAvailability.get(`${experienceId}:${item.id}`);
  return {
    id: item.id,
    name: item.name,
    ...(choiceOf ? { choiceOf } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(item.price !== undefined ? { price: item.price } : {}),
    ...(item.imageAssetId ? { imageAssetId: item.imageAssetId } : {}),
    status: state?.status ?? "available",
    quantity: state?.quantity ?? null,
    updatedAt: state?.updatedAt ?? null,
  };
}

/** A dish right before its guisados, each listed as its own item. */
function demoAvailabilityItems(
  experienceId: unknown,
  items: readonly DemoAvailabilitySourceItem[],
) {
  return items.flatMap((item) => [
    demoAvailabilityItem(experienceId, item),
    ...(item.choices ?? []).map((choice) =>
      demoAvailabilityItem(experienceId, choice, item.id),
    ),
  ]);
}

function demoAvailabilitySections(experience: Record<string, unknown>) {
  const content = (experience.content ?? {}) as {
    sections?: {
      id: string;
      name: string;
      items: DemoAvailabilitySourceItem[];
    }[];
    items?: DemoAvailabilitySourceItem[];
  };
  const sections =
    experience.type === "menu"
      ? (content.sections ?? [])
      : [{ id: "catalogo", name: null, items: content.items ?? [] }];
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    items: demoAvailabilityItems(experience.id, section.items),
  }));
}

function demoAvailabilityExperience(experience: Record<string, unknown>) {
  const sections = demoAvailabilitySections(experience);
  const updatedAt =
    sections
      .flatMap((section) => section.items.map((item) => item.updatedAt))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const content = (experience.content ?? {}) as { currency?: string };
  return {
    experienceId: experience.id,
    name: experience.name,
    type: experience.type,
    currency: content.currency ?? "MXN",
    source: experience.publicationStatus === "draft" ? "draft" : "published",
    hasUnpublishedChanges: Boolean(experience.hasUnpublishedChanges),
    liveTouchpointCount: Number(experience.liveTouchpointCount ?? 0),
    sections,
    updatedAt,
  };
}

function handleAvailabilityDemo(
  path: string,
  method: string,
  body: Record<string, unknown>,
): { value: unknown } | { error: ApiRequestError } | undefined {
  const isListed = (experience: Record<string, unknown>) =>
    (experience.type === "menu" || experience.type === "catalog") &&
    !experience.archivedAt;
  if (/^\/v1\/workspaces\/[^/]+\/availability$/.test(path) && method === "GET")
    return {
      value: {
        experiences: store.experiences
          .filter(isListed)
          .map(demoAvailabilityExperience),
      },
    };
  const match = /\/experiences\/([^/]+)\/availability$/.exec(path);
  if (!match || method !== "PUT") return undefined;
  const experience = store.experiences.find((item) => item.id === match[1]);
  if (!experience || !isListed(experience))
    return {
      error: experience?.archivedAt
        ? new ApiRequestError(
            "Esta página se archivó y ya no acepta cambios de disponibilidad.",
            409,
            "EXPERIENCE_ARCHIVED",
          )
        : new ApiRequestError(
            "No encontramos este elemento en tu espacio.",
            404,
            "NOT_FOUND",
          ),
    };
  const known = new Set(
    demoAvailabilitySections(experience).flatMap((section) =>
      section.items.map((item) => item.id),
    ),
  );
  const updatedAt = new Date().toISOString();
  const changes = (body.items ?? []) as {
    itemId: string;
    status: DemoItemAvailability["status"];
    quantity: number | null;
  }[];
  for (const change of changes)
    if (known.has(change.itemId))
      demoAvailability.set(`${experience.id}:${change.itemId}`, {
        status: change.status,
        quantity: change.quantity,
        updatedAt,
      });
  return { value: demoAvailabilityExperience(experience) };
}

// ---------------------------------------------------------------------------
// Estudio, modo HTML: "Pídele a la IA de Kardo" in the demo
// ---------------------------------------------------------------------------

type DemoBrief = {
  description?: string;
  colors?: string[];
  imageRefs?: string[];
  fonts?: string[];
};

let demoGenerationsLeft = 10;

const demoFontNames: Record<string, string> = {
  geist: "Geist",
  "dm-sans": "DM Sans",
  poppins: "Poppins",
  playfair: "Playfair Display",
  lora: "Lora",
  "space-grotesk": "Space Grotesk",
};

function demoCustomHtmlGeneration(
  experience: Record<string, unknown> | undefined,
  brief: DemoBrief | undefined,
): CustomHtmlGeneration {
  const content = (experience?.content ?? {}) as Record<string, unknown>;
  const type = String(experience?.type ?? "links");
  const name =
    String(content.displayName ?? content.title ?? "Café Nube").trim() ||
    "Café Nube";
  const tagline =
    String(
      content.bio ?? content.headline ?? content.description ?? "",
    ).trim() || "Café de especialidad y cocina de temporada.";
  const colors = brief?.colors ?? [];
  const accent = colors[0] ?? "#5b6b3a";
  const deep = colors[1] ?? "#2f3a1f";
  const cream = colors[2] ?? "#f6f1e7";
  const [display, text] = [
    demoFontNames[brief?.fonts?.[0] ?? ""] ?? "Playfair Display",
    demoFontNames[brief?.fonts?.[1] ?? ""] ?? "DM Sans",
  ];
  const images = (brief?.imageRefs ?? []).slice(0, 3);
  const escapeText = (value: string) =>
    value.replace(/[&<>"]/g, (character) =>
      character === "&"
        ? "&amp;"
        : character === "<"
          ? "&lt;"
          : character === ">"
            ? "&gt;"
            : "&quot;",
    );
  const gallery = images.length
    ? `
  <section class="galeria" aria-label="Fotos">
${images.map((ref) => `    <img src="kardo-asset:${ref}" alt="">`).join("\n")}
  </section>`
    : "";
  const html = `<main class="pagina">
  <header class="portada">
    <p class="sello">Desde 2019 · Roma Norte</p>
${type === "linkpage" ? "    <kardo-profile></kardo-profile>" : `    <h1>${escapeText(name)}</h1>\n    <p class="lema">${escapeText(tagline)}</p>`}
  </header>

  <section class="destacado">
    <p class="etiqueta">Hoy en la barra</p>
    <h2>Pan de masa madre recién horneado</h2>
    <p>Pídelo con un flat white y guarda un lugar en la terraza.</p>
  </section>

  <kardo-links></kardo-links>
${gallery}
${type === "linkpage" ? "  <kardo-socials></kardo-socials>\n" : ""}  <footer class="horario">
    <p><strong>Lunes a sábado</strong> 8:00 a 20:00</p>
    <p><strong>Domingo</strong> 9:00 a 15:00</p>
  </footer>
</main>`;
  const css = `.pagina {
  background: ${cream};
  color: ${deep};
  font-family: "${text}", system-ui, sans-serif;
  min-height: 100vh;
  padding: 0 0 32px;
}

.portada {
  background: linear-gradient(160deg, ${deep}, ${accent});
  border-radius: 0 0 32px 32px;
  color: ${cream};
  padding: 56px 28px 44px;
  text-align: center;
}

.sello {
  font-size: 12px;
  letter-spacing: 0.14em;
  margin: 0 0 18px;
  opacity: 0.8;
  text-transform: uppercase;
}

.portada h1 {
  font-family: "${display}", Georgia, serif;
  font-size: 44px;
  line-height: 1.05;
  margin: 0 0 12px;
}

.lema {
  font-size: 17px;
  line-height: 1.5;
  margin: 0 auto;
  max-width: 300px;
  opacity: 0.9;
}

.destacado {
  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 18px 40px -24px rgba(47, 58, 31, 0.45);
  margin: -24px 20px 24px;
  padding: 22px 22px 20px;
  position: relative;
}

.etiqueta {
  color: ${accent};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  margin: 0 0 6px;
  text-transform: uppercase;
}

.destacado h2 {
  font-family: "${display}", Georgia, serif;
  font-size: 24px;
  line-height: 1.2;
  margin: 0 0 8px;
}

.destacado p {
  line-height: 1.5;
  margin: 0;
}

kardo-links {
  display: block;
  padding: 0 20px;
}

.k-links {
  display: grid;
  gap: 12px;
}

.k-link {
  background: ${deep};
  border-radius: 999px;
  color: ${cream};
  font-weight: 600;
  padding: 16px 20px;
  text-align: center;
  text-decoration: none;
}

.galeria {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(${Math.max(1, images.length)}, 1fr);
  padding: 24px 20px 0;
}

.galeria img {
  aspect-ratio: 1;
  border-radius: 18px;
  object-fit: cover;
  width: 100%;
}

kardo-socials {
  color: ${deep};
  display: block;
  padding: 24px 20px 0;
}

.horario {
  border-top: 1px solid rgba(47, 58, 31, 0.15);
  font-size: 14px;
  margin: 28px 20px 0;
  padding-top: 18px;
  text-align: center;
}

.horario p {
  margin: 4px 0;
}`;
  demoGenerationsLeft = Math.max(0, demoGenerationsLeft - 1);
  return {
    html,
    css,
    notes: `Armé una portada con los colores de tu marca, una tarjeta para destacar lo de hoy, tus enlaces como botones redondeados${images.length ? ", una galería con tus fotos" : ""} y tu horario al final. Títulos en ${display} y texto en ${text}.`,
    remainingToday: demoGenerationsLeft,
  };
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), 220));
}

const demoGenerationStages: {
  stage: CustomHtmlGenerationStage;
  turn: number;
  maxTurns: number;
  wait: number;
}[] = [
  { stage: "queued", turn: 1, maxTurns: 2, wait: 300 },
  { stage: "generating", turn: 1, maxTurns: 2, wait: 900 },
  { stage: "reviewing", turn: 1, maxTurns: 2, wait: 450 },
  { stage: "fixing", turn: 2, maxTurns: 2, wait: 450 },
];

function demoAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

/**
 * "Diseñar con la IA de Kardo" in the demo: the same staged progress
 * (`CustomHtmlGenerationEvent`) the real endpoint streams as NDJSON, so the
 * onboarding shows real-looking stages instead of a canned timer, then the
 * canned design `demoCustomHtmlGeneration` already builds.
 */
export async function demoCustomHtmlGenerationStream(
  path: string,
  brief: DemoBrief | undefined,
  {
    signal,
    onEvent,
  }: {
    signal?: AbortSignal | undefined;
    onEvent: (event: CustomHtmlGenerationEvent) => void;
  },
): Promise<CustomHtmlGeneration> {
  const match = /\/experiences\/([^/]+)\/custom-html\/generations$/.exec(path);
  const experience = match
    ? store.experiences.find((item) => item.id === match[1])
    : undefined;
  for (const step of demoGenerationStages) {
    if (signal?.aborted) throw demoAbortError();
    await new Promise((resolve) => window.setTimeout(resolve, step.wait));
    onEvent({
      type: "progress",
      stage: step.stage,
      turn: step.turn,
      maxTurns: step.maxTurns,
    });
  }
  if (signal?.aborted) throw demoAbortError();
  return demoCustomHtmlGeneration(experience, brief);
}

/** Groups nest (ADR 021): the group and every group below it. */
function demoGroupTree(groupId: string): Set<string> {
  const ids = new Set([groupId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const group of store.groups) {
      const parent = group.parentId as string | null | undefined;
      if (parent && ids.has(parent) && !ids.has(String(group.id))) {
        ids.add(String(group.id));
        grew = true;
      }
    }
  }
  return ids;
}

/** Root first, the group itself last. */
function demoGroupChain(groupId: string): string[] {
  const chain: string[] = [];
  let current = store.groups.find((group) => group.id === groupId);
  while (current && !chain.includes(String(current.id))) {
    chain.unshift(String(current.id));
    const parent = current.parentId as string | null | undefined;
    current = parent
      ? store.groups.find((group) => group.id === parent)
      : undefined;
  }
  return chain;
}

/** What a group serves: an Experience targeting it, live in its tree. */
function demoGroupServes(groupId: string): Record<string, unknown> | null {
  const tree = demoGroupTree(groupId);
  for (const touchpoint of store.touchpoints) {
    const live = touchpoint.live as
      | { experienceId?: string }
      | null
      | undefined;
    if (!live || !tree.has(String(touchpoint.groupId))) continue;
    const experience = store.experiences.find(
      (item) => item.id === live.experienceId,
    );
    const targets = experience?.targets as { groupIds?: string[] } | undefined;
    if (targets?.groupIds?.includes(groupId))
      return live as Record<string, unknown>;
  }
  return null;
}

/** What a Touchpoint joining `groupId` receives: the nearest serving group. */
function demoServedLive(groupId: string): Record<string, unknown> | null {
  const chain = demoGroupChain(groupId);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const served = demoGroupServes(chain[index] ?? "");
    if (served) return served;
  }
  return null;
}

function demoAssertSiblingName(
  parentId: string | null,
  name: string,
  selfId: string | null,
  code: "GROUP_NAME_TAKEN" | "GROUP_CHILD_NAME_TAKEN" = "GROUP_NAME_TAKEN",
) {
  const key = name.trim().toLowerCase();
  const taken = store.groups.some(
    (group) =>
      group.id !== selfId &&
      ((group.parentId as string | null | undefined) ?? null) === parentId &&
      String(group.name).trim().toLowerCase() === key,
  );
  if (taken)
    throw new ApiRequestError(
      "Ya existe un grupo con ese nombre en ese mismo lugar.",
      409,
      code,
    );
}

function demoGroupView(group: Record<string, unknown>) {
  const id = String(group.id);
  const tree = demoGroupTree(id);
  const live = demoGroupServes(id) as {
    experienceId: string;
    experienceName: string;
  } | null;
  return {
    ...group,
    parentId: (group.parentId as string | null | undefined) ?? null,
    kind: group.kind ?? "group",
    touchpointCount: store.touchpoints.filter(
      (item) => item.groupId === id && item.status !== "retired",
    ).length,
    totalTouchpointCount: store.touchpoints.filter(
      (item) => tree.has(String(item.groupId)) && item.status !== "retired",
    ).length,
    servedExperience: live
      ? { id: live.experienceId, name: live.experienceName }
      : null,
    qrTemplateId: demoGroupQrTemplateId(id),
  };
}

// The business starts with its address chosen, set on the first request
// (not while the modules load: demo/settings.ts may still be loading).
let demoAddressSeeded = false;

export function demoRequest<T>(path: string, options: DemoOptions): Promise<T> {
  if (!demoAddressSeeded) {
    demoAddressSeeded = true;
    setDemoWorkspaceSlug(workspaceId, "cafe-nube-roma");
  }
  const method = options.method ?? "GET";
  const body = (options.body ?? {}) as Record<string, unknown>;
  const clone = <V>(value: V) => structuredClone(value) as unknown as T;

  const account = handleAccountDemo(path, method, body);
  if (account !== undefined) return delay(clone(account));

  // Downgrade option B (ADR 023), only with ?demo-bajada=1: a smaller plan
  // than the demo's Touchpoints, to review «Qué sigue activo».
  if (path.endsWith("/plan-selection"))
    return delay(clone(demoPlanSelection(path, method, body)));

  const settings = handleSettingsDemo(path, method, body);
  if (settings !== undefined) return delay(clone(settings));

  const notifications = handleNotificationsDemo(path, method);
  if (notifications !== undefined) return delay(clone(notifications));

  try {
    const links = handleLinksDemo(path, method, body, {
      touchpoints: store.touchpoints,
      experiences: store.experiences,
      businessSlug: () => demoWorkspaceSlug(workspaceId),
    });
    if (links !== undefined) return delay(clone(links));
  } catch (error) {
    return Promise.reject(error);
  }

  const qr = handleQrDemo(path, method, body, {
    touchpoint: (id) => {
      const item = store.touchpoints.find((touchpoint) => touchpoint.id === id);
      return item
        ? {
            groupId: (item.groupId as string | null | undefined) ?? null,
            kind: demoKind(item),
            status: String(item.status),
          }
        : null;
    },
    group: (id) => {
      const item = store.groups.find((group) => group.id === id);
      return item
        ? {
            name: String(item.name),
            parentId: (item.parentId as string | null | undefined) ?? null,
          }
        : null;
    },
    // Every printable code: QRs and NFCs' backup QRs (relevo 38).
    qrTouchpointIds: () =>
      store.touchpoints
        .filter(
          (item) =>
            (demoKind(item) === "qr" || demoKind(item) === "nfc") &&
            item.status !== "retired",
        )
        .map((item) => String(item.id)),
    exported: (ids) => {
      for (const id of ids) {
        const item = store.touchpoints.find(
          (touchpoint) => touchpoint.id === id,
        );
        if (item && demoKind(item) === "nfc") demoMarkBackup(id);
      }
    },
  });
  if (qr && "error" in qr)
    return delay(null).then(() => Promise.reject(qr.error));
  if (qr) return delay(clone(qr.value));

  const availability = handleAvailabilityDemo(path, method, body);
  if (availability && "error" in availability)
    return delay(null).then(() => Promise.reject(availability.error));
  if (availability) return delay(clone(availability.value));

  if (path === "/v1/workspaces")
    return delay(
      clone([
        {
          id: workspaceId,
          publicId: "kardodemo00000001",
          name: "Café Nube",
          kind: "organization",
          role: "owner",
          slug: demoWorkspaceSlug(workspaceId),
          slugChangedAt: demoWorkspaceSlugChangedAt(workspaceId),
          mainLinkId: demoMainLinkId(),
        },
        ...listCreatedDemoOrganizations(),
      ]),
    );
  if (path === "/v1/me/terms-acceptance" && method === "POST")
    return delay(
      clone({
        subject: "e6abf26a-3263-4149-9d75-9b7441165d29",
        email: "demo@kardo.test",
        displayName: "Demo",
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: legalVersions.terms,
        privacyVersion: legalVersions.privacy,
      }),
    );
  if (path.endsWith("/touchpoint-groups") && method === "GET")
    return delay(clone(store.groups.map(demoGroupView)));
  if (path.endsWith("/touchpoint-groups") && method === "POST") {
    const parentId = (body.parentId as string | undefined) ?? null;
    demoAssertSiblingName(parentId, String(body.name), null);
    const group = {
      id: crypto.randomUUID(),
      name: body.name,
      description: body.description ?? null,
      touchpointCount: 0,
      parentId,
      kind: body.kind ?? "group",
    };
    store.groups.push(group);
    const ids = (body.touchpointIds as string[] | undefined) ?? [];
    for (const touchpoint of store.touchpoints)
      if (ids.includes(String(touchpoint.id))) touchpoint.groupId = group.id;
    return delay(clone(demoGroupView(group)));
  }
  const groupMatch = /\/touchpoint-groups\/([^/]+)(\/touchpoints)?$/.exec(path);
  if (groupMatch) {
    const group = store.groups.find((item) => item.id === groupMatch[1]);
    if (method === "DELETE") {
      // Its Touchpoints and subgroups move up to its parent (ADR 021).
      const parentId = (group?.parentId as string | null | undefined) ?? null;
      for (const child of store.groups)
        if (child.parentId === groupMatch[1]) {
          demoAssertSiblingName(
            parentId,
            String(child.name),
            String(child.id),
            "GROUP_CHILD_NAME_TAKEN",
          );
        }
      store.groups = store.groups.filter((item) => item.id !== groupMatch[1]);
      for (const child of store.groups)
        if (child.parentId === groupMatch[1]) child.parentId = parentId;
      for (const touchpoint of store.touchpoints)
        if (touchpoint.groupId === groupMatch[1]) touchpoint.groupId = parentId;
      return delay(undefined as T);
    }
    if (groupMatch[2] && group) {
      const ids = (body.touchpointIds as string[] | undefined) ?? [];
      for (const touchpoint of store.touchpoints) {
        if (ids.includes(String(touchpoint.id))) touchpoint.groupId = group.id;
        else if (touchpoint.groupId === group.id) touchpoint.groupId = null;
      }
    } else if (group) {
      const nextParent =
        body.parentId === undefined
          ? ((group.parentId as string | null | undefined) ?? null)
          : ((body.parentId as string | null) ?? null);
      if (nextParent && demoGroupTree(String(group.id)).has(nextParent))
        throw new ApiRequestError(
          "Un grupo no puede ir dentro de sí mismo ni de uno de sus subgrupos.",
          409,
          "GROUP_CYCLE",
        );
      demoAssertSiblingName(
        nextParent,
        String(body.name ?? group.name),
        String(group.id),
      );
      Object.assign(group, {
        name: body.name ?? group.name,
        description:
          body.description === undefined ? group.description : body.description,
        parentId: nextParent,
        kind: body.kind ?? group.kind ?? "group",
      });
    }
    return delay(clone(group ? demoGroupView(group) : group));
  }
  if (path.endsWith("/touchpoints") && method === "GET")
    // The server always reports the format; legacy demo rows only carry
    // `physicalType`.
    return delay(
      clone(
        store.touchpoints.map((item) => ({
          ...item,
          kind: demoKind(item),
          planExcluded: demoPlanExcluded(item),
          ...(demoKind(item) === "link"
            ? {}
            : { object: demoTouchpointObject(String(item.id)) }),
        })),
      ),
    );
  if (path.endsWith("/touchpoints") && method === "POST") {
    const touchpoint = {
      id: crypto.randomUUID(),
      publicId: crypto.randomUUID().replaceAll("-", ""),
      operationalName: body.operationalName,
      physicalType: body.physicalType ?? "other",
      kind: demoKind(body),
      handle: body.handle ?? null,
      groupId: body.groupId ?? null,
      status: "assigned",
      createdAt: new Date().toISOString(),
      live: null,
    };
    store.touchpoints.unshift(touchpoint);
    demoLinkTouchpointDesign(touchpoint.id, body.qrTemplateId);
    return delay(clone(touchpoint));
  }
  // «Producto de Kardo» (ADR 026): codes K4RD0-DEM05 and DEM0-0001.
  if (path.endsWith("/kardo-pieces/preview") && method === "POST") {
    const usage = store.touchpoints.filter(
      (item) => demoKind(item) !== "link" && item.status !== "retired",
    ).length;
    return delay(clone(demoPiecePreview(String(body.code ?? ""), usage)));
  }
  if (path.endsWith("/kardo-pieces/claim") && method === "POST") {
    const result = demoPieceClaim(
      String(body.code ?? ""),
      (body.pieces as { touchpointId: string; name: string }[]) ?? [],
      (body.groupId as string | null | undefined) ?? null,
    );
    store.touchpoints.unshift(...result.touchpoints);
    return delay(
      clone({
        touchpoints: result.touchpoints.map(demoTouchpointView),
        panel: result.panel,
      }),
    );
  }
  if (path.endsWith("/touchpoints/move") && method === "POST") {
    const ids = (body.touchpointIds as string[] | undefined) ?? [];
    const target = (body.groupId as string | null | undefined) ?? null;
    // Joining a group receives what it serves (unless it already shows
    // something); leaving keeps the current content. Mirrors the server.
    const groupLive = target ? demoServedLive(target) : null;
    let moved = 0;
    let propagated = 0;
    for (const touchpoint of store.touchpoints) {
      if (!ids.includes(String(touchpoint.id))) continue;
      if (touchpoint.groupId === target) continue;
      touchpoint.groupId = target;
      moved += 1;
      if (groupLive && !touchpoint.live) {
        touchpoint.live = structuredClone(groupLive);
        propagated += 1;
      }
    }
    return delay(clone({ moved, propagatedPublications: propagated }));
  }
  if (path.endsWith("/touchpoints/batch") && method === "POST") {
    const prefix = String(body.namePrefix ?? "").trim();
    const start = Number(body.start ?? 1);
    const count = Math.min(100, Math.max(1, Number(body.count ?? 1)));
    const groupIdForBatch = body.groupId as string | undefined;
    // A Touchpoint created in a group receives that group's live Experience.
    const groupLive = groupIdForBatch ? demoServedLive(groupIdForBatch) : null;
    const created = Array.from({ length: count }, (_, index) => ({
      id: crypto.randomUUID(),
      publicId: crypto.randomUUID().replaceAll("-", ""),
      operationalName: `${prefix} ${start + index}`,
      physicalType: body.physicalType ?? "other",
      kind: demoKind(body),
      status: "assigned",
      groupId: groupIdForBatch ?? null,
      createdAt: new Date().toISOString(),
      live: groupLive ? structuredClone(groupLive) : null,
    }));
    store.touchpoints.unshift(...created);
    for (const touchpoint of created)
      demoLinkTouchpointDesign(touchpoint.id, body.qrTemplateId);
    return delay(
      clone({
        touchpoints: created,
        propagatedPublications: groupLive ? created.length : 0,
      }),
    );
  }
  if (/\/touchpoints\/[^/]+\/object$/.test(path) && method === "POST") {
    const id = String(path.split("/").at(-2));
    const touchpoint = store.touchpoints.find((item) => item.id === id);
    if (!touchpoint)
      throw new ApiRequestError(
        "No encontramos este QR o etiqueta.",
        404,
        "NOT_FOUND",
      );
    demoUpdateObject(
      id,
      demoKind(touchpoint),
      body as unknown as Parameters<typeof demoUpdateObject>[2],
    );
    return delay(clone(demoTouchpointView(touchpoint)));
  }
  if (/\/touchpoints\/[^/]+\/object\/probe$/.test(path) && method === "POST") {
    const id = String(path.split("/").at(-3));
    const touchpoint = store.touchpoints.find((item) => item.id === id);
    if (!touchpoint)
      throw new ApiRequestError(
        "No encontramos este QR o etiqueta.",
        404,
        "NOT_FOUND",
      );
    const detected = demoProbeObject(
      id,
      Boolean(touchpoint.live) && touchpoint.status === "active",
    );
    return delay(
      clone({
        touchpoint: demoTouchpointView(touchpoint),
        detected,
        source: "analytics",
      }),
    );
  }
  if (/\/touchpoints\/[^/]+\/retire$/.test(path) && method === "POST") {
    const id = path.split("/").at(-2);
    const touchpoint = store.touchpoints.find((item) => item.id === id);
    if (touchpoint) touchpoint.status = "retired";
    return delay(clone(touchpoint && demoTouchpointView(touchpoint)));
  }
  if (/\/touchpoints\/[^/]+\/status$/.test(path)) {
    const id = path.split("/").at(-2);
    const touchpoint = store.touchpoints.find((item) => item.id === id);
    if (touchpoint) touchpoint.status = body.status;
    return delay(clone(touchpoint && demoTouchpointView(touchpoint)));
  }
  if (/\/touchpoints\/[^/]+$/.test(path) && method === "PATCH") {
    const id = path.split("/").at(-1);
    const touchpoint = store.touchpoints.find((item) => item.id === id);
    // Another format is another object: its steps start over (as the API).
    if (touchpoint && body.kind && body.kind !== demoKind(touchpoint)) {
      demoResetObject(String(id));
      demoForgetQrExport(String(id));
    }
    if (touchpoint) Object.assign(touchpoint, body);
    return delay(clone(touchpoint && demoTouchpointView(touchpoint)));
  }
  if (path.endsWith("/experiences/publication-states") && method === "GET") {
    return delay(
      clone(
        store.experiences
          .filter((item) => !item.archivedAt)
          .map((item) => ({
            id: item.id,
            publicationStatus: item.publicationStatus,
            hasUnpublishedChanges: item.hasUnpublishedChanges,
            liveRevision: item.liveRevision,
            liveTouchpointCount: item.liveTouchpointCount,
            draftRevision: item.draftRevision,
          })),
      ),
    );
  }
  if (/\/experiences(\?.*)?$/.test(path) && method === "GET") {
    const archived =
      new URL(path, "http://demo.local").searchParams.get("archived") ===
      "true";
    return delay(
      clone(
        store.experiences.filter(
          (item) => Boolean(item.archivedAt) === archived,
        ),
      ),
    );
  }
  if (path.endsWith("/experiences") && method === "POST") {
    // Design first: a draft may be created without targets.
    const targets = (body.targets as DemoTargets | undefined) ?? {
      touchpointIds: body.touchpointId ? [String(body.touchpointId)] : [],
      groupIds: [],
    };
    const experience = {
      id: crypto.randomUUID(),
      ...body,
      targets,
      touchpointId: targets.touchpointIds[0] ?? null,
      publicationStatus: "draft",
      hasUnpublishedChanges: true,
      liveRevision: null,
      liveTouchpointCount: 0,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    };
    store.experiences.unshift(experience);
    return delay(clone(experience));
  }
  const archiveMatch = /\/experiences\/([^/]+)\/archive$/.exec(path);
  if (archiveMatch) {
    const experience = store.experiences.find(
      (item) => item.id === archiveMatch[1],
    );
    const archivedAt = new Date().toISOString();
    if (experience) experience.archivedAt = archivedAt;
    return delay(
      clone({
        experienceId: archiveMatch[1],
        archivedAt,
        fallbackPublications: 0,
      }),
    );
  }
  const unarchiveMatch = /\/experiences\/([^/]+)\/unarchive$/.exec(path);
  if (unarchiveMatch) {
    const experience = store.experiences.find(
      (item) => item.id === unarchiveMatch[1],
    );
    if (experience) experience.archivedAt = null;
    return delay(clone(experience));
  }
  const duplicateMatch = /\/experiences\/([^/]+)\/duplicate$/.exec(path);
  if (duplicateMatch) {
    const source = store.experiences.find(
      (item) => item.id === duplicateMatch[1],
    );
    const name =
      (body.name as string | undefined)?.trim() ||
      `${(source?.name as string | undefined) ?? "Página"} (copia)`;
    const duplicated = {
      ...structuredClone(source ?? {}),
      id: crypto.randomUUID(),
      name,
      targets: { touchpointIds: [], groupIds: [] },
      publicationStatus: "draft",
      hasUnpublishedChanges: true,
      liveRevision: null,
      liveTouchpointCount: 0,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    };
    store.experiences.unshift(duplicated);
    return delay(clone(duplicated));
  }
  const targetsMatch = /\/experiences\/([^/]+)\/targets$/.exec(path);
  if (targetsMatch) {
    const experience = store.experiences.find(
      (item) => item.id === targetsMatch[1],
    );
    const targets = body as DemoTargets;
    // Like the server: taking every target away is only allowed while
    // nothing serves this Experience.
    if (
      experience &&
      !demoResolvedTouchpoints(targets).length &&
      demoIsLive(experience)
    )
      return demoReject("TARGETS_REQUIRED", 400);
    if (experience) {
      experience.targets = targets;
      experience.touchpointId = targets.touchpointIds[0] ?? null;
    }
    return delay(clone(experience));
  }
  const generationMatch =
    /\/experiences\/([^/]+)\/custom-html\/generations$/.exec(path);
  if (generationMatch && method === "POST") {
    const experience = store.experiences.find(
      (item) => item.id === generationMatch[1],
    );
    // Kardo's AI in the demo: a canned design after a short wait.
    return new Promise((resolve) =>
      window.setTimeout(
        () =>
          resolve(
            clone(
              demoCustomHtmlGeneration(
                experience,
                body.brief as DemoBrief | undefined,
              ),
            ),
          ),
        1_500,
      ),
    );
  }
  const versionMatch = /\/experiences\/([^/]+)\/versions\/([^/]+)$/.exec(path);
  if (versionMatch && method === "GET") {
    const experience = store.experiences.find(
      (item) => item.id === versionMatch[1],
    );
    const version = experience
      ? demoVersions(experience).find((item) => item.id === versionMatch[2])
      : undefined;
    return version
      ? delay(clone(version))
      : Promise.reject(
          new ApiRequestError("No encontramos esa versión.", 404, "NOT_FOUND"),
        );
  }
  const experienceMatch = /\/experiences\/([^/]+)$/.exec(path);
  if (experienceMatch) {
    const experience = store.experiences.find(
      (item) => item.id === experienceMatch[1],
    );
    if (method === "PATCH" && experience) {
      // Same rules as the API (A2-22): a stale revision is refused, a
      // rename alone keeps the content, every save moves the revision on.
      const { expectedDraftRevision, ...changes } = body as {
        expectedDraftRevision?: number;
      } & Record<string, unknown>;
      const current = Number(experience.draftRevision ?? 1);
      if (
        expectedDraftRevision !== undefined &&
        expectedDraftRevision !== current
      )
        throw new ApiRequestError(
          "Alguien más guardó cambios en esta página. Recarga para ver la versión más reciente.",
          409,
          "EXPERIENCE_CHANGED",
        );
      Object.assign(experience, changes, {
        hasUnpublishedChanges: true,
        draftRevision: current + 1,
        updatedAt: new Date().toISOString(),
      });
    }
    return delay(
      clone(
        method === "PATCH"
          ? experience
          : {
              experience,
              versions: demoVersions(experience),
              targets: demoTargets(experience),
            },
      ),
    );
  }
  const publishMatch =
    /\/experiences\/([^/]+)(?:\/versions\/([^/]+))?\/publication-intents$/.exec(
      path,
    );
  if (publishMatch && method === "POST") {
    const experience = store.experiences.find(
      (item) => item.id === publishMatch[1],
    );
    if (!experience) return demoReject("NOT_FOUND", 404);
    // Links redesign (2026-10-04): any type on any Touchpoint, Links too.
    const precedence = demoPublishPlan(experience);
    if (!precedence.publishable.length && !precedence.skipped.length)
      return demoReject("TARGETS_REQUIRED", 400);
    if (!precedence.publishable.length)
      return demoReject("TARGETS_OVERRIDDEN", 409);
    // The same replace guard as the server, rollbacks included (round 4,
    // B1; domain audit A9-5): with a body, a place showing another page is
    // only taken over when listed.
    const replaceTargets = Array.isArray(body.replaceTargets)
      ? (body.replaceTargets as string[])
      : undefined;
    const notConfirmed = replaceTargets
      ? precedence.publishable.filter((touchpoint) => {
          const live = touchpoint.live as DemoLive | null;
          return (
            live &&
            live.experienceId !== experience.id &&
            !replaceTargets.includes(String(touchpoint.id))
          );
        })
      : [];
    const plan = {
      publishable: precedence.publishable.filter(
        (touchpoint) => !notConfirmed.includes(touchpoint),
      ),
      skipped: precedence.skipped,
    };
    if (!plan.publishable.length)
      return demoReject("REPLACE_NOT_CONFIRMED", 409);
    const versions = demoVersions(experience);
    const versionId = publishMatch[2];
    let version = versionId
      ? versions.find((item) => item.id === versionId)
      : undefined;
    if (!version) {
      const revision = (versions[0]?.revision ?? 0) + 1;
      version = {
        id: crypto.randomUUID(),
        revision,
        createdAt: new Date().toISOString(),
        content: structuredClone(experience.content),
        publication: null,
      };
      versions.unshift(version);
      experience.hasUnpublishedChanges = false;
    }
    const publishedVersion = version;
    publishedVersion.publication = {
      id: crypto.randomUUID(),
      revision: publishedVersion.revision,
      status: "pending",
      createdAt: new Date().toISOString(),
      publishedAt: null,
      failureReason: null,
    };
    experience.publicationStatus = "pending";
    // The Publisher is asynchronous: the version goes live a moment later.
    window.setTimeout(
      () => demoCompletePublication(experience, publishedVersion, plan),
      2_500,
    );
    return delay(
      clone({
        versionId: publishedVersion.id,
        versionRevision: publishedVersion.revision,
        publications: plan.publishable.map((touchpoint) => ({
          touchpointId: touchpoint.id,
          publicationId: crypto.randomUUID(),
          revision: publishedVersion.revision,
          status: "pending",
        })),
        skipped: [
          ...plan.skipped.map((entry) => ({
            touchpointId: entry.touchpoint.id,
            touchpointName: entry.touchpoint.operationalName,
            reason: "DIRECT_TARGET_PRECEDENCE",
            liveExperienceName: entry.keeps,
          })),
          ...notConfirmed.map((touchpoint) => ({
            touchpointId: touchpoint.id,
            touchpointName: touchpoint.operationalName,
            reason: "REPLACE_NOT_CONFIRMED",
            liveExperienceName: (touchpoint.live as DemoLive).experienceName,
          })),
        ],
      }),
    );
  }
  if (path.endsWith("/restore")) {
    const id = path.split("/")[5];
    const versionId = path.split("/")[7];
    const experience = store.experiences.find((item) => item.id === id);
    const version = experience
      ? demoVersions(experience).find((item) => item.id === versionId)
      : undefined;
    if (experience && version) {
      experience.content = structuredClone(version.content);
      experience.hasUnpublishedChanges =
        demoVersions(experience)[0] !== version;
      experience.updatedAt = new Date().toISOString();
    }
    return delay(
      clone({
        experience,
        versions: demoVersions(experience),
        targets: demoTargets(experience),
      }),
    );
  }
  if (path.endsWith("/lead-delivery") && method === "GET")
    return delay(clone(store.leadDelivery));
  if (path.endsWith("/lead-delivery") && method === "PUT") {
    store.leadDelivery.notifyEmail = Boolean(body.notifyEmail);
    store.leadDelivery.notifyRecipients =
      (body.notifyRecipients as string[] | undefined) ?? [];
    store.leadDelivery.webhookUrl = (body.webhookUrl as string | null) ?? null;
    const rotated = Boolean(body.rotateWebhookSecret);
    store.leadDelivery.webhookConfigured =
      Boolean(store.leadDelivery.webhookUrl) &&
      (rotated || store.leadDelivery.webhookConfigured);
    return delay(
      clone({
        settings: store.leadDelivery,
        webhookSecret: rotated
          ? "whsec_demo0000000000000000000000000000000000"
          : null,
      }),
    );
  }
  if (path.endsWith("/lead-delivery/test") && method === "POST")
    return delay(
      clone({
        delivered: store.leadDelivery.webhookConfigured,
        status: store.leadDelivery.webhookConfigured ? 200 : null,
      }),
    );
  if (path.endsWith("/upload-authorizations") && method === "POST") {
    const assetId = crypto.randomUUID();
    // Persisted now (quarantined) so the finalization step below can find it.
    store.assets.unshift({
      id: assetId,
      filename: String(body.filename ?? "archivo"),
      mediaType: String(body.mediaType ?? "image/png"),
      byteSize: Number(body.byteSize ?? 0),
      sha256: "0".repeat(64),
      status: "quarantined",
      createdAt: new Date().toISOString(),
    });
    return delay(
      clone({
        assetId,
        uploadUrl: "https://demo.kardo.local/upload",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      }),
    );
  }
  const finalizeMatch = /\/assets\/([^/]+)\/finalizations$/.exec(path);
  if (finalizeMatch) {
    const asset = store.assets.find((item) => item.id === finalizeMatch[1]);
    if (asset) asset.status = "validated";
    return delay(clone(asset));
  }
  const usageMatch = /\/assets\/([^/]+)\/usage$/.exec(path);
  if (usageMatch && method === "GET") {
    // The demo's photo is used by the cafeteria menu, live on a table.
    const experiences =
      usageMatch[1] === "30000000-0000-4000-8000-000000000001"
        ? [
            {
              id: String(store.experiences[0]?.id ?? crypto.randomUUID()),
              name: String(store.experiences[0]?.name ?? "Menú"),
              live: true,
            },
          ]
        : [];
    return delay(clone({ experiences }));
  }
  if (/\/assets\/[^/]+$/.test(path) && method === "PATCH") {
    const id = path.split("/").at(-1);
    const asset = store.assets.find((item) => item.id === id);
    if (!asset)
      throw new ApiRequestError(
        "No encontramos este archivo.",
        404,
        "NOT_FOUND",
      );
    asset.filename = String(body.filename ?? asset.filename).trim();
    return delay(clone(asset));
  }
  if (/\/assets\/[^/]+$/.test(path) && method === "DELETE") {
    const id = path.split("/").at(-1);
    store.assets = store.assets.filter((item) => item.id !== id);
    return delay(undefined as T);
  }
  if (path.endsWith("/assets") && method === "GET")
    return delay(clone(store.assets));
  if (path.endsWith("/dashboard")) {
    if (method === "PUT") {
      store.dashboard = {
        layout: body.layout as DemoDashboard["layout"],
        updatedAt: new Date().toISOString(),
      };
      return delay(clone(store.dashboard));
    }
    if (method === "DELETE") {
      store.dashboard = { layout: null, updatedAt: null };
      return delay(undefined as T);
    }
    return delay(clone(store.dashboard));
  }
  if (path.includes("/analytics/summary")) {
    const params = new URL(path, "http://demo.local").searchParams;
    const days = Number(params.get("days")) || 30;
    return delay(
      clone(
        demoAnalytics(days, {
          groupId: params.get("groupId"),
          touchpointId: params.get("touchpointId"),
        }),
      ),
    );
  }
  if (path.includes("/leads/export"))
    return delay(
      "﻿fecha,touchpoint,nombre,email,telefono,mensaje\r\n" as unknown as T,
    );
  if (path.endsWith("/lead-retention") && method === "GET")
    return delay(clone(store.leadRetention));
  if (path.endsWith("/lead-retention") && method === "PUT") {
    store.leadRetention.days = (body.days as number | null) ?? null;
    return delay(clone(store.leadRetention));
  }
  const leadItemMatch = /\/leads\/([^/]+)$/.exec(path);
  if (leadItemMatch && method === "PATCH") {
    const lead = store.leads.find((item) => item.id === leadItemMatch[1]);
    if (lead) {
      lead.status = body.status;
      lead.updatedAt = new Date().toISOString();
    }
    return delay(clone(lead));
  }
  if (leadItemMatch && method === "DELETE") {
    store.leads = store.leads.filter((item) => item.id !== leadItemMatch[1]);
    return delay(undefined as T);
  }
  if (path.includes("/leads")) {
    const url = new URL(path, "http://demo.local");
    const statusFilter = url.searchParams.get("status");
    const touchpointFilter = url.searchParams.get("touchpointId");
    const items = store.leads.filter(
      (item) =>
        (!statusFilter || item.status === statusFilter) &&
        (!touchpointFilter || item.touchpointId === touchpointFilter),
    );
    return delay(clone({ items, nextCursor: null }));
  }
  // Two-step ownership transfer (ADR 024): requesting returns a pending
  // request; the demo never has one pending to read or accept.
  if (path.endsWith("/ownership-transfer") && method === "POST") {
    return delay(
      clone({
        id: "7a7a7a7a-0000-4000-8000-0000000000de",
        workspaceId: "demo-workspace",
        workspaceName: "Tu negocio (demo)",
        fromProfileId: "e6abf26a-3263-4149-9d75-9b7441165d29",
        fromName: "Demo",
        toProfileId: String(body.profileId),
        toName: "Miembro del equipo",
        status: "pending",
        createdAt: "2026-09-18T09:00:00.000Z",
        isRecipient: false,
      }),
    );
  }
  if (path.endsWith("/ownership-transfers")) {
    return delay(clone([]));
  }
  if (path.endsWith("/ownership-transfer") && method === "GET") {
    return delay(clone(null));
  }
  // Cancel, accept and decline (by id): the demo has none, so just succeed.
  if (path.includes("/ownership-transfer")) {
    return delay(clone(null));
  }
  if (path.endsWith("/members"))
    return delay(
      clone([
        {
          profileId: "e6abf26a-3263-4149-9d75-9b7441165d29",
          displayName: "Demo",
          email: "demo@kardo.test",
          role: "owner",
          joinedAt: "2026-09-16T10:00:00.000Z",
          isCurrentUser: true,
        },
      ]),
    );
  if (path.endsWith("/invitations") && method === "GET")
    return delay(clone([]));
  if (path.endsWith("/invitations") && method === "POST")
    return delay(
      clone({
        invitation: {
          id: crypto.randomUUID(),
          email: body.email,
          role: body.role,
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          createdAt: new Date().toISOString(),
        },
        token: "demo_invitation_token_000000000000000000000",
      }),
    );
  return delay(undefined as T);
}

type DemoTargets = { touchpointIds: string[]; groupIds: string[] };
type DemoLive = {
  experienceId: string;
  experienceName: string;
  experienceType: string;
  revision: number;
  publishedAt: string;
};
type DemoVersion = {
  id: string;
  revision: number;
  createdAt: string;
  content: unknown;
  publication: {
    id: string;
    revision: number;
    status: "pending" | "published" | "superseded" | "failed";
    createdAt: string;
    publishedAt: string | null;
    failureReason: string | null;
  } | null;
};

function demoReject<T>(code: string, status: number): Promise<T> {
  return delay(null).then(() =>
    Promise.reject(
      new ApiRequestError(resolveErrorMessage(status, code), status, code),
    ),
  );
}

function demoTargetsOf(experience: Record<string, unknown>): DemoTargets {
  return (experience.targets ?? {
    touchpointIds: experience.touchpointId ? [experience.touchpointId] : [],
    groupIds: [],
  }) as DemoTargets;
}

/** Physical, non-retired Touchpoints the targets resolve to (groups expanded). */
function demoResolvedTouchpoints(targets: DemoTargets) {
  return store.touchpoints.filter(
    (touchpoint) =>
      touchpoint.status !== "retired" &&
      (targets.touchpointIds.includes(String(touchpoint.id)) ||
        targets.groupIds.includes(String(touchpoint.groupId))),
  );
}

function demoIsLive(experience: Record<string, unknown>): boolean {
  return (
    Number(experience.liveTouchpointCount ?? 0) > 0 ||
    store.touchpoints.some(
      (touchpoint) =>
        (touchpoint.live as DemoLive | null)?.experienceId === experience.id,
    )
  );
}

/**
 * The precedence of a publish, with the panel's own rule (domain audit
 * A9-10): the closest wins, directly or through the nearest group (ADR 021).
 * The demo used to keep a third, simpler copy of it.
 */
function demoPublishPlan(experience: Record<string, unknown>) {
  const plan = planPublication({
    experienceId: String(experience.id),
    targets: demoTargetsOf(experience),
    touchpoints: store.touchpoints as unknown as Touchpoint[],
    experiences: store.experiences as unknown as ExperienceSummary[],
    groups: store.groups as unknown as TouchpointGroup[],
  });
  return {
    publishable: plan.publishable.map(
      (entry) => entry.touchpoint as unknown as Record<string, unknown>,
    ),
    skipped: plan.skipped.map((entry) => ({
      touchpoint: entry.touchpoint as unknown as Record<string, unknown>,
      keeps: entry.keeps,
    })),
  };
}

function demoCompletePublication(
  experience: Record<string, unknown>,
  version: DemoVersion,
  plan: { publishable: Record<string, unknown>[] },
) {
  const publishedAt = new Date().toISOString();
  for (const other of demoVersions(experience))
    if (other !== version && other.publication?.status === "published")
      other.publication.status = "superseded";
  if (version.publication) {
    version.publication.status = "published";
    version.publication.publishedAt = publishedAt;
  }
  const replaced = new Set(
    plan.publishable
      .map((touchpoint) => (touchpoint.live as DemoLive | null)?.experienceId)
      .filter((id): id is string => Boolean(id) && id !== experience.id),
  );
  for (const touchpoint of plan.publishable) {
    touchpoint.live = {
      experienceId: experience.id,
      experienceName: experience.name,
      experienceType: experience.type,
      revision: version.revision,
      publishedAt,
    };
    if (touchpoint.status === "assigned") touchpoint.status = "active";
  }
  const serving = (id: unknown) =>
    store.touchpoints.filter(
      (touchpoint) => (touchpoint.live as DemoLive | null)?.experienceId === id,
    ).length;
  experience.liveTouchpointCount = serving(experience.id);
  // The Experiences these Touchpoints showed before lose them, and stop
  // listing them as direct targets (domain audit A9-4, as the server does).
  const taken = new Set(
    plan.publishable.map((touchpoint) => String(touchpoint.id)),
  );
  for (const item of store.experiences) {
    if (!replaced.has(String(item.id))) continue;
    const targets = demoTargetsOf(item);
    item.targets = {
      touchpointIds: targets.touchpointIds.filter((id) => !taken.has(id)),
      groupIds: targets.groupIds,
    };
    item.liveTouchpointCount = serving(item.id);
    if (!item.liveTouchpointCount && item.publicationStatus === "published")
      item.publicationStatus = "superseded";
  }
  experience.publicationStatus = "published";
  experience.liveRevision = version.revision;
}

function demoTargets(experience: Record<string, unknown> | undefined) {
  if (!experience) return [];
  const targets = demoTargetsOf(experience);
  const plan = demoPublishPlan(experience);
  return demoResolvedTouchpoints(targets).map((touchpoint) => {
    const live = touchpoint.live as DemoLive | null;
    const isLive = live?.experienceId === experience.id;
    const overridden = plan.skipped.some(
      (entry) => entry.touchpoint === touchpoint,
    );
    return {
      touchpointId: touchpoint.id,
      touchpointName: touchpoint.operationalName,
      groupId: touchpoint.groupId ?? null,
      status: isLive
        ? "published"
        : experience.publicationStatus === "pending"
          ? "pending"
          : "draft",
      isLive,
      liveExperienceName:
        live && live.experienceId !== experience.id
          ? live.experienceName
          : null,
      via: targets.touchpointIds.includes(String(touchpoint.id))
        ? "touchpoint"
        : "group",
      overridden,
    };
  });
}

/** Immutable versions per Experience; published seeds start with a history. */
const demoVersionStore = new Map<string, DemoVersion[]>();

function demoVersions(
  experience: Record<string, unknown> | undefined,
): DemoVersion[] {
  if (!experience) return [];
  const id = String(experience.id);
  const known = demoVersionStore.get(id);
  if (known) return known;
  const latest = Number(experience.liveRevision ?? 0);
  const versions: DemoVersion[] =
    experience.publicationStatus === "draft" || !latest
      ? []
      : Array.from({ length: latest }, (_, index) => {
          const revision = latest - index;
          const createdAt = new Date(
            Date.now() - (index + 1) * 86_400_000,
          ).toISOString();
          return {
            id: `${id.slice(0, 24)}${String(revision).padStart(12, "0")}`,
            revision,
            createdAt,
            content: structuredClone(experience.content),
            publication: {
              id: `${id.slice(0, 19)}ffff-${String(revision).padStart(12, "0")}`,
              revision,
              status: index === 0 ? "published" : "superseded",
              createdAt,
              publishedAt: createdAt,
              failureReason: null,
            },
          };
        });
  demoVersionStore.set(id, versions);
  return versions;
}

function demoAnalytics(
  days: number,
  filter: { groupId: string | null; touchpointId: string | null } = {
    groupId: null,
    touchpointId: null,
  },
) {
  const today = new Date();
  // Filters narrow the demo the way the API does: only the selected
  // Touchpoints count, so the numbers shrink in proportion.
  const selected = store.touchpoints.filter((touchpoint) =>
    filter.touchpointId
      ? // Nothing published, nothing visited (as the Resolver counts).
        touchpoint.id === filter.touchpointId && Boolean(touchpoint.live)
      : filter.groupId
        ? touchpoint.groupId === filter.groupId
        : true,
  );
  const share = store.touchpoints.length
    ? selected.length / store.touchpoints.length
    : 1;
  const scale = (value: number) => Math.round(value * share);
  const totalWindow = days * 2;
  // A single continuous synthetic series: the oldest `days` become the
  // "previous" period, the newest `days` become the current one, so both
  // windows share one coherent shape (weekday dips, gentle NFC/QR growth).
  const series = Array.from({ length: totalWindow }, (_, index) => {
    const daysAgo = totalWindow - 1 - index;
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - daysAgo);
    const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const nfc = Math.max(
      0,
      Math.round(8 + 6 * Math.sin(index / 3) + (isWeekend ? 5 : 0)),
    );
    const qr = Math.max(
      0,
      Math.round(5 + 4 * Math.cos(index / 4) + (isWeekend ? 3 : 0)),
    );
    const link = Math.max(0, Math.round(2 + (index % 5)));
    const taps = nfc + qr + link;
    const clicks = Math.round((nfc + qr) * 0.4);
    const leads = Math.max(0, Math.round(taps * 0.12) - (isWeekend ? 1 : 0));
    return {
      date: date.toISOString().slice(0, 10),
      taps: scale(taps),
      clicks: scale(clicks),
      leads: scale(leads),
      channels: { nfc: scale(nfc), qr: scale(qr), link: scale(link) },
    };
  });
  const previousWindow = series.slice(0, days);
  const currentWindow = series.slice(days);
  const daily = currentWindow.map(
    ({ date, taps, clicks, leads, channels }) => ({
      date,
      taps: channels.nfc + channels.qr + channels.link,
      clicks,
      leads,
      channels,
    }),
  );

  const sumOf = (
    rows: typeof currentWindow,
    key: "taps" | "clicks" | "leads",
  ) => rows.reduce((total, row) => total + row[key], 0);
  const channelSum = (rows: typeof currentWindow, key: "nfc" | "qr" | "link") =>
    rows.reduce((total, row) => total + row.channels[key], 0);

  const channels = {
    nfc: channelSum(currentWindow, "nfc"),
    qr: channelSum(currentWindow, "qr"),
    link: channelSum(currentWindow, "link"),
  };
  const taps = channels.nfc + channels.qr + channels.link;
  const clicks = sumOf(currentWindow, "clicks");
  const leads = sumOf(currentWindow, "leads");

  const previous = {
    taps:
      channelSum(previousWindow, "nfc") +
      channelSum(previousWindow, "qr") +
      channelSum(previousWindow, "link"),
    clicks: sumOf(previousWindow, "clicks"),
    leads: sumOf(previousWindow, "leads"),
  };

  const hourly = Array.from({ length: 24 }, (_, index) => {
    const hour = new Date(today);
    hour.setUTCMinutes(0, 0, 0);
    hour.setUTCHours(hour.getUTCHours() - (23 - index));
    const local = (hour.getUTCHours() + 18) % 24;
    return {
      hour: hour.toISOString(),
      taps:
        local >= 8 && local <= 21
          ? scale(Math.round(2 + 3 * Math.sin(local / 3)) + 1)
          : 0,
    };
  });

  // Monday-first, 7 x 24 matrix: quiet overnight, busiest around midday,
  // noticeably lighter on the weekend rows (5 = Saturday, 6 = Sunday).
  const weekdayHour = Array.from({ length: 7 }, (_, day) => {
    const isWeekend = day >= 5;
    return Array.from({ length: 24 }, (_, hour) => {
      if (hour < 7 || hour > 21) return 0;
      const shape = Math.sin(((hour - 7) / 14) * Math.PI);
      const base = isWeekend ? 3 : 6;
      return scale(
        Math.max(0, Math.round(base * shape + (hour === 13 ? 2 : 0))),
      );
    });
  });

  const touchpointCount = Math.max(1, selected.length);
  const touchpoints = selected.map((touchpoint, index) => {
    const share =
      selected.length === 1 ? 1 : index === 0 ? 0.7 : 0.3 / touchpointCount;
    return {
      touchpointId: touchpoint.id,
      name: touchpoint.operationalName,
      // A9-24: this list is «Por QR, etiqueta o link», never only physical.
      kind:
        touchpoint.kind === "link"
          ? ("link" as const)
          : effectiveKind(touchpoint.kind as TouchpointKind | undefined),
      ...(touchpoint.pieceModel
        ? { pieceModel: touchpoint.pieceModel as PieceModel }
        : {}),
      taps: Math.round(taps * share),
      clicks: Math.round(clicks * share),
      leads: Math.round(leads * share),
      channels: {
        nfc: Math.round(channels.nfc * share),
        qr: Math.round(channels.qr * share),
        link: Math.round(channels.link * share),
      },
    };
  });

  // Drafts never published have no traffic.
  const served = store.experiences.filter(
    (experience) => experience.publicationStatus !== "draft",
  );
  const experienceCount = Math.max(1, served.length);
  const experiences = served.map((experience, index) => {
    const share = index === 0 ? 0.8 : 0.2 / experienceCount;
    return {
      experienceId: experience.id,
      name: experience.name,
      type: experience.type,
      taps: Math.round(taps * share),
      clicks: Math.round(clicks * share),
      leads: Math.round(leads * share),
    };
  });

  // A9-26: every group, including those with no visits — the server no
  // longer drops the zeros, so the demo should not either.
  const groupDepth = (groupId: unknown): number => {
    let depth = 0;
    let current = store.groups.find((item) => item.id === groupId);
    const seen = new Set<unknown>();
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      depth += 1;
      current = store.groups.find((item) => item.id === current?.parentId);
    }
    return depth;
  };
  const groups = store.groups.map((group) => {
    const members = touchpoints.filter((touchpoint) =>
      store.touchpoints.some(
        (item) =>
          item.id === touchpoint.touchpointId && item.groupId === group.id,
      ),
    );
    const sum = (key: "taps" | "clicks" | "leads") =>
      members.reduce((total, touchpoint) => total + touchpoint[key], 0);
    return {
      groupId: group.id,
      name: group.name,
      depth: groupDepth(group.id),
      taps: sum("taps"),
      clicks: sum("clicks"),
      leads: sum("leads"),
    };
  });

  // Previous period, day by day (aligned with `daily`), and its channels.
  const previousDaily = previousWindow.map((day) => ({
    date: day.date,
    taps: day.channels.nfc + day.channels.qr + day.channels.link,
    clicks: day.clicks,
    leads: day.leads,
  }));
  const previousChannels = {
    nfc: channelSum(previousWindow, "nfc"),
    qr: channelSum(previousWindow, "qr"),
    link: channelSum(previousWindow, "link"),
  };
  const clickChannels = {
    nfc: Math.round(clicks * 0.6),
    qr: Math.round(clicks * 0.3),
    link: clicks - Math.round(clicks * 0.6) - Math.round(clicks * 0.3),
  };

  // Indicators the same way the API derives them (services/customer-api
  // analytics-kpis.ts), so the demo exercises every widget.
  const rate = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
  const hoursOfDay = Array.from({ length: 24 }, (_, hour) =>
    weekdayHour.reduce((sum, row) => sum + (row[hour] ?? 0), 0),
  );
  const argmax = (values: number[]) => {
    const best = Math.max(...values);
    return best > 0 ? values.indexOf(best) : null;
  };
  const peakHour = argmax(hoursOfDay);
  const channelKeys = ["nfc", "qr", "link"] as const;
  const topOf = (counts: { nfc: number; qr: number; link: number }) => {
    const index = argmax(channelKeys.map((key) => counts[key]));
    return index === null ? null : channelKeys[index];
  };
  const top = topOf(channels);
  const active = selected.filter(
    (touchpoint) => touchpoint.status === "active",
  );
  const reached = touchpoints.filter(
    (item) =>
      item.taps > 0 &&
      active.some((touchpoint) => touchpoint.id === item.touchpointId),
  ).length;
  const peakDay = daily.reduce<{ date: string; taps: number } | null>(
    (best, day) => (day.taps > (best?.taps ?? 0) ? day : best),
    null,
  );
  const kpis = {
    taps: { value: taps, previous: previous.taps },
    clicks: { value: clicks, previous: previous.clicks },
    leads: { value: leads, previous: previous.leads },
    conversionRate: {
      value: rate(leads, taps),
      previous: previous.taps > 0 ? rate(previous.leads, previous.taps) : null,
    },
    interactionRate: {
      value: rate(clicks, taps),
      previous: previous.taps > 0 ? rate(previous.clicks, previous.taps) : null,
    },
    dailyAverage: { value: taps / days, previous: previous.taps / days },
    touchpoints: {
      active: active.length,
      total: selected.filter((touchpoint) => touchpoint.status !== "retired")
        .length,
    },
    reachedTouchpoints: { value: reached, previous: Math.max(0, reached - 1) },
    peakHour: {
      hour: peakHour,
      share:
        peakHour === null
          ? 0
          : rate(
              hoursOfDay[peakHour] ?? 0,
              hoursOfDay.reduce((sum, value) => sum + value, 0),
            ),
      previousHour: peakHour === null ? null : (peakHour + 23) % 24,
    },
    topChannel: {
      channel: top,
      share: top ? rate(channels[top], taps) : 0,
      previousChannel: topOf(previousChannels),
    },
    peakDay: { date: peakDay?.date ?? null, taps: peakDay?.taps ?? 0 },
  };

  return {
    source: "analytics_engine",
    days,
    generatedAt: today.toISOString(),
    timezone: "America/Mexico_City",
    previous: { ...previous, channels: previousChannels },
    previousDaily,
    kpis,
    activeTouchpoints: active.length,
    totals: { taps, clicks, leads, channels, clickChannels },
    daily,
    hourly,
    weekdayHour,
    touchpoints,
    experiences,
    groups,
  };
}

let demoKeep: Set<string> | null = null;

/** With ?demo-bajada=1, what was left out of «Qué sigue activo». */
function demoPlanExcluded(item: Record<string, unknown>): boolean {
  return (
    demoKeep !== null &&
    item.status !== "retired" &&
    !demoKeep.has(String(item.id))
  );
}

function demoPlanSelection(
  _path: string,
  method: string,
  body: Record<string, unknown>,
) {
  const downgrade =
    typeof window !== "undefined" &&
    /[?&]demo-bajada=1/.test(window.location.search + window.location.hash);
  const live = store.touchpoints.filter((item) => item.status !== "retired");
  const touchpointLimit = downgrade ? Math.max(live.length - 2, 1) : null;
  if (method === "PUT") {
    demoKeep = new Set((body.keep as string[] | undefined) ?? []);
    return {
      excluded: live.filter((item) => !demoKeep?.has(String(item.id))).length,
      included: 0,
    };
  }
  return {
    overage: downgrade
      ? {
          planCode: "esencial",
          planName: "Esencial",
          chooseBy: new Date(Date.now() + 9 * 86_400_000).toISOString(),
          chosenAt: demoKeep ? new Date().toISOString() : null,
          appliedAt: demoKeep ? new Date().toISOString() : null,
          resolved: false,
        }
      : null,
    limits: { touchpoints: touchpointLimit, links: downgrade ? 2 : null },
    candidates: live.map((item, index) => ({
      id: item.id,
      publicId: item.publicId,
      kind: "touchpoint",
      format: item.physicalType === "card" ? "nfc" : "qr",
      name: item.operationalName ?? null,
      excluded: demoKeep ? !demoKeep.has(String(item.id)) : false,
      visits: Math.max(240 - index * 37, 3),
    })),
  };
}
