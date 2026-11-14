import { useDraggable } from "@dnd-kit/core";
import {
  type DesignBlockKind,
  isCanvasSection,
  type PageDesign,
  type SectionLayout,
} from "@kardo/contracts";
import type { ReactNode } from "react";
import { Icon } from "../../../components/Icon.js";
import { Tooltip } from "../../../components/Tooltip.js";
import { LayoutGlyph } from "../inspector/controls.js";
import { layoutLabels } from "../labels.js";
import {
  blockKindDescription,
  blockKindIcon,
  blockKindLabel,
  boundKindsFor,
} from "../model/blocks.js";
import { createCanvasSection } from "../model/canvas.js";
import { idFactoryFor } from "../model/ids.js";
import {
  addBlockBlocker,
  addCanvasSectionBlocker,
  addSectionBlocker,
} from "../model/limits.js";
import {
  addSection,
  findSection,
  sectionIndexOf,
  sectionOfBlock,
} from "../model/operations.js";
import { useStudio } from "../StudioContext.js";

const sectionLayouts: SectionLayout[] = ["1", "1-1", "1-2", "2-1", "1-1-1"];

/** "Agregar" in clear groups (addendum 3): text, buttons, images and
 * shapes, the type's own content, and, last, the HTML block. `freeBlockKinds`
 * is the flat catalog used elsewhere; this file groups it for display. */
const textKinds: readonly DesignBlockKind[] = ["heading", "text"];
const buttonKinds: readonly DesignBlockKind[] = ["button", "brandButton"];
const imageShapeKinds: readonly DesignBlockKind[] = [
  "image",
  "gallery",
  "shape",
];
const infoKinds: readonly DesignBlockKind[] = ["features"];
const layoutKinds: readonly DesignBlockKind[] = ["divider", "spacer"];

/** Where a tapped block goes: after the selected block, at the end of the
 * selected section, or at the end of the page (same as the Estudio's
 * `addBlock` without a target). */
function insertionTarget(
  design: PageDesign,
  selection: ReturnType<typeof useStudio>["selection"],
): { sectionId: string; columnIndex: number } | undefined {
  const section =
    selection?.kind === "block"
      ? sectionOfBlock(design, selection.id)
      : selection?.kind === "section"
        ? findSection(design, selection.id)
        : design.sections.at(-1);
  if (!section) return undefined;
  if (isCanvasSection(section))
    return { sectionId: section.id, columnIndex: 0 };
  if (selection?.kind === "block")
    for (const [columnIndex, column] of section.columns.entries())
      if (column.some((block) => block.id === selection.id))
        return { sectionId: section.id, columnIndex };
  return { sectionId: section.id, columnIndex: 0 };
}

/** Where a tapped block goes, in words (follows the selection). */
function useInsertionHint(): string {
  const { selection, design } = useStudio();
  const section =
    selection?.kind === "block"
      ? sectionOfBlock(design, selection.id)
      : selection?.kind === "section"
        ? findSection(design, selection.id)
        : design.sections.at(-1);
  if (section && isCanvasSection(section))
    return `Se agrega al centro del espacio libre de la sección ${sectionIndexOf(design, section.id) + 1}. Luego arrástralo a su lugar.`;
  if (selection?.kind === "block")
    return section
      ? `Se agrega después del bloque seleccionado (sección ${sectionIndexOf(design, section.id) + 1}).`
      : "Se agrega al final de la página.";
  if (selection?.kind === "section")
    return `Se agrega al final de la sección ${sectionIndexOf(design, selection.id) + 1}.`;
  return "Se agrega al final de la página. Selecciona un bloque para ponerlo justo después.";
}

