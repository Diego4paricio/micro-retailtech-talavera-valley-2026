import type {
  ExperienceSummary,
  Touchpoint,
  TouchpointGroup,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  groupDeleteTargetingNotice,
  groupNameSuggestions,
  groupTargetingExperienceNames,
  memberSections,
  siblingNameTaken,
} from "../src/features/touchpoints/group-form-model.js";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const groups: TouchpointGroup[] = [
  {
    id: id(1),
    name: "Local Centro",
    description: null,
    touchpointCount: 0,
    parentId: null,
    kind: "location",
  },
  {
    id: id(2),
    name: "Terraza",
    description: null,
    touchpointCount: 1,
    parentId: id(1),
    kind: "group",
  },
  {
    id: id(3),
    name: "Salón",
    description: null,
    touchpointCount: 1,
    parentId: null,
    kind: "group",
  },
];

const touchpoint = (n: number, name: string, groupId: string | null) =>
  ({
    id: id(100 + n),
    publicId: `public${n}`,
    operationalName: name,
    kind: "qr",
    status: "active",
    groupId,
    live: null,
  }) as Touchpoint;

const items = [
  touchpoint(1, "Mesa 1", id(2)),
  touchpoint(2, "Mesa 2", id(3)),
  touchpoint(3, "Mostrador", null),
  // Its group is not loaded (deleted meanwhile): it must not disappear.
  touchpoint(4, "Barra", id(99)),
];

describe("new group dialog: touchpoints to choose", () => {
  it("sorts them by where they are now, with the group's path", () => {
    const sections = memberSections({
      touchpoints: items,
      groups,
      selfId: null,
    });
    expect(sections.map((section) => section.title)).toEqual([
      "Sin grupo",
      "En «Local Centro › Terraza»",
      "En «Salón»",
    ]);
    expect(sections[0]?.items.map((item) => item.operationalName)).toEqual([
      "Mostrador",
      "Barra",
    ]);
  });

  it("puts the group's own first when editing it", () => {
    const sections = memberSections({
      touchpoints: items,
      groups,
      selfId: id(3),
    });
    expect(sections[0]).toMatchObject({ id: "self", title: "En este grupo" });
    expect(sections[0]?.items.map((item) => item.operationalName)).toEqual([
      "Mesa 2",
    ]);
    expect(sections.some((section) => section.title === "En «Salón»")).toBe(
      false,
    );
  });

  it("filters by name", () => {
    const sections = memberSections({
      touchpoints: items,
      groups,
      selfId: null,
      query: " mesa ",
    });
    expect(
      sections
        .flatMap((section) => section.items)
        .map((item) => item.operationalName),
    ).toEqual(["Mesa 1", "Mesa 2"]);
  });
});

describe("new group dialog: the name", () => {
  it("is unique only among siblings, and the edited group does not count", () => {
    expect(siblingNameTaken(groups, id(1), " terraza ", null)).toBe(true);
    expect(siblingNameTaken(groups, null, "Terraza", null)).toBe(false);
    expect(siblingNameTaken(groups, id(1), "Terraza", id(2))).toBe(false);
    expect(siblingNameTaken(groups, null, "", null)).toBe(false);
  });

  it("suggests names for several kinds of business", () => {
    expect(groupNameSuggestions.location.length).toBeGreaterThan(2);
    expect(groupNameSuggestions.group).toContain("Probadores");
  });
});

describe("deleting a group warns about pages that target it (A9-13)", () => {
  const experience = (
    name: string,
    groupIds: string[],
    archivedAt: string | null = null,
  ) =>
    ({
      id: name,
      name,
      archivedAt,
      targets: { touchpointIds: [], groupIds },
    }) as unknown as ExperienceSummary;

  it("finds only non-archived pages that target the group directly", () => {
    const experiences = [
      experience("Menú", [id(2)]),
      experience("Catálogo", [id(3)]),
      experience("Viejo menú", [id(2)], "2026-09-01T00:00:00.000Z"),
      experience("Perfil", []),
    ];
    expect(groupTargetingExperienceNames(experiences, id(2))).toEqual(["Menú"]);
    expect(groupTargetingExperienceNames(experiences, id(3))).toEqual([
      "Catálogo",
    ]);
    expect(groupTargetingExperienceNames(experiences, id(9))).toEqual([]);
  });

  it("names one, two or several pages in Spanish", () => {
    expect(groupDeleteTargetingNotice([])).toBeNull();
    expect(groupDeleteTargetingNotice(["Menú"])).toBe(
      "La página «Menú» se publica en este grupo: seguirá viéndose en sus QR y etiquetas.",
    );
    expect(groupDeleteTargetingNotice(["Menú", "Catálogo"])).toBe(
      "Las páginas «Menú» y «Catálogo» se publican en este grupo: seguirán viéndose en sus QR y etiquetas.",
    );
    expect(groupDeleteTargetingNotice(["Menú", "Catálogo", "Perfil"])).toBe(
      "Las páginas «Menú», «Catálogo» y «Perfil» se publican en este grupo: seguirán viéndose en sus QR y etiquetas.",
    );
  });
});
