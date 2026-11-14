import type { QrDesign, QrEyeColors, QrPaint } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { Icon } from "../../../../../components/Icon.js";
import { contrastRatio } from "../../qr-design.js";
import {
  ColorField,
  ControlBlock,
  OptionalColorField,
  RangeField,
  Segmented,
  type Swatch,
  SwitchField,
} from "../controls.js";
import { useStudio } from "../StudioContext.js";
import { SectionWarnings } from "./SectionWarnings.js";

type EyeCorner = "topLeft" | "topRight" | "bottomLeft";
const eyeCorners: readonly { id: EyeCorner; label: string }[] = [
  { id: "topLeft", label: "Ojo superior izquierdo" },
  { id: "topRight", label: "Ojo superior derecho" },
  { id: "bottomLeft", label: "Ojo inferior izquierdo" },
];

export function ColorsSection() {
  const { design, change, readOnly, swatches } = useStudio();
  const ratio = worstContrast(design);

  return (
    <>
      <SectionWarnings section="colors" />
      <ControlBlock
        actions={
          ratio !== null ? (
            <span
              className={`qrs-contrast qrs-contrast-${ratio >= 7 ? "good" : ratio >= 4.5 ? "fair" : "low"}`}
            >
              Contraste {formatRatio(ratio)}
            </span>
          ) : null
        }
        title="Módulos"
      >
        <PaintField
          disabled={readOnly}
          onChange={(fill, key) =>
            change(
              (current) => ({
                ...current,
                modules: { ...current.modules, fill },
              }),
              key,
            )
          }
          swatches={swatches.ink}
          value={design.modules.fill}
        />
      </ControlBlock>

      <ControlBlock title="Fondo">
        <ColorField
          disabled={readOnly}
          hint={
            design.background.transparent
              ? "Con fondo transparente, este color representa la superficie donde vas a imprimir: lo usamos para comprobar el contraste."
              : undefined
          }
          label={
            design.background.transparent
              ? "Color de la superficie de impresión"
              : "Color de fondo"
          }
          onChange={(color) =>
            change(
              (current) => ({
                ...current,
                background: { ...current.background, color },
              }),
              "background.color",
            )
          }
          swatches={swatches.background}
          value={design.background.color}
        />
        <SwitchField
          checked={design.background.transparent}
          description="Útil para colocarlo sobre tu propio diseño. Imprímelo solo sobre superficies claras y lisas."
          disabled={readOnly}
          label="Fondo transparente"
          onChange={(transparent) =>
            change((current) => ({
              ...current,
              background: { ...current.background, transparent },
            }))
          }
        />
      </ControlBlock>

      <EyeColors />
    </>
  );
}

function EyeColors() {
  const { design, change, readOnly, swatches } = useStudio();
  const linkedNow = eyeCorners.every(
    ({ id }) =>
      design.eyes[id].frame === design.eyes.topLeft.frame &&
      design.eyes[id].ball === design.eyes.topLeft.ball,
  );
  const [perEye, setPerEye] = useState(!linkedNow);
  // A template or undo can bring different colors per eye: show them.
  useEffect(() => {
    if (!linkedNow) setPerEye(true);
  }, [linkedNow]);
  const fallback = paintColor(design.modules.fill);

  const setEye = (
    corners: readonly EyeCorner[],
    patch: Partial<QrEyeColors>,
    key: string,
  ) =>
    change((current) => {
      const eyes = { ...current.eyes };
      for (const corner of corners)
        eyes[corner] = { ...eyes[corner], ...patch };
      return { ...current, eyes };
    }, key);

  return (
    <ControlBlock title="Ojos">
      <SwitchField
        checked={perEye}
        description="Por defecto los tres ojos comparten color."
        disabled={readOnly}
        label="Colorear cada ojo por separado"
        onChange={(next) => {
          setPerEye(next);
          if (!next && !linkedNow)
            setEye(
              ["topRight", "bottomLeft"],
              { ...design.eyes.topLeft },
              "eyes.link",
            );
        }}
      />
      {perEye ? (
        eyeCorners.map((corner) => (
          <fieldset className="qrs-eye-group" key={corner.id}>
            <legend>{corner.label}</legend>
            <EyePair
              disabled={readOnly}
              fallback={fallback}
              onChange={(patch, key) => setEye([corner.id], patch, key)}
              swatches={swatches.ink}
              value={design.eyes[corner.id]}
            />
          </fieldset>
        ))
      ) : (
        <EyePair
          disabled={readOnly}
          fallback={fallback}
          onChange={(patch, key) =>
            setEye(
              eyeCorners.map((corner) => corner.id),
              patch,
              key,
            )
          }
          swatches={swatches.ink}
          value={design.eyes.topLeft}
        />
      )}
    </ControlBlock>
  );
}