export function AddBlockPanel() {
  const {
    type,
    design,
    actions,
    readOnly,
    selection,
    change,
    select,
    contentIds,
    canEditHtml,
  } = useStudio();
  const hint = useInsertionHint();
  const bound = boundKindsFor(type);
  const target = insertionTarget(design, selection);
  const blockerOf = (kind: DesignBlockKind) =>
    readOnly ? "Solo lectura" : addBlockBlocker(design, type, kind, target);
  const sectionBlocked = readOnly ? "Solo lectura" : addSectionBlocker(design);
  const canvasBlocked = readOnly
    ? "Solo lectura"
    : addCanvasSectionBlocker(design);
  const sectionIndex =
    selection?.kind === "section"
      ? sectionIndexOf(design, selection.id) + 1
      : selection?.kind === "block"
        ? (() => {
            const section = sectionOfBlock(design, selection.id);
            return section
              ? sectionIndexOf(design, section.id) + 1
              : design.sections.length;
          })()
        : design.sections.length;

  const addCanvas = () => {
    if (canvasBlocked) return;
    const section = createCanvasSection(idFactoryFor(design, contentIds));
    change((current) => addSection(current, section, sectionIndex));
    select({ kind: "section", id: section.id });
  };

  const group = (
    id: string,
    title: string,
    kinds: readonly DesignBlockKind[],
    hint?: string,
  ) =>
    kinds.length ? (
      <section aria-labelledby={id} className="es-panel-group" key={id}>
        <h3 className="es-group-title" id={id}>
          {title}
        </h3>
        {hint ? <p className="qrs-hint">{hint}</p> : null}
        <div className="es-palette">
          {kinds.map((kind) => (
            <PaletteItem
              blocked={blockerOf(kind)}
              key={kind}
              kind={kind}
              onAdd={() => actions.addBlock(kind)}
            />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div className="es-panel-stack">
      <p className="es-insert-hint">
        <Icon name="info" size={14} />
        <span>{hint}</span>
      </p>
      <section aria-labelledby="es-add-canvas" className="es-panel-group">
        <h3 className="es-group-title" id="es-add-canvas">
          Espacio libre
        </h3>
        <p className="qrs-hint">
          La forma libre de diseñar: coloca, rota y sobrepón bloques donde
          quieras, como en Canva.
        </p>
        <SectionTile
          blocked={canvasBlocked}
          emphasis
          label="Agregar espacio libre"
          onAdd={addCanvas}
        >
          <CanvasGlyph />
        </SectionTile>
      </section>
      {group("es-add-text", "Texto", textKinds)}
      <section aria-labelledby="es-add-buttons" className="es-panel-group">
        <h3 className="es-group-title" id="es-add-buttons">
          Botones
        </h3>
        <div className="es-palette">
          {buttonKinds.map((kind) => (
            <PaletteItem
              blocked={blockerOf(kind)}
              key={kind}
              kind={kind}
              onAdd={() => actions.addBlock(kind)}
            />
          ))}
        </div>
        <button
          aria-disabled={blockerOf("brandButton") ? true : undefined}
          className="es-tile"
          onClick={() => {
            if (!blockerOf("brandButton")) actions.addBrandCircleRow();
          }}
          title={
            blockerOf("brandButton") ??
            "WhatsApp, Instagram, TikTok y Facebook, en círculo, listos para apilar en fila."
          }
          type="button"
        >
          <span aria-hidden="true" className="es-tile-icon">
            <Icon name="share" size={18} />
          </span>
          <span className="es-tile-text">
            <strong>Redes en círculo</strong>
            <small>
              {blockerOf("brandButton") ??
                "4 botones en círculo (WhatsApp, Instagram, TikTok, Facebook)."}
            </small>
          </span>
        </button>
      </section>
      {group("es-add-images", "Imágenes y formas", imageShapeKinds)}
      {group("es-add-info", "Información", infoKinds)}
      {group("es-add-layout", "Básicos", layoutKinds)}
      {group(
        "es-add-content",
        "Contenido de tu página",
        bound,
        "Muestran lo que escribiste en Contenido. Cada uno va una sola vez, salvo el menú (que puedes partir en varios bloques) y los destacados (hasta 3).",
      )}
      {canEditHtml
        ? group(
            "es-add-html",
            "Avanzado: HTML",
            ["html"],
            "Tu propio código, siempre revisado antes de mostrarse o publicarse.",
          )
        : null}
      <section aria-labelledby="es-add-sections" className="es-panel-group">
        <h3 className="es-group-title" id="es-add-sections">
          Secciones en columnas
        </h3>
        <p className="qrs-hint">
          Se agrega después de la sección {sectionIndex}. En celulares las
          columnas se apilan en orden.
        </p>
        <div className="es-section-palette">
          {sectionLayouts.map((layout) => (
            <SectionTile
              blocked={sectionBlocked}
              key={layout}
              label={layoutLabels[layout]}
              onAdd={() => actions.addSection(layout, sectionIndex)}
            >
              <LayoutGlyph layout={layout} />
            </SectionTile>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionTile({
  label,
  blocked,
  onAdd,
  children,
  emphasis,
}: {
  label: string;
  blocked: string | null;
  onAdd: () => void;
  children: ReactNode;
  emphasis?: boolean | undefined;
}) {
  const button = (
    <button
      aria-disabled={blocked ? true : undefined}
      aria-label={`Agregar sección: ${label}${blocked ? ` (${blocked})` : ""}`}
      className={
        emphasis ? "es-section-tile es-section-tile-main" : "es-section-tile"
      }
      onClick={() => {
        if (!blocked) onAdd();
      }}
      type="button"
    >
      {children}
      <span>{label}</span>
    </button>
  );
  return blocked ? <Tooltip content={blocked}>{button}</Tooltip> : button;
}

/** A section glyph with boxes placed freely ("lienzo libre"). */
export function CanvasGlyph() {
  return (
    <span aria-hidden="true" className="es-layout-glyph es-cv-glyph">
      <span />
      <span />
      <span />
    </span>
  );
}

function PaletteItem({
  kind,
  blocked,
  onAdd,
}: {
  kind: DesignBlockKind;
  blocked: string | null;
  onAdd: () => void;
}) {
  const { type } = useStudio();
  const label = blockKindLabel(kind, type);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `palette:${kind}`,
    data: { type: "palette", kind, label: `«${label}»` },
    disabled: Boolean(blocked),
  });
  // Keyboard users add with Enter (a click); only pointers drag from here.
  const { onKeyDown: _keyboardDrag, ...pointerListeners } = listeners ?? {};
  const tile = (
    <button
      aria-disabled={blocked ? true : undefined}
      aria-label={blocked ? `${label}: ${blocked}` : `Agregar ${label}`}
      className="es-tile"
      data-dragging={isDragging || undefined}
      onClick={() => {
        if (!blocked) onAdd();
      }}
      ref={setNodeRef}
      type="button"
      {...pointerListeners}
    >
      <span aria-hidden="true" className="es-tile-icon">
        <Icon name={blockKindIcon(kind)} size={18} />
      </span>
      <span className="es-tile-text">
        <strong>{label}</strong>
        <small>{blocked ?? blockKindDescription(kind)}</small>
      </span>
      {!blocked ? (
        <Icon className="es-tile-grip" name="grip" size={15} />
      ) : null}
    </button>
  );
  return tile;
}
