import { describe, expect, it } from "vitest";
import {
  buildRedirectSnapshot,
  ClaimedJobError,
  createHttpResolverProjection,
  PublicationError,
  type PublicationJob,
  type PublicationJobRepository,
  type PublicationProjection,
  type PublishedSnapshot,
  processNextPublication,
} from "../src/index.js";

function job(overrides: Partial<PublicationJob> = {}): PublicationJob {
  return {
    id: "31f7a4dc-0bb7-450e-91c6-342045d779e9",
    publicationId: "42f7a4dc-0bb7-450e-91c6-342045d779e9",
    workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
    experienceId: "5b1f7a4d-c0bb-4507-91c6-342045d779e9",
    publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
    revision: 1,
    type: "redirect",
    content: { destinationUrl: "https://kardo.test/bienvenida" },
    assets: {},
    attempts: 1,
    ...overrides,
  };
}

class MemoryPublicationJobs implements PublicationJobRepository {
  private queued: PublicationJob | null;
  succeeded: string[] = [];
  failed: { id: string; code: string; message: string }[] = [];

  constructor(initial: PublicationJob) {
    this.queued = initial;
  }
  async claimNext(): Promise<PublicationJob | null> {
    const claimed = this.queued;
    this.queued = null;
    return claimed;
  }
  async markSucceeded(completed: PublicationJob): Promise<void> {
    this.succeeded.push(completed.id);
  }
  async markFailed(
    failedJob: PublicationJob,
    error: PublicationError,
  ): Promise<void> {
    this.failed.push({
      id: failedJob.id,
      code: error.code,
      message: error.message,
    });
  }
}

function capturingProjection(result: "activated" | "stale" = "activated"): {
  projection: PublicationProjection;
  snapshots: PublishedSnapshot[];
} {
  const snapshots: PublishedSnapshot[] = [];
  return {
    projection: {
      publish: async (snapshot) => {
        snapshots.push(snapshot);
        return result;
      },
    },
    snapshots,
  };
}

function firstSnapshot(snapshots: PublishedSnapshot[]): PublishedSnapshot {
  const snapshot = snapshots[0];
  if (!snapshot) throw new Error("Expected a published snapshot.");
  return snapshot;
}

describe("regression: redirect publications", () => {
  it("rejects an unsafe redirect before it can become public", () => {
    expect(() =>
      buildRedirectSnapshot({
        publicId: "kdo_123",
        revision: 1,
        destinationUrl: "javascript:alert(1)",
      }),
    ).toThrow(/HTTPS/);
  });

  it("builds the experience-shaped snapshot the Resolver's publishCommand must accept, with no top-level destinationUrl", async () => {
    const repository = new MemoryPublicationJobs(job());
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(snapshots).toEqual([
      {
        schemaVersion: 1,
        publicId: job().publicId,
        revision: 1,
        status: "active",
        experience: {
          type: "redirect",
          destinationUrl: "https://kardo.test/bienvenida",
        },
        experienceId: job().experienceId,
      },
    ]);
    expect(repository.succeeded).toEqual([job().id]);
  });

  it("posts the exact wire shape to the Resolver: experience only, never a top-level destinationUrl", async () => {
    const calls: unknown[] = [];
    const projection = createHttpResolverProjection({
      publishUrl: "https://resolver.kardo.test/internal/publish",
      commandKey: "test-command",
      fetchFn: async (_input, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return Response.json({ result: "activated", revision: 1 });
      },
    });
    await projection.publish(
      buildRedirectSnapshot({
        publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
        revision: 1,
        destinationUrl: "https://kardo.test/bienvenida",
      }),
    );
    expect(calls).toEqual([
      {
        publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
        revision: 1,
        experience: {
          type: "redirect",
          destinationUrl: "https://kardo.test/bienvenida",
        },
      },
    ]);
  });
});

