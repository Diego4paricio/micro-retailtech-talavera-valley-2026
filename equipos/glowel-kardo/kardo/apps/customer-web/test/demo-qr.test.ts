import { describe, expect, it } from "vitest";
import {
  demoForgetQrExport,
  demoQrLastExportAt,
  handleQrDemo,
} from "../src/lib/demo/qr.js";

/**
 * The demo answers like the API (relevo 38): the nearest group up the tree
 * gives its design (ADR 021), an NFC carries its backup QR's design, and a
 * download is recorded only for live codes.
 */
const ids = {
  qr: "11111111-1111-4111-8111-111111111111",
  nfc: "22222222-2222-4222-8222-222222222222",
  other: "33333333-3333-4333-8333-333333333333",
  retired: "44444444-4444-4444-8444-444444444444",
  parent: "55555555-5555-4555-8555-555555555555",
  child: "66666666-6666-4666-8666-666666666666",
};
const touchpoints: Record<
  string,
  { groupId: string | null; kind: string; status: string }
> = {
  [ids.qr]: { groupId: ids.child, kind: "qr", status: "active" },
  [ids.nfc]: { groupId: null, kind: "nfc", status: "active" },
  [ids.other]: { groupId: null, kind: "other", status: "active" },
  [ids.retired]: { groupId: null, kind: "qr", status: "retired" },
};
const groups: Record<string, { name: string; parentId: string | null }> = {
  [ids.parent]: { name: "Local Centro", parentId: null },
  [ids.child]: { name: "Terraza", parentId: ids.parent },
};
const exported: string[] = [];
const ctx = {
  touchpoint: (id: string) => touchpoints[id] ?? null,
  group: (id: string) => groups[id] ?? null,
  qrTouchpointIds: () => [ids.qr, ids.nfc],
  exported: (list: string[]) => exported.push(...list),
};
const ws = "/v1/workspaces/w";
const library = "7d1e2c3b-4a5f-4e6d-8c7b-1a2b3c4d5e01";
const fingerprint = "a".repeat(64);

describe("demo QR designs", () => {
  it("a QR inherits the design of the nearest group up the tree", () => {
    handleQrDemo(
      `${ws}/touchpoint-groups/${ids.parent}/qr-design`,
      "PUT",
      { templateId: library },
      ctx,
    );
    const state = handleQrDemo(
      `${ws}/touchpoints/${ids.qr}/qr-design`,
      "GET",
      {},
      ctx,
    );
    expect(state && "value" in state && state.value).toMatchObject({
      source: "group",
      template: { id: library },
    });
  });

  it("an NFC keeps its backup QR's own design; «Otro» has none", () => {
    const nfc = handleQrDemo(
      `${ws}/touchpoints/${ids.nfc}/qr-design`,
      "PUT",
      { templateId: library },
      ctx,
    );
    expect(nfc && "value" in nfc && nfc.value).toMatchObject({
      source: "library",
    });
    const other = handleQrDemo(
      `${ws}/touchpoints/${ids.other}/qr-design`,
      "PUT",
      { templateId: library },
      ctx,
    );
    expect(other && "error" in other).toBe(true);
  });

  it("records downloads of live codes only, and forgets them when the format changes", () => {
    handleQrDemo(
      `${ws}/qr-exports`,
      "POST",
      {
        format: "png",
        items: [ids.qr, ids.nfc, ids.retired, ids.other].map(
          (touchpointId) => ({
            touchpointId,
            fingerprint,
          }),
        ),
      },
      ctx,
    );
    expect(exported).toEqual([ids.qr, ids.nfc]);
    expect(demoQrLastExportAt(ids.qr)).not.toBeNull();
    expect(demoQrLastExportAt(ids.retired)).toBeNull();
    demoForgetQrExport(ids.qr);
    expect(demoQrLastExportAt(ids.qr)).toBeNull();
  });
});