function EyePair({
  value,
  onChange,
  fallback,
  swatches,
  disabled,
}: {
  value: QrEyeColors;
  onChange: (patch: Partial<QrEyeColors>, key: string) => void;
  fallback: string;
  swatches: readonly Swatch[];
  disabled: boolean;
}) {
  return (
    <div className="qrs-eye-pair">
      <OptionalColorField
        disabled={disabled}
        fallback={fallback}
        inheritLabel={
          value.frame === null
            ? "Usa el color de los módulos."
            : "Color propio."
        }
        label="Marco"
        onChange={(frame) => onChange({ frame }, "eyes.frame")}
        swatches={swatches}
        value={value.frame}
      />
      <OptionalColorField
        disabled={disabled}
        fallback={fallback}
        inheritLabel={
          value.ball === null ? "Usa el color de los módulos." : "Color propio."
        }
        label="Centro"
        onChange={(ball) => onChange({ ball }, "eyes.ball")}
        swatches={swatches}
        value={value.ball}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Solid or gradient paint for the modules.
// ---------------------------------------------------------------------------

export function PaintField({
  value,
  onChange,
  swatches,
  disabled,
}: {
  value: QrPaint;
  onChange: (paint: QrPaint, key?: string) => void;
  swatches: readonly Swatch[];
  disabled: boolean;
}) {
  return (
    <>
      <Segmented
        disabled={disabled}
        fill
        label="Relleno de los módulos"
        onChange={(kind) => onChange(convertPaint(value, kind))}
        options={[
          { value: "solid", label: "Sólido" },
          { value: "linear", label: "Lineal" },
          { value: "radial", label: "Radial" },
        ]}
        value={value.kind}
      />
      {value.kind === "solid" ? (
        <ColorField
          disabled={disabled}
          label="Color de los módulos"
          onChange={(color) =>
            onChange({ kind: "solid", color }, "paint.color")
          }
          swatches={swatches}
          value={value.color}
        />
      ) : (
        <>
          <ColorField
            disabled={disabled}
            label={
              value.kind === "radial" ? "Color del centro" : "Color inicial"
            }
            onChange={(from) => onChange({ ...value, from }, "paint.from")}
            swatches={swatches}
            value={value.from}
          />
          <ColorField
            disabled={disabled}
            label={value.kind === "radial" ? "Color del borde" : "Color final"}
            onChange={(to) => onChange({ ...value, to }, "paint.to")}
            swatches={swatches}
            value={value.to}
          />
          <div className="qrs-inline-actions">
            <button
              className="button button-ghost button-small"
              disabled={disabled}
              onClick={() =>
                onChange({ ...value, from: value.to, to: value.from })
              }
              type="button"
            >
              <Icon name="refresh" size={14} /> Invertir colores
            </button>
          </div>
          {value.kind === "linear" ? (
            <RangeField
              disabled={disabled}
              format={(angle) => `${Math.round(angle)}°`}
              label="Ángulo"
              max={359}
              min={0}
              onChange={(angle) =>
                onChange({ ...value, angle: Math.round(angle) }, "paint.angle")
              }
              step={1}
              value={value.angle}
            />
          ) : null}
          <p className="qrs-hint">
            Mantén los dos colores oscuros: el lector compara cada módulo con el
            fondo, y el tramo más claro del degradado es el que manda.
          </p>
        </>
      )}
    </>
  );
}

function convertPaint(paint: QrPaint, kind: QrPaint["kind"]): QrPaint {
  if (paint.kind === kind) return paint;
  const from = paintColor(paint);
  const to =
    paint.kind === "solid"
      ? from.toLowerCase() === "#0a6c78"
        ? "#16232e"
        : "#0a6c78"
      : paint.to;
  if (kind === "solid") return { kind: "solid", color: from };
  if (kind === "linear") return { kind: "linear", from, to, angle: 45 };
  return { kind: "radial", from, to };
}

export function paintColor(paint: QrPaint): string {
  return paint.kind === "solid" ? paint.color : paint.from;
}

/** Worst module/background contrast (the lightest end of a gradient). */
function worstContrast(design: QrDesign): number | null {
  try {
    const fill = design.modules.fill;
    const colors = fill.kind === "solid" ? [fill.color] : [fill.from, fill.to];
    return Math.min(
      ...colors.map((color) => contrastRatio(color, design.background.color)),
    );
  } catch {
    return null;
  }
}

function formatRatio(ratio: number): string {
  return `${ratio.toLocaleString("es-MX", { maximumFractionDigits: 1 })}:1`;
}
