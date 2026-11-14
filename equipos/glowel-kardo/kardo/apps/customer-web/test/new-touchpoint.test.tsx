import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CreatedSummary,
  KindStep,
  NameStep,
  OrderStep,
  orderOptions,
} from "../src/features/touchpoints/NewTouchpointDialog.js";
import {
  BATCH_MAX,
  batchNamePreview,
  clampBatch,
  creationHeadline,
  creationNames,
  defaultSplits,
  emptyNewTouchpointDraft,
  evenSplits,
  firstOpenStep,
  groupNamed,
  orderSummary,
  pluralGroupName,
  splitProblem,
  splitRanges,
  stepIsComplete,
  withCountAt,
  withOrderDefaults,
} from "../src/features/touchpoints/new-touchpoint-model.js";

const draft = (patch: Partial<typeof emptyNewTouchpointDraft>) => ({
  ...emptyNewTouchpointDraft,
  ...patch,
});

describe("new touchpoint assistant: steps", () => {
  it("asks for the object first, then the name, then the details", () => {
    expect(firstOpenStep(emptyNewTouchpointDraft)).toBe("kind");
    expect(firstOpenStep(draft({ kind: "qr" }))).toBe("name");
    expect(firstOpenStep(draft({ kind: "qr", name: "Mesa 1" }))).toBe(
      "details",
    );
  });

  it("a name step is complete with a name, or a valid batch", () => {
    expect(stepIsComplete("name", draft({ kind: "nfc", name: "  " }))).toBe(
      false,
    );
    expect(
      stepIsComplete("name", draft({ kind: "nfc", name: "Llavero" })),
    ).toBe(true);
    const batch = draft({ kind: "qr", mode: "batch", namePrefix: "Mesa" });
    expect(stepIsComplete("name", batch)).toBe(true);
    expect(stepIsComplete("name", { ...batch, namePrefix: "" })).toBe(false);
    expect(stepIsComplete("name", { ...batch, count: BATCH_MAX + 1 })).toBe(
      false,
    );
    expect(stepIsComplete("details", { ...batch, kind: null })).toBe(false);
  });

  it("keeps batch numbers inside their limits", () => {
    expect(clampBatch(0, 1, BATCH_MAX)).toBe(1);
    expect(clampBatch(250, 1, BATCH_MAX)).toBe(BATCH_MAX);
    expect(clampBatch(Number.NaN, 1, BATCH_MAX)).toBe(1);
    expect(clampBatch(7.8, 1, BATCH_MAX)).toBe(7);
  });

  it("previews a batch without listing all of it", () => {
    expect(
      batchNamePreview({ namePrefix: "Mesa", start: 1, count: 20 }),
    ).toEqual({
      names: ["Mesa 1", "Mesa 2", "Mesa 3"],
      last: "Mesa 20",
      more: 16,
    });
    expect(
      batchNamePreview({ namePrefix: "Caja", start: 5, count: 2 }),
    ).toEqual({ names: ["Caja 5", "Caja 6"], last: null, more: 0 });
  });

  it("summarizes what will be created", () => {
    expect(creationHeadline(draft({ kind: "qr", name: "Mesa 1" }))).toBe(
      "1 touchpoint QR",
    );
    const batch = draft({
      kind: "nfc",
      mode: "batch",
      namePrefix: "Tarjeta",
      count: 20,
    });
    expect(creationHeadline(batch)).toBe("20 touchpoints NFC");
    expect(creationNames(batch)).toBe("Tarjeta 1 … Tarjeta 20");
    expect(creationNames(draft({ kind: "qr", name: "  Recepción " }))).toBe(
      "Recepción",
    );
  });
});

