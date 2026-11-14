import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { WorkspaceAccessError } from "../src/errors.js";
import { authHeader, verifierFor, workspaceId } from "./helpers.js";

describe("asset routes", () => {
  it("lets a viewer list Assets (read-only)", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetRepository: {
        listAssets: async () => [
          {
            id: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
            filename: "logo.png",
            mediaType: "image/png",
            byteSize: 1024,
            sha256: "0".repeat(64),
            status: "validated",
          },
        ],
        beginUpload: async () => {
          throw new Error("not used");
        },
        finalize: async () => {
          throw new Error("not used");
        },
        lookupQuarantined: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/assets`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    await app.close();
  });

  it("rejects an upload authorization for a viewer (assets.manage required)", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetWorker: {
        uploadUrl: () => "https://assets.example/upload/x",
        validate: async () => {
          throw new Error("not used");
        },
      },
      assetRepository: {
        listAssets: async () => [],
        beginUpload: async () => {
          throw new WorkspaceAccessError();
        },
        finalize: async () => {
          throw new Error("not used");
        },
        lookupQuarantined: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/assets/upload-authorizations`,
      headers: authHeader,
      payload: { filename: "logo.png", mediaType: "image/png", byteSize: 1024 },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("WORKSPACE_ACCESS_DENIED");
    await app.close();
  });

  it("returns 503 when the asset worker is not configured", async () => {
    const app = buildCustomerApi({ sessionVerifier: verifierFor() });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/assets/upload-authorizations`,
      headers: authHeader,
      payload: { filename: "logo.png", mediaType: "image/png", byteSize: 1024 },
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("never returns a storage key in the Asset response shape", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetRepository: {
        listAssets: async () =>
          // @ts-expect-error intentionally including a field the schema forbids
          [
            {
              id: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
              filename: "logo.png",
              mediaType: "image/png",
              byteSize: 1024,
              sha256: "0".repeat(64),
              status: "validated",
              storageKey: "originals/should-not-leak",
            },
          ],
        beginUpload: async () => {
          throw new Error("not used");
        },
        finalize: async () => {
          throw new Error("not used");
        },
        lookupQuarantined: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/assets`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).not.toHaveProperty("storageKey");
    await app.close();
  });
});

describe("asset detail routes: where it is used and rename", () => {
  const assetId = "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c";
  const asset = {
    id: assetId,
    filename: "carta-otono.pdf",
    mediaType: "application/pdf" as const,
    byteSize: 2048,
    sha256: "0".repeat(64),
    status: "validated" as const,
  };
  const unused = async () => {
    throw new Error("not used");
  };
  const repository = (overrides: Record<string, unknown>) => ({
    listAssets: async () => [],
    beginUpload: unused,
    finalize: unused,
    lookupQuarantined: unused,
    lookupReadableImage: unused,
    deleteAsset: unused,
    assetUsage: unused,
    renameAsset: unused,
    ...overrides,
  });

  it("lists the Experiences that use a file, marking the live ones", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetRepository: repository({
        assetUsage: async () => ({
          experiences: [
            {
              id: "9d6f2e10-9b39-4f8e-9a1a-6b5a2f0d1c22",
              name: "Carta de otoño",
              live: true,
            },
          ],
        }),
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/assets/${assetId}/usage`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      experiences: [
        {
          id: "9d6f2e10-9b39-4f8e-9a1a-6b5a2f0d1c22",
          name: "Carta de otoño",
          live: true,
        },
      ],
    });
    await app.close();
  });

  it("renames a file and refuses a blank name", async () => {
    const calls: string[] = [];
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetRepository: repository({
        renameAsset: async (
          _identity: unknown,
          _workspace: string,
          _asset: string,
          filename: string,
        ) => {
          calls.push(filename);
          return { ...asset, filename };
        },
      }),
    });
    const renamed = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/assets/${assetId}`,
      headers: authHeader,
      payload: { filename: "Carta de otoño.pdf" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ filename: "Carta de otoño.pdf" });
    for (const filename of ["", "   "]) {
      const blank = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/assets/${assetId}`,
        headers: authHeader,
        payload: { filename },
      });
      expect(blank.statusCode).toBe(400);
    }
    const extra = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/assets/${assetId}`,
      headers: authHeader,
      payload: { filename: "ok.png", status: "validated" },
    });
    // Unknown fields are dropped: only the name can change.
    expect(extra.statusCode).toBe(200);
    expect(calls).toEqual(["Carta de otoño.pdf", "ok.png"]);
    await app.close();
  });
});

describe("asset worker client", () => {
  it("always sends the expected size as a number (Postgres bigint arrives as text)", async () => {
    const { createAssetWorkerClient } = await import("../src/assets.js");
    let sent: Record<string, unknown> | undefined;
    const client = createAssetWorkerClient({
      workerUrl: "https://assets.example.com",
      signingKey: "k".repeat(32),
      fetchFn: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            status: "validated",
            byteSize: 47,
            sha256: "a".repeat(64),
          }),
          { status: 200 },
        );
      },
    });
    await client.validate({
      assetId: "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
      storageKey: "originals/w/2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c",
      expectedMediaType: "image/jpeg",
      expectedByteSize: "47" as unknown as number,
    });
    expect(sent?.expectedByteSize).toBe(47);
  });
});
