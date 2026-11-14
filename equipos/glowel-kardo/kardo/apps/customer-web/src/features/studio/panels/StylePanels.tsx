import {
  DESIGN_LEGACY_PAGE_PADDING,
  type DesignAmbient,
  type DesignFont,
  type DesignStyle,
  designFonts,
} from "@kardo/contracts";
import { RadioGroup } from "radix-ui";
import { type CSSProperties, useEffect, useId, useState } from "react";
import {
  ColorField,
  RangeField,
  Segmented,
  SwitchField,
} from "../../../components/controls/index.js";
import { BackgroundFields, StepperField } from "../inspector/controls.js";
import {
  ambientKindLabels,
  buttonShapeLabels,
  buttonStyleLabels,
  fontLabels,
  fontSampleStacks,
  paletteLabels,
  shadowLabels,
} from "../labels.js";
import { updateStyle } from "../model/operations.js";
import { loadPanelFont } from "../preview/fonts.js";
import { useStudio } from "../StudioContext.js";

function useStyleChange() {
  const { change } = useStudio();
  return (recipe: (style: DesignStyle) => DesignStyle, key?: string) =>
    change(
      (design) => updateStyle(design, recipe),
      key ? `style:${key}` : undefined,
    );
}

const paletteKeys = [
  "background",
  "surface",
  "text",
  "muted",
  "accent",
] as const satisfies readonly (keyof DesignStyle["palette"])[];

/** Estilo: palette, fonts, radius, buttons, shadow and content width. */
export function StylePanel() {
  const { design, readOnly, swatches } = useStudio();
  const style = design.style;
  const set = useStyleChange();
  return (
    <fieldset className="es-fields es-panel-stack" disabled={readOnly}>
      <section className="es-panel-group" aria-labelledby="es-style-palette">
        <h3 className="es-group-title" id="es-style-palette">
          Paleta
        </h3>
        <div className="es-palette-strip" aria-hidden="true">
          {paletteKeys.map((key) => (
            <span key={key} style={{ background: style.palette[key] }} />
          ))}
        </div>
        {paletteKeys.map((key) => (
          <ColorField
            hint={paletteLabels[key].hint}
            key={key}
            label={paletteLabels[key].label}
            onChange={(color) =>
              set(
                (current) => ({
                  ...current,
                  palette: { ...current.palette, [key]: color },
                }),
                `palette-${key}`,
              )
            }
            swatches={swatches}
            value={style.palette[key]}
          />
        ))}
      </section>

      <section className="es-panel-group" aria-labelledby="es-style-type">
        <h3 className="es-group-title" id="es-style-type">
          Tipografía
        </h3>
        <FontPicker
          label="Títulos"
          onChange={(heading) =>
            set((current) => ({
              ...current,
              fonts: { ...current.fonts, heading },
            }))
          }
          value={style.fonts.heading}
        />
        <FontPicker
          label="Texto"
          onChange={(body) =>
            set((current) => ({
              ...current,
              fonts: { ...current.fonts, body },
            }))
          }
          value={style.fonts.body}
        />
      </section>

      <section className="es-panel-group" aria-labelledby="es-style-buttons">
        <h3 className="es-group-title" id="es-style-buttons">
          Botones y formas
        </h3>
        <ButtonSample style={style} />
        <Segmented
          fill
          label="Relleno de los botones"
          onChange={(buttonStyle) =>
            set((current) => ({ ...current, buttonStyle }))
          }
          options={(
            Object.keys(buttonStyleLabels) as DesignStyle["buttonStyle"][]
          ).map((value) => ({ value, label: buttonStyleLabels[value] }))}
          value={style.buttonStyle}
        />
        <Segmented
          fill
          label="Forma de los botones"
          onChange={(buttonShape) =>
            set((current) => ({ ...current, buttonShape }))
          }
          options={(
            Object.keys(buttonShapeLabels) as DesignStyle["buttonShape"][]
          ).map((value) => ({ value, label: buttonShapeLabels[value] }))}
          value={style.buttonShape}
        />
        <RangeField
          format={(value) => `${value} px`}
          hint="Tarjetas, imágenes y botones redondeados."
          label="Esquinas"
          max={32}
          min={0}
          onChange={(radius) =>
            set((current) => ({ ...current, radius }), "radius")
          }
          step={1}
          value={style.radius}
        />
        <Segmented
          fill
          label="Sombra de las tarjetas"
          onChange={(shadow) => set((current) => ({ ...current, shadow }))}
          options={(Object.keys(shadowLabels) as DesignStyle["shadow"][]).map(
            (value) => ({ value, label: shadowLabels[value] }),
          )}
          value={style.shadow}
        />
      </section>

      <section className="es-panel-group" aria-labelledby="es-style-padding">
        <h3 className="es-group-title" id="es-style-padding">
          Márgenes de la página
        </h3>
        <PagePaddingPreview
          value={style.pagePadding ?? DESIGN_LEGACY_PAGE_PADDING}
        />
        <StepperField
          fallback={DESIGN_LEGACY_PAGE_PADDING}
          hint="El espacio a los lados de cada sección normal. Las secciones de espacio libre siempre llegan de borde a borde."
          label="Margen izquierdo y derecho"
          max={48}
          min={0}
          onChange={(pagePadding) =>
            set((current) => {
              const { pagePadding: _old, ...rest } = current;
              return pagePadding === undefined
                ? rest
                : { ...rest, pagePadding };
            }, "pagePadding")
          }
          unit="px"
          value={style.pagePadding}
        />
      </section>

      <section className="es-panel-group" aria-labelledby="es-style-width">
        <h3 className="es-group-title" id="es-style-width">
          Ancho del contenido
        </h3>
        <RangeField
          format={(value) => `${value} px`}
          hint="Cuánto se extiende la página en pantallas grandes. En celulares siempre ocupa todo el ancho."
          label="Ancho máximo"
          max={960}
          min={360}
          onChange={(maxWidth) =>
            set((current) => ({ ...current, maxWidth }), "maxWidth")
          }
          step={8}
          value={style.maxWidth}
        />
        <div className="es-presets">
          {(
            [
              ["Angosto", 480],
              ["Medio", 640],
              ["Ancho", 880],
            ] as const
          ).map(([label, width]) => (
            <button
              aria-pressed={style.maxWidth === width}
              className="qrs-chip"
              key={label}
              onClick={() =>
                set((current) => ({ ...current, maxWidth: width }))
              }
              type="button"
            >
              {label} · {width}
            </button>
          ))}
        </div>
      </section>
    </fieldset>
  );
}

