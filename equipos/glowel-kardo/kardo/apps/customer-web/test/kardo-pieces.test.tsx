import type { KardoPieceClaimPreview, Touchpoint } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  effectiveKind,
  formatKinds,
  physicalTouchpointKinds,
} from "../src/features/touchpoints/kind.js";
import { KindStep } from "../src/features/touchpoints/NewTouchpointDialog.js";
import { suggestPieceNames } from "../src/features/touchpoints/naming.js";
import {
  objectFlow,
  objectStateView,
} from "../src/features/touchpoints/object-steps.js";
import {
  PieceCodeStep,
  PieceDoneSummary,
  PiecePickStep,
} from "../src/features/touchpoints/pieces/KardoPieceFlow.js";
import {
  pieceKindLabel,
  pieceModelOf,
} from "../src/features/touchpoints/pieces/PieceThumb.js";
import {
  activateLabel,
  claimProblem,
  codeHint,
  codeIsComplete,
  draftWithCode,
  emptyPieceDraft,
  formatCodeInput,
  loadPieceDraft,
  panelSentence,
  piecesToActivate,
  previewHeadline,
  savePieceDraft,
} from "../src/features/touchpoints/pieces/piece-flow-model.js";
import {
  piecesSummary,
  pieceViews,
} from "../src/features/touchpoints/pieces/pieces.js";
import { demoPieceClaim, demoPiecePreview } from "../src/lib/demo/pieces.js";
import { pieceCodeFrom } from "../src/lib/pending-piece-code.js";
import { parseRoute, routePath } from "../src/lib/router.js";

const workspaceId = "f6399f75-b398-41cd-a299-92b6d236c1fd";
const stand = "7c1e0a52-1a2b-4c3d-8e4f-5a6b7c8d9e01";
const card1 = "7c1e0a52-1a2b-4c3d-8e4f-5a6b7c8d9e02";
const card2 = "7c1e0a52-1a2b-4c3d-8e4f-5a6b7c8d9e03";

function preview(
  patch: Partial<KardoPieceClaimPreview> = {},
): KardoPieceClaimPreview {
  return {
    scope: "kit",
    pieces: [
      { touchpointId: stand, model: "stand" },
      { touchpointId: card1, model: "card" },
      { touchpointId: card2, model: "card" },
    ],
    alreadyActive: 0,
    kit: {
      kitCode: "presentacion",
      kitName: "Kit Presentación",
      planCode: "profesional",
      planName: "Profesional",
      days: 30,
      pending: true,
      outcome: "trial",
    },
    limit: { limit: 60, usage: 5, fits: 3 },
    planRequired: false,
    ...patch,
  };
}

const store = new Map<string, string>();
function browser() {
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}
afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

describe("«Producto de Kardo» is the fourth kind (ADR 026)", () => {
  it("shows NFC, QR, Otro and Producto de Kardo", () => {
    expect(physicalTouchpointKinds).toEqual(["nfc", "qr", "other", "kardo"]);
    const html = renderToStaticMarkup(
      <KindStep kind={null} onPick={() => {}} />,
    );
    for (const label of ["NFC", "QR", "Otro", "Producto de Kardo"])
      expect(html).toContain(label);
  });

  it("never offers a piece as a format to switch to, nor reads it as a QR", () => {
    expect(formatKinds).toEqual(["nfc", "qr", "other"]);
    expect(effectiveKind("kardo")).toBe("kardo");
  });

  it("names a piece by its model, with its picture", () => {
    const piece = { kind: "kardo", pieceModel: "magnet" } as Pick<
      Touchpoint,
      "kind" | "pieceModel"
    >;
    expect(pieceModelOf(piece)).toBe("magnet");
    expect(pieceModelOf({ kind: "qr", pieceModel: null })).toBeNull();
    expect(pieceKindLabel("card")).toBe("Card de Kardo");
    expect(typeof pieceViews.sticker.art).toBe("string");
    expect(piecesSummary(["magnet", "sticker", "magnet", "stand"])).toBe(
      "1 Stand, 2 Magnets, 1 Sticker",
    );
  });
});

