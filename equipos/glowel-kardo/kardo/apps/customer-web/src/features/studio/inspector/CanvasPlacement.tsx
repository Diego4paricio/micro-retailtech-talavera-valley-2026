import { CANVAS_WIDTH, DESIGN_LIMITS, type PageDesign } from "@kardo/contracts";
import { useEffect, useId, useState } from "react";
import { RangeField, SwitchField } from "../../../components/controls/index.js";
import { Icon, type IconName } from "../../../components/Icon.js";
import { Tooltip } from "../../../components/Tooltip.js";
import {
  alignCanvasItem,
  type CanvasAlign,
  type CanvasLayerMove,
  canvasItemOf,
  canvasLayerOf,
  moveCanvasLayer,
  setCanvasItemGeometry,
  setCanvasItemLayer,
} from "../model/canvas.js";
import { CANVAS_GRIP, fillsItem, itemHeight } from "../model/canvas-items.js";
import { setCanvasItemFlags } from "../model/operations.js";
import { useStudio } from "../StudioContext.js";
import { useMeasuredItemBox } from "../stage/canvas-measure.js";

/** Whether a block sits on a canvas section (and so shows CanvasPlacement). */
export function isCanvasBlock(design: PageDesign, blockId: string): boolean {
  return canvasItemOf(design, blockId) !== null;
}

const layerMoves: {
  move: CanvasLayerMove;
  label: string;
  short: string;
}[] = [
  { move: "front", label: "Traer al frente", short: "Al frente" },
  { move: "forward", label: "Traer adelante", short: "Adelante" },
  { move: "backward", label: "Enviar atrás", short: "Atrás" },
  { move: "back", label: "Enviar al fondo", short: "Al fondo" },
];

const alignments: {
  align: CanvasAlign;
  label: string;
  icon: IconName;
  vertical?: boolean;
}[] = [
  { align: "left", label: "Alinear a la izquierda", icon: "align-left" },
  { align: "center", label: "Centrar", icon: "align-center" },
  { align: "right", label: "Alinear a la derecha", icon: "align-right" },
  { align: "top", label: "Alinear arriba", icon: "align-left", vertical: true },
  {
    align: "middle",
    label: "Centrar en medio",
    icon: "align-center",
    vertical: true,
  },
  {
    align: "bottom",
    label: "Alinear abajo",
    icon: "align-right",
    vertical: true,
  },
];

/**
 * Where a canvas block sits, by the numbers: X, Y, width, height (images
 * and shapes) and layer, plus stacking and alignment buttons. Everything
 * the pointer does on the stage can be done here with a keyboard or a
 * phone. Arrow keys in a field step by 1 (10 with Shift).
 */
