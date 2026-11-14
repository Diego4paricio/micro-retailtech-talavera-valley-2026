import type { ExperienceTheme } from "@kardo/contracts";
import { useId } from "react";
import { assetsApi } from "../../../api/assets.js";
import { Field } from "../../../components/Field.js";
import { AssetSelect } from "../../../components/FormFields.js";
import { useResource } from "../../../lib/use-resource.js";
import { presetThemes, swatchStyle } from "../theme-style.js";

const backgroundKinds: {
  value: ExperienceTheme["background"]["kind"];
  label: string;
}[] = [
  { value: "solid", label: "Sólido" },
  { value: "gradient", label: "Degradado" },
  { value: "image", label: "Imagen" },
];

const surfaces: { value: ExperienceTheme["surface"]; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];

const buttonStyles: { value: ExperienceTheme["buttonStyle"]; label: string }[] =
  [
    { value: "pill", label: "Píldora" },
    { value: "rounded", label: "Redondeado" },
    { value: "square", label: "Recto" },
    { value: "outline", label: "Contorno" },
  ];

const fonts: { value: ExperienceTheme["font"]; label: string }[] = [
  { value: "sans", label: "Moderna" },
  { value: "serif", label: "Editorial" },
  { value: "rounded", label: "Amigable" },
  { value: "mono", label: "Técnica" },
];

const defaultTheme = presetThemes[0]?.theme as ExperienceTheme;

function sameTheme(a: ExperienceTheme, b: ExperienceTheme): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Page theme editor shared by Experiences, Links and the organization brand.
 * Contract (keep stable): `value` may be undefined (no custom theme);
 * `onChange(undefined)` resets to the default look.
 */