describe("new touchpoint assistant: what it shows", () => {
  it("the object step explains each format with examples", () => {
    const html = renderToStaticMarkup(
      <KindStep kind="nfc" onPick={() => undefined} />,
    );
    expect(html).toContain("¿Qué objeto vas a usar?");
    for (const label of ["QR", "NFC", "Otro"]) expect(html).toContain(label);
    expect(html).toContain("Tarjetas de presentación");
    expect(html).toContain('aria-pressed="true"');
  });

  it("the name step suggests names, and previews a batch", () => {
    const single = renderToStaticMarkup(
      <NameStep draft={draft({ kind: "qr" })} update={() => undefined} />,
    );
    expect(single).toContain("Nombre interno");
    expect(single).toContain("Mostrador");
    const batch = renderToStaticMarkup(
      <NameStep
        draft={draft({
          kind: "qr",
          mode: "batch",
          namePrefix: "Mesa",
          count: 20,
        })}
        update={() => undefined}
      />,
    );
    expect(batch).toContain("Se crearán:");
    expect(batch).toContain("Mesa 20");
    expect(batch).toContain("+16");
  });

  it("the end screen says what was created", () => {
    const html = renderToStaticMarkup(
      <CreatedSummary
        created={{
          kind: "batch",
          prefix: "Mesa",
          count: 20,
          groups: [],
          propagated: 0,
        }}
      />,
    );
    expect(html).toContain("Se crearon 20 QR y etiquetas");
  });

  it("the end screen lists each group of a split batch with its range", () => {
    const html = renderToStaticMarkup(
      <CreatedSummary
        created={{
          kind: "batch",
          prefix: "Mesa",
          count: 20,
          groups: [
            { id: "a", name: "Terraza", start: 1, count: 12 },
            { id: "b", name: "Salón", start: 13, count: 8 },
          ],
          propagated: 0,
        }}
      />,
    );
    expect(html).toContain("Se crearon 20 QR y etiquetas en 2 grupos");
    expect(html).toContain("Mesa 1 a 12");
    expect(html).toContain("Mesa 13 a 20");
  });
});

const groups = [
  {
    id: "7b8c9d0e-1f20-4a3b-8c4d-5e6f7a8b9c0d",
    name: "Mesas",
    description: null,
    touchpointCount: 4,
  },
];

