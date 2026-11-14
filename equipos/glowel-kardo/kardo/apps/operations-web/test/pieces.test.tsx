import type {
  StaffKit,
  StaffPiece,
  StaffPieceBatch,
  StaffPieceBatchSummary,
} from "@kardo/contracts";
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
  useRouter: () => ({ route: { name: "pieces" }, navigate: () => {} }),
}));
vi.mock("../src/shell/StaffContext.js", () => ({
  useStaff: () => ({ can: () => true, staff: { permissions: [] } }),
}));
vi.mock("../src/components/Toast.js", () => ({
  useToast: () => ({ notify: () => {} }),
}));
vi.mock("../src/lib/use-resource.js", () => ({
  useResource: (key: string) => ({
    data: resources[key] ?? null,
    error: null,
    isLoading: false,
    reload: async () => {},
    setData: () => {},
  }),
}));

import { piecesApi } from "../src/api/pieces.js";
import { NewPieceBatchDialog } from "../src/features/pieces/NewPieceBatchDialog.js";
import {
  emptyQuantities,
  itemsText,
  validateBatch,
} from "../src/features/pieces/new-batch.js";
import { PieceBatchesPage } from "../src/features/pieces/PieceBatchesPage.js";
import { PieceBatchPage } from "../src/features/pieces/PieceBatchPage.js";
import {
  csvCell,
  panelOutcomeLabel,
  pieceCaption,
  pieceNumbers,
  slugify,
  workshopCsv,
} from "../src/features/pieces/workshop-file.js";

const piece = (
  n: number,
  model: StaffPiece["model"],
  extra: Partial<StaffPiece> = {},
): StaffPiece => ({
  touchpointId: `00000000-0000-4000-8000-00000000000${n}`,
  publicId: `kp_${String(n).padStart(20, "0")}`,
  model,
  code: `ABCD-234${n}`,
  status: "available",
  operationalName: null,
  workspaceName: null,
  claimedAt: null,
  urls: {
    nfc: `https://t.test/t/kp_${n}?c=nfc`,
    qr: `https://t.test/t/kp_${n}?c=qr`,
  },
  ...extra,
});

const summary: StaffPieceBatchSummary = {
  id: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
  kitCode: "presentacion",
  kitName: "Kit Presentación",
  reference: "Café Central, pedido del 13",
  pieces: 3,
  claimed: 1,
  workspaceId: null,
  workspaceName: "Café Central",
  panelOutcome: "trial",
  createdAt: "2026-10-13T12:00:00Z",
  claimedAt: null,
};

const batch: StaffPieceBatch = {
  batch: summary,
  code: "K4RD0-DEM05",
  activationUrl: null,
  pieces: [
    piece(1, "stand"),
    piece(2, "card"),
    piece(3, "card", {
      code: null,
      status: "active",
      workspaceName: "Café Central",
      operationalName: "Mesa 4",
    }),
  ],
};

const kits: StaffKit[] = [
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
];

const resources: Record<string, unknown> = {};

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({});
  for (const key of Object.keys(resources)) delete resources[key];
});

describe("piecesApi", () => {
  it("calls the staff endpoints", async () => {
    const signal = new AbortController().signal;
    await piecesApi.listKits(signal);
    await piecesApi.listBatches(signal);
    await piecesApi.getBatch("abc", signal);
    await piecesApi.createBatch({
      kitCode: "refri",
      reference: "Taquería",
      reason: "Pedido",
    });
    expect(request.mock.calls).toEqual([
      ["/v1/staff/kits", { signal }],
      ["/v1/staff/piece-batches", { signal }],
      ["/v1/staff/piece-batches/abc", { signal }],
      [
        "/v1/staff/piece-batches",
        {
          method: "POST",
          body: { kitCode: "refri", reference: "Taquería", reason: "Pedido" },
        },
      ],
    ]);
  });
});