describe("the activation code", () => {
  it("is typed the way it is printed", () => {
    expect(formatCodeInput("abcd2345")).toBe("ABCD-2345");
    expect(formatCodeInput("abcde23456")).toBe("ABCDE-23456");
    // I, L and O read as 1, 1 and 0; U and symbols never stay.
    expect(formatCodeInput("ilo0-u12")).toBe("1100-12");
    expect(formatCodeInput("abc")).toBe("ABC");
    expect(codeIsComplete("ABCD-2345")).toBe(true);
    expect(codeIsComplete("ABCD-234")).toBe(false);
  });

  it("says where the code is for the piece picked", () => {
    expect(codeHint("card")).toContain("atrás de tu Card");
    expect(codeHint("kit")).toContain("tarjeta de activación");
  });

  it("arrives from the activation card's QR through /activar", () => {
    expect(
      parseRoute({ pathname: "/activar", search: "?codigo=abcde-23456" }),
    ).toEqual({
      name: "activate-piece",
      code: "ABCDE23456",
    });
    expect(
      parseRoute({ pathname: "/activar", search: "?codigo=nope" }),
    ).toEqual({
      name: "activate-piece",
    });
    expect(routePath({ name: "activate-piece", code: "ABCDE23456" })).toBe(
      "/activar?codigo=ABCDE-23456",
    );
    expect(
      pieceCodeFrom({ pathname: "/activar/", search: "?codigo=ABCD-2345" }),
    ).toBe("ABCD2345");
    expect(
      pieceCodeFrom({ pathname: "/registro", search: "?codigo=ABCD-2345" }),
    ).toBeNull();
  });

  it("starts on the code step when the code came with the address", () => {
    const draft = draftWithCode(workspaceId, "abcde23456");
    expect(draft.step).toBe("code");
    expect(draft.code).toBe("ABCDE-23456");
  });
});

describe("the names, the plan and the group", () => {
  it("names a lone piece by its model and numbers several", () => {
    expect(suggestPieceNames(["stand", "card", "card"])).toEqual([
      "Stand",
      "Card 1",
      "Card 2",
    ]);
    // A name in use is skipped.
    expect(suggestPieceNames(["card"], ["Card"])).toEqual(["Card 2"]);
    expect(suggestPieceNames(["magnet", "magnet"], ["Magnet 1"])).toEqual([
      "Magnet 2",
      "Magnet 3",
    ]);
  });

  it("activates what is checked, with the names the owner wrote", () => {
    const draft = {
      ...emptyPieceDraft(workspaceId),
      names: { [card2]: "Recepción" },
      skipped: [card1],
    };
    expect(piecesToActivate(preview(), draft, [])).toEqual([
      { touchpointId: stand, model: "stand", name: "Stand" },
      { touchpointId: card2, model: "card", name: "Recepción" },
    ]);
    expect(activateLabel(2)).toBe("Activar 2 piezas");
    expect(activateLabel(1)).toBe("Activar pieza");
  });

  it("says clearly when they do not fit, and never activates half", () => {
    const draft = emptyPieceDraft(workspaceId);
    expect(claimProblem(preview(), draft, [])).toBeNull();
    expect(
      claimProblem(
        preview({ limit: { limit: 15, usage: 13, fits: 2 } }),
        draft,
        [],
      ),
    ).toContain("lugar para 2 piezas más");
    // Leaving one for later makes them fit.
    expect(
      claimProblem(
        preview({ limit: { limit: 15, usage: 13, fits: 2 } }),
        { ...draft, skipped: [card2] },
        [],
      ),
    ).toBeNull();
    expect(claimProblem(preview({ planRequired: true }), draft, [])).toContain(
      "no tiene plan",
    );
    expect(
      claimProblem(preview(), { ...draft, skipped: [stand, card1, card2] }, []),
    ).toContain("al menos una");
    expect(
      claimProblem(preview(), { ...draft, names: { [stand]: "  " } }, []),
    ).toContain("nombre");
    expect(
      claimProblem(preview(), { ...draft, groupMode: "new" }, []),
    ).toContain("grupo");
  });

  it("says what the kit does to the panel before activating", () => {
    expect(panelSentence(preview())).toContain(
      "30 días del panel con Profesional",
    );
    expect(
      panelSentence(
        preview({ kit: { ...preview().kit!, outcome: "subscription" } }),
      ),
    ).toContain("no lo cambia");
    expect(
      panelSentence(preview({ kit: { ...preview().kit!, pending: false } })),
    ).toBeNull();
    expect(previewHeadline(preview())).toBe(
      "Kit Presentación: 1 Stand, 2 Cards",
    );
  });
});

