import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import {
  authHeader,
  experienceId,
  touchpointId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Estudio de Experiences (ADR 018, addendum 3): "El esquema solo revisa `id`
// y `kind` de cada bloque; `checkDesign` ... lo valida exacto." A section's
// `columns` and a canvas's `items[].block` are only loosely typed in the
// JSON Schema TypeBox compiles for Fastify's request validation (AJV) — see
// `LooseBlockSchema` in packages/contracts/src/design.ts. This is a
// regression smoke test for the HTTP boundary itself: AJV, not TypeBox's own
// `Value.Check` (used internally by `validateExperienceContent`), must not
// reject a structurally valid design — including a schema 2 canvas section
// and blocks carrying every field beyond `id`/`kind` — before it ever
// reaches the repository. The mock repository below never runs
// `validateExperienceContent`; a 400 here can only come from the route's own
// `SafeCreateExperienceSchema` (AJV).
// ---------------------------------------------------------------------------

const imageAssetId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";

function baseDesignStyle() {
  return {
    palette: {
      background: "#ffffff",
      surface: "#f5f5f5",
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

function fakeRepository(overrides: Record<string, unknown> = {}) {
  const notUsed = async () => {
    throw new Error("not used");
  };
  return {
    listExperiences: notUsed,
    getExperienceDetail: notUsed,
    createExperience: notUsed,
    updateExperience: notUsed,
    setExperienceTargets: notUsed,
    restoreExperienceVersion: notUsed,
    createPublicationIntent: notUsed,
    createRollbackPublicationIntent: notUsed,
    ...overrides,
  };
}

describe("Fastify/AJV request validation accepts a valid design (regression)", () => {
  it("accepts a menu experience with a schema 2 canvas section and a loose column block", async () => {
    let receivedContent: unknown;
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: fakeRepository({
        createExperience: async (
          _identity: unknown,
          _workspaceId: string,
          input: { content: unknown },
        ) => {
          receivedContent = input.content;
          return {
            id: experienceId,
            touchpointId,
            name: "Carta",
            type: "menu" as const,
            content: input.content,
            publicationStatus: "draft" as const,
            hasUnpublishedChanges: true,
            liveRevision: null,
            updatedAt: "2026-09-24T00:00:00.000Z",
          };
        },
      }),
    });

    const design = {
      schema: 2,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              { id: "mn1", kind: "menu", layout: "list", photos: "none" },
              // A loose column block with plenty of fields beyond id/kind.
              { id: "h1", kind: "heading", text: "Bienvenido", level: 1 },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
        {
          id: "c1",
          kind: "canvas",
          height: 400,
          items: [
            {
              block: {
                id: "img1",
                kind: "image",
                imageRef: imageAssetId,
                alt: "Foto",
                aspect: "1:1",
                fit: "cover",
              },
              x: 0,
              y: 0,
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
              x: 0,
              y: 220,
              w: 342,
            },
          ],
        },
      ],
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences`,
      headers: authHeader,
      payload: {
        touchpointId,
        name: "Carta",
        type: "menu",
        content: {
          title: "Carta",
          currency: "USD",
          sections: [
            { id: "s1", name: "Entradas", items: [{ id: "i1", name: "Sopa" }] },
          ],
          design,
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(
      (receivedContent as { design?: { schema: number } } | undefined)?.design
        ?.schema,
    ).toBe(2);
    await app.close();
  });
});