describe("new touchpoint assistant: where they go (Orden)", () => {
  const batch = draft({
    kind: "qr",
    mode: "batch",
    namePrefix: "Mesa",
    count: 20,
  });

  it("proposes a new group named after the batch, and no group for one", () => {
    expect(withOrderDefaults(batch)).toMatchObject({
      groupMode: "new",
      newGroupName: "Mesas",
    });
    expect(
      withOrderDefaults(draft({ kind: "nfc", name: "Llavero" })).groupMode,
    ).toBe("none");
  });

  it("keeps the customer's choice once made, but never a split for one", () => {
    expect(
      withOrderDefaults({ ...batch, groupMode: "none", orderTouched: true })
        .groupMode,
    ).toBe("none");
    expect(
      withOrderDefaults({
        ...batch,
        mode: "single",
        name: "Mostrador",
        groupMode: "split",
        orderTouched: true,
      }).groupMode,
    ).toBe("none");
  });

  it("names the group in plural from the batch name", () => {
    expect(pluralGroupName("Mesa")).toBe("Mesas");
    expect(pluralGroupName("Mostrador")).toBe("Mostradores");
    expect(pluralGroupName("Luz")).toBe("Luces");
    expect(pluralGroupName("Probador VIP")).toBe("Probador VIP");
  });

  it("splits into consecutive ranges and says what is missing", () => {
    const split = {
      ...batch,
      groupMode: "split" as const,
      splits: [
        { name: "Terraza", count: 12 },
        { name: "Salón", count: 8 },
      ],
    };
    expect(splitRanges(1, split.splits)).toEqual([
      { name: "Terraza", start: 1, count: 12 },
      { name: "Salón", start: 13, count: 8 },
    ]);
    expect(splitProblem(split)).toBeNull();
    expect(stepIsComplete("details", split)).toBe(true);
    expect(
      splitProblem({
        ...split,
        splits: [
          { name: "Terraza", count: 12 },
          { name: "", count: 8 },
        ],
      }),
    ).toBe("Ponle nombre a cada grupo.");
    expect(
      splitProblem({
        ...split,
        splits: [
          { name: "Terraza", count: 12 },
          { name: "terraza", count: 8 },
        ],
      }),
    ).toBe("Usa un nombre distinto para cada grupo.");
    expect(
      splitProblem({
        ...split,
        splits: [
          { name: "Terraza", count: 10 },
          { name: "Salón", count: 8 },
        ],
      }),
    ).toBe("Faltan 2 por repartir.");
    expect(
      splitProblem({
        ...split,
        splits: [
          { name: "Terraza", count: 15 },
          { name: "Salón", count: 8 },
        ],
      }),
    ).toBe("Sobran 3: reparte 20 en total.");
    expect(stepIsComplete("details", { ...split, splits: [] })).toBe(false);
  });

  it("gives the last group what is left when another count changes", () => {
    const two = [
      { name: "Terraza", count: 10 },
      { name: "Salón", count: 10 },
    ];
    expect(withCountAt(20, two, 0, 12)).toEqual([
      { name: "Terraza", count: 12 },
      { name: "Salón", count: 8 },
    ]);
    expect(withCountAt(20, two, 0, 25)[1]?.count).toBe(0);
    // Editing the last one leaves the others alone (the status says why).
    expect(withCountAt(20, two, 1, 4)).toEqual([
      { name: "Terraza", count: 10 },
      { name: "Salón", count: 4 },
    ]);
  });

  it("shares a batch evenly, keeping the names", () => {
    expect(
      evenSplits(20, [
        { name: "A", count: 1 },
        { name: "B", count: 1 },
        { name: "C", count: 1 },
      ]),
    ).toEqual([
      { name: "A", count: 7 },
      { name: "B", count: 7 },
      { name: "C", count: 6 },
    ]);
    expect(defaultSplits(9)).toEqual([
      { name: "", count: 5 },
      { name: "", count: 4 },
    ]);
  });

  it("a new group needs a name; an existing one needs to be chosen", () => {
    expect(
      stepIsComplete("details", {
        ...batch,
        groupMode: "new",
        newGroupName: " ",
      }),
    ).toBe(false);
    expect(
      stepIsComplete("details", {
        ...batch,
        groupMode: "existing",
        groupId: "",
      }),
    ).toBe(false);
    expect(groupNamed(groups, "  mesas ")?.id).toBe(groups[0]?.id);
  });

  it("the summary says where they go", () => {
    expect(
      orderSummary({ ...batch, groupMode: "new", newGroupName: "Mesas" }, null),
    ).toBe("En el grupo nuevo «Mesas»");
    expect(
      orderSummary(
        {
          ...batch,
          groupMode: "split",
          splits: [
            { name: "Terraza", count: 12 },
            { name: "Salón", count: 8 },
          ],
        },
        null,
      ),
    ).toBe("Repartidos en 2 grupos: Terraza (12), Salón (8)");
    expect(orderSummary({ ...batch, groupMode: "none" }, null)).toBe(
      "Sin grupo",
    );
  });

  it("offers a split only for many at once, and an existing group only when there is one", () => {
    const many = orderOptions(batch, true).map((option) => option.id);
    expect(many).toEqual(["new", "existing", "split", "none"]);
    const one = orderOptions(
      draft({ kind: "qr", name: "Mostrador" }),
      false,
    ).map((option) => option.id);
    expect(one).toEqual(["none", "new"]);
  });

  it("renders the split editor with each range", () => {
    const html = renderToStaticMarkup(
      <OrderStep
        draft={{
          ...batch,
          groupMode: "split",
          splits: [
            { name: "Terraza", count: 12 },
            { name: "Salón", count: 8 },
          ],
        }}
        groups={groups}
        update={() => undefined}
      />,
    );
    expect(html).toContain("¿Cómo ordenas estos 20?");
    expect(html).toContain("Mesa 1 a 12");
    expect(html).toContain("Mesa 13 a 20");
    expect(html).toContain("Listo: 20 repartidos en 2 grupos");
  });
});

describe("first visit to Touchpoints", () => {
  it("explains what a touchpoint is, the three steps, and one button", async () => {
    const { TouchpointsOnboarding } = await import(
      "../src/features/touchpoints/TouchpointsPage.js"
    );
    const html = renderToStaticMarkup(
      <TouchpointsOnboarding onCreate={() => undefined} />,
    );
    expect(html).toContain("Crea tu primer QR o etiqueta");
    expect(html).toContain("Elige el objeto");
    expect(html).toContain("Ponle nombre");
    expect(html).toContain("Publica una página");
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});