export function CanvasPlacement({ blockId }: { blockId: string }) {
  const { design, change, readOnly } = useStudio();
  const measured = useMeasuredItemBox(blockId);
  const titleId = useId();
  const at = canvasItemOf(design, blockId);
  if (!at) return null;
  const { item, section, block } = at;
  const fills = fillsItem(block.kind);
  const height = Math.round(itemHeight(item, measured?.h));
  const measuredHeight = measured ? Math.round(measured.h) : undefined;
  const layer = canvasLayerOf(design, blockId) ?? { position: 0, count: 1 };
  const locked = Boolean(item.locked);
  // Locked keeps its position and size from the Estudio's own tools (drag,
  // resize, align, layers); unlocking it here is always available.
  const placementDisabled = readOnly || locked;

  const place = (
    patch: { x?: number; y?: number; w?: number; h?: number },
    key?: string,
  ) =>
    change(
      (current) =>
        setCanvasItemGeometry(current, blockId, patch, measuredHeight),
      key ? `${blockId}:placement-${key}` : undefined,
    );

  const layerBlocked = (move: CanvasLayerMove): string | null => {
    if (layer.count <= 1) return "Es el único bloque del espacio libre";
    if (
      (move === "front" || move === "forward") &&
      layer.position === layer.count - 1
    )
      return "Ya está al frente";
    if ((move === "back" || move === "backward") && layer.position === 0)
      return "Ya está al fondo";
    return null;
  };

  return (
    <section aria-labelledby={titleId} className="es-cv-placement">
      <h3 className="es-group-title" id={titleId}>
        Posición en el espacio libre
      </h3>
      <fieldset className="es-cv-fields" disabled={placementDisabled}>
        <legend className="visually-hidden">Posición y tamaño en px</legend>
        <NumberField
          label="X"
          max={CANVAS_WIDTH - CANVAS_GRIP}
          min={-CANVAS_WIDTH}
          onCommit={(x, stepping) => place({ x }, stepping ? "x" : undefined)}
          value={item.x}
        />
        <NumberField
          label="Y"
          max={section.height - CANVAS_GRIP}
          min={-400}
          onCommit={(y, stepping) => place({ y }, stepping ? "y" : undefined)}
          value={item.y}
        />
        <NumberField
          label="Ancho"
          max={CANVAS_WIDTH * 2}
          min={8}
          onCommit={(w, stepping) => place({ w }, stepping ? "w" : undefined)}
          value={item.w}
        />
        {fills ? (
          <NumberField
            label="Alto"
            max={DESIGN_LIMITS.canvasHeight}
            min={8}
            onCommit={(h, stepping) => place({ h }, stepping ? "h" : undefined)}
            value={item.h ?? height}
          />
        ) : null}
        <NumberField
          label="Capa"
          max={layer.count}
          min={1}
          onCommit={(position, stepping) =>
            change(
              (current) => setCanvasItemLayer(current, blockId, position - 1),
              stepping ? `${blockId}:placement-layer` : undefined,
            )
          }
          suffix={`de ${layer.count}`}
          value={layer.position + 1}
        />
      </fieldset>
      <fieldset className="es-cv-fields" disabled={readOnly}>
        <legend className="visually-hidden">
          Rotación, bloqueo y visibilidad
        </legend>
        <RangeField
          disabled={locked}
          format={(value) => `${value}°`}
          label="Rotación"
          max={180}
          min={-180}
          onChange={(r) =>
            change(
              (current) => setCanvasItemFlags(current, blockId, { r }),
              `${blockId}:placement-r`,
            )
          }
          step={1}
          value={item.r ?? 0}
        />
        <SwitchField
          checked={Boolean(item.locked)}
          description="El Estudio no lo moverá ni cambiará su tamaño hasta que lo desbloquees."
          label="Bloquear"
          onChange={(locked) =>
            change((current) =>
              setCanvasItemFlags(current, blockId, { locked }),
            )
          }
        />
        <SwitchField
          checked={Boolean(item.hidden)}
          description="Se guarda en tu diseño pero no se dibuja en la página."
          label="Ocultar"
          onChange={(hidden) =>
            change((current) =>
              setCanvasItemFlags(current, blockId, { hidden }),
            )
          }
        />
      </fieldset>
      {!fills ? (
        <p className="es-cv-note">
          El alto se ajusta al contenido: {height} px.
        </p>
      ) : null}

      {!readOnly ? (
        locked ? (
          <p className="qrs-hint">
            Este bloque está bloqueado: desbloquéalo para moverlo, cambiar su
            tamaño, ordenarlo en capas o alinearlo.
          </p>
        ) : (
          <>
            <fieldset className="es-cv-group">
              <legend className="es-cv-legend">Capas</legend>
              <div className="es-cv-layers">
                {layerMoves.map(({ move, label, short }) => {
                  const blocked = layerBlocked(move);
                  return (
                    <Tooltip content={blocked ?? label} key={move}>
                      <button
                        aria-disabled={blocked ? true : undefined}
                        aria-label={blocked ? `${label}: ${blocked}` : label}
                        className="button button-secondary button-small"
                        onClick={() => {
                          if (!blocked)
                            change((current) =>
                              moveCanvasLayer(current, blockId, move),
                            );
                        }}
                        type="button"
                      >
                        {short}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="es-cv-group">
              <legend className="es-cv-legend">
                Alinear en el espacio libre
              </legend>
              <div className="es-cv-align">
                {alignments.map(({ align, label, icon, vertical }) => (
                  <Tooltip content={label} key={align}>
                    <button
                      aria-label={label}
                      className="es-action"
                      onClick={() =>
                        change((current) =>
                          alignCanvasItem(current, blockId, align, {
                            height: measuredHeight,
                          }),
                        )
                      }
                      type="button"
                    >
                      <Icon
                        className={vertical ? "es-cv-vertical" : undefined}
                        name={icon}
                        size={16}
                      />
                    </button>
                  </Tooltip>
                ))}
              </div>
            </fieldset>
            <p className="qrs-hint">
              Arrastra el bloque en la vista previa o muévelo con las flechas
              del teclado (con Mayús, de 10 en 10). Alt desactiva las guías.
            </p>
          </>
        )
      ) : null}
    </section>
  );
}

/**
 * A whole number that commits on Enter or when leaving the field. Arrow
 * keys step right away (Shift: 10) with `stepping`, so the caller can
 * coalesce repeated steps into one undo step.
 */
function NumberField({
  label,
  value,
  min,
  max,
  suffix = "px",
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onCommit: (value: number, stepping: boolean) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const clamp = (next: number) =>
    Math.min(max, Math.max(min, Math.round(next)));
  const commit = (raw: string) => {
    const parsed = Number(raw.trim());
    if (raw.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(parsed);
    setDraft(String(next));
    if (next !== value) onCommit(next, false);
  };
  return (
    <div className="es-cv-field">
      <label htmlFor={id}>{label}</label>
      <span className="es-cv-input">
        <input
          className="input"
          id={id}
          max={max}
          min={min}
          onBlur={(event) => commit(event.target.value)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(event.currentTarget.value);
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              const step =
                (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
              const next = clamp(value + step);
              setDraft(String(next));
              if (next !== value) onCommit(next, true);
            }
          }}
          step={1}
          type="number"
          value={draft}
        />
        <span aria-hidden="true" className="es-cv-suffix">
          {suffix}
        </span>
      </span>
    </div>
  );
}