/** A quick preview of `pagePadding`: a phone-width strip with the margin
 * drawn on both sides, so the number reads as a distance right away. */
function PagePaddingPreview({ value }: { value: number }) {
  return (
    <div aria-hidden="true" className="es-padding-preview">
      <span className="es-padding-preview-margin" style={{ width: value }} />
      <span className="es-padding-preview-content" />
      <span className="es-padding-preview-margin" style={{ width: value }} />
    </div>
  );
}

function ButtonSample({ style }: { style: DesignStyle }) {
  const radius =
    style.buttonShape === "pill"
      ? 999
      : style.buttonShape === "square"
        ? Math.min(style.radius, 8)
        : style.radius;
  const accent = style.palette.accent;
  const sample: CSSProperties = {
    borderRadius: radius,
    fontFamily: fontSampleStacks[style.fonts.body],
    ...(style.buttonStyle === "outline"
      ? { background: "transparent", color: accent, borderColor: accent }
      : style.buttonStyle === "soft"
        ? {
            background: `color-mix(in srgb, ${accent} 16%, ${style.palette.surface})`,
            color: accent,
          }
        : { background: accent, color: "var(--on-solid)" }),
  };
  return (
    <div
      aria-hidden="true"
      className="es-button-sample"
      style={{ background: style.palette.background }}
    >
      <span style={sample}>Reservar mesa</span>
    </div>
  );
}

