import type { ExperienceContent } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { contentFieldDomId } from "../src/features/studio/model/content-focus.js";

describe("contentFieldDomId (relevo 37, C5c)", () => {
  const menu = {
    title: "Menú",
    sections: [
      {
        id: "sec-1",
        name: "Entradas",
        items: [{ id: "it-1" }, { id: "it-2" }],
      },
    ],
  } as unknown as ExperienceContent;

  it("resolves a menu item field to its editor's own id", () => {
    expect(contentFieldDomId("menu", menu, "sections.0.items.1.name")).toBe(
      "item-it-2-name",
    );
    expect(contentFieldDomId("menu", menu, "sections.0.items.1.price")).toBe(
      "item-it-2-price",
    );
    expect(contentFieldDomId("menu", menu, "sections.0.name")).toBe(
      "section-sec-1-name",
    );
  });

  it("resolves a catalog item field", () => {
    const catalog = {
      items: [{ id: "prod-1" }, { id: "prod-2" }],
    } as unknown as ExperienceContent;
    expect(contentFieldDomId("catalog", catalog, "items.1.price")).toBe(
      "catalog-prod-2-price",
    );
  });

  it("resolves a links/linkpage button field by the link's own id", () => {
    const links = {
      links: [{ id: "lnk-1" }],
    } as unknown as ExperienceContent;
    expect(contentFieldDomId("links", links, "links.0.url")).toBe(
      "link-lnk-1-url",
    );
    expect(contentFieldDomId("linkpage", links, "links.0.url")).toBe(
      "linkpage-button-lnk-1-url",
    );
  });

  it("resolves a simple top-level field per type", () => {
    const menuDetails = {} as unknown as ExperienceContent;
    expect(contentFieldDomId("menu", menuDetails, "title")).toBe("menu-title");
    expect(contentFieldDomId("form", menuDetails, "submitLabel")).toBe(
      "form-submit",
    );
    expect(contentFieldDomId("profile", menuDetails, "displayName")).toBe(
      "profile-name",
    );
  });

  it("returns null for a path or index it does not recognize", () => {
    expect(contentFieldDomId("menu", menu, "sections.5.name")).toBeNull();
    expect(contentFieldDomId("menu", menu, "unknownField")).toBeNull();
  });
});
