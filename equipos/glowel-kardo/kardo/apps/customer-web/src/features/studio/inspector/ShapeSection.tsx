import type { DesignBlock } from "@kardo/contracts";
import { useId } from "react";
import { Segmented } from "../../../components/controls/index.js";
import { setBrandButtonLook } from "../model/canvas.js";
import { setBlockStyle, updateBlock } from "../model/operations.js";
import {
  type ButtonShapePreset,
  buttonShapePreset,
  buttonShapeRadius,
} from "../model/shape-presets.js";
import { useStudio } from "../StudioContext.js";
import { MaskGallery, ShapeGallery, StepperField } from "./controls.js";

/**
 * "Forma" (the owner's complaint: "no sé en qué apartado poder mover la
 * forma del cuadro"): one place, always in the same spot (right after the
 * block's own content in the inspector, and a button in the floating
 * toolbar — `SelectionToolbar.tsx`), to change what shape an element is.
 * Image: its mask. Figura: its 9 shapes. Button and botón de marca: a
 * corner preset (botón de marca also gets "Círculo"). Any other block that
 * paints its own background: its corner radius. `null` (nothing shown) for
 * every other kind.
 */
export function blockHasShapeControls(block: DesignBlock): boolean {
  switch (block.kind) {
    case "image":
    case "shape":
    case "button":
    case "brandButton":
      return true;
    default: {
      const background = block.style?.background;
      return Boolean(background && background !== "none");
    }
  }
}

export function ShapeSection({ block }: { block: DesignBlock }) {
  const { change, readOnly } = useStudio();
  const titleId = useId();
  if (!blockHasShapeControls(block)) return null;

  const setRadius = (radius: number | undefined) =>
    change(
      (design) => setBlockStyle(design, block.id, { radius }),
      `${block.id}:radius`,
    );

  return (
    <section aria-labelledby={titleId} className="es-fields es-shape-section">
      <h4 className="es-group-title" id={titleId}>
        Forma
      </h4>
      {block.kind === "image" ? (
        <MaskGallery
          disabled={readOnly}
          onChange={(mask) =>
            change(
              (design) =>
                updateBlock(design, block.id, (current) => {
                  if (current.kind !== "image") return current;
                  const { mask: _old, ...rest } = current;
                  return mask ? { ...rest, mask } : rest;
                }),
              `${block.id}:mask`,
            )
          }
          value={block.mask}
        />
      ) : null}
      {block.kind === "shape" ? (
        <ShapeGallery
          disabled={readOnly}
          onChange={(shape) =>
            change(
              (design) =>
                updateBlock(design, block.id, (current) =>
                  current.kind === "shape" ? { ...current, shape } : current,
                ),
              `${block.id}:shape`,
            )
          }
          value={block.shape}
        />
      ) : null}
      {block.kind === "button" ? (
        <ButtonShapeField
          disabled={readOnly}
          onChange={(preset) => setRadius(buttonShapeRadius(preset))}
          value={buttonShapePreset(block.style?.radius)}
        />
      ) : null}
      {block.kind === "brandButton" ? (
        <BrandButtonShapeField block={block} disabled={readOnly} />
      ) : null}
      {block.kind !== "image" &&
      block.kind !== "shape" &&
      block.kind !== "button" &&
      block.kind !== "brandButton" ? (
        <StepperField
          disabled={readOnly}
          fallback={0}
          label="Esquinas"
          max={48}
          min={0}
          onChange={setRadius}
          unit="px"
          value={block.style?.radius}
        />
      ) : null}
    </section>
  );
}

const buttonShapeOptions: { value: ButtonShapePreset; label: string }[] = [
  { value: "pill", label: "Píldora" },
  { value: "rounded", label: "Redondeado" },
  { value: "square", label: "Recto" },
];

function ButtonShapeField({
  value,
  onChange,
  disabled,
}: {
  value: ButtonShapePreset;
  onChange: (preset: ButtonShapePreset) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <Segmented
      disabled={disabled}
      fill
      label="Forma del botón"
      onChange={onChange}
      options={buttonShapeOptions}
      value={value}
    />
  );
}

type BrandShapeValue = ButtonShapePreset | "circle";

const brandShapeOptions: { value: BrandShapeValue; label: string }[] = [
  ...buttonShapeOptions,
  { value: "circle", label: "Círculo" },
];

function BrandButtonShapeField({
  block,
  disabled,
}: {
  block: Extract<DesignBlock, { kind: "brandButton" }>;
  disabled?: boolean | undefined;
}) {
  const { change } = useStudio();
  const value: BrandShapeValue =
    block.look === "circle" ? "circle" : buttonShapePreset(block.style?.radius);

  return (
    <Segmented
      disabled={disabled}
      fill
      label="Forma del botón"
      onChange={(next) => {
        if (next === "circle") {
          change(
            (design) => setBrandButtonLook(design, block.id, "circle"),
            `${block.id}:shape`,
          );
          return;
        }
        // Leaving círculo for a corner preset: restore the normal look
        // first (same undo step), the radius has no effect on a circle.
        change((design) => {
          const base =
            block.look === "circle"
              ? setBrandButtonLook(design, block.id, "brand")
              : design;
          return setBlockStyle(base, block.id, {
            radius: buttonShapeRadius(next),
          });
        }, `${block.id}:shape`);
      }}
      options={brandShapeOptions}
      value={value}
    />
  );
}
