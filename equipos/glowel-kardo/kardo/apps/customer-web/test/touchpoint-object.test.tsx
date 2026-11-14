import type { Touchpoint, TouchpointObject } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StepTrack } from "../src/components/StepTrack.js";
import {
  emptyTouchpointObject,
  needsPlacing,
  objectFlow,
  objectStateView,
} from "../src/features/touchpoints/object-steps.js";
import { markDownloaded } from "../src/features/touchpoints/qr/mark-downloaded.js";
import { touchpointUrls } from "../src/lib/touchpoint-urls.js";

const at = "2026-10-07T18:00:00.000Z";

function touchpoint(
  kind: "nfc" | "qr" | "other",
  object: Partial<TouchpointObject> = {},
): Touchpoint {
  return {
    id: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
    publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
    operationalName: "Tarjeta en recepción",
    physicalType: kind === "nfc" ? "card" : kind === "qr" ? "label" : "other",
    kind,
    status: "active",
    object: { ...emptyTouchpointObject, ...object },
  };
}

describe("objectFlow (relevo 36): the step to come back to after a reload", () => {
  it("an NFC goes write, test, backup QR, place, from the first missing one", () => {
    const fresh = objectFlow(touchpoint("nfc"));
    expect(fresh.steps.map((step) => step.label)).toEqual([
      "Grabar",
      "Probar",
      "Respaldo",
      "Colocar",
    ]);
    expect(fresh.current).toBe(0);
    const written = objectFlow(
      touchpoint("nfc", { state: "ready", preparedAt: at }),
    );
    expect(written.current).toBe(1);
    expect(written.steps[1]?.api).toBe("tested");
    // Skipping a step leaves it as the one still missing.
    expect(
      objectFlow(
        touchpoint("nfc", { state: "ready", preparedAt: at, backupAt: at }),
      ).current,
    ).toBe(1);
  });

  it("a QR counts as downloaded when Kardo saw the download or it was printed", () => {
    expect(objectFlow(touchpoint("qr")).current).toBe(0);
    expect(objectFlow(touchpoint("qr", { downloadedAt: at })).current).toBe(1);
    const printed = objectFlow(
      touchpoint("qr", { state: "ready", preparedAt: at }),
    );
    expect(printed.steps[0]?.doneAt).toBe(at);
    expect(printed.current).toBe(2);
  });

  it("«Otro» has three steps", () => {
    expect(
      objectFlow(touchpoint("other")).steps.map((step) => step.key),
    ).toEqual(["address", "test", "place"]);
  });

  it("is complete once placed, and replacing opens its own four steps", () => {
    const placed = objectFlow(
      touchpoint("nfc", {
        state: "placed",
        preparedAt: at,
        testedAt: at,
        backupAt: at,
        placedAt: at,
      }),
    );
    expect(placed).toMatchObject({ complete: true, current: 4 });
    const replacing = objectFlow(
      touchpoint("nfc", {
        state: "replacing",
        preparedAt: at,
        placedAt: at,
        replacingAt: at,
        replaceReadyAt: at,
      }),
    );
    expect(replacing).toMatchObject({ mode: "replace", complete: false });
    expect(replacing.steps.map((step) => step.api)).toEqual([
      "replace_ready",
      "replace_prepared",
      "replace_tested",
      "placed",
    ]);
    expect(replacing.current).toBe(1);
  });
});

describe("objectStateView and «Por colocar»", () => {
  it("names the object by its format, apart from the page's state", () => {
    expect(objectStateView(touchpoint("nfc")).label).toBe("Sin grabar");
    expect(objectStateView(touchpoint("qr")).label).toBe("Sin imprimir");
    expect(
      objectStateView(touchpoint("nfc", { state: "ready", preparedAt: at })),
    ).toEqual({ label: "Grabado", tone: "ready" });
    expect(
      objectStateView(touchpoint("qr", { state: "ready", preparedAt: at }))
        .label,
    ).toBe("Impreso");
    expect(
      objectStateView(touchpoint("qr", { state: "placed", placedAt: at })),
    ).toEqual({ label: "Colocado", tone: "placed" });
    expect(
      objectStateView(
        touchpoint("nfc", { state: "replacing", replacingAt: at }),
      ).label,
    ).toBe("Reemplazando");
  });

  it("puts in «Por colocar» what is not placed, never what is retired", () => {
    expect(needsPlacing(touchpoint("nfc"))).toBe(true);
    expect(
      needsPlacing(touchpoint("nfc", { state: "placed", placedAt: at })),
    ).toBe(false);
    expect(needsPlacing({ ...touchpoint("qr"), status: "retired" })).toBe(
      false,
    );
  });
});

describe("the backup QR and the preview (E2, E3)", () => {
  it("count apart: the backup QR is the QR channel, «Ver página» is not counted", () => {
    const urls = touchpointUrls("c2fc661f2bdf4d5092c3112db0bcc3ef");
    expect(urls.qr).toMatch(/\?src=qr$/);
    expect(urls.nfc).toMatch(/\?src=nfc$/);
    expect(urls.preview).toMatch(/\?src=preview$/);
  });
});

describe("StepTrack", () => {
  it("marks the open step, checks the done ones and joins them with the line", () => {
    const html = renderToStaticMarkup(
      <StepTrack
        current={1}
        items={[
          { label: "Grabar", done: true },
          { label: "Probar", done: false },
          { label: "Respaldo", done: false },
        ]}
        onSelect={() => undefined}
      />,
    );
    expect(html).toContain(
      'Grabar<span class="visually-hidden">, hecho</span>',
    );
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("step-track-now");
    expect(html).toContain("step-track-joined");
    expect((html.match(/<button/g) ?? []).length).toBe(3);
  });
});

describe("a recorded download marks the step, wherever it happened (relevo 38)", () => {
  const later = "2026-10-08T12:00:00.000Z";

  it("a QR's «Descargar» is marked by the download", () => {
    const marked = markDownloaded(touchpoint("qr"), later);
    expect(marked.object?.downloadedAt).toBe(later);
    expect(objectFlow(marked).steps[0]?.doneAt).toBe(later);
    expect(objectFlow(marked).current).toBe(1);
  });

  it("an NFC's backup QR marks «Respaldo» once, and never during a replacement", () => {
    const marked = markDownloaded(touchpoint("nfc"), later);
    expect(marked.object?.backupAt).toBe(later);
    const before = markDownloaded(touchpoint("nfc", { backupAt: at }), later);
    expect(before.object?.backupAt).toBe(at);
    const replacing = markDownloaded(
      touchpoint("nfc", { state: "replacing", replacingAt: at }),
      later,
    );
    expect(replacing.object?.backupAt).toBeNull();
  });
});
