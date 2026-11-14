import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/demo.js", () => ({ isDemoMode: false }));

import { AssetPreview } from "../src/features/assets/AssetPreview.js";
import {
  assetStatusExplanation,
  rejectionFor,
} from "../src/features/assets/asset-status.js";

// Every reason the Assets Worker gives (services/assets-worker).
const workerReasons = [
  "The PDF includes active content.",
  "The PDF exceeds the 20 page limit.",
  "The PDF includes a stream this scanner cannot inspect safely.",
  "The PDF includes a stream that could not be safely inspected.",
  "The PDF includes too many streams to inspect safely.",
  "The file is not a valid PDF.",
  "The PNG dimensions are invalid.",
  "The JPEG dimensions are invalid.",
  "The WebP dimensions are invalid.",
  "The JPEG uses an unsupported encoding.",
  "Animated WebP files are not supported.",
  "The uploaded object does not match its authorization.",
  "The file is not a valid PNG.",
  "The file is not a valid JPEG.",
  "The file is not a valid WebP.",
  "The PNG is truncated or malformed.",
  "The JPEG is truncated or malformed.",
  "The WebP is truncated or malformed.",
  "The PNG is missing a valid header chunk.",
  "The JPEG is missing image data.",
  "The WebP is missing image data.",
  "The WebP header is invalid.",
  "The WebP RIFF size does not match the file.",
];

describe("asset status in plain Spanish", () => {
  it("explains every worker reason specifically, never with the generic text", () => {
    const generic = rejectionFor(undefined).body;
    for (const reason of workerReasons) {
      const rejection = rejectionFor(reason);
      expect(rejection.body, reason).not.toBe(generic);
      expect(rejection.fix.length, reason).toBeGreaterThan(10);
    }
    expect(rejectionFor("The PDF includes active content.").body).toContain(
      "formularios para llenar",
    );
    expect(rejectionFor("The PNG dimensions are invalid.").body).toContain(
      "40 megapíxeles",
    );
  });

  it("an unknown reason still gets an honest explanation and what to do", () => {
    const view = assetStatusExplanation({
      status: "rejected",
      rejectedReason: "Something new.",
    });
    expect(view).toMatchObject({ label: "Rechazado", tone: "danger" });
    expect(view.fix).toBeTruthy();
  });

  it("validated and in-review files explain themselves without a fix", () => {
    expect(assetStatusExplanation({ status: "validated" })).toMatchObject({
      label: "Validado",
      tone: "success",
    });
    const review = assetStatusExplanation({ status: "quarantined" });
    expect(review).toMatchObject({ label: "En revisión", tone: "info" });
    expect(review.fix).toBeUndefined();
  });
});

describe("asset preview", () => {
  const base = {
    id: "30000000-0000-4000-8000-000000000001",
    filename: "foto.png",
    mediaType: "image/png" as const,
  };

  it("never shows a rejected or in-review file, only its tile", () => {
    for (const status of ["rejected", "quarantined"] as const) {
      const html = renderToStaticMarkup(
        <AssetPreview
          asset={{ ...base, status }}
          size="thumb"
          workspaceId="w"
        />,
      );
      expect(html).not.toContain("<img");
      expect(html).toContain("asset-preview-tile");
      expect(html).toContain("PNG");
    }
  });

  it("a PDF has a tile with its type", () => {
    const html = renderToStaticMarkup(
      <AssetPreview
        asset={{ ...base, mediaType: "application/pdf", status: "validated" }}
        size="full"
        workspaceId="w"
      />,
    );
    expect(html).toContain("PDF");
    expect(html).not.toContain("<img");
  });
});
