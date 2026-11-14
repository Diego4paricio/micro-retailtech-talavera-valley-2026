// Demo data for the Piezas section (VITE_DEMO_MODE only).
import type {
  StaffCreatePieceBatch,
  StaffKit,
  StaffPiece,
  StaffPieceBatch,
  StaffPieceBatchSummary,
} from "@kardo/contracts";

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    window.setTimeout(() => resolve(structuredClone(value)), 200),
  );
}

/** Same contents as Docs/engineering/config/kits-catalog.json (a test
 * compares them); prices are not part of what Operations sees. */
export const demoKits: StaffKit[] = [
  {
    code: "mostrador",
    name: "Kit Mostrador",
    panelPlanCode: "profesional",
    panelDays: 30,
    items: [
      { piece: "stand", quantity: 1 },
      { piece: "sticker", quantity: 2 },
    ],
  },
  {
    code: "presentacion",
    name: "Kit Presentación",
    panelPlanCode: "profesional",
    panelDays: 30,
    items: [
      { piece: "stand", quantity: 1 },
      { piece: "card", quantity: 2 },
    ],
  },
  {
    code: "refri",
    name: "Kit Refri",
    panelPlanCode: "profesional",
    panelDays: 30,
    items: [
      { piece: "magnet", quantity: 25 },
      { piece: "sticker", quantity: 2 },
    ],
  },
  {
    code: "completo",
    name: "Kit Completo",
    panelPlanCode: "negocio",
    panelDays: 30,
    items: [
      { piece: "stand", quantity: 1 },
      { piece: "card", quantity: 1 },
      { piece: "magnet", quantity: 10 },
      { piece: "sticker", quantity: 5 },
    ],
  },
];

const batchId = "a0000000-0000-4000-8000-000000000001";
const site = "https://t.kardo.example/t";

function piece(
  index: number,
  model: StaffPiece["model"],
  code: string,
): StaffPiece {
  const publicId = `kp_DemoPieza${String(index).padStart(9, "0")}`;
  return {
    touchpointId: `a1000000-0000-4000-8000-00000000000${index}`,
    publicId,
    model,
    code,
    status: "available",
    operationalName: null,
    workspaceName: null,
    claimedAt: null,
    urls: {
      nfc: `${site}/${publicId}?src=nfc`,
      qr: `${site}/${publicId}?src=qr`,
    },
  };
}

const demoBatch: StaffPieceBatch = {
  batch: {
    id: batchId,
    kitCode: "presentacion",
    kitName: "Kit Presentación",
    reference: "Café Central, pedido del 13",
    pieces: 3,
    claimed: 0,
    workspaceId: null,
    workspaceName: null,
    panelOutcome: null,
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    claimedAt: null,
  },
  code: "K4RD0-DEM05",
  activationUrl: "https://kardo.example/activar/?codigo=K4RD0-DEM05",
  pieces: [
    piece(1, "stand", "DEM0-0001"),
    piece(2, "card", "DEM0-0002"),
    piece(3, "card", "DEM0-0003"),
  ],
};

const created: StaffPieceBatch[] = [];

export function demoPiecesRequest(
  path: string,
  method: string,
  body: unknown,
): Promise<unknown> | null {
  const { pathname } = new URL(path, "https://demo.local");
  if (pathname === "/v1/staff/kits") return delay({ items: demoKits });
  if (pathname === "/v1/staff/piece-batches") {
    if (method === "POST") {
      const input = body as StaffCreatePieceBatch;
      const kit = demoKits.find((item) => item.code === input.kitCode) ?? null;
      const items = kit ? kit.items : (input.items ?? []);
      const pieces: StaffPiece[] = [];
      for (const item of items)
        for (let n = 0; n < item.quantity; n++)
          pieces.push(
            piece(
              pieces.length + 1,
              item.piece,
              `DEM${created.length}-${String(pieces.length + 1).padStart(4, "0")}`,
            ),
          );
      const batch: StaffPieceBatch = {
        batch: {
          id: `a0000000-0000-4000-8000-0000000001${String(created.length).padStart(2, "0")}`,
          kitCode: kit?.code ?? null,
          kitName: kit?.name ?? null,
          reference: input.reference,
          pieces: pieces.length,
          claimed: 0,
          workspaceId: null,
          workspaceName: null,
          panelOutcome: null,
          createdAt: new Date().toISOString(),
          claimedAt: null,
        },
        code: kit ? `K4RD${created.length}-DEM0${created.length}` : null,
        activationUrl: kit
          ? "https://kardo.example/activar/?codigo=K4RD0-DEM05"
          : null,
        pieces,
      };
      created.unshift(batch);
      return delay(batch);
    }
    const summaries: StaffPieceBatchSummary[] = [
      ...created.map((item) => item.batch),
      demoBatch.batch,
    ];
    return delay({ items: summaries, nextCursor: null });
  }
  const match = /^\/v1\/staff\/piece-batches\/([^/]+)$/.exec(pathname);
  if (match) {
    const found = [...created, demoBatch].find(
      (item) => item.batch.id === match[1],
    );
    return found ? delay(found) : delay(demoBatch);
  }
  return null;
}
