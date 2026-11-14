import type {
  DesignableExperienceType,
  DesignBackground,
  DesignBlock,
  DesignFont,
  DesignStyle,
  ExperienceContent,
  ExperienceTheme,
  PageDesign,
} from "@kardo/contracts";
import { documentViewerDesign } from "@kardo/page-render";
import { createBlock } from "./blocks.js";
import { contentItemIds } from "./content.js";
import { idFactoryFor, type NewId } from "./ids.js";

/**
 * "Usar mi diseño actual": turns today's theme into a design that looks the
 * same, with one card section holding the type's content blocks.
 */

/** The page look of a content without a theme (the Kardo light look). */
export const defaultDesignStyle: DesignStyle = {
  palette: {
    background: "#f7f5f0",
    surface: "#fffdf8",
    text: "#16232e",
    muted: "#52646d",
    accent: "#0a6c78",
  },
  fonts: { heading: "dm-sans", body: "dm-sans" },
  radius: 16,
  buttonStyle: "solid",
  buttonShape: "rounded",
  shadow: "soft",
  background: { kind: "none" },
  maxWidth: 576,
};

const surfaces = {
  light: { surface: "#fffdf8", text: "#16232e", muted: "#52646d" },
  dark: { surface: "#1c232b", text: "#f4f6f5", muted: "#aab4bb" },
} as const;

const themeFonts: Record<ExperienceTheme["font"], DesignFont> = {
  sans: "dm-sans",
  serif: "serif",
  rounded: "rounded",
  mono: "mono",
};

function themeBackground(theme: ExperienceTheme): DesignBackground {
  const { background } = theme;
  switch (background.kind) {
    case "solid":
      return { kind: "solid", color: background.color };
    case "gradient":
      return {
        kind: "gradient",
        color: background.color,
        colorTo: background.colorTo ?? background.color,
        angle: background.angle ?? 180,
      };
    case "image":
      return background.imageAssetId
        ? {
            kind: "image",
            color: background.color,
            imageRef: background.imageAssetId,
            overlay: background.overlay ?? 0,
            position: "center",
          }
        : { kind: "solid", color: background.color };
  }
}

export function styleFromTheme(
  theme: ExperienceTheme | undefined,
): DesignStyle {
  if (!theme) return structuredClone(defaultDesignStyle);
  const surface = surfaces[theme.surface];
  const font = themeFonts[theme.font];
  const outline = theme.buttonStyle === "outline";
  return {
    palette: {
      background: theme.background.color,
      surface: surface.surface,
      text: surface.text,
      muted: surface.muted,
      accent: theme.accent,
    },
    fonts: { heading: font, body: font },
    radius: 16,
    buttonStyle: outline ? "outline" : "solid",
    buttonShape:
      theme.buttonStyle === "pill"
        ? "pill"
        : theme.buttonStyle === "square"
          ? "square"
          : "rounded",
    shadow: "soft",
    background: themeBackground(theme),
    maxWidth: 576,
  };
}

/** The type's content blocks, in the order today's pages show them. */
export function contentBlocksFor(
  type: DesignableExperienceType,
  newId: NewId,
): DesignBlock[] {
  switch (type) {
    case "links":
      return [
        createBlock("contentTitle", newId),
        createBlock("contentLinks", newId),
      ];
    case "profile":
      return [
        createBlock("profileHeader", newId),
        createBlock("contentLinks", newId),
      ];
    case "linkpage":
      return [
        createBlock("profileHeader", newId),
        createBlock("contentSocials", newId),
        createBlock("contentLinks", newId),
      ];
    case "menu":
      return [createBlock("contentTitle", newId), createBlock("menu", newId)];
    case "catalog":
      return [
        createBlock("contentTitle", newId),
        createBlock("catalog", newId),
      ];
    case "form":
      return [
        createBlock("contentTitle", newId),
        createBlock("leadForm", newId),
      ];
    case "document":
      return [
        createBlock("contentTitle", newId),
        createBlock("documentPages", newId),
      ];
    case "image":
      return [createBlock("imageMain", newId)];
  }
}

/** Sections align to the left by default; a header-shaped type (a person's
 * profile, a link-in-bio page or a single photo) reads better centered. */
const centeredTypes: readonly DesignableExperienceType[] = [
  "linkpage",
  "image",
];

export function designFromContent(
  type: DesignableExperienceType,
  content: ExperienceContent,
  newId: NewId = idFactoryFor(null, contentItemIds(content)),
): PageDesign {
  const theme = (content as { theme?: ExperienceTheme }).theme;
  if (type === "document") return documentDesignFrom(theme, newId);
  return {
    schema: 1,
    style: {
      ...styleFromTheme(theme),
      ambient: { kind: "auto" },
      pagePadding: 20,
    },
    sections: [
      {
        id: newId("s"),
        layout: "1",
        columns: [contentBlocksFor(type, newId)],
        card: type !== "image",
        paddingTop: 28,
        paddingBottom: 28,
        gap: 16,
        align: centeredTypes.includes(type) ? "center" : "start",
      },
    ],
  };
}

/**
 * A Documento PDF starts as only its pages, edge to edge on a phone and in a
 * wide column on a computer: what matters is the document itself (a menu,
 * a brochure), not text around it; titles or buttons can be added later.
 * Same structure as `documentViewerDesign` (@kardo/page-render), which the
 * Resolver serves when a viewer has no design, in the page's theme colors.
 */
function documentDesignFrom(
  theme: ExperienceTheme | undefined,
  newId: NewId,
): PageDesign {
  const base = documentViewerDesign();
  const themed = theme ? styleFromTheme(theme) : null;
  return {
    ...base,
    style: {
      ...base.style,
      ...(themed
        ? {
            palette: themed.palette,
            fonts: themed.fonts,
            background: themed.background,
          }
        : {}),
    },
    sections: [
      {
        id: newId("s"),
        layout: "1",
        columns: [
          [
            {
              ...createBlock("documentPages", newId),
              kind: "documentPages",
              pageStyle: "flat",
              gap: 8,
            } as DesignBlock,
          ],
        ],
        paddingTop: 0,
        paddingBottom: 0,
        gap: 0,
        align: "center",
      },
    ],
  };
}
