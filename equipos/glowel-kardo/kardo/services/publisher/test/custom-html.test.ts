import { describe, expect, it } from "vitest";
import {
  type PublicationError,
  type PublicationJob,
  type PublicationJobRepository,
  type PublicationProjection,
  type PublishedSnapshot,
  processNextPublication,
  referencedAssetIds,
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

function capturingProjection(): {
  projection: PublicationProjection;
  snapshots: PublishedSnapshot[];
} {
  const snapshots: PublishedSnapshot[] = [];
  return {
    projection: {
      publish: async (snapshot) => {
        snapshots.push(snapshot);
        return "activated";
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

const imageAssetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
const imageSha256 = "c".repeat(64);
const imageAsset = {
  sha256: imageSha256,
  mediaType: "image/png" as const,
  filename: "panaderia.png",
};

describe("referencedAssetIds: custom HTML images", () => {
  it("scans html and css for kardo-asset:<uuid> tokens, active or not", () => {
    const ids = referencedAssetIds("links", {
      title: "T",
      links: [],
      customHtml: {
        schema: 1,
        active: false,
        html: `<img src="kardo-asset:${imageAssetId}">`,
        css: `.a{background:url(kardo-asset:${imageAssetId})}`,
      },
    });
    expect(ids).toContain(imageAssetId);
  });

  it("tolerates a malformed customHtml without throwing", () => {
    expect(() =>
      referencedAssetIds("links", {
        title: "T",
        links: [],
        customHtml: "not an object",
      }),
    ).not.toThrow();
  });

  it("does not look for customHtml on types that cannot carry one (redirect: the only type with no page)", () => {
    expect(
      referencedAssetIds("redirect", {
        customHtml: { html: `kardo-asset:${imageAssetId}`, css: "" },
      }),
    ).toEqual([]);
  });
});

describe("Publisher: modo HTML (customHtml)", () => {
  it("publishes sanitized, tokenized html/css with the image ref resolved to a sha256", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Panadería El Sol",
          links: [
            {
              id: "native",
              label: "Nativo",
              url: "https://example.com/nativo",
            },
          ],
          customHtml: {
            schema: 1,
            active: true,
            html: `<div><script>alert(1)</script><a href="https://example.com/sitio">Ir</a><img src="kardo-asset:${imageAssetId}" alt="Foto"></div>`,
            css: `.a{color:red;background:url(kardo-asset:${imageAssetId})}`,
          },
        },
        assets: { [imageAssetId]: imageAsset },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const snapshot = firstSnapshot(snapshots);
    const experience = snapshot.experience as Record<string, unknown>;
    const customHtml = experience.customHtml as {
      html: string;
      css: string;
      links: { id: string; url: string }[];
    };
    expect(customHtml).toBeDefined();
    expect(customHtml.html).not.toContain("<script");
    expect(customHtml.html).toContain(`kardo-asset:${imageSha256}`);
    expect(customHtml.css).toContain(`kardo-asset:${imageSha256}`);
    expect(customHtml.links).toEqual([
      { id: "h1", url: "https://example.com/sitio" },
    ]);
    expect(snapshot.assets).toContainEqual({
      sha256: imageSha256,
      mediaType: "image/png",
    });
  });

  it("ignores customHtml when active is false — no customHtml key on the snapshot", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Panadería El Sol",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
          customHtml: {
            schema: 1,
            active: false,
            html: "<div>hola</div>",
            css: "",
          },
        },
        assets: {},
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const experience = firstSnapshot(snapshots).experience as Record<
      string,
      unknown
    >;
    expect(experience.customHtml).toBeUndefined();
  });

  it("works the same for profile and linkpage", async () => {
    for (const [type, content] of [
      [
        "profile",
        {
          displayName: "Ana Pérez",
          links: [],
          customHtml: {
            schema: 1,
            active: true,
            html: "<kardo-profile></kardo-profile>",
            css: "",
          },
        },
      ],
      [
        "linkpage",
        {
          displayName: "Ana",
          socials: [],
          links: [
            { id: "l1", label: "Tienda", url: "https://example.com/tienda" },
          ],
          customHtml: {
            schema: 1,
            active: true,
            html: "<kardo-links></kardo-links>",
            css: "",
          },
        },
      ],
    ] as const) {
      const repository = new MemoryPublicationJobs(
        job({ type, content, assets: {} }),
      );
      const { projection, snapshots } = capturingProjection();
      await expect(
        processNextPublication(repository, projection),
      ).resolves.toBe("published");
      const experience = firstSnapshot(snapshots).experience as Record<
        string,
        unknown
      >;
      expect(experience.customHtml).toBeDefined();
    }
  });

  it("fails with CONTENT_INVALID when customHtml does not match the contract shape", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "T",
          links: [
            {
              id: "native",
              label: "Nativo",
              url: "https://example.com/nativo",
            },
          ],
          customHtml: { active: true, html: "<div></div>" }, // missing schema/css
        },
        assets: {},
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

  it("fails with ASSET_UNAVAILABLE when the referenced image is not in the workspace", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "T",
          links: [
            {
              id: "native",
              label: "Nativo",
              url: "https://example.com/nativo",
            },
          ],
          customHtml: {
            schema: 1,
            active: true,
            html: `<img src="kardo-asset:${imageAssetId}" alt="x">`,
            css: "",
          },
        },
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

  it("normalizes a hand-written link and still fails closed on one the URL rule refuses", async () => {
    const customHtmlJob = (html: string) =>
      job({
        type: "links",
        content: {
          title: "T",
          links: [
            {
              id: "native",
              label: "Nativo",
              url: "https://example.com/nativo",
            },
          ],
          customHtml: { schema: 1, active: true, html, css: "" },
        },
        assets: {},
      });

    // No path: published with the trailing slash every stored URL carries.
    const { projection, snapshots } = capturingProjection();
    await expect(
      processNextPublication(
        new MemoryPublicationJobs(
          customHtmlJob('<a href="https://example.com">Ir</a>'),
        ),
        projection,
      ),
    ).resolves.toBe("published");
    const payload = firstSnapshot(snapshots).experience as {
      customHtml?: { links: { id: string; url: string }[] };
    };
    expect(payload.customHtml?.links).toEqual([
      { id: "h1", url: "https://example.com/" },
    ]);

    // One the shared URL rule refuses (a host ending in a dot) never is.
    const repository = new MemoryPublicationJobs(
      customHtmlJob('<a href="https://example.com./">Ir</a>'),
    );
    await expect(
      processNextPublication(repository, {
        publish: async () => "activated",
      }),
    ).resolves.toBe("failed");
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });
});

function baseDesignStyle() {
  return {
    palette: {
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#666666",
      accent: "#0a6c78",
    },
    fonts: { heading: "geist", body: "system" },
    radius: 12,
    buttonStyle: "solid",
    buttonShape: "rounded",
    shadow: "none",
    background: { kind: "solid", color: "#ffffff" },
    maxWidth: 640,
  };
}

/**
 * Estudio de Experiences — `html` design blocks (addendum 3, 2026-09-30).
 * Unlike `content.customHtml` (the whole-page "modo HTML"), a design's
 * `html` block has no separate `links` table: its plain `<a href>`s are
 * never tracked through `/go/{id}`, exactly like a `text` block's href. The
 * block is still cleaned with the very same sanitizer (`prepareCustomHtml`)
 * as `customHtml`, so every rule above (script/image/link handling) applies
 * per block too — only the link outcome differs (inlined literally, not
 * kept as a `kardo-link:<id>` token).
 */
describe("Publisher: design html blocks (addendum 3)", () => {
  function htmlBlockJob(
    html: string,
    css = "",
    assets: Record<string, unknown> = {},
  ) {
    return job({
      type: "links",
      content: {
        title: "Panadería",
        links: [{ id: "l1", label: "Sitio", url: "https://example.com/sitio" }],
        design: {
          schema: 1,
          style: baseDesignStyle(),
          sections: [
            {
              id: "s1",
              layout: "1",
              columns: [
                [
                  { id: "cl1", kind: "contentLinks", layout: "list" },
                  { id: "h1", kind: "html", html, css },
                ],
              ],
              paddingTop: 0,
              paddingBottom: 0,
              gap: 0,
              align: "start",
            },
          ],
        },
      },
      assets,
    });
  }

  function htmlBlockOf(snapshot: PublishedSnapshot): {
    html: string;
    css: string;
  } {
    const experience = snapshot.experience as {
      design: { sections: { columns: Record<string, unknown>[][] }[] };
    };
    const block = experience.design.sections[0]?.columns[0]?.find(
      (b) => b.kind === "html",
    ) as { html: string; css: string } | undefined;
    if (!block) throw new Error("Expected an html block in the design.");
    return block;
  }

  it("sanitizes the block, resolves its image to a sha256, and inlines a validated literal link (never tracked)", async () => {
    const repository = new MemoryPublicationJobs(
      htmlBlockJob(
        `<div><script>alert(1)</script><a href="https://example.com/sitio">Ir</a><img src="kardo-asset:${imageAssetId}" alt="Foto"></div>`,
        `.a{color:red;background:url(kardo-asset:${imageAssetId})}`,
        { [imageAssetId]: imageAsset },
      ),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const block = htmlBlockOf(firstSnapshot(snapshots));
    expect(block.html).not.toContain("<script");
    expect(block.html).not.toContain("kardo-link:");
    expect(block.html).toContain('href="https://example.com/sitio"');
    expect(block.html).toContain(`kardo-asset:${imageSha256}`);
    expect(block.css).toContain(`kardo-asset:${imageSha256}`);
    expect(firstSnapshot(snapshots).assets).toContainEqual({
      sha256: imageSha256,
      mediaType: "image/png",
    });
  });

  it("keeps mailto: and tel: links in a block literal, exactly like a text block's href", async () => {
    const repository = new MemoryPublicationJobs(
      htmlBlockJob(
        '<a href="mailto:hola@example.com">Escríbenos</a><a href="tel:+525512345678">Llama</a>',
      ),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const block = htmlBlockOf(firstSnapshot(snapshots));
    expect(block.html).toContain('href="mailto:hola@example.com"');
    expect(block.html).toContain('href="tel:+525512345678"');
  });

  it("a block that becomes empty after cleaning is not an error", async () => {
    const repository = new MemoryPublicationJobs(
      htmlBlockJob("<script>alert(1)</script>"),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(htmlBlockOf(firstSnapshot(snapshots)).html).toBe("");
  });

  it("rejects a block image ref that is not a workspace asset uuid (looks like an already-published hash)", async () => {
    const repository = new MemoryPublicationJobs(
      htmlBlockJob(`<img src="kardo-asset:${imageSha256}" alt="x">`),
    );
    await expect(
      processNextPublication(repository, { publish: async () => "activated" }),
    ).resolves.toBe("failed");
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("fails with ASSET_UNAVAILABLE when a block's image is not in the workspace", async () => {
    const repository = new MemoryPublicationJobs(
      htmlBlockJob(`<img src="kardo-asset:${imageAssetId}" alt="x">`),
    );
    await expect(
      processNextPublication(repository, { publish: async () => "activated" }),
    ).resolves.toBe("failed");
    expect(repository.failed[0]?.code).toBe("ASSET_UNAVAILABLE");
  });

  it("normalizes a hand-written link in a block and still fails closed on one the URL rule refuses", async () => {
    const { projection, snapshots } = capturingProjection();
    await expect(
      processNextPublication(
        new MemoryPublicationJobs(
          htmlBlockJob('<a href="https://example.com">Ir</a>'),
        ),
        projection,
      ),
    ).resolves.toBe("published");
    expect(htmlBlockOf(firstSnapshot(snapshots)).html).toContain(
      'href="https://example.com/"',
    );

    const repository = new MemoryPublicationJobs(
      htmlBlockJob('<a href="https://example.com./">Ir</a>'),
    );
    await expect(
      processNextPublication(repository, { publish: async () => "activated" }),
    ).resolves.toBe("failed");
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });
});
