import type { DesignBlock } from "@kardo/contracts";
import { RangeField } from "../../../components/controls/index.js";
import { ColorTokenField } from "./controls.js";

type ShapeBlock = Extract<DesignBlock, { kind: "shape" }>;

/** The outline (`stroke`/`strokeWidth`) only draws on these three shapes,
 * whose straight or round edges keep a stroke legible; the others (star,
 * hexagon...) would show broken corners. */
const outlineShapes = new Set<ShapeBlock["shape"]>(["rect", "ellipse", "pill"]);

/** `undefined` clears the field (contract-optional; TypeBox treats a present
 * `undefined` the same as an absent key, and `JSON.stringify` drops it before
 * saving), matching `BlockStylePatch`'s own convention. */
export type ShapePatch = {
  shape?: ShapeBlock["shape"];
  fill?: string;
  fillTo?: string | undefined;
  angle?: number | undefined;
  stroke?: string | undefined;
  strokeWidth?: number | undefined;
};

/**
 * Fields of a `shape` block (addendum 3): a solid or gradient fill and, for
 * rect/ellipse/pill only, an outline. Its 9 shapes live in the inspector's
 * "Forma" section (`ShapeSection.tsx`), the one place every block's shape is
 * changed. Size and position are set on the canvas itself or in "Posición
 * en el lienzo".
 */
export function ShapeFields({
  block,
  onChange,
}: {
  block: ShapeBlock;
  onChange: (patch: ShapePatch) => void;
}) {
  const gradient = block.fillTo !== undefined;
  const outlined = outlineShapes.has(block.shape);

  return (
    <div className="es-fields">
      <ColorTokenField
        label={gradient ? "Color inicial" : "Color"}
        onChange={(value) => onChange({ fill: value ?? "accent" })}
        value={block.fill === "accent" ? undefined : block.fill}
      />
      <label className="checkbox-row">
        <input
          checked={gradient}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? { fillTo: "surface", angle: block.angle ?? 135 }
                : { fillTo: undefined, angle: undefined },
            )
          }
          type="checkbox"
        />
        Degradado
      </label>
      {gradient ? (
        <>
          <ColorTokenField
            label="Color final"
            onChange={(value) => onChange({ fillTo: value ?? "surface" })}
            value={block.fillTo === "surface" ? undefined : block.fillTo}
          />
          <RangeField
            format={(angle) => `${angle}°`}
            label="Dirección del degradado"
            max={360}
            min={0}
            onChange={(angle) => onChange({ angle })}
            step={5}
            value={block.angle ?? 135}
          />
        </>
      ) : null}
      {outlined ? (
        <>
          <h4 className="es-group-title">Contorno</h4>
          <ColorTokenField
            label="Color del contorno"
            onChange={(value) =>
              onChange({
                stroke: value,
                strokeWidth: value ? (block.strokeWidth ?? 2) : undefined,
              })
            }
            value={block.stroke}
          />
          {block.stroke !== undefined ? (
            <RangeField
              format={(width) => `${width} px`}
              label="Grosor del contorno"
              max={24}
              min={1}
              onChange={(strokeWidth) => onChange({ strokeWidth })}
              step={1}
              value={block.strokeWidth ?? 2}
            />
          ) : (
            <p className="qrs-hint">Elige un color para dibujar el contorno.</p>
          )}
        </>
      ) : (
        <p className="qrs-hint">
          El contorno solo está disponible en rectángulo, círculo y píldora.
        </p>
      )}
    </div>
  );
}