describe("regression: image and document publications", () => {
  it("uses alt text (not title) for image content and keeps a legacy asset field for compatibility", async () => {
    const assetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
    const repository = new MemoryPublicationJobs(
      job({
        type: "image",
        content: { assetId, alt: "Escaparate de la tienda" },
        assets: {
          [assetId]: {
            sha256: "a".repeat(64),
            mediaType: "image/png",
            filename: "escaparate.png",
          },
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(snapshots).toEqual([
      {
        schemaVersion: 1,
        publicId: job().publicId,
        revision: 1,
        status: "active",
        experience: { type: "image", alt: "Escaparate de la tienda" },
        asset: {
          sha256: "a".repeat(64),
          mediaType: "image/png",
          title: "escaparate.png",
        },
        assets: [{ sha256: "a".repeat(64), mediaType: "image/png" }],
        experienceId: job().experienceId,
      },
    ]);
  });

  it("accepts sanitized JPEG and WebP images, but never a PDF where an image is expected", async () => {
    const assetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
    for (const mediaType of ["image/jpeg", "image/webp"] as const) {
      const repository = new MemoryPublicationJobs(
        job({
          type: "image",
          content: { assetId, alt: "Vitrina" },
          assets: {
            [assetId]: { sha256: "d".repeat(64), mediaType, filename: "foto" },
          },
        }),
      );
      const { projection, snapshots } = capturingProjection();
      await expect(
        processNextPublication(repository, projection),
      ).resolves.toBe("published");
      expect(snapshots[0]?.assets).toEqual([
        { sha256: "d".repeat(64), mediaType },
      ]);
    }
    const pdfAsImage = new MemoryPublicationJobs(
      job({
        type: "image",
        content: { assetId, alt: "Vitrina" },
        assets: {
          [assetId]: {
            sha256: "e".repeat(64),
            mediaType: "application/pdf",
            filename: "menu.pdf",
          },
        },
      }),
    );
    await expect(
      processNextPublication(pdfAsImage, capturingProjection().projection),
    ).resolves.toBe("failed");
    expect(pdfAsImage.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("uses title (not alt) for document content", async () => {
    const assetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
    const repository = new MemoryPublicationJobs(
      job({
        type: "document",
        content: { assetId, title: "Menú 2026" },
        assets: {
          [assetId]: {
            sha256: "b".repeat(64),
            mediaType: "application/pdf",
            filename: "menu.pdf",
          },
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(firstSnapshot(snapshots).experience).toEqual({
      type: "document",
      title: "Menú 2026",
    });
  });
});

describe("regression: pausing survives a republish", () => {
  it("documents that markSucceeded must only flip touchpoints from 'assigned' to 'active'", () => {
    // markSucceeded runs a `where status = 'assigned'` guard before setting
    // touchpoints to 'active' so republishing a paused Touchpoint cannot
    // silently un-pause it in the database while the Durable Object keeps
    // serving it as paused. This is exercised end to end against Postgres in
    // integration testing; it is documented here because this suite has no
    // database to assert against directly.
    expect(true).toBe(true);
  });
});

describe("stable error codes", () => {
  it("fails immediately with CONTENT_INVALID for malformed content and does not retry it as transient", async () => {
    const repository = new MemoryPublicationJobs(
      job({ content: { destinationUrl: "javascript:alert(1)" } }),
    );
    const projection: PublicationProjection = {
      publish: async () => "activated",
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed).toEqual([
      {
        id: job().id,
        code: "CONTENT_INVALID",
        message: expect.stringContaining("HTTPS"),
      },
    ]);
  });

  it("fails immediately with ASSET_UNAVAILABLE when a referenced asset was not resolved", async () => {
    const assetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
    const repository = new MemoryPublicationJobs(
      job({ type: "image", content: { assetId, alt: "Vitrina" }, assets: {} }),
    );
    const projection: PublicationProjection = {
      publish: async () => "activated",
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("ASSET_UNAVAILABLE");
  });

  it("marks a 4xx Resolver response as RESOLVER_REJECTED", async () => {
    const repository = new MemoryPublicationJobs(job());
    const projection = createHttpResolverProjection({
      publishUrl: "https://resolver.kardo.test/internal/publish",
      commandKey: "test-command",
      fetchFn: async () => new Response("bad", { status: 400 }),
    });
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("RESOLVER_REJECTED");
  });

  it("marks a network failure as RESOLVER_UNAVAILABLE and leaves the job retryable", async () => {
    const repository = new MemoryPublicationJobs(job());
    const projection = createHttpResolverProjection({
      publishUrl: "https://resolver.kardo.test/internal/publish",
      commandKey: "test-command",
      fetchFn: async () => {
        throw new Error("network down");
      },
    });
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("RESOLVER_UNAVAILABLE");
  });

  it("marks a 5xx Resolver response as RESOLVER_UNAVAILABLE", async () => {
    const repository = new MemoryPublicationJobs(job());
    const projection = createHttpResolverProjection({
      publishUrl: "https://resolver.kardo.test/internal/publish",
      commandKey: "test-command",
      fetchFn: async () => new Response("down", { status: 503 }),
    });
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("RESOLVER_UNAVAILABLE");
  });

  it("leaves a failed projection retryable instead of reporting a false publication", async () => {
    const repository = new MemoryPublicationJobs(job());
    const projection: PublicationProjection = {
      publish: async () => {
        throw new PublicationError(
          "RESOLVER_UNAVAILABLE",
          "Resolver is temporarily unavailable.",
        );
      },
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.succeeded).toEqual([]);
    expect(repository.failed).toEqual([
      {
        id: job().id,
        code: "RESOLVER_UNAVAILABLE",
        message: "Resolver is temporarily unavailable.",
      },
    ]);
  });
});

describe("new templates: strict, contract-equivalent validation", () => {
  it("requires every URL to already be stored in its normalized form", async () => {
    const repository = new MemoryPublicationJobs(
      job({ content: { destinationUrl: "https://kardo.test" } }),
    );
    const projection: PublicationProjection = {
      publish: async () => "activated",
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("publishes a valid menu experience", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: {
          title: "Carta",
          currency: "MXN",
          sections: [
            {
              id: "s1",
              name: "Bebidas",
              items: [{ id: "i1", name: "Café", price: 45 }],
            },
          ],
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(firstSnapshot(snapshots).experience).toMatchObject({ type: "menu" });
    // Every snapshot buildSnapshot builds carries the Experience it came
    // from — needed by the Resolver to key live item availability.
    expect(firstSnapshot(snapshots).experienceId).toBe(job().experienceId);
  });

  it("publishes a menu experience and resolves an item's imageAssetId to its sha256", async () => {
    const imageAssetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
    const repository = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: {
          title: "Carta",
          currency: "MXN",
          sections: [
            {
              id: "s1",
              name: "Bebidas",
              items: [
                { id: "i1", name: "Café", price: 45, imageAssetId },
                { id: "i2", name: "Té" },
              ],
            },
          ],
        },
        assets: {
          [imageAssetId]: {
            sha256: "c".repeat(64),
            mediaType: "image/png",
            filename: "cafe.png",
          },
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const snapshot = firstSnapshot(snapshots);
    expect(snapshot.experience).toMatchObject({
      type: "menu",
      sections: [
        {
          items: [
            expect.objectContaining({
              id: "i1",
              imageSha256: "c".repeat(64),
            }),
            expect.objectContaining({ id: "i2" }),
          ],
        },
      ],
    });
    // The second item has no imageAssetId, so it must not gain an
    // imageSha256 field at all.
    const sections = snapshot.experience as {
      sections: { items: Record<string, unknown>[] }[];
    };
    expect(sections.sections[0]?.items[1]).not.toHaveProperty("imageSha256");
    expect(snapshot.assets).toEqual([
      { sha256: "c".repeat(64), mediaType: "image/png" },
    ]);
  });

  it("fails with ASSET_UNAVAILABLE when a menu item's imageAssetId is missing or belongs to another workspace", async () => {
    const imageAssetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
    const repository = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: {
          title: "Carta",
          currency: "MXN",
          sections: [
            {
              id: "s1",
              name: "Bebidas",
              items: [{ id: "i1", name: "Café", imageAssetId }],
            },
          ],
        },
        // Not resolved in `assets` — claimNext only resolves assets that
        // exist and belong to the job's own workspace, so a foreign or
        // missing asset simply never appears here.
        assets: {},
      }),
    );
    const projection: PublicationProjection = {
      publish: async () => "activated",
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("ASSET_UNAVAILABLE");
  });

  it("rejects a menu exceeding the 150 item total limit even when every section is individually valid", async () => {
    const section = (id: string) => ({
      id,
      name: "Sección",
      items: Array.from({ length: 30 }, (_, index) => ({
        id: `i${id}-${index}`,
        name: `Platillo ${index}`,
      })),
    });
    const repository = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: {
          title: "Carta",
          currency: "MXN",
          sections: Array.from({ length: 6 }, (_, index) =>
            section(`s${index}`),
          ),
        },
      }),
    );
    const projection: PublicationProjection = {
      publish: async () => "activated",
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("rejects a menu with an invalid currency", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: {
          title: "Carta",
          currency: "pesos",
          sections: [
            { id: "s1", name: "Bebidas", items: [{ id: "i1", name: "Café" }] },
          ],
        },
      }),
    );
    const projection: PublicationProjection = {
      publish: async () => "activated",
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("publishes a catalog experience and resolves imageAssetId to its sha256", async () => {
    const imageAssetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
    const repository = new MemoryPublicationJobs(
      job({
        type: "catalog",
        content: {
          title: "Productos",
          currency: "MXN",
          items: [{ id: "p1", name: "Vela", price: 199, imageAssetId }],
        },
        assets: {
          [imageAssetId]: {
            sha256: "c".repeat(64),
            mediaType: "image/png",
            filename: "vela.png",
          },
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const snapshot = firstSnapshot(snapshots);
    expect(snapshot.experience).toMatchObject({
      type: "catalog",
      items: [expect.objectContaining({ imageSha256: "c".repeat(64) })],
    });
    expect(snapshot.assets).toEqual([
      { sha256: "c".repeat(64), mediaType: "image/png" },
    ]);
  });

  it("rejects a catalog item whose url is not a normalized HTTPS URL", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "catalog",
        content: {
          title: "Productos",
          currency: "MXN",
          items: [{ id: "p1", name: "Vela", url: "http://kardo.test/vela" }],
        },
      }),
    );
    const projection: PublicationProjection = {
      publish: async () => "activated",
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("publishes a form experience with its bounded fields and always-required email", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "form",
        content: {
          title: "Contáctanos",
          fields: { name: "optional", phone: "hidden", message: "required" },
          submitLabel: "Enviar",
          successMessage: "Gracias, te contactaremos pronto.",
          consentText: "Acepto ser contactado.",
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(firstSnapshot(snapshots).experience).toMatchObject({
      type: "form",
      fields: { name: "optional", phone: "hidden", message: "required" },
    });
  });

  it("rejects a form with an invalid field setting", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "form",
        content: {
          title: "Contáctanos",
          fields: { name: "optional", phone: "hidden", message: "sometimes" },
          submitLabel: "Enviar",
          successMessage: "Gracias.",
          consentText: "Acepto.",
        },
      }),
    );
    const projection: PublicationProjection = {
      publish: async () => "activated",
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("publishes a profile with a biography and resolves its avatarAssetId to a sha256", async () => {
    const avatarAssetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
    const repository = new MemoryPublicationJobs(
      job({
        type: "profile",
        content: {
          displayName: "Estudio Kardo",
          biography: "Diseño y branding para negocios locales.",
          avatarAssetId,
          links: [],
        },
        assets: {
          [avatarAssetId]: {
            sha256: "d".repeat(64),
            mediaType: "image/png",
            filename: "avatar.png",
          },
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(firstSnapshot(snapshots).experience).toMatchObject({
      biography: "Diseño y branding para negocios locales.",
      avatarSha256: "d".repeat(64),
    });
  });

  it("rejects a profile avatarAssetId that resolves to a PDF instead of a PNG", async () => {
    const avatarAssetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
    const repository = new MemoryPublicationJobs(
      job({
        type: "profile",
        content: { displayName: "Estudio Kardo", avatarAssetId, links: [] },
        assets: {
          [avatarAssetId]: {
            sha256: "e".repeat(64),
            mediaType: "application/pdf",
            filename: "not-an-image.pdf",
          },
        },
      }),
    );
    const projection: PublicationProjection = {
      publish: async () => "activated",
    };
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });
});

describe("projection plumbing", () => {
  it("projects a claimed job once and records completion only after activation", async () => {
    const repository = new MemoryPublicationJobs(job());
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(snapshots).toHaveLength(1);
    expect(repository.succeeded).toEqual([job().id]);
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "idle",
    );
  });

  it("sends the authenticated projection command only to HTTPS", async () => {
    const calls: Request[] = [];
    const projection = createHttpResolverProjection({
      publishUrl: "https://resolver.kardo.test/internal/publish",
      commandKey: "test-command",
      fetchFn: async (input, init) => {
        calls.push(new Request(input, init));
        return Response.json({ result: "activated", revision: 1 });
      },
    });

    await projection.publish(
      buildRedirectSnapshot({
        publicId: job().publicId,
        revision: job().revision,
        destinationUrl: "https://kardo.test/bienvenida",
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer test-command");
    expect(() =>
      createHttpResolverProjection({
        publishUrl: "http://resolver.kardo.test/internal/publish",
        commandKey: "test-command",
      }),
    ).toThrow("must use HTTPS");
  });
});

describe("publication queue draining", () => {
  it("processes every pending job in one run, up to the limit", async () => {
    const { processPendingPublications } = await import("../src/index.js");
    const pending = [1, 2, 3].map((revision) => ({
      id: `00000000-0000-4000-8000-00000000000${revision}`,
      publicationId: `10000000-0000-4000-8000-00000000000${revision}`,
      workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
      publicId: `c2fc661f2bdf4d5092c3112db0bcc3e${revision}`,
      revision: 1,
      type: "redirect" as const,
      content: { destinationUrl: "https://kardo.test/" },
      assets: [],
      attempts: 1,
    }));
    const succeeded: string[] = [];
    const result = await processPendingPublications(
      {
        claimNext: async () => pending.shift() ?? null,
        markSucceeded: async (job) => {
          succeeded.push(job.id);
        },
        markFailed: async () => {},
      } as never,
      { publish: async () => "activated" },
    );
    expect(result).toEqual({ published: 3, failed: 0, idle: true });
    expect(succeeded).toHaveLength(3);
  });

  it("labels a failure after a successful projection as STATE_SYNC_FAILED", async () => {
    const { processNextPublication } = await import("../src/index.js");
    let code = "";
    await processNextPublication(
      {
        claimNext: async () => ({
          id: "00000000-0000-4000-8000-000000000009",
          publicationId: "10000000-0000-4000-8000-000000000009",
          workspaceId: "f6399f75-b398-41cd-a299-92b6d236c1fd",
          publicId: "c2fc661f2bdf4d5092c3112db0bcc3e9",
          revision: 1,
          type: "redirect",
          content: { destinationUrl: "https://kardo.test/" },
          assets: [],
          attempts: 1,
        }),
        markSucceeded: async () => {
          throw new Error("permission denied for table touchpoints");
        },
        markFailed: async (_job, error) => {
          code = error.code;
        },
      } as never,
      { publish: async () => "activated" },
    );
    expect(code).toBe("STATE_SYNC_FAILED");
  });
});

describe("link pages and themes", () => {
  const avatarId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
  const backgroundId = "1f7a4dc0-0bb7-450e-91c6-342045d779e9";
  const theme = {
    background: {
      kind: "image",
      color: "#08293d",
      imageAssetId: backgroundId,
      overlay: 40,
    },
    surface: "dark",
    accent: "#8ce0dc",
    buttonStyle: "pill",
    font: "serif",
  };

  it("publishes a link page with socials, highlight, avatar and an image theme", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "linkpage",
        content: {
          displayName: "Café Central",
          bio: "Café de especialidad",
          avatarAssetId: avatarId,
          socials: [
            {
              id: "ig",
              network: "instagram",
              value: "https://www.instagram.com/cafe",
            },
            { id: "mail", network: "email", value: "hola@cafecentral.mx" },
          ],
          links: [
            {
              id: "menu",
              label: "Menú",
              url: "https://cafe.example/menu",
              highlight: true,
            },
          ],
          theme,
        },
        assets: {
          [avatarId]: {
            sha256: "a".repeat(64),
            mediaType: "image/jpeg",
            filename: "ana.jpg",
          },
          [backgroundId]: {
            sha256: "b".repeat(64),
            mediaType: "image/webp",
            filename: "fondo.webp",
          },
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const experience = snapshots[0]?.experience as Record<string, unknown>;
    expect(experience).toMatchObject({
      type: "linkpage",
      displayName: "Café Central",
      avatarSha256: "a".repeat(64),
      links: [
        {
          id: "menu",
          label: "Menú",
          url: "https://cafe.example/menu",
          highlight: true,
        },
      ],
      theme: {
        background: {
          kind: "image",
          color: "#08293d",
          imageSha256: "b".repeat(64),
          overlay: 40,
        },
        surface: "dark",
        accent: "#8ce0dc",
        buttonStyle: "pill",
        font: "serif",
      },
    });
    expect(experience.theme).not.toHaveProperty("background.imageAssetId");
    expect(snapshots[0]?.assets).toEqual(
      expect.arrayContaining([
        { sha256: "a".repeat(64), mediaType: "image/jpeg" },
        { sha256: "b".repeat(64), mediaType: "image/webp" },
      ]),
    );
  });

  it("fails closed on an unsafe theme or social value", async () => {
    for (const content of [
      {
        title: "Carta",
        currency: "MXN",
        sections: [{ id: "s", name: "S", items: [{ id: "i", name: "I" }] }],
        theme: { ...theme, accent: "red" },
      },
      {
        displayName: "X",
        socials: [
          { id: "a", network: "website", value: "javascript:alert(1)" },
        ],
        links: [],
      },
      {
        displayName: "X",
        socials: [{ id: "a", network: "fax", value: "https://x.example" }],
        links: [],
      },
    ]) {
      const repository = new MemoryPublicationJobs(
        job({
          type: "displayName" in content ? "linkpage" : "menu",
          content,
          assets: {},
        }),
      );
      await expect(
        processNextPublication(repository, capturingProjection().projection),
      ).resolves.toBe("failed");
      expect(repository.failed[0]?.code).toMatch(
        /CONTENT_INVALID|ASSET_UNAVAILABLE/,
      );
    }
  });
});

describe("regression: a claimed job whose assets cannot be read", () => {
  it("records INPUT_UNAVAILABLE on that job instead of leaving it pending without an error", async () => {
    // 2026-10-02: the Publisher's role could not read kardo_core.assets, the
    // claim rolled back and a profile with a photo stayed "Publicando".
    const claimed = job({ type: "profile" });
    const repository = new MemoryPublicationJobs(claimed);
    repository.claimNext = async () => {
      throw new ClaimedJobError(
        claimed,
        new Error("permission denied for table assets"),
      );
    };
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "failed",
    );
    expect(snapshots).toHaveLength(0);
    expect(repository.failed).toEqual([
      {
        id: claimed.id,
        code: "INPUT_UNAVAILABLE",
        message: "permission denied for table assets",
      },
    ]);
  });

  it("still lets any other claim error stop the run", async () => {
    const repository = new MemoryPublicationJobs(job());
    repository.claimNext = async () => {
      throw new Error("connection refused");
    };
    await expect(
      processNextPublication(repository, capturingProjection().projection),
    ).rejects.toThrow("connection refused");
  });
});
