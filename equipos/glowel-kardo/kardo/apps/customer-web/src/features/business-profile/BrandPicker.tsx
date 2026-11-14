import { type DragEvent, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { imageFileProblem, maxAssetSizeLabel } from "../assets/upload.js";
import "./brand-picker.css";

/**
 * Logo, palette and their validation, in one place (domain audit
 * 2026-10-13, A2-6). Crear organización (step 3) and Configuración → Marca
 * used their own copies, each with its own limit and its own Kardo teal.
 */

/** Kardo's own palette: a sensible starting point, not a forced default. */
export const defaultBrand = { primary: "#0a6c78", accent: "#4ec3ce" };

export type BrandColors = { primary: string; accent: string };
export type PaletteChoice = BrandColors & { label: string };

const hexColor = /^#[0-9a-f]{6}$/i;

/** True for `#rrggbb`, the only shape the profile accepts for a color. */
export function isHexColor(value: string): boolean {
  return hexColor.test(value);
}

/**
 * Two colors for a page: the logo's own color and a soft one, its dark
 * version with the color, or Kardo's. Without a logo, Kardo's first.
 */
export function paletteChoices(logoColor: string | null): PaletteChoice[] {
  const kardo = { ...defaultBrand, label: "Kardo" };
  if (!logoColor || !isHexColor(logoColor)) return [kardo];
  return [
    {
      primary: logoColor,
      accent: mix(logoColor, "#ffffff", 0.72),
      label: "De tu logo",
    },
    {
      primary: mix(logoColor, "#000000", 0.45),
      accent: logoColor,
      label: "Más oscuro",
    },
    kardo,
  ];
}

function mix(a: string, b: string, amount: number): string {
  const parse = (hex: string) =>
    [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const [r1 = 0, g1 = 0, b1 = 0] = parse(a);
  const [r2 = 0, g2 = 0, b2 = 0] = parse(b);
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

/** Why a logo file cannot be used, or null; the same rule as every upload. */
export function logoProblem(file: File): string | null {
  return imageFileProblem(file);
}

/** The two color inputs (primary and accent). */
export function ColorFields({
  primary,
  accent,
  onChange,
  idPrefix,
}: BrandColors & {
  onChange: (colors: BrandColors) => void;
  idPrefix: string;
}) {
  return (
    <div className="brand-colors">
      <label className="brand-color-field" htmlFor={`${idPrefix}-primary`}>
        <span>Color primario</span>
        <input
          id={`${idPrefix}-primary`}
          onChange={(event) => {
            if (isHexColor(event.target.value))
              onChange({ primary: event.target.value, accent });
          }}
          type="color"
          value={primary}
        />
      </label>
      <label className="brand-color-field" htmlFor={`${idPrefix}-accent`}>
        <span>Color de acento</span>
        <input
          id={`${idPrefix}-accent`}
          onChange={(event) => {
            if (isHexColor(event.target.value))
              onChange({ primary, accent: event.target.value });
          }}
          type="color"
          value={accent}
        />
      </label>
    </div>
  );
}

/** The logo: a drop zone, or the chosen file with «Quitar». */
export function LogoPicker({
  logo,
  onLogo,
  note,
}: {
  logo: { file: File; url: string } | null;
  onLogo: (file: File | null) => void;
  /** Under the file name once chosen, e.g. when it will be uploaded. */
  note?: string | undefined;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function pick(file: File | undefined) {
    if (!file) return;
    const issue = logoProblem(file);
    if (issue) {
      setProblem(issue);
      return;
    }
    setProblem(null);
    onLogo(file);
  }

  return (
    <>
      {logo ? (
        <div className="brand-picker-logo">
          <img alt="Tu logo" src={logo.url} />
          <span>
            <strong>{logo.file.name}</strong>
            {note ? <small>{note}</small> : null}
          </span>
          <button
            className="text-action"
            onClick={() => onLogo(null)}
            type="button"
          >
            Quitar
          </button>
        </div>
      ) : (
        <label
          className={
            dragging
              ? "brand-picker-drop brand-picker-drop-active"
              : "brand-picker-drop"
          }
          onDragLeave={() => setDragging(false)}
          onDragOver={(event: DragEvent<HTMLLabelElement>) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDrop={(event: DragEvent<HTMLLabelElement>) => {
            event.preventDefault();
            setDragging(false);
            pick(event.dataTransfer.files[0]);
          }}
        >
          <span aria-hidden="true" className="brand-picker-drop-icon">
            <Icon name="upload" size={20} />
          </span>
          <strong>Sube tu logo</strong>
          <small>
            PNG, JPG o WebP, hasta {maxAssetSizeLabel}. O arrástralo aquí.
          </small>
          <input
            accept="image/png,image/jpeg,image/webp"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              pick(file);
            }}
            type="file"
          />
        </label>
      )}
      {problem ? <p className="field-error">{problem}</p> : null}
    </>
  );
}

/**
 * Logo and colors together (step 3 of Crear organización): the logo, the
 * palettes its color suggests, and «Elegir otros colores».
 */
export function BrandPicker({
  logo,
  onLogo,
  logoColor,
  primary,
  accent,
  onColors,
  logoNote,
}: BrandColors & {
  logo: { file: File; url: string } | null;
  onLogo: (file: File | null) => void;
  /** The logo's own color, once read from it. */
  logoColor: string | null;
  /** The person picked these colors (palette or own). */
  onColors: (colors: BrandColors) => void;
  logoNote?: string | undefined;
}) {
  const [ownColors, setOwnColors] = useState(false);
  const palettes = paletteChoices(logoColor);
  return (
    <>
      <div className="new-org-field">
        <span className="new-org-label">Logo</span>
        <LogoPicker logo={logo} note={logoNote} onLogo={onLogo} />
      </div>
      <div className="new-org-field">
        <span className="new-org-label">Colores</span>
        {logo && palettes.length > 1 ? (
          <p className="new-org-hint">Sugeridos con los colores de tu logo.</p>
        ) : null}
        <fieldset className="brand-picker-palettes">
          <legend className="visually-hidden">Colores</legend>
          {palettes.map((choice) => (
            <button
              aria-pressed={
                !ownColors &&
                choice.primary === primary &&
                choice.accent === accent
              }
              className="brand-picker-palette"
              key={choice.label}
              onClick={() => {
                setOwnColors(false);
                onColors({ primary: choice.primary, accent: choice.accent });
              }}
              type="button"
            >
              <span aria-hidden="true">
                <i style={{ background: choice.primary }} />
                <i style={{ background: choice.accent }} />
              </span>
              {choice.label}
            </button>
          ))}
        </fieldset>
        {ownColors ? (
          <ColorFields
            accent={accent}
            idPrefix="brand-picker"
            onChange={onColors}
            primary={primary}
          />
        ) : (
          <button
            className="text-action"
            onClick={() => setOwnColors(true)}
            type="button"
          >
            Elegir otros colores
          </button>
        )}
      </div>
    </>
  );
}