export function ThemeEditor({
  value,
  onChange,
  workspaceId,
}: {
  value: ExperienceTheme | undefined;
  onChange: (theme: ExperienceTheme | undefined) => void;
  /** Workspace used to pick/upload a background image. */
  workspaceId: string;
}) {
  const id = useId();
  const assets = useResource(`assets:${workspaceId}`, (signal) =>
    assetsApi.list(workspaceId, signal),
  );
  const enabled = value !== undefined;
  const theme = value ?? defaultTheme;

  function patch(partial: Partial<ExperienceTheme>) {
    onChange({ ...theme, ...partial });
  }

  function patchBackground(partial: Partial<ExperienceTheme["background"]>) {
    onChange({
      ...theme,
      background: {
        ...theme.background,
        ...partial,
      } as ExperienceTheme["background"],
    });
  }

  function setBackgroundKind(kind: ExperienceTheme["background"]["kind"]) {
    const color = theme.background.color;
    if (kind === "solid") return patch({ background: { kind, color } });
    if (kind === "gradient")
      return patch({
        background: {
          kind,
          color,
          colorTo: theme.background.colorTo ?? "#fffefa",
          angle: theme.background.angle ?? 135,
        },
      });
    return patch({
      background: {
        kind,
        color,
        ...(theme.background.imageAssetId
          ? { imageAssetId: theme.background.imageAssetId }
          : {}),
        overlay: theme.background.overlay ?? 40,
      },
    });
  }

  // `exactOptionalPropertyTypes` forbids writing `imageAssetId: undefined`:
  // an empty selection must drop the key entirely, not set it to undefined.
  function setBackgroundImage(imageAssetId: string) {
    patch({
      background: {
        kind: "image",
        color: theme.background.color,
        overlay: theme.background.overlay ?? 40,
        ...(imageAssetId ? { imageAssetId } : {}),
      },
    });
  }

  return (
    <fieldset className="theme-editor">
      <legend>Apariencia</legend>
      <div className="theme-editor-toggle">
        <p className="field-hint">
          {enabled
            ? "Se aplica a la página pública. Puedes volver al estilo de Kardo cuando quieras."
            : "Elige un estilo sugerido o personaliza desde cero. Sin elegir, la página usa el estilo de Kardo."}
        </p>
        {enabled ? (
          <button
            className="link-button"
            onClick={() => onChange(undefined)}
            type="button"
          >
            Volver al estilo de Kardo
          </button>
        ) : (
          <button
            className="button button-secondary button-small"
            onClick={() => onChange(defaultTheme)}
            type="button"
          >
            Personalizar desde cero
          </button>
        )}
      </div>

      <fieldset className="theme-editor-group">
        <legend>Estilos sugeridos</legend>
        <div className="theme-preset-row">
          {presetThemes.map((preset) => {
            const selected = enabled && sameTheme(theme, preset.theme);
            return (
              <button
                aria-label={preset.name}
                aria-pressed={selected}
                className={
                  selected
                    ? "theme-preset theme-preset-selected"
                    : "theme-preset"
                }
                key={preset.name}
                onClick={() => onChange(preset.theme)}
                style={swatchStyle(preset.theme)}
                title={preset.name}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="theme-preset-dot"
                  style={{ background: preset.theme.accent }}
                />
              </button>
            );
          })}
        </div>
      </fieldset>

      {enabled ? (
        <div className="theme-editor-body">
          <fieldset className="theme-editor-group">
            <legend>Fondo</legend>
            <div className="segmented">
              {backgroundKinds.map((option) => (
                <button
                  aria-pressed={theme.background.kind === option.value}
                  className={
                    theme.background.kind === option.value
                      ? "segment segment-current"
                      : "segment"
                  }
                  key={option.value}
                  onClick={() => setBackgroundKind(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            {theme.background.kind === "solid" ? (
              <ColorField
                id={`${id}-bg-color`}
                label="Color"
                onChange={(color) => patchBackground({ color })}
                value={theme.background.color}
              />
            ) : null}

            {theme.background.kind === "gradient" ? (
              <>
                <div className="theme-color-row">
                  <ColorField
                    id={`${id}-bg-color`}
                    label="Color 1"
                    onChange={(color) => patchBackground({ color })}
                    value={theme.background.color}
                  />
                  <ColorField
                    id={`${id}-bg-color-to`}
                    label="Color 2"
                    onChange={(colorTo) => patchBackground({ colorTo })}
                    value={theme.background.colorTo ?? "#fffefa"}
                  />
                </div>
                <Field id={`${id}-bg-angle`} label="Ángulo">
                  <input
                    id={`${id}-bg-angle`}
                    max={360}
                    min={0}
                    onChange={(event) =>
                      patchBackground({ angle: Number(event.target.value) })
                    }
                    step={15}
                    type="range"
                    value={theme.background.angle ?? 135}
                  />
                </Field>
              </>
            ) : null}

            {theme.background.kind === "image" ? (
              <>
                <div className="theme-bg-image-row">
                  <AssetSelect
                    assets={assets.data ?? []}
                    id={`${id}-bg-image`}
                    kind="image"
                    label="Imagen de fondo"
                    onAssetUploaded={(asset) =>
                      assets.setData((items) =>
                        items ? [asset, ...items] : [asset],
                      )
                    }
                    onChange={setBackgroundImage}
                    value={theme.background.imageAssetId}
                  />
                </div>
                <Field
                  hint="Oscurece la imagen para que el texto se lea bien encima."
                  id={`${id}-bg-overlay`}
                  label={`Superposición · ${theme.background.overlay ?? 40} %`}
                >
                  <input
                    id={`${id}-bg-overlay`}
                    max={80}
                    min={0}
                    onChange={(event) =>
                      patchBackground({ overlay: Number(event.target.value) })
                    }
                    type="range"
                    value={theme.background.overlay ?? 40}
                  />
                </Field>
              </>
            ) : null}
          </fieldset>

          <fieldset className="theme-editor-group">
            <legend>Superficie</legend>
            <div className="segmented">
              {surfaces.map((option) => (
                <button
                  aria-pressed={theme.surface === option.value}
                  className={
                    theme.surface === option.value
                      ? "segment segment-current"
                      : "segment"
                  }
                  key={option.value}
                  onClick={() => patch({ surface: option.value })}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <ColorField
            id={`${id}-accent`}
            label="Color de acento"
            onChange={(accent) => patch({ accent })}
            value={theme.accent}
          />

          <fieldset className="theme-editor-group">
            <legend>Estilo de botón</legend>
            <div className="theme-button-row">
              {buttonStyles.map((option) => (
                <button
                  aria-pressed={theme.buttonStyle === option.value}
                  className={
                    theme.buttonStyle === option.value
                      ? "theme-button-sample theme-button-sample-selected"
                      : "theme-button-sample"
                  }
                  key={option.value}
                  onClick={() => patch({ buttonStyle: option.value })}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`theme-button-shape theme-button-shape-${option.value}`}
                    style={{
                      borderColor: theme.accent,
                      background:
                        option.value === "outline"
                          ? "transparent"
                          : theme.accent,
                    }}
                  />
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="theme-editor-group">
            <legend>Tipografía</legend>
            <div className="segmented">
              {fonts.map((option) => (
                <button
                  aria-pressed={theme.font === option.value}
                  className={
                    theme.font === option.value
                      ? "segment segment-current"
                      : "segment"
                  }
                  key={option.value}
                  onClick={() => patch({ font: option.value })}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </fieldset>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label}>
      <div className="theme-color-field">
        <input
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={value}
        />
        <code>{value}</code>
      </div>
    </Field>
  );
}
