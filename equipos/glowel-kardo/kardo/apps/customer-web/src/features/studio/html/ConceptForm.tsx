import {
  type Asset,
  type ConceptBrief,
  CUSTOM_HTML_LIMITS,
  customHtmlFontFamilies,
  type DesignFont,
} from "@kardo/contracts";
import { type Ref, useEffect, useId, useRef, useState } from "react";
import { Dialog } from "../../../components/Dialog.js";
import { Icon } from "../../../components/Icon.js";
import { toneWordsOf } from "../ai/ai-brief.js";
import { loadPanelFont } from "../preview/fonts.js";
import { AssetThumb, ImageLibrary } from "./ImageLibrary.js";
import { customHtmlFonts } from "./model.js";
import { objectiveActive, objectives, toggleObjective } from "./objectives.js";
// The form also lives in the blocks AI rail, where modo HTML (which used to
// bring these styles) may never have loaded.
import "./html-mode.css";

export type BriefChange = (
  recipe: (brief: ConceptBrief) => ConceptBrief,
  key?: string,
) => void;

const toneIdeas = [
  "elegante",
  "cálido",
  "moderno",
  "minimalista",
  "divertido",
  "artesanal",
];

/**
 * Paso 1, "¿Qué quieres?": the concept description (what the customer's own
 * AI and Kardo's both design from), quick objective chips that write part of
 * it, and the optional tone. Saved with the page (`customHtml.brief`).
 */
