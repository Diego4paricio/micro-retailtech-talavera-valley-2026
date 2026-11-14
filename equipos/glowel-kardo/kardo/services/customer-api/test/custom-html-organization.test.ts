import type { WorkspaceProfile } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { AssetRepository } from "../src/assets.js";
import type { CustomHtmlPromptImage } from "../src/custom-html/images.js";
import { createCustomHtmlLimiter } from "../src/custom-html/limiter.js";
import type {
  CustomHtmlModel,
  CustomHtmlModelCompleteInput,
} from "../src/custom-html/model.js";
import {
  organizationImageRefs,
  organizationPromptInput,
} from "../src/custom-html/organization.js";
import type { CustomHtmlAssistantRepository } from "../src/repositories/custom-html.js";
import type { WorkspaceProfileRepository } from "../src/repositories/workspace-profile.js";
import {
  authHeader,
  experienceId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// The organization's brand reaches Kardo's AI on its own (2026-10-02): the
// profile's giro, city, "Sobre tu negocio", colors, logo and cover go into
// every generation without the customer choosing them again.
// ---------------------------------------------------------------------------

const logo = "11111111-1111-4111-8111-111111111111";
const cover = "22222222-2222-4222-8222-222222222222";
const chosen = "33333333-3333-4333-8333-333333333333";

const profile: WorkspaceProfile = {
  industry: "cafeteria",
  city: "Guadalajara",
  about: "Cafetería de barrio con pan dulce hecho aquí.",
  hours: "Lun a sáb, 8:00 a 17:00",
  brand: { primary: "#4a2c21", accent: "#d98e4a" },
  logoAssetId: logo,
  coverAssetId: cover,
};

function image(ref: string, label: string): CustomHtmlPromptImage {
  return { ref, label, mediaType: "image/png", base64: "" };
}

describe("organizationImageRefs", () => {
  it("puts the logo first, then the chosen images, then the cover", () => {
    expect(organizationImageRefs(profile, [chosen])).toEqual([
      logo,
      chosen,
      cover,
    ]);
  });

  it("never repeats an image and works without a profile", () => {
    expect(organizationImageRefs(profile, [cover, logo])).toEqual([
      logo,
      cover,
    ]);
    expect(organizationImageRefs(null, [chosen])).toEqual([chosen]);
  });
});

describe("organizationPromptInput", () => {
  it("names the logo and cover only when the prompt really has them", () => {
    const withBoth = organizationPromptInput(profile, [
      image(logo, "logo.png"),
      image(chosen, "terraza.jpg"),
      image(cover, "portada.jpg"),
    ]);
    expect(withBoth.organization).toMatchObject({
      industry: "cafeteria",
      city: "Guadalajara",
      logoRef: logo,
      coverRef: cover,
    });
    expect(withBoth.images.map((item) => item.label)).toEqual([
      "Logo del negocio",
      "terraza.jpg",
      "Portada del negocio",
    ]);

    // The cover failed to read: it is not offered to the model.
    const logoOnly = organizationPromptInput(profile, [
      image(logo, "logo.png"),
    ]);
    expect(logoOnly.organization.logoRef).toBe(logo);
    expect(logoOnly.organization.coverRef).toBeUndefined();
  });
});

describe("design generation route with the organization profile", () => {
  it("sends the giro, city, about and brand colors on its own", async () => {
    const seen: CustomHtmlModelCompleteInput[] = [];
    const model: CustomHtmlModel = {
      provider: "anthropic",
      model: "claude-sonnet-5",
      complete: async (input) => {
        seen.push(input);
        return {
          text: JSON.stringify({ design: { schema: 1 }, notes: "" }),
          usage: {
            inputTokens: 1,
            outputTokens: 1,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          stopReason: "end_turn",
        };
      },
    };
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: model,
      customHtmlAssistantRepository: {
        loadContentForDesignGeneration: async () => ({
          businessName: "Café Central",
          type: "links",
          content: {
            title: "Café Central",
            links: [
              { id: "link-1", label: "Menú", url: "https://example.com" },
            ],
          },
        }),
        requireCustomHtmlBlockPermission: async () => {},
        recordDesignGeneration: async () => {},
      } as unknown as CustomHtmlAssistantRepository,
      workspaceProfileRepository: {
        getProfile: async () => profile,
      } as unknown as WorkspaceProfileRepository,
      customHtmlLimiter: createCustomHtmlLimiter(20),
      assetRepository: {} as AssetRepository,
      assetWorker: null,
    });
    await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/generations`,
      headers: authHeader,
      payload: {
        brief: {
          description: "quiero mi menu",
          colors: [],
          imageRefs: [],
          fonts: [],
        },
      },
    });
    const first = seen[0];
    expect(first).toBeDefined();
    const text = first?.messages[0]?.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    expect(text).toContain("Perfil de la organización");
    expect(text).toContain("Giro: cafetería");
    expect(text).toContain("Guadalajara");
    expect(text).toContain(profile.about);
    expect(text).toContain('Horario: "Lun a sáb, 8:00 a 17:00"');
    expect(text).toContain("#4a2c21");
    expect(text).toContain("Receta para este giro (café)");
    expect(first?.system).not.toContain("Recetas por giro");
    await app.close();
  });
});