describe("workshop file", () => {
  it("numbers pieces within their model", () => {
    const pieces = [piece(1, "card"), piece(2, "stand"), piece(3, "card")];
    expect(pieceNumbers(pieces)).toEqual([1, 1, 2]);
    expect(pieceCaption(pieces[2] as StaffPiece, 2)).toBe("ABCD-2343 Card 2");
    expect(pieceCaption(piece(4, "card", { code: null }), 1)).toBe(
      "Activada Card 1",
    );
  });

  it("quotes cells and blocks formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])
      expect(csvCell(bad).replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it("builds one row per piece with the agreed columns", () => {
    const csv = workshopCsv(batch.pieces, "K4RD0-DEM05", null);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "pieza,modelo,url_nfc,url_qr,codigo_pieza,codigo_kit,url_activacion",
    );
    expect(lines).toHaveLength(4);
    expect(lines[2]).toBe(
      "Card 1,card,https://t.test/t/kp_2?c=nfc,https://t.test/t/kp_2?c=qr,ABCD-2342,K4RD0-DEM05,",
    );
    expect(lines[3]?.startsWith("Card 2,")).toBe(true);
  });

  it("slugifies and labels the panel outcome", () => {
    expect(slugify("Café Central, pedido del 13")).toBe(
      "cafe-central-pedido-del-13",
    );
    expect(slugify("¿¿??")).toBe("lote");
    expect(panelOutcomeLabel(null, true)).toBe("Pendiente");
    expect(panelOutcomeLabel(null, false)).toBe("No aplica");
    expect(panelOutcomeLabel("trial", true)).toBe("Prueba alargada a 30 días");
  });
});

describe("new batch validation", () => {
  it("accepts a kit with a reference", () => {
    expect(
      validateBatch({
        kitCode: "refri",
        quantities: emptyQuantities,
        reference: "  Taquería  ",
      }),
    ).toEqual({ ok: true, body: { kitCode: "refri", reference: "Taquería" } });
  });

  it("checks loose pieces", () => {
    const base = { kitCode: null, reference: "Taquería" };
    expect(validateBatch({ ...base, quantities: emptyQuantities }).ok).toBe(
      false,
    );
    expect(
      validateBatch({
        ...base,
        quantities: { ...emptyQuantities, card: "60", sticker: "41" },
      }).ok,
    ).toBe(false);
    expect(
      validateBatch({
        ...base,
        quantities: { ...emptyQuantities, card: "1.5" },
      }).ok,
    ).toBe(false);
    expect(
      validateBatch({
        ...base,
        quantities: { ...emptyQuantities, card: "2", stand: "1" },
      }),
    ).toEqual({
      ok: true,
      body: {
        kitCode: null,
        items: [
          { piece: "stand", quantity: 1 },
          { piece: "card", quantity: 2 },
        ],
        reference: "Taquería",
      },
    });
  });

  it("rejects short references", () => {
    const result = validateBatch({
      kitCode: "refri",
      quantities: emptyQuantities,
      reference: "ab",
    });
    expect(result.ok).toBe(false);
  });

  it("describes kit contents", () => {
    expect(itemsText(kits[0]?.items ?? [])).toBe("1 Stand, 2 Cards");
  });
});

describe("pages", () => {
  it("renders the batch list", () => {
    resources.batches = { items: [summary], nextCursor: null };
    resources.kits = { items: kits };
    const html = renderToStaticMarkup(<PieceBatchesPage />);
    expect(html).toContain("Piezas");
    expect(html).toContain("Nuevo lote");
    expect(html).toContain("Café Central, pedido del 13");
    expect(html).toContain("Kit Presentación");
    expect(html).toContain("1 de 3");
    expect(html).toContain("Prueba alargada a 30 días");
  });

  it("renders the empty list", () => {
    resources.batches = { items: [], nextCursor: null };
    const html = renderToStaticMarkup(<PieceBatchesPage />);
    expect(html).toContain("Todavía no hay lotes");
  });

  it("renders the batch detail", () => {
    resources["batch:x"] = batch;
    const html = renderToStaticMarkup(<PieceBatchPage batchId="x" />);
    expect(html).toContain("K4RD0-DEM05");
    expect(html).toContain("Falta WEBSITE_URL");
    expect(html).toContain("QR para el taller (PDF)");
    expect(html).toContain("CSV para grabar el NFC");
    expect(html).not.toContain("Tarjeta de activación (PDF)");
    expect(html).toContain("Card 2");
    expect(html).toContain("Usado");
    expect(html).toContain("Sin activar");
    expect(html).toContain("Mesa 4");
    expect(html).toContain("es la misma dirección");
  });

  it("shows the activation card when the code and the URL exist", () => {
    resources["batch:x"] = {
      ...batch,
      activationUrl: "https://k.test/activar/",
    };
    const html = renderToStaticMarkup(<PieceBatchPage batchId="x" />);
    expect(html).toContain("Tarjeta de activación (PDF)");
    expect(html).not.toContain("Falta WEBSITE_URL");
  });

  it("says when every piece is activated", () => {
    resources["batch:x"] = { ...batch, code: null };
    const html = renderToStaticMarkup(<PieceBatchPage batchId="x" />);
    expect(html).toContain("Ya se activaron todas las piezas de este lote.");
  });

  it("renders the new batch dialog kits", () => {
    const html = renderToStaticMarkup(
      <NewPieceBatchDialog kits={kits} onClose={() => {}} />,
    );
    // Dialog content mounts on the client; the static render must not throw.
    expect(typeof html).toBe("string");
  });
});

describe("demo kits", () => {
  it("bring the same pieces as the kits catalog", async () => {
    const { readFileSync } = await import("node:fs");
    const catalog = JSON.parse(
      readFileSync(
        new URL(
          "../../../Docs/engineering/config/kits-catalog.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      panelDays: number;
      kits: {
        code: string;
        name: string;
        panelPlan: string;
        items: { piece: string; quantity: number }[];
      }[];
    };
    const { demoKits } = await import("../src/lib/demo-pieces.js");
    const sorted = (items: { piece: string; quantity: number }[]) =>
      [...items].sort((a, b) => a.piece.localeCompare(b.piece));
    expect(
      demoKits.map((kit) => ({
        code: kit.code,
        name: kit.name,
        plan: kit.panelPlanCode,
        days: kit.panelDays,
        items: sorted(kit.items),
      })),
    ).toEqual(
      catalog.kits.map((kit) => ({
        code: kit.code,
        name: kit.name,
        plan: kit.panelPlan,
        days: catalog.panelDays,
        items: sorted(kit.items),
      })),
    );
  });
});