export function ConceptForm({
  brief,
  onChange,
  disabled,
  descriptionRef,
}: {
  brief: ConceptBrief;
  onChange: BriefChange;
  disabled: boolean;
  descriptionRef?: Ref<HTMLTextAreaElement | null> | undefined;
}) {
  const id = useId();
  const tone = brief.tone ?? "";

  function addTone(word: string) {
    onChange((current) => {
      const words = toneWordsOf(current.tone);
      if (words.includes(word)) return current;
      return { ...current, tone: [...words, word].join(", ").slice(0, 200) };
    });
  }

  return (
    <div className="esh-concept">
      <div className="field">
        <div className="field-label-row">
          <label htmlFor={`${id}-description`}>¿Cómo quieres tu página?</label>
          <span
            className={
              brief.description.length > CUSTOM_HTML_LIMITS.briefDescription
                ? "field-counter field-counter-over"
                : "field-counter"
            }
          >
            {brief.description.length}/{CUSTOM_HTML_LIMITS.briefDescription}
          </span>
        </div>
        <textarea
          className="esh-description"
          disabled={disabled}
          id={`${id}-description`}
          maxLength={CUSTOM_HTML_LIMITS.briefDescription}
          onChange={(event) => {
            const value = event.target.value;
            onChange(
              (current) => ({ ...current, description: value }),
              "brief:description",
            );
          }}
          placeholder="Ej.: Una página cálida con una foto grande del café arriba, el menú del día destacado y botones grandes para reservar y pedir. Fondo crema con detalles en verde oliva."
          ref={descriptionRef}
          rows={6}
          value={brief.description}
        />
        <p className="field-hint">
          Cuenta qué debe transmitir, qué va primero y qué quieres destacar.
        </p>
      </div>

      <div className="esh-objectives">
        <p className="esh-objectives-label">
          ¿Para qué la quieres?{" "}
          <span className="optional-label">(opcional)</span>
        </p>
        <div className="esh-objective-chips">
          {objectives.map((objective) => {
            const active = objectiveActive(brief, objective);
            return (
              <button
                aria-pressed={active}
                className="esh-objective-chip"
                data-checked={active || undefined}
                disabled={disabled}
                key={objective.id}
                onClick={() =>
                  onChange(
                    (current) => toggleObjective(current, objective),
                    "brief:objective",
                  )
                }
                type="button"
              >
                <Icon name={objective.icon} size={14} />
                {objective.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-tone`}>
          Tono y estilo <span className="optional-label">(opcional)</span>
        </label>
        <input
          disabled={disabled}
          id={`${id}-tone`}
          maxLength={200}
          onChange={(event) => {
            const value = event.target.value;
            onChange((current) => {
              const { tone: _tone, ...rest } = current;
              return value ? { ...rest, tone: value } : rest;
            }, "brief:tone");
          }}
          placeholder="elegante, cálido"
          value={tone}
        />
        <div className="esh-tone-ideas">
          {toneIdeas.map((word) => (
            <button
              className="qrs-chip"
              disabled={disabled}
              key={word}
              onClick={() => addTone(word)}
              type="button"
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Paso 2, "Tu marca" (opcional): brand colors (prefilled from the
 * organization the first time this step shows with none chosen), brand
 * images from the library and up to two typefaces. Also saved with the page
 * (`customHtml.brief`).
 */
export function BrandForm({
  brief,
  onChange,
  disabled,
  workspaceId,
  assets,
  onAssetUploaded,
  canUpload,
  brandColors,
}: {
  brief: ConceptBrief;
  onChange: BriefChange;
  disabled: boolean;
  workspaceId: string;
  assets: readonly Asset[];
  onAssetUploaded: (asset: Asset) => void;
  canUpload: boolean;
  /** The organization's brand colors, offered first and used to prefill. */
  brandColors: readonly string[];
}) {
  const [picking, setPicking] = useState(false);

  const prefilled = useRef(false);
  // Prefills the organization's own colors once, the first time Tu marca
  // shows with none chosen yet; stays editable and removable after that.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per mount
  useEffect(() => {
    if (prefilled.current || disabled || !brandColors.length) return;
    prefilled.current = true;
    onChange((current) =>
      current.colors.length
        ? current
        : {
            ...current,
            colors: brandColors
              .slice(0, CUSTOM_HTML_LIMITS.briefColors)
              .map((color) => color.toLowerCase()),
          },
    );
  }, []);

  function addColor() {
    onChange((current) => {
      if (current.colors.length >= CUSTOM_HTML_LIMITS.briefColors)
        return current;
      const next =
        brandColors.find(
          (color) => !current.colors.includes(color.toLowerCase()),
        ) ?? "#16232e";
      return { ...current, colors: [...current.colors, next.toLowerCase()] };
    });
  }

  return (
    <div className="esh-brand">
      <fieldset className="esh-fieldset">
        <legend>
          Colores de tu marca{" "}
          <span className="field-counter">
            {brief.colors.length}/{CUSTOM_HTML_LIMITS.briefColors}
          </span>
        </legend>
        <div className="esh-colors">
          {brief.colors.map((color, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: colors are positional and may repeat
            <div className="esh-color" key={`${index}-${color}`}>
              <span className="esh-color-well" style={{ background: color }}>
                <input
                  aria-label={`Color ${index + 1}: cambiar`}
                  disabled={disabled}
                  onChange={(event) => {
                    const value = event.target.value.toLowerCase();
                    onChange(
                      (current) => ({
                        ...current,
                        colors: current.colors.map((item, at) =>
                          at === index ? value : item,
                        ),
                      }),
                      `brief:color:${index}`,
                    );
                  }}
                  type="color"
                  value={color}
                />
              </span>
              <span className="esh-color-hex">{color}</span>
              {!disabled ? (
                <button
                  aria-label={`Quitar el color ${color}`}
                  className="esh-chip-remove"
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      colors: current.colors.filter((_, at) => at !== index),
                    }))
                  }
                  type="button"
                >
                  <Icon name="close" size={12} />
                </button>
              ) : null}
            </div>
          ))}
          {!disabled && brief.colors.length < CUSTOM_HTML_LIMITS.briefColors ? (
            <button className="esh-add" onClick={addColor} type="button">
              <Icon name="plus" size={14} /> Color
            </button>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="esh-fieldset">
        <legend>
          Imágenes de tu marca{" "}
          <span className="field-counter">
            {brief.imageRefs.length}/{CUSTOM_HTML_LIMITS.briefImages}
          </span>
        </legend>
        <div className="esh-brand-images">
          {brief.imageRefs.map((ref) => {
            const asset = assets.find((item) => item.id === ref);
            return (
              <div
                className="esh-brand-image"
                key={ref}
                title={asset?.filename ?? "Imagen"}
              >
                <AssetThumb assetId={ref} workspaceId={workspaceId} />
                {!disabled ? (
                  <button
                    aria-label={`Quitar ${asset?.filename ?? "la imagen"}`}
                    className="esh-chip-remove"
                    onClick={() =>
                      onChange((current) => ({
                        ...current,
                        imageRefs: current.imageRefs.filter(
                          (item) => item !== ref,
                        ),
                      }))
                    }
                    type="button"
                  >
                    <Icon name="close" size={12} />
                  </button>
                ) : null}
              </div>
            );
          })}
          {!disabled ? (
            <button
              className="esh-add esh-add-image"
              onClick={() => setPicking(true)}
              type="button"
            >
              <Icon name="image-plus" size={16} />
              {brief.imageRefs.length ? "Cambiar" : "Elegir"}
            </button>
          ) : null}
        </div>
        <p className="field-hint">
          Tu logo, fotos del lugar o de tus productos.
        </p>
      </fieldset>

      <fieldset className="esh-fieldset">
        <legend>
          Tipografías <span className="optional-label">(hasta 2)</span>
        </legend>
        <div className="esh-fonts">
          {customHtmlFonts.map((font) => (
            <FontChip
              checked={brief.fonts.includes(font)}
              disabled={
                disabled ||
                (!brief.fonts.includes(font) && brief.fonts.length >= 2)
              }
              font={font}
              key={font}
              onToggle={() =>
                onChange((current) => ({
                  ...current,
                  fonts: current.fonts.includes(font)
                    ? current.fonts.filter((item) => item !== font)
                    : [...current.fonts, font].slice(0, 2),
                }))
              }
            />
          ))}
        </div>
      </fieldset>

      <Dialog
        description="Elige hasta 8: tu logo, fotos del lugar o de tus productos. Adjunta las mismas cuando uses tu propia IA."
        footer={
          <button
            className="button button-primary"
            onClick={() => setPicking(false)}
            type="button"
          >
            Listo
          </button>
        }
        onClose={() => setPicking(false)}
        open={picking}
        size="large"
        title="Imágenes de tu marca"
      >
        <ImageLibrary
          assets={assets}
          canUpload={canUpload}
          max={CUSTOM_HTML_LIMITS.briefImages}
          onToggle={(assetId) =>
            onChange((current) => ({
              ...current,
              imageRefs: current.imageRefs.includes(assetId)
                ? current.imageRefs.filter((item) => item !== assetId)
                : [...current.imageRefs, assetId].slice(
                    0,
                    CUSTOM_HTML_LIMITS.briefImages,
                  ),
            }))
          }
          onUploaded={(asset) => {
            onAssetUploaded(asset);
            onChange((current) =>
              current.imageRefs.length < CUSTOM_HTML_LIMITS.briefImages
                ? { ...current, imageRefs: [...current.imageRefs, asset.id] }
                : current,
            );
          }}
          selected={brief.imageRefs}
          workspaceId={workspaceId}
        />
      </Dialog>
    </div>
  );
}

function FontChip({
  font,
  checked,
  disabled,
  onToggle,
}: {
  font: DesignFont;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadPanelFont(font).then((loaded) => {
      if (!cancelled) setFamily(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [font]);
  return (
    <button
      aria-pressed={checked}
      className="esh-font"
      data-checked={checked || undefined}
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <span
        className="esh-font-sample"
        style={family ? { fontFamily: `"${family}"` } : undefined}
      >
        Aa
      </span>
      <span className="esh-font-name">{customHtmlFontFamilies[font]}</span>
    </button>
  );
}
