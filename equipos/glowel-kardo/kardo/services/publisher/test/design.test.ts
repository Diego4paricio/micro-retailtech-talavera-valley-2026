import { describe, expect, it } from "vitest";
import {
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
    error: { code: string; message: string },
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

function linksDesign(overrides: { columns?: unknown[] } = {}) {
  return {
    schema: 1,
    style: baseDesignStyle(),
    sections: [
      {
        id: "s1",
        layout: "1",
        columns: overrides.columns ?? [
          [
            { id: "ct1", kind: "contentTitle" },
            {
              id: "img1",
              kind: "image",
              imageRef: imageAssetId,
              alt: "Foto de la panadería",
              aspect: "1:1",
              fit: "cover",
            },
            { id: "cl1", kind: "contentLinks", layout: "list" },
          ],
        ],
        paddingTop: 24,
        paddingBottom: 24,
        gap: 12,
        align: "center",
      },
    ],
  };
}

const imageAsset = {
  sha256: imageSha256,
  mediaType: "image/png" as const,
  filename: "panaderia.png",
};

describe("referencedAssetIds: design images", () => {
  it("collects an image block's imageRef for links/profile/linkpage", () => {
    expect(
      referencedAssetIds("links", {
        title: "Panadería",
        links: [],
        design: linksDesign(),
      }),
    ).toContain(imageAssetId);
    expect(
      referencedAssetIds("profile", {
        displayName: "Ana",
        design: linksDesign(),
      }),
    ).toContain(imageAssetId);
    expect(
      referencedAssetIds("linkpage", {
        displayName: "Ana",
        design: linksDesign(),
      }),
    ).toContain(imageAssetId);
  });

  it("collects a section and page background imageRef too", () => {
    const design = {
      schema: 1,
      style: {
        ...baseDesignStyle(),
        background: { kind: "image", imageRef: "page-bg" },
      },
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [[{ id: "cl1", kind: "contentLinks", layout: "list" }]],
          background: { kind: "image", imageRef: "section-bg" },
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    const ids = referencedAssetIds("links", { title: "T", links: [], design });
    expect(ids).toContain("page-bg");
    expect(ids).toContain("section-bg");
  });

  it("collects every photo of a gallery block, and tolerates 'sin banco de fotos' slots with no imageRef", () => {
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "cl1", kind: "contentLinks", layout: "list" },
              {
                id: "g1",
                kind: "gallery",
                layout: "grid",
                aspect: "1:1",
                images: [
                  { imageRef: "gallery-1", alt: "Uno" },
                  { imageRef: "gallery-2", alt: "Dos" },
                  { alt: "Espacio para foto" },
                ],
              },
              {
                id: "img1",
                kind: "image",
                alt: "Espacio para otra foto",
                aspect: "1:1",
                fit: "cover",
              },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    const ids = referencedAssetIds("links", { title: "T", links: [], design });
    expect(ids).toContain("gallery-1");
    expect(ids).toContain("gallery-2");
    expect(ids).toHaveLength(2);
  });

  it("tolerates a malformed design without throwing", () => {
    expect(() =>
      referencedAssetIds("links", {
        title: "T",
        links: [],
        design: "not an object",
      }),
    ).not.toThrow();
    expect(() =>
      referencedAssetIds("links", {
        title: "T",
        links: [],
        design: { sections: "not an array" },
      }),
    ).not.toThrow();
  });

  it("does not look for a design on types that cannot carry one (redirect: the only type with no page)", () => {
    expect(referencedAssetIds("redirect", { design: linksDesign() })).toEqual(
      [],
    );
  });

  it("collects an image block's imageRef from a canvas section too (regression: canvas items live in `items[].block`, not `columns`)", () => {
    const design = {
      schema: 2,
      style: baseDesignStyle(),
      sections: [
        {
          id: "c1",
          kind: "canvas",
          height: 400,
          items: [
            {
              block: {
                id: "img9",
                kind: "image",
                imageRef: imageAssetId,
                alt: "Ramo",
                aspect: "1:1",
                fit: "cover",
              },
              x: 0,
              y: 0,
              w: 100,
              h: 100,
            },
          ],
        },
      ],
    };
    expect(
      referencedAssetIds("links", { title: "T", links: [], design }),
    ).toContain(imageAssetId);
  });

  it("scans a design html block's own kardo-asset tokens, in columns and canvases", () => {
    const columnsDesign = linksDesign({
      columns: [
        [
          { id: "cl1", kind: "contentLinks", layout: "list" },
          {
            id: "h1",
            kind: "html",
            html: `<img src="kardo-asset:${imageAssetId}">`,
            css: "",
          },
        ],
      ],
    });
    expect(
      referencedAssetIds("links", {
        title: "T",
        links: [],
        design: columnsDesign,
      }),
    ).toContain(imageAssetId);

    const canvasDesign = {
      schema: 2,
      style: baseDesignStyle(),
      sections: [
        {
          id: "c1",
          kind: "canvas",
          height: 400,
          items: [
            {
              block: {
                id: "h1",
                kind: "html",
                html: "",
                css: `.a{background:url(kardo-asset:${imageAssetId})}`,
              },
              x: 0,
              y: 0,
              w: 100,
              h: 100,
            },
          ],
        },
      ],
    };
    expect(
      referencedAssetIds("links", {
        title: "T",
        links: [],
        design: canvasDesign,
      }),
    ).toContain(imageAssetId);
  });

  it("collects a document's page assetIds alongside its own assetId", () => {
    const pageAssetId = "aaaaaaaa-1111-4111-8111-111111111111";
    const ids = referencedAssetIds("document", {
      assetId: imageAssetId,
      title: "Menú",
      display: "viewer",
      pages: [{ assetId: pageAssetId, width: 800, height: 1000 }],
    });
    expect(ids).toContain(imageAssetId);
    expect(ids).toContain(pageAssetId);
  });
});

describe("Publisher: designed links/profile/linkpage", () => {
  it("emits the design in the snapshot with imageRef resolved to a sha256, and adds it to assets", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Panadería El Sol",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
          design: linksDesign(),
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
    const design = experience.design as { sections: unknown[] };
    expect(design).toBeDefined();
    const blocks = (design.sections[0] as { columns: unknown[][] })
      .columns[0] as Record<string, unknown>[];
    const imageBlock = blocks.find((b) => b.kind === "image");
    expect(imageBlock?.imageRef).toBe(imageSha256);
    expect(snapshot.assets).toContainEqual({
      sha256: imageSha256,
      mediaType: "image/png",
    });
  });

  it("works the same for profile and linkpage", async () => {
    for (const type of ["profile", "linkpage"] as const) {
      const content =
        type === "profile"
          ? {
              displayName: "Ana Pérez",
              links: [
                { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
              ],
              design: {
                ...linksDesign(),
                sections: [
                  {
                    id: "s1",
                    layout: "1",
                    columns: [
                      [
                        {
                          id: "ph1",
                          kind: "profileHeader",
                          layout: "stacked",
                          avatarShape: "circle",
                        },
                        {
                          id: "img1",
                          kind: "image",
                          imageRef: imageAssetId,
                          alt: "",
                          aspect: "auto",
                          fit: "cover",
                        },
                        { id: "cl1", kind: "contentLinks", layout: "list" },
                      ],
                    ],
                    paddingTop: 0,
                    paddingBottom: 0,
                    gap: 0,
                    align: "start",
                  },
                ],
              },
            }
          : {
              displayName: "Ana",
              socials: [
                {
                  id: "so1",
                  network: "instagram",
                  value: "https://instagram.com/ana",
                },
              ],
              links: [],
              design: {
                ...linksDesign(),
                sections: [
                  {
                    id: "s1",
                    layout: "1",
                    columns: [
                      [
                        {
                          id: "ph1",
                          kind: "profileHeader",
                          layout: "stacked",
                          avatarShape: "circle",
                        },
                        {
                          id: "img1",
                          kind: "image",
                          imageRef: imageAssetId,
                          alt: "",
                          aspect: "auto",
                          fit: "cover",
                        },
                        { id: "cs1", kind: "contentSocials", size: "medium" },
                      ],
                    ],
                    paddingTop: 0,
                    paddingBottom: 0,
                    gap: 0,
                    align: "start",
                  },
                ],
              },
            };
      const repository = new MemoryPublicationJobs(
        job({ type, content, assets: { [imageAssetId]: imageAsset } }),
      );
      const { projection, snapshots } = capturingProjection();
      await expect(
        processNextPublication(repository, projection),
      ).resolves.toBe("published");
      const experience = firstSnapshot(snapshots).experience as Record<
        string,
        unknown
      >;
      expect(experience.design).toBeDefined();
    }
  });

  it("publishes a schema 2 canvas: its images become hashes and its brand buttons keep a normalized link", async () => {
    const design = {
      ...linksDesign({
        columns: [[{ id: "cl1", kind: "contentLinks", layout: "list" }]],
      }),
      schema: 2,
    };
    design.sections.push({
      id: "c1",
      kind: "canvas",
      height: 640,
      items: [
        {
          block: {
            id: "img9",
            kind: "image",
            imageRef: imageAssetId,
            alt: "Ramo",
            aspect: "1:1",
            fit: "cover",
          },
          x: 24,
          y: 40,
          w: 200,
          h: 200,
        },
        {
          block: {
            id: "wa1",
            kind: "brandButton",
            brand: "whatsapp",
            label: "Escríbenos",
            href: "https://wa.me/525512345678",
            look: "brand",
          },
          x: 24,
          y: 300,
          w: 342,
        },
      ],
    } as never);
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Florería Luna",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
          design,
        },
        assets: { [imageAssetId]: imageAsset },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await processNextPublication(repository, projection);
    expect(repository.failed).toEqual([]);
    const experience = firstSnapshot(snapshots).experience as {
      design: {
        schema: number;
        sections: { items?: { block: Record<string, unknown> }[] }[];
      };
    };
    expect(experience.design.schema).toBe(2);
    const items = experience.design.sections[1]?.items ?? [];
    expect(items[0]?.block.imageRef).toBe(imageSha256);
    expect(items[1]?.block.href).toBe("https://wa.me/525512345678");
  });

  it("rejects a brand button whose link carries credentials", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Florería Luna",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
          design: linksDesign({
            columns: [
              [
                { id: "cl1", kind: "contentLinks", layout: "list" },
                {
                  id: "wa1",
                  kind: "brandButton",
                  brand: "whatsapp",
                  label: "Escríbenos",
                  href: "https://user:pass@wa.me/5255",
                  look: "brand",
                },
              ],
            ],
          }),
        },
      }),
    );
    const { projection } = capturingProjection();
    await processNextPublication(repository, projection);
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
    expect(repository.failed[0]?.message).toContain("design button href");
  });

  it("rejects a design missing its required bound block", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Panadería",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
          design: linksDesign({
            columns: [[{ id: "h1", kind: "heading", text: "Hola", level: 1 }]],
          }),
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

  it("fails with ASSET_UNAVAILABLE when the design's image is not in the workspace", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Panadería",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
          design: linksDesign(),
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

  it("rejects a design image block whose imageRef is not an asset uuid", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Panadería",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
          design: linksDesign({
            columns: [
              [
                { id: "ct1", kind: "contentTitle" },
                {
                  id: "img1",
                  kind: "image",
                  imageRef: imageSha256, // a published hash, not a workspace asset id
                  alt: "",
                  aspect: "auto",
                  fit: "cover",
                },
                { id: "cl1", kind: "contentLinks", layout: "list" },
              ],
            ],
          }),
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

  it("rejects a design button href that carries embedded credentials, even though the schema allows the https:// shape", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Panadería",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
          design: linksDesign({
            columns: [
              [
                { id: "ct1", kind: "contentTitle" },
                {
                  id: "b1",
                  kind: "button",
                  label: "Reservar",
                  href: "https://user:pass@example.com/reservar",
                  variant: "primary",
                },
                { id: "cl1", kind: "contentLinks", layout: "list" },
              ],
            ],
          }),
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

  it("rejects structurally invalid design content", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Panadería",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
          design: { schema: 2 },
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

  it("publishes a links experience with no design exactly as before (design is entirely optional)", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "links",
        content: {
          title: "Panadería",
          links: [
            { id: "l1", label: "Sitio", url: "https://example.com/sitio" },
          ],
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
    expect(experience.design).toBeUndefined();
  });
});

describe("Publisher: designed menu, catalog, form, document and image (addendum 3)", () => {
  it("publishes a designed menu, checking a menu block's sectionIds against the menu's own sections", async () => {
    const menuDesign = (sectionIds?: string[]) => ({
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              {
                id: "mn1",
                kind: "menu",
                layout: "list",
                photos: "small",
                ...(sectionIds ? { sectionIds } : {}),
              },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    });
    const content = {
      title: "Carta",
      currency: "MXN",
      sections: [
        {
          id: "bebidas",
          name: "Bebidas",
          items: [{ id: "i1", name: "Café", price: 45 }],
        },
      ],
    };

    const ok = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: { ...content, design: menuDesign(["bebidas"]) },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(ok, projection)).resolves.toBe(
      "published",
    );
    expect(
      (firstSnapshot(snapshots).experience as Record<string, unknown>).design,
    ).toBeDefined();

    const badSection = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: { ...content, design: menuDesign(["postres"]) },
      }),
    );
    await expect(
      processNextPublication(badSection, { publish: async () => "activated" }),
    ).resolves.toBe("failed");
    expect(badSection.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("publishes a designed catalog, resolving the design's own image alongside the item's", async () => {
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              {
                id: "img1",
                kind: "image",
                imageRef: imageAssetId,
                alt: "",
                aspect: "auto",
                fit: "cover",
              },
              { id: "cat1", kind: "catalog", layout: "grid", columns: 1 },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    const repository = new MemoryPublicationJobs(
      job({
        type: "catalog",
        content: {
          title: "Catálogo",
          currency: "MXN",
          items: [{ id: "p1", name: "Producto" }],
          design,
        },
        assets: { [imageAssetId]: imageAsset },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const experience = firstSnapshot(snapshots).experience as {
      design: { sections: { columns: unknown[][] }[] };
    };
    const blocks = experience.design.sections[0]?.columns[0] as Record<
      string,
      unknown
    >[];
    expect(blocks.find((b) => b.kind === "image")?.imageRef).toBe(imageSha256);
  });

  it("publishes a designed catalog's gallery block, resolving every photo to a hash", async () => {
    const secondAssetId = "a1b2c3d4-0bb7-450e-91c6-342045d779e9";
    const secondSha256 = "e".repeat(64);
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              {
                id: "g1",
                kind: "gallery",
                layout: "grid",
                aspect: "1:1",
                images: [
                  { imageRef: imageAssetId, alt: "Local" },
                  { imageRef: secondAssetId, alt: "Producto" },
                ],
              },
              { id: "cat1", kind: "catalog", layout: "grid", columns: 1 },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    const repository = new MemoryPublicationJobs(
      job({
        type: "catalog",
        content: {
          title: "Catálogo",
          currency: "MXN",
          items: [{ id: "p1", name: "Producto" }],
          design,
        },
        assets: {
          [imageAssetId]: imageAsset,
          [secondAssetId]: { ...imageAsset, sha256: secondSha256 },
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const snapshot = firstSnapshot(snapshots);
    const experience = snapshot.experience as {
      design: { sections: { columns: unknown[][] }[] };
    };
    const blocks = experience.design.sections[0]?.columns[0] as Record<
      string,
      unknown
    >[];
    const gallery = blocks.find((b) => b.kind === "gallery") as {
      images: { imageRef: string }[];
    };
    expect(gallery.images.map((i) => i.imageRef)).toEqual([
      imageSha256,
      secondSha256,
    ]);
    expect(snapshot.assets).toContainEqual({
      sha256: secondSha256,
      mediaType: "image/png",
    });
  });

  it("'sin banco de fotos': publishes an image block and a gallery slot with no imageRef, unresolved and asset-free", async () => {
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              {
                id: "img1",
                kind: "image",
                alt: "Espacio para la foto del producto",
                aspect: "4:3",
                fit: "cover",
              },
              {
                id: "g1",
                kind: "gallery",
                layout: "grid",
                aspect: "1:1",
                images: [
                  { imageRef: imageAssetId, alt: "Local" },
                  { alt: "Espacio para otra foto" },
                ],
              },
              { id: "cat1", kind: "catalog", layout: "grid", columns: 1 },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    const repository = new MemoryPublicationJobs(
      job({
        type: "catalog",
        content: {
          title: "Catálogo",
          currency: "MXN",
          items: [{ id: "p1", name: "Producto" }],
          design,
        },
        assets: { [imageAssetId]: imageAsset },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const experience = firstSnapshot(snapshots).experience as {
      design: { sections: { columns: unknown[][] }[] };
    };
    const blocks = experience.design.sections[0]?.columns[0] as Record<
      string,
      unknown
    >[];
    const imageBlock = blocks.find((b) => b.kind === "image") as {
      imageRef?: string;
    };
    expect(imageBlock.imageRef).toBeUndefined();
    const gallery = blocks.find((b) => b.kind === "gallery") as {
      images: { imageRef?: string }[];
    };
    expect(gallery.images[0]?.imageRef).toBe(imageSha256);
    expect(gallery.images[1]?.imageRef).toBeUndefined();
  });

  it("publishes a designed menu's featuredItems block, checking its itemIds against the menu's own dishes", async () => {
    const menuDesign = (itemIds: string[]) => ({
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              { id: "mn1", kind: "menu", layout: "list", photos: "small" },
              {
                id: "fi1",
                kind: "featuredItems",
                layout: "cards",
                itemIds,
              },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    });
    const content = {
      title: "Carta",
      currency: "MXN",
      sections: [
        {
          id: "bebidas",
          name: "Bebidas",
          items: [{ id: "i1", name: "Café", price: 45 }],
        },
      ],
    };

    const ok = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: { ...content, design: menuDesign(["i1"]) },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(ok, projection)).resolves.toBe(
      "published",
    );
    expect(
      (firstSnapshot(snapshots).experience as Record<string, unknown>).design,
    ).toBeDefined();

    const ghost = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: { ...content, design: menuDesign(["ghost"]) },
      }),
    );
    await expect(
      processNextPublication(ghost, { publish: async () => "activated" }),
    ).resolves.toBe("failed");
    expect(ghost.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("publishes a designed catalog's featuredItems block, checking its itemIds against the catalog's own products", async () => {
    const catalogDesign = (itemIds: string[]) => ({
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              { id: "cat1", kind: "catalog", layout: "grid", columns: 2 },
              { id: "fi1", kind: "featuredItems", layout: "cards", itemIds },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    });
    const content = {
      title: "Catálogo",
      currency: "MXN",
      items: [{ id: "p1", name: "Producto" }],
    };

    const ok = new MemoryPublicationJobs(
      job({
        type: "catalog",
        content: { ...content, design: catalogDesign(["p1"]) },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(ok, projection)).resolves.toBe(
      "published",
    );
    expect(
      (firstSnapshot(snapshots).experience as Record<string, unknown>).design,
    ).toBeDefined();

    const ghost = new MemoryPublicationJobs(
      job({
        type: "catalog",
        content: { ...content, design: catalogDesign(["ghost"]) },
      }),
    );
    await expect(
      processNextPublication(ghost, { publish: async () => "activated" }),
    ).resolves.toBe("failed");
    expect(ghost.failed[0]?.code).toBe("CONTENT_INVALID");
  });

  it("publishes a designed form with no content item ids to check against", async () => {
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              { id: "lf1", kind: "leadForm", look: "boxed" },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    const repository = new MemoryPublicationJobs(
      job({
        type: "form",
        content: {
          title: "Contáctanos",
          fields: { name: "optional", phone: "hidden", message: "optional" },
          submitLabel: "Enviar",
          successMessage: "Gracias",
          consentText: "Acepto el aviso de privacidad.",
          design,
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(
      (firstSnapshot(snapshots).experience as Record<string, unknown>).design,
    ).toBeDefined();
  });

  it("publishes a designed image experience", async () => {
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [{ id: "im1", kind: "imageMain", fit: "cover", frame: "none" }],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    const repository = new MemoryPublicationJobs(
      job({
        type: "image",
        content: { assetId: imageAssetId, alt: "Foto de portada", design },
        assets: { [imageAssetId]: imageAsset },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    expect(
      (firstSnapshot(snapshots).experience as Record<string, unknown>).design,
    ).toBeDefined();
  });

  it("publishes a visor de PDF: pages resolved to hashes, the PDF stays assets[0], then pages, then design images", async () => {
    const pageAssetId = "aaaaaaaa-1111-4111-8111-111111111111";
    const pageAsset = {
      sha256: "d".repeat(64),
      mediaType: "image/png" as const,
      filename: "pagina-1.png",
    };
    const pdfAssetId = "bbbbbbbb-2222-4222-8222-222222222222";
    const pdfAsset = {
      sha256: "e".repeat(64),
      mediaType: "application/pdf" as const,
      filename: "menu.pdf",
    };
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              {
                id: "img1",
                kind: "image",
                imageRef: imageAssetId,
                alt: "",
                aspect: "auto",
                fit: "cover",
              },
              { id: "dp1", kind: "documentPages", pageStyle: "shadow" },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    const repository = new MemoryPublicationJobs(
      job({
        type: "document",
        content: {
          assetId: pdfAssetId,
          title: "Menú 2026",
          display: "viewer",
          allowDownload: true,
          pages: [{ assetId: pageAssetId, width: 800, height: 1000 }],
          design,
        },
        assets: {
          [pdfAssetId]: pdfAsset,
          [pageAssetId]: pageAsset,
          [imageAssetId]: imageAsset,
        },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const snapshot = firstSnapshot(snapshots);
    const experience = snapshot.experience as {
      display?: string;
      allowDownload?: boolean;
      pages?: { sha256: string; width: number; height: number }[];
    };
    expect(experience.display).toBe("viewer");
    expect(experience.allowDownload).toBe(true);
    expect(experience.pages).toEqual([
      { sha256: pageAsset.sha256, width: 800, height: 1000 },
    ]);
    expect(snapshot.assets?.[0]).toEqual({
      sha256: pdfAsset.sha256,
      mediaType: "application/pdf",
    });
    expect(snapshot.assets?.[1]).toEqual({
      sha256: pageAsset.sha256,
      mediaType: "image/png",
    });
    expect(snapshot.assets?.[2]).toEqual({
      sha256: imageSha256,
      mediaType: "image/png",
    });
  });

  it("rejects a visor de PDF with no pages", async () => {
    const pdfAssetId = "bbbbbbbb-2222-4222-8222-222222222222";
    const repository = new MemoryPublicationJobs(
      job({
        type: "document",
        content: {
          assetId: pdfAssetId,
          title: "Menú 2026",
          display: "viewer",
        },
        assets: {
          [pdfAssetId]: {
            sha256: "e".repeat(64),
            mediaType: "application/pdf",
            filename: "menu.pdf",
          },
        },
      }),
    );
    await expect(
      processNextPublication(repository, { publish: async () => "activated" }),
    ).resolves.toBe("failed");
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
    expect(repository.failed[0]?.message).toContain("viewer");
  });

  it("rejects a document page whose assetId is a PDF, not an image", async () => {
    const pdfAssetId = "bbbbbbbb-2222-4222-8222-222222222222";
    const repository = new MemoryPublicationJobs(
      job({
        type: "document",
        content: {
          assetId: pdfAssetId,
          title: "Menú 2026",
          display: "viewer",
          pages: [{ assetId: pdfAssetId, width: 800, height: 1000 }],
        },
        assets: {
          [pdfAssetId]: {
            sha256: "e".repeat(64),
            mediaType: "application/pdf",
            filename: "menu.pdf",
          },
        },
      }),
    );
    await expect(
      processNextPublication(repository, { publish: async () => "activated" }),
    ).resolves.toBe("failed");
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });
});

describe("Publisher: a Documento PDF viewer without its PDF file (2026-10-02)", () => {
  const pageAssetId = "aaaaaaaa-1111-4111-8111-111111111111";
  const page = { assetId: pageAssetId, width: 1240, height: 1754 };

  it("publishes the pages alone when the PDF was rejected (no download, no legacy asset)", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "document",
        content: { title: "Calculadora", display: "viewer", pages: [page] },
        assets: { [pageAssetId]: imageAsset },
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(repository, projection)).resolves.toBe(
      "published",
    );
    const snapshot = firstSnapshot(snapshots);
    expect(snapshot.asset).toBeUndefined();
    expect(snapshot.assets?.map((asset) => asset.mediaType)).toEqual([
      imageAsset.mediaType,
    ]);
  });

  it("still requires the PDF to download it", async () => {
    const repository = new MemoryPublicationJobs(
      job({
        type: "document",
        content: {
          title: "Calculadora",
          display: "viewer",
          allowDownload: true,
          pages: [page],
        },
        assets: { [pageAssetId]: imageAsset },
      }),
    );
    await expect(
      processNextPublication(repository, capturingProjection().projection),
    ).resolves.toBe("failed");
    expect(repository.failed[0]?.code).toBe("CONTENT_INVALID");
  });
});

describe("Publisher: «Menú del día» with choices (relevo 37, D1)", () => {
  const menu = (choices: unknown, choicesLabel?: unknown) => ({
    title: "Cocina Económica Doña Rosa",
    currency: "MXN",
    sections: [
      {
        id: "comidas",
        name: "Comida corrida",
        items: [
          {
            id: "corrida",
            name: "Comida corrida",
            description: "Sopa, guisado, postre y agua",
            price: 90,
            choices,
            ...(choicesLabel === undefined ? {} : { choicesLabel }),
          },
        ],
      },
    ],
  });

  it("publishes the choices of a dish with their label", async () => {
    const jobs = new MemoryPublicationJobs(
      job({
        type: "menu",
        content: menu(
          [
            { id: "mole", name: "Mole poblano" },
            { id: "chicharron", name: "Chicharrón" },
          ],
          "Elige tu guisado",
        ),
      }),
    );
    const { projection, snapshots } = capturingProjection();
    await expect(processNextPublication(jobs, projection)).resolves.toBe(
      "published",
    );
    const experience = firstSnapshot(snapshots).experience as {
      sections: { items: Record<string, unknown>[] }[];
    };
    expect(experience.sections[0]?.items[0]).toMatchObject({
      id: "corrida",
      choicesLabel: "Elige tu guisado",
      choices: [
        { id: "mole", name: "Mole poblano" },
        { id: "chicharron", name: "Chicharrón" },
      ],
    });
  });

  it("rejects invalid or repeated choices", async () => {
    for (const choices of [
      [],
      [{ id: "corrida", name: "Repite el platillo" }],
      [
        { id: "mole", name: "Mole" },
        { id: "mole", name: "Mole" },
      ],
      [{ id: "bad id", name: "x" }],
    ]) {
      const jobs = new MemoryPublicationJobs(
        job({ type: "menu", content: menu(choices) }),
      );
      await expect(
        processNextPublication(jobs, { publish: async () => "activated" }),
      ).resolves.toBe("failed");
      expect(jobs.failed[0]?.code).toBe("CONTENT_INVALID");
    }
  });
});
