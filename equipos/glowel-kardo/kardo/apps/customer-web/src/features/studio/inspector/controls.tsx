import type {
  DesignBackground,
  DesignShape,
  ImageMask,
  SectionLayout,
} from "@kardo/contracts";
import { RadioGroup, Slider } from "radix-ui";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  ColorField,
  ControlGroup,
  RangeField,
  Segmented,
} from "../../../components/controls/index.js";
import { Icon } from "../../../components/Icon.js";
import { useAssetImage } from "../../../lib/asset-images.js";
import { AssetSelect } from "../../experiences/editors/fields.js";
import {
  type ColorToken,
  colorTokenLabels,
  colorTokens,
  imageMaskLabels,
  isColorToken,
  layoutFractions,
  layoutLabels,
  shapeLabels,
} from "../labels.js";
import { useStudio } from "../StudioContext.js";

/**
 * Inspector controls of the Estudio de Experiences. Choices are radix
 * RadioGroups (arrow keys, one tab stop) and sliders are radix Sliders, as
 * in the Estudio QR, whose ColorField/RangeField/Segmented are reused.
 */

// ---------------------------------------------------------------------------
// Numeric stepper: exact value + slider, optional (empty = automatic).
// ---------------------------------------------------------------------------

export function StepperField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  fallback,
  onChange,
  format,
  disabled,
  hint,
}: {
  label: string;
  /** `undefined` means "automatic" (inherits from the page). */
  value: number | undefined;
  min: number;
  max: number;
  step?: number | undefined;
  unit?: string | undefined;
  /** Where the slider rests while the value is automatic. */
  fallback: number;
  onChange: (value: number | undefined) => void;
  /** Shown instead of the raw number (e.g. 15 → "1.5"). */
  format?: ((value: number) => string) | undefined;
  disabled?: boolean | undefined;
  hint?: ReactNode | undefined;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  useEffect(() => {
    setDraft(value === undefined ? "" : String(value));
  }, [value]);
  const shown = value ?? fallback;
  const commit = (raw: string) => {
    if (raw.trim() === "") {
      onChange(undefined);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(value === undefined ? "" : String(value));
      return;
    }
    const clamped = Math.min(
      max,
      Math.max(min, Math.round(parsed / step) * step),
    );
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div
      className="qrs-control es-stepper"
      data-auto={value === undefined || undefined}
    >
      <div className="qrs-control-head">
        <label className="qrs-control-label" htmlFor={id}>
          {label}
        </label>
        <span className="es-stepper-value">
          <input
            aria-describedby={`${id}-range`}
            className="input es-stepper-input"
            disabled={disabled}
            id={id}
            inputMode="numeric"
            max={max}
            min={min}
            onBlur={(event) => commit(event.target.value)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(event.currentTarget.value);
            }}
            placeholder="Auto"
            step={step}
            type="number"
            value={draft}
          />
          {unit ? <span className="es-stepper-unit">{unit}</span> : null}
          {value !== undefined && !disabled ? (
            <button
              aria-label={`Volver a automático: ${label}`}
              className="es-reset"
              onClick={() => onChange(undefined)}
              title="Volver a automático"
              type="button"
            >
              <Icon name="reset" size={13} />
            </button>
          ) : null}
        </span>
      </div>
      <Slider.Root
        className="qrs-slider"
        disabled={disabled ?? false}
        max={max}
        min={min}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
        step={step}
        value={[Math.min(max, Math.max(min, shown))]}
      >
        <Slider.Track className="qrs-slider-track">
          <Slider.Range className="qrs-slider-range" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={label}
          aria-valuetext={
            value === undefined
              ? "Automático"
              : `${format ? format(value) : value}${unit ? ` ${unit}` : ""}`
          }
          className="qrs-slider-thumb"
        />
      </Slider.Root>
      <p className="qrs-hint" id={`${id}-range`}>
        {hint ??
          `De ${format ? format(min) : min} a ${format ? format(max) : max}${unit ? ` ${unit}` : ""}.`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A color that is a palette token, a custom hex or automatic.
// ---------------------------------------------------------------------------

export function ColorTokenField({
  label,
  value,
  onChange,
  allowNone,
  disabled,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** Adds "Sin fondo" (the literal `none`). */
  allowNone?: boolean | undefined;
  disabled?: boolean | undefined;
}) {
  const { design, swatches } = useStudio();
  const labelId = useId();
  const mode: "auto" | "none" | ColorToken | "custom" =
    value === undefined
      ? "auto"
      : value === "none"
        ? "none"
        : isColorToken(value)
          ? value
          : "custom";
  const palette = design.style.palette;
  const options: { value: typeof mode; label: string; color?: string }[] = [
    { value: "auto", label: "Automático" },
    ...(allowNone ? [{ value: "none" as const, label: "Sin fondo" }] : []),
    ...colorTokens.map((token) => ({
      value: token,
      label: colorTokenLabels[token],
      color: palette[token],
    })),
    { value: "custom", label: "Otro color" },
  ];
  return (
    <div className="qrs-control">
      <div className="qrs-control-head">
        <span className="qrs-control-label" id={labelId}>
          {label}
        </span>
        <span className="qrs-control-aside">
          {options.find((option) => option.value === mode)?.label}
        </span>
      </div>
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="es-tokens"
        disabled={disabled}
        loop
        onValueChange={(next) => {
          if (next === "auto") onChange(undefined);
          else if (next === "none") onChange("none");
          else if (next === "custom")
            onChange(
              value && !isColorToken(value) && value !== "none"
                ? value
                : palette.accent,
            );
          else onChange(next);
        }}
        orientation="horizontal"
        value={mode}
      >
        {options.map((option) => (
          <RadioGroup.Item
            aria-label={option.label}
            className="es-token"
            data-kind={option.value}
            key={option.value}
            title={option.label}
            value={option.value}
          >
            {option.color ? (
              <span
                className="es-token-dot"
                style={{ background: option.color }}
              />
            ) : option.value === "auto" ? (
              <Icon name="reset" size={14} />
            ) : option.value === "none" ? (
              <Icon name="ban" size={14} />
            ) : (
              <Icon name="palette" size={14} />
            )}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      {mode === "custom" && value ? (
        <ColorField
          disabled={disabled}
          label={`${label}: color propio`}
          onChange={onChange}
          swatches={swatches}
          value={value}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image from the library (the Experiences picker + inline upload).
// ---------------------------------------------------------------------------

export function ImageField({
  id,
  label,
  value,
  onChange,
  error,
  optional,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string | undefined;
  optional?: boolean | undefined;
}) {
  const { workspaceId, assets, addAsset, readOnly, canUploadAssets } =
    useStudio();
  const image = useAssetImage(workspaceId, value || undefined, "thumb");
  return (
    <div className="es-image-field">
      <div
        className="es-image-thumb"
        data-state={value ? image.status : "empty"}
      >
        {image.url ? (
          <img alt="" src={image.url} />
        ) : (
          <Icon name={value ? "asset" : "image-plus"} size={22} />
        )}
      </div>
      <AssetSelect
        assets={assets}
        error={error}
        id={id}
        kind="image"
        label={label}
        onAssetUploaded={canUploadAssets ? addAsset : undefined}
        onChange={onChange}
        optional={optional}
        readOnly={readOnly}
        value={value || undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backgrounds (page and sections).
// ---------------------------------------------------------------------------

const backgroundKinds: readonly {
  value: DesignBackground["kind"];
  label: string;
}[] = [
  { value: "none", label: "Ninguno" },
  { value: "solid", label: "Color" },
  { value: "gradient", label: "Degradado" },
  { value: "image", label: "Imagen" },
];

export function BackgroundFields({
  idPrefix,
  value,
  onChange,
  noneLabel,
  baseColor,
  error,
}: {
  idPrefix: string;
  value: DesignBackground | undefined;
  onChange: (value: DesignBackground, key?: string) => void;
  /** What "Ninguno" means here. */
  noneLabel: string;
  /** Starting color when switching from "Ninguno". */
  baseColor: string;
  error?: string | undefined;
}) {
  const { readOnly, swatches } = useStudio();
  const current: DesignBackground = value ?? { kind: "none" };
  const color = current.color ?? baseColor;
  const setKind = (kind: DesignBackground["kind"]) => {
    if (kind === "none") onChange({ kind: "none" });
    else if (kind === "solid") onChange({ kind, color });
    else if (kind === "gradient")
      onChange({
        kind,
        color,
        colorTo: current.colorTo ?? baseColor,
        angle: current.angle ?? 160,
      });
    else
      onChange({
        kind,
        color,
        ...(current.imageRef ? { imageRef: current.imageRef } : {}),
        overlay: current.overlay ?? 30,
        position: current.position ?? "center",
      });
  };
  return (
    <div className="es-fields">
      <Segmented
        disabled={readOnly}
        fill
        hint={current.kind === "none" ? noneLabel : undefined}
        label="Tipo de fondo"
        onChange={setKind}
        options={backgroundKinds}
        value={current.kind}
      />
      {current.kind === "solid" || current.kind === "gradient" ? (
        <ColorField
          disabled={readOnly}
          label={current.kind === "gradient" ? "Color inicial" : "Color"}
          onChange={(next) =>
            onChange({ ...current, color: next }, `${idPrefix}-color`)
          }
          swatches={swatches}
          value={color}
        />
      ) : null}
      {current.kind === "gradient" ? (
        <>
          <ColorField
            disabled={readOnly}
            label="Color final"
            onChange={(next) =>
              onChange({ ...current, colorTo: next }, `${idPrefix}-color-to`)
            }
            swatches={swatches}
            value={current.colorTo ?? baseColor}
          />
          <RangeField
            disabled={readOnly}
            format={(angle) => `${angle}°`}
            label="Dirección"
            max={360}
            min={0}
            onChange={(angle) =>
              onChange({ ...current, angle }, `${idPrefix}-angle`)
            }
            step={5}
            value={current.angle ?? 160}
          />
        </>
      ) : null}
      {current.kind === "image" ? (
        <>
          <ImageField
            error={error}
            id={`${idPrefix}-image`}
            label="Foto de fondo"
            onChange={(ref) => {
              const { imageRef: _old, ...rest } = current;
              onChange(ref ? { ...rest, imageRef: ref } : rest);
            }}
            value={current.imageRef}
          />
          <RangeField
            disabled={readOnly}
            format={(overlay) => `${overlay} %`}
            hint="Oscurece la foto para que el texto se lea."
            label="Velo"
            max={80}
            min={0}
            onChange={(overlay) =>
              onChange({ ...current, overlay }, `${idPrefix}-overlay`)
            }
            step={5}
            value={current.overlay ?? 0}
          />
          <Segmented
            disabled={readOnly}
            fill
            label="Encuadre"
            onChange={(position) => onChange({ ...current, position })}
            options={[
              { value: "top", label: "Arriba" },
              { value: "center", label: "Centro" },
              { value: "bottom", label: "Abajo" },
            ]}
            value={current.position ?? "center"}
          />
          <ColorField
            disabled={readOnly}
            hint="Se ve mientras carga la foto."
            label="Color de respaldo"
            onChange={(next) =>
              onChange({ ...current, color: next }, `${idPrefix}-color`)
            }
            swatches={swatches}
            value={color}
          />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section layout tiles.
// ---------------------------------------------------------------------------

export function LayoutGlyph({ layout }: { layout: SectionLayout }) {
  return (
    <span aria-hidden="true" className="es-layout-glyph">
      {layoutFractions[layout].map((fraction, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed, ordered columns
          key={index}
          style={{ flexGrow: fraction }}
        />
      ))}
    </span>
  );
}

export function LayoutPicker({
  value,
  onChange,
  disabled,
}: {
  value: SectionLayout;
  onChange: (layout: SectionLayout) => void;
  disabled?: boolean | undefined;
}) {
  const labelId = useId();
  const layouts = Object.keys(layoutLabels) as SectionLayout[];
  return (
    <ControlGroup
      aside={layoutLabels[value]}
      hint="En celulares las columnas se apilan en este orden."
      label="Columnas"
      labelId={labelId}
    >
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="es-layouts"
        disabled={disabled}
        loop
        onValueChange={(next) => {
          if (next) onChange(next as SectionLayout);
        }}
        orientation="horizontal"
        value={value}
      >
        {layouts.map((layout) => (
          <RadioGroup.Item
            aria-label={layoutLabels[layout]}
            className="es-layout"
            key={layout}
            title={layoutLabels[layout]}
            value={layout}
          >
            <LayoutGlyph layout={layout} />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </ControlGroup>
  );
}

// ---------------------------------------------------------------------------
// Shapes and image masks: a small drawn preview per glyph (no icon set has
// all 9), reused by the shape gallery and the image/imageMain mask field.
// ---------------------------------------------------------------------------

/** CSS a small square needs to read as `shape` (best-effort preview; the
 * real, exact shape is drawn by `@kardo/page-render`). */
function shapeGlyphStyle(shape: DesignShape | ImageMask): React.CSSProperties {
  switch (shape) {
    case "rect":
    case "none":
      return {};
    case "ellipse":
    case "circle":
      return { borderRadius: "50%" };
    case "pill":
      return { borderRadius: "999px" };
    case "rounded":
      return { borderRadius: "28%" };
    case "triangle":
      return { clipPath: "polygon(50% 6%, 96% 94%, 4% 94%)" };
    case "diamond":
      return { clipPath: "polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%)" };
    case "hexagon":
      return {
        clipPath: "polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)",
      };
    case "star":
      return {
        clipPath:
          "polygon(50% 2%, 63% 36%, 98% 38%, 70% 60%, 80% 96%, 50% 75%, 20% 96%, 30% 60%, 2% 38%, 37% 36%)",
      };
    case "arch":
      return { borderRadius: "50% 50% 0 0" };
    case "blob":
      return { borderRadius: "62% 38% 34% 66% / 58% 42% 58% 42%" };
  }
}

function ShapeGlyph({ shape }: { shape: DesignShape | ImageMask }) {
  return (
    <span
      aria-hidden="true"
      className="es-shape-glyph"
      style={shapeGlyphStyle(shape)}
    />
  );
}

export function ShapeGallery({
  value,
  onChange,
  disabled,
}: {
  value: DesignShape;
  onChange: (shape: DesignShape) => void;
  disabled?: boolean | undefined;
}) {
  const labelId = useId();
  const shapes = Object.keys(shapeLabels) as DesignShape[];
  return (
    <div className="qrs-control">
      <span className="qrs-control-label" id={labelId}>
        Forma
      </span>
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="es-shape-gallery"
        disabled={disabled}
        loop
        onValueChange={(next) => {
          if (next) onChange(next as DesignShape);
        }}
        orientation="horizontal"
        value={value}
      >
        {shapes.map((shape) => (
          <RadioGroup.Item
            aria-label={shapeLabels[shape]}
            className="es-shape-tile"
            key={shape}
            title={shapeLabels[shape]}
            value={shape}
          >
            <ShapeGlyph shape={shape} />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

export function MaskGallery({
  value,
  onChange,
  disabled,
}: {
  value: ImageMask | undefined;
  onChange: (mask: ImageMask | undefined) => void;
  disabled?: boolean | undefined;
}) {
  const labelId = useId();
  const masks = Object.keys(imageMaskLabels) as ImageMask[];
  return (
    <div className="qrs-control">
      <span className="qrs-control-label" id={labelId}>
        Recorte
      </span>
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="es-shape-gallery"
        disabled={disabled}
        loop
        onValueChange={(next) => {
          if (next) onChange(next === "none" ? undefined : (next as ImageMask));
        }}
        orientation="horizontal"
        value={value ?? "none"}
      >
        {masks.map((mask) => (
          <RadioGroup.Item
            aria-label={imageMaskLabels[mask]}
            className="es-shape-tile"
            key={mask}
            title={imageMaskLabels[mask]}
            value={mask}
          >
            <ShapeGlyph shape={mask} />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

/** A plain text (or URL) input with a counter and inline error, shared by
 * every block's fields (free blocks, the new bound blocks and `html`). */
export function TextField({
  id,
  label,
  value,
  onChange,
  max,
  error,
  hint,
  optional,
  placeholder,
  type = "text",
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string | undefined;
  hint?: string | undefined;
  optional?: boolean | undefined;
  placeholder?: string | undefined;
  type?: "text" | "url" | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <div className="qrs-control">
      <div className="qrs-control-head">
        <label className="qrs-control-label" htmlFor={id}>
          {label}
          {optional ? <span className="es-optional"> (opcional)</span> : null}
        </label>
        {type === "text" && value.length > max * 0.7 ? (
          <span
            className={
              value.length > max
                ? "qrs-counter qrs-counter-full"
                : "qrs-counter"
            }
          >
            {value.length} / {max}
          </span>
        ) : null}
      </div>
      <input
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        aria-invalid={Boolean(error) || undefined}
        autoComplete="off"
        className="input"
        disabled={disabled}
        id={id}
        inputMode={type === "url" ? "url" : undefined}
        maxLength={type === "url" ? 2048 : max + 20}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={type === "url" ? false : undefined}
        type={type === "url" ? "url" : "text"}
        value={value}
      />
      <div id={`${id}-error`}>
        <FieldIssue message={error} />
      </div>
      {hint && !error ? (
        <p className="qrs-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Short inline error under a field. */
export function FieldIssue({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="qrs-hint qrs-hint-error" role="alert">
      <Icon name="circle-alert" size={14} /> {message}
    </p>
  );
}
