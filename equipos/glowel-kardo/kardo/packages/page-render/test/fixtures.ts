import type { DesignBlock, DesignSection, PageDesign } from "@kardo/contracts";
import type { DesignableContent, RenderContext } from "../src/index.js";

export function baseStyle(): PageDesign["style"] {
  return {
    palette: {
      background: "#f7f5f0",
      surface: "#ffffff",
      text: "#16232e",
      muted: "#52646d",
      accent: "#0a6c78",
    },
    fonts: { heading: "geist", body: "system" },
    radius: 16,
    buttonStyle: "solid",
    buttonShape: "rounded",
    shadow: "soft",
    background: { kind: "solid", color: "#f7f5f0" },
    maxWidth: 640,
  };
}

export function section(
  id: string,
  columns: DesignBlock[][],
  overrides: Partial<DesignSection> = {},
): DesignSection {
  const layout =
    overrides.layout ??
    (columns.length === 1 ? "1" : columns.length === 2 ? "1-1" : "1-1-1");
  return {
    id,
    layout,
    columns,
    paddingTop: 32,
    paddingBottom: 32,
    gap: 16,
    align: "start",
    ...overrides,
  };
}

export function design(sections: DesignSection[]): PageDesign {
  return { schema: 1, style: baseStyle(), sections };
}

export function testContext(
  overrides: Partial<RenderContext> = {},
): RenderContext {
  return {
    resolveImage: (ref) => `https://cdn.example.test/${ref}`,
    linkHref: (itemId) => `/go/${itemId}`,
    fontBaseUrl: "/_fonts/",
    ...overrides,
  };
}

export function linksContent(
  overrides: Partial<Extract<DesignableContent, { type: "links" }>> = {},
): Extract<DesignableContent, { type: "links" }> {
  return {
    type: "links",
    title: "Mi negocio",
    description: "Bienvenido",
    links: [{ id: "l1", label: "Sitio", url: "https://example.com" }],
    ...overrides,
  };
}

export function profileContent(
  overrides: Partial<Extract<DesignableContent, { type: "profile" }>> = {},
): Extract<DesignableContent, { type: "profile" }> {
  return {
    type: "profile",
    displayName: "Ana Pérez",
    headline: "Fotógrafa",
    links: [{ id: "l1", label: "Portafolio", url: "https://example.com" }],
    ...overrides,
  };
}

export function linkPageContent(
  overrides: Partial<Extract<DesignableContent, { type: "linkpage" }>> = {},
): Extract<DesignableContent, { type: "linkpage" }> {
  return {
    type: "linkpage",
    displayName: "Ana",
    bio: "Bio corta",
    socials: [
      { id: "s1", network: "instagram", value: "https://instagram.com/ana" },
    ],
    links: [
      {
        id: "l1",
        label: "Tienda",
        url: "https://example.com",
        highlight: true,
      },
    ],
    ...overrides,
  };
}
