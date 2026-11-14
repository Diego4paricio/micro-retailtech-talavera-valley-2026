import type { Asset } from "@kardo/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
vi.mock("../src/api/assets.js", () => ({
  assetsApi: { upload: (...args: unknown[]) => upload(...args) },
  maxAssetBytes: 5_242_880,
}));

import {
  assetFileProblem,
  imageFileProblem,
  uploadAsset,
  uploadImage,
} from "../src/features/assets/upload.js";

// The one upload helper (domain audit A2-46).

const file = (type: string, size = 1_000) =>
  new File([new Uint8Array(size)], "a", { type });
const asset = (status: Asset["status"]) =>
  ({ id: "x", status, mediaType: "image/png" }) as unknown as Asset;

describe("upload helpers", () => {
  beforeEach(() => upload.mockReset());

  it("rejects the wrong type and the too-big file before uploading", () => {
    expect(imageFileProblem(file("application/pdf"))).toContain("imagen");
    expect(assetFileProblem(file("text/plain"))).toContain("PDF");
    expect(assetFileProblem(file("application/pdf", 6_000_000))).toContain(
      "5 MB",
    );
    expect(assetFileProblem(file("application/pdf"))).toBeNull();
  });

  it("never uploads a file that fails the check", async () => {
    await expect(uploadImage("w", file("application/pdf"))).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
  });

  it("throws, in Spanish, for a rejected or unfinished file", async () => {
    upload.mockResolvedValueOnce(asset("rejected"));
    await expect(uploadImage("w", file("image/png"))).rejects.toMatchObject({
      code: "UPLOAD_REJECTED",
    });
    upload.mockResolvedValueOnce(asset("pending"));
    await expect(uploadImage("w", file("image/png"))).rejects.toMatchObject({
      code: "UPLOAD_PENDING",
    });
  });

  it("resolves with a validated file, and with a rejected one when asked (the library lists it)", async () => {
    upload.mockResolvedValueOnce(asset("validated"));
    expect((await uploadImage("w", file("image/png"))).status).toBe(
      "validated",
    );
    upload.mockResolvedValueOnce(asset("rejected"));
    expect(
      (await uploadAsset("w", file("image/png"), { allowUnvalidated: true }))
        .status,
    ).toBe("rejected");
  });
});