function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DesignFont;
  onChange: (font: DesignFont) => void;
}) {
  const labelId = useId();
  const [families, setFamilies] = useState<Partial<Record<DesignFont, string>>>(
    {},
  );
  useEffect(() => {
    let cancelled = false;
    for (const font of designFonts)
      void loadPanelFont(font).then((family) => {
        if (!cancelled && family)
          setFamilies((current) => ({ ...current, [font]: family }));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="qrs-control">
      <div className="qrs-control-head">
        <span className="qrs-control-label" id={labelId}>
          {label}
        </span>
        <span className="qrs-control-aside">{fontLabels[value]}</span>
      </div>
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="es-fonts"
        loop
        onValueChange={(next) => {
          if (next) onChange(next as DesignFont);
        }}
        value={value}
      >
        {designFonts.map((font) => (
          <RadioGroup.Item
            className="es-font"
            key={font}
            title={fontLabels[font]}
            value={font}
          >
            <span
              aria-hidden="true"
              className="es-font-sample"
              style={{
                fontFamily: families[font]
                  ? `"${families[font]}", ${fontSampleStacks[font]}`
                  : fontSampleStacks[font],
              }}
            >
              Aa
            </span>
            <span className="es-font-name">{fontLabels[font]}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

/** Fondo: the page background behind every section, plus the blurred
 * ambient field behind it (addendum 3). */
export function BackgroundPanel() {
  const { design, readOnly, issues, swatches } = useStudio();
  const set = useStyleChange();
  const ambient = design.style.ambient;
  const kind = ambient?.kind ?? "auto";
  const baseColor = design.style.palette.accent;

  const setAmbient = (next: DesignAmbient | undefined, key?: string) =>
    set((current) => {
      const { ambient: _old, ...rest } = current;
      return next ? { ...rest, ambient: next } : rest;
    }, key);

  return (
    <fieldset className="es-panel-stack" disabled={readOnly}>
      <section aria-labelledby="es-bg-ambient" className="es-panel-group">
        <h3 className="es-group-title" id="es-bg-ambient">
          Fondo difuminado
        </h3>
        <p className="qrs-hint">
          Resalta tus tarjetas y llena la pantalla en computadora con
          resplandores suaves detrás de la página. Está activado por defecto.
        </p>
        <SwitchField
          checked={kind !== "none"}
          label="Fondo difuminado"
          onChange={(checked) =>
            setAmbient(
              checked
                ? { kind: "auto", strength: ambient?.strength ?? 60 }
                : { kind: "none" },
              "ambient-kind",
            )
          }
        />
        {kind !== "none" ? (
          <>
            <Segmented
              fill
              label="Colores"
              onChange={(next) =>
                setAmbient(
                  next === "custom"
                    ? {
                        kind: "custom",
                        color: ambient?.color ?? baseColor,
                        colorTo:
                          ambient?.colorTo ?? design.style.palette.surface,
                        strength: ambient?.strength ?? 60,
                      }
                    : { kind: "auto", strength: ambient?.strength ?? 60 },
                  "ambient-kind",
                )
              }
              options={[
                { value: "auto", label: ambientKindLabels.auto },
                { value: "custom", label: ambientKindLabels.custom },
              ]}
              value={kind === "custom" ? "custom" : "auto"}
            />
            {kind === "custom" ? (
              <>
                <ColorField
                  label="Primer color"
                  onChange={(color) =>
                    setAmbient(
                      {
                        kind: "custom",
                        color,
                        colorTo: ambient?.colorTo ?? baseColor,
                        strength: ambient?.strength ?? 60,
                      },
                      "ambient-color",
                    )
                  }
                  swatches={swatches}
                  value={ambient?.color ?? baseColor}
                />
                <ColorField
                  label="Segundo color"
                  onChange={(colorTo) =>
                    setAmbient(
                      {
                        kind: "custom",
                        color: ambient?.color ?? baseColor,
                        colorTo,
                        strength: ambient?.strength ?? 60,
                      },
                      "ambient-color-to",
                    )
                  }
                  swatches={swatches}
                  value={ambient?.colorTo ?? design.style.palette.surface}
                />
              </>
            ) : null}
            <RangeField
              format={(value) => `${value} %`}
              label="Intensidad"
              max={100}
              min={0}
              onChange={(strength) =>
                setAmbient(
                  ambient?.kind === "custom"
                    ? { ...ambient, strength }
                    : { kind: "auto", strength },
                  "ambient-strength",
                )
              }
              step={5}
              value={ambient?.strength ?? 60}
            />
          </>
        ) : null}
      </section>
      <section aria-labelledby="es-bg-page" className="es-panel-group">
        <h3 className="es-group-title" id="es-bg-page">
          Fondo de la página
        </h3>
        <BackgroundFields
          baseColor={design.style.palette.background}
          error={
            issues.find(
              (issue) => issue.area === "page" && issue.field === "background",
            )?.message
          }
          idPrefix="es-page-bg"
          noneLabel="Usa el color «Fondo» de la paleta."
          onChange={(background, key) =>
            set((current) => ({ ...current, background }), key)
          }
          value={design.style.background}
        />
      </section>
    </fieldset>
  );
}
