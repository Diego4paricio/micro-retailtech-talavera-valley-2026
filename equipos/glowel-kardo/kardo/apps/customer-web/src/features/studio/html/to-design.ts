import {
  DESIGN_LIMITS,
  type DesignableExperienceType,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";
import {
  blockKindLabel,
  isBoundKind,
  isRequiredKind,
} from "../model/blocks.js";
import { createIdFactory, designIds } from "../model/ids.js";
import { designCounts } from "../model/limits.js";
import {
  type BlockTarget,
  findFlowSection,
  insertBlock,
  locateBlock,
  removeBlock,
  updateBlock,
} from "../model/operations.js";
import { validateDesign } from "../model/validate.js";
import { cssRulesForClasses, cssWithoutClasses } from "./css-blocks.js";
import {
  collectClasses,
  defaultHtmlParser,
  findMarked,
  type HtmlParser,
  type LiteElement,
  serialize,
  topUnits,
} from "./dom-lite.js";

/**
 * HTML → Bloques (sync between the two editors of the Estudio, 2026-10):
 * compares the machine-generated source (`designToCustomCode` of the saved
 * or last-generated design) against what the person actually left in the
 * editor, and turns every changed or new element into (or as) an `html`
 * design block, in place — never touching a bound block's own content
 * (enlaces, redes, perfil…), which stays live on the platform instead.
 * Pure — same input, same output, no DOM of its own (the caller's parser,
 * `DOMParser` in the panel, is injected).
 */

export type Code = { html: string; css: string };
export type BlockSyncAction = "changed" | "added" | "removed";
export type BlockSyncChange = { blockId: string; action: BlockSyncAction };

export type SyncPlan = {
  design: PageDesign;
  changedBlocks: BlockSyncChange[];
  notes: string[];
};

function squash(css: string): string {
  return css.replace(/\s+/g, "");
}

type Unit = { id: string | null; el: LiteElement };

/** Aligns the generated and edited unit lists of one section by id: an
 * edited id found ahead in the generated list is a match (whatever sits
 * between is simply not looked at again — order changes are not treated as
 * removals); an edited unit with no id, or an id the generated list never
 * had, is new content; a generated id never matched is removed. */
function diffUnits(
  genUnits: readonly Unit[],
  editUnits: readonly Unit[],
): {
  matched: { id: string; el: LiteElement }[];
  inserted: { beforeId: string | null; el: LiteElement }[];
  removed: string[];
} {
  const matched: { id: string; el: LiteElement }[] = [];
  const inserted: { beforeId: string | null; el: LiteElement }[] = [];
  let gi = 0;
  for (const unit of editUnits) {
    if (unit.id === null) {
      inserted.push({ beforeId: genUnits[gi]?.id ?? null, el: unit.el });
      continue;
    }
    let found = -1;
    for (let k = gi; k < genUnits.length; k += 1) {
      if (genUnits[k]?.id === unit.id) {
        found = k;
        break;
      }
    }
    if (found === -1) {
      inserted.push({ beforeId: genUnits[gi]?.id ?? null, el: unit.el });
      continue;
    }
    matched.push({ id: unit.id, el: unit.el });
    gi = found + 1;
  }
  const matchedIds = new Set(matched.map((m) => m.id));
  const removed = genUnits
    .map((u) => u.id)
    .filter((id): id is string => id !== null && !matchedIds.has(id));
  return { matched, inserted, removed };
}

function insertionTarget(
  design: PageDesign,
  sectionId: string,
  beforeId: string | null,
): BlockTarget | null {
  if (beforeId) {
    const at = locateBlock(design, beforeId);
    if (at?.on === "flow")
      return { sectionId, columnIndex: at.columnIndex, index: at.blockIndex };
  }
  const section = findFlowSection(design, sectionId);
  if (!section) return null;
  const columnIndex = section.columns.length - 1;
  return {
    sectionId,
    columnIndex,
    index: section.columns[columnIndex]?.length ?? 0,
  };
}

export function customCodeToDesign(
  type: DesignableExperienceType,
  design: PageDesign,
  contentIds: readonly string[],
  generated: Code,
  edited: Code,
  parseHtml: HtmlParser = defaultHtmlParser(),
): SyncPlan {
  if (generated.html === edited.html && generated.css === edited.css)
    return { design, changedBlocks: [], notes: [] };

  const genRoots = parseHtml(generated.html);
  const editRoots = parseHtml(edited.html);
  const genSections = findMarked(genRoots, "data-section-id");
  const editSectionsById = new Map(
    findMarked(editRoots, "data-section-id").map((el) => [
      el.attrs["data-section-id"] ?? "",
      el,
    ]),
  );

  const notes: string[] = [];
  const changes: BlockSyncChange[] = [];
  const claimedClasses = new Set<string>();
  let nextDesign = design;
  let htmlBudget = DESIGN_LIMITS.htmlBlocks - designCounts(design).htmlBlocks;
  const newId = createIdFactory(designIds(design));
  let recognizedAnySection = false;

  for (const section of design.sections) {
    const genSectionEl = genSections.find(
      (el) => el.attrs["data-section-id"] === section.id,
    );
    const editSectionEl = editSectionsById.get(section.id);
    if (!genSectionEl || !editSectionEl) continue;
    recognizedAnySection = true;

    const genUnits = topUnits(genSectionEl, "data-block-id");
    const editUnits = topUnits(editSectionEl, "data-block-id");
    const genById = new Map(
      genUnits
        .filter(
          (unit): unit is { id: string; el: LiteElement } => unit.id !== null,
        )
        .map((unit) => [unit.id, unit.el]),
    );
    const { matched, inserted, removed } = diffUnits(genUnits, editUnits);

    // 1) Changed blocks, converted in place --------------------------------
    for (const { id, el } of matched) {
      const genEl = genById.get(id);
      if (genEl && serialize(genEl) === serialize(el)) continue;
      const at = locateBlock(nextDesign, id);
      if (!at) continue;
      if (isBoundKind(at.block.kind)) {
        notes.push(
          `Tus cambios en «${blockKindLabel(at.block.kind, type)}» no se aplicaron: ese contenido sigue ligado a tu plataforma.`,
        );
        continue;
      }
      const html = serialize(el);
      const classes = collectClasses(el);
      const css = cssRulesForClasses(edited.css, classes);
      if (
        html.length > DESIGN_LIMITS.htmlBlockHtml ||
        css.length > DESIGN_LIMITS.htmlBlockCss
      ) {
        notes.push(
          "Un bloque editado pasa el límite de tamaño de un bloque HTML y no se convirtió.",
        );
        continue;
      }
      const wasHtml = at.block.kind === "html";
      if (!wasHtml) {
        if (htmlBudget <= 0) {
          notes.push(
            `Ya tienes ${DESIGN_LIMITS.htmlBlocks} bloques HTML, el máximo por diseño. Algunos cambios no se llevaron.`,
          );
          continue;
        }
        htmlBudget -= 1;
      }
      const existingLabel =
        at.block.kind === "html" ? at.block.label : undefined;
      nextDesign = updateBlock(nextDesign, id, (block) => ({
        id: block.id,
        kind: "html",
        html,
        css,
        ...(block.style ? { style: block.style } : {}),
        ...(existingLabel ? { label: existingLabel } : {}),
      }));
      changes.push({ blockId: id, action: "changed" });
      for (const name of classes) claimedClasses.add(name);
    }

    // 2) New elements, inserted in place ------------------------------------
    for (const { beforeId, el } of inserted) {
      if (isCanvasSection(section)) {
        notes.push(
          "No se pueden agregar elementos nuevos a un espacio libre desde el HTML todavía.",
        );
        continue;
      }
      const html = serialize(el);
      const classes = collectClasses(el);
      const css = cssRulesForClasses(edited.css, classes);
      if (
        html.length > DESIGN_LIMITS.htmlBlockHtml ||
        css.length > DESIGN_LIMITS.htmlBlockCss
      ) {
        notes.push(
          "Un bloque nuevo pasa el límite de tamaño de un bloque HTML y no se agregó.",
        );
        continue;
      }
      if (htmlBudget <= 0) {
        notes.push(
          `Ya tienes ${DESIGN_LIMITS.htmlBlocks} bloques HTML, el máximo por diseño. No agregamos todo lo nuevo.`,
        );
        continue;
      }
      const target = insertionTarget(nextDesign, section.id, beforeId);
      if (!target) continue;
      htmlBudget -= 1;
      const id = newId("b");
      nextDesign = insertBlock(
        nextDesign,
        { id, kind: "html", html, css },
        target,
      );
      changes.push({ blockId: id, action: "added" });
      for (const name of classes) claimedClasses.add(name);
    }

    // 3) Removed blocks -------------------------------------------------------
    for (const id of removed) {
      const at = locateBlock(nextDesign, id);
      if (!at) continue;
      if (isRequiredKind(type, at.block.kind)) {
        notes.push(
          `Tu página necesita «${blockKindLabel(at.block.kind, type)}». Lo mantuvimos.`,
        );
        continue;
      }
      nextDesign = removeBlock(nextDesign, id);
      changes.push({ blockId: id, action: "removed" });
    }
  }

  if (!recognizedAnySection) {
    return {
      design,
      changedBlocks: [],
      notes: ["No pudimos reconocer tu HTML para llevarlo a bloques."],
    };
  }

  const genRemainder = cssWithoutClasses(generated.css, claimedClasses);
  const editRemainder = cssWithoutClasses(edited.css, claimedClasses);
  if (squash(genRemainder) !== squash(editRemainder))
    notes.push("Algunos estilos generales quedan solo en el modo HTML.");

  if (changes.length === 0) return { design, changedBlocks: [], notes };

  const issues = validateDesign(type, nextDesign, contentIds);
  if (issues.length > 0) {
    return {
      design,
      changedBlocks: [],
      notes: [
        `No pudimos llevar tus cambios a bloques: ${issues[0]?.message ?? "el diseño no es válido."}`,
      ],
    };
  }

  return { design: nextDesign, changedBlocks: changes, notes };
}