describe("a reload comes back to the same step", () => {
  it("keeps the draft of this tab, only for its organization", () => {
    browser();
    const draft = {
      ...emptyPieceDraft(workspaceId),
      step: "name" as const,
      code: "abcd2345",
      choice: "card" as const,
    };
    savePieceDraft(draft);
    expect(loadPieceDraft(workspaceId)).toMatchObject({
      step: "name",
      code: "ABCD-2345",
      choice: "card",
    });
    expect(loadPieceDraft("0f6e8a35-8f2b-4b9b-9a8b-1f9b2a3c4d5e")).toBeNull();
  });

  it("ignores anything odd in storage", () => {
    browser();
    store.set(
      "kardo.new-piece",
      JSON.stringify({
        workspaceId,
        step: "hack",
        choice: "phone",
        skipped: [1],
      }),
    );
    expect(loadPieceDraft(workspaceId)).toMatchObject({
      step: "piece",
      choice: null,
      skipped: [],
    });
  });
});

describe("the steps' views", () => {
  it("shows the four pieces like the site, and the kit", () => {
    const html = renderToStaticMarkup(
      <PiecePickStep choice={null} onPick={() => {}} />,
    );
    for (const name of [
      "Stand",
      "Card",
      "Magnet",
      "Sticker",
      "10 × 15 cm",
      "Compré un kit o varias piezas",
    ])
      expect(html).toContain(name);
  });

  it("asks for the code with where it is", () => {
    const html = renderToStaticMarkup(
      <PieceCodeStep
        busy={false}
        choice="magnet"
        code="ABCD"
        error={null}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Escribe el código de activación");
    expect(html).toContain("atrás de tu Magnet");
  });

  it("ends with the pieces and the panel's new end", () => {
    const html = renderToStaticMarkup(
      <PieceDoneSummary
        result={{
          touchpoints: [
            {
              id: stand,
              publicId: "kp_Ab3dEf6hIj9kLm2nOp4q",
              operationalName: "Stand",
              physicalType: "card",
              kind: "kardo",
              pieceModel: "stand",
              status: "assigned",
              live: null,
            },
          ],
          panel: {
            outcome: "trial",
            planCode: "profesional",
            endsAt: "2026-11-12T18:00:00.000Z",
          },
        }}
      />,
    );
    expect(html).toContain("«Stand» ya está activada");
    expect(html).toContain("Tu panel queda activo hasta el");
  });
});

describe("«Conecta el objeto» for a piece", () => {
  it("arrives ready: only testing and placing are left", () => {
    const touchpoint = {
      id: stand,
      publicId: "kp_Ab3dEf6hIj9kLm2nOp4q",
      operationalName: "Stand",
      physicalType: "card",
      kind: "kardo",
      pieceModel: "stand",
      status: "assigned",
      live: null,
      object: {
        state: "ready",
        preparedAt: "2026-10-13T12:00:00.000Z",
        testedAt: null,
        backupAt: null,
        placedAt: null,
        downloadedAt: null,
        replacingAt: null,
        replaceReadyAt: null,
        replacePreparedAt: null,
        replaceTestedAt: null,
      },
    } as Touchpoint;
    const flow = objectFlow(touchpoint);
    expect(flow.steps.map((step) => step.label)).toEqual([
      "Lista",
      "Probar",
      "Colocar",
    ]);
    expect(flow.current).toBe(1);
    expect(objectStateView(touchpoint).label).toBe("Lista");
  });
});

describe("the demo's codes", () => {
  it("opens a kit with its 30 days once, and refuses anything else", () => {
    const first = demoPiecePreview("K4RD0-DEM05", 5);
    expect(first.pieces).toHaveLength(3);
    expect(first.kit?.pending).toBe(true);
    expect(() => demoPiecePreview("ZZZZ-ZZZZ", 5)).toThrow();
    const done = demoPieceClaim(
      "K4RD0-DEM05",
      first.pieces.map((piece) => ({
        touchpointId: piece.touchpointId,
        name: "Pieza",
      })),
      null,
    );
    expect(done.panel?.outcome).toBe("trial");
    expect(() => demoPiecePreview("K4RD0-DEM05", 5)).toThrow();
  });
});
