import type {
  DesignableExperienceType,
  ExperienceContent,
} from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { contentItemIds } from "../src/features/studio/model/content.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import { AddBlockPanel } from "../src/features/studio/panels/AddBlockPanel.js";
import {
  StudioContext,
  type StudioContextValue,
} from "../src/features/studio/StudioContext.js";

/**
 * "Agregar bloque" (motor de 3 bloques, 2026-10-03): `featuredItems`
 * ("Destacados") must only offer itself where the contract allows it — a
 * Menú or a Catálogo — never on a type with no dishes or products to
 * highlight. `features` ("Datos clave") and `gallery` ("Galería") are free
 * blocks and must appear on every designable type.
 */

function noop() {
  // The panel only renders tiles here; nothing is ever clicked.
}

function contextFor(
  type: DesignableExperienceType,
  content: ExperienceContent,
): StudioContextValue {
  const design = designFromContent(type, content);
  return {
    type,
    design,
    change: noop,
    readOnly: false,
    content,
    changeContent: noop,
    contentErrors: {},
    contentIds: contentItemIds(content),
    contentRoute: { name: "overview" },
    canEditHtml: true,
    selection: null,
    select: noop,
    issues: [],
    workspaceId: "ws-1",
    experienceId: "exp-1",
    assets: [],
    addAsset: noop,
    canUploadAssets: true,
    swatches: [],
    templates: [],
    actions: {
      addBlock: noop,
      addBrandCircleRow: noop,
      addSection: noop,
      removeBlock: noop,
      duplicateBlock: noop,
      moveBlockStep: noop,
      moveBlockToSection: noop,
      removeSection: noop,
      duplicateSection: noop,
      moveSectionStep: noop,
      applyTemplate: noop,
      restoreCurrentLook: noop,
    },
    openRail: noop,
    focusContent: noop,
    contentFocus: null,
    editOnPage: noop,
  };
}

function renderPanel(
  type: DesignableExperienceType,
  content: ExperienceContent,
): string {
  return renderToStaticMarkup(
    <StudioContext.Provider value={contextFor(type, content)}>
      <AddBlockPanel />
    </StudioContext.Provider>,
  );
}

const menuContent: ExperienceContent = {
  title: "Menú",
  currency: "MXN",
  sections: [],
};
const catalogContent: ExperienceContent = {
  title: "Catálogo",
  currency: "MXN",
  items: [],
};
const profileContent: ExperienceContent = { displayName: "Ana" };
const linksContent: ExperienceContent = { title: "Enlaces", links: [] };

describe("AddBlockPanel: Destacados only where there is something to feature", () => {
  it("offers «Destacados» for a Menú", () => {
    expect(renderPanel("menu", menuContent)).toContain("Destacados");
  });

  it("offers «Destacados» for a Catálogo", () => {
    expect(renderPanel("catalog", catalogContent)).toContain("Destacados");
  });

  it("never offers «Destacados» for a Perfil", () => {
    expect(renderPanel("profile", profileContent)).not.toContain("Destacados");
  });

  it("never offers «Destacados» for a página de Enlaces", () => {
    expect(renderPanel("links", linksContent)).not.toContain("Destacados");
  });
});

describe("AddBlockPanel: free blocks on every type", () => {
  it("offers «Datos clave» and «Galería» on a Menú", () => {
    const html = renderPanel("menu", menuContent);
    expect(html).toContain("Datos clave");
    expect(html).toContain("Galería");
  });

  it("offers «Datos clave» and «Galería» on a página de Enlaces", () => {
    const html = renderPanel("links", linksContent);
    expect(html).toContain("Datos clave");
    expect(html).toContain("Galería");
  });
});
