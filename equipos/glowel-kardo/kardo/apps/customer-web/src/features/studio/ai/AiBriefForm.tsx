import {
  type ConceptBrief,
  CUSTOM_HTML_LIMITS,
  type DesignableExperienceType,
  type DesignPhotoMode,
} from "@kardo/contracts";
import { type Ref, useId } from "react";
import { Icon } from "../../../components/Icon.js";
import { AiPhotosField } from "./AiPhotosField.js";
import {
  aiTypeCopy,
  photoModeOptions,
  shortcutActive,
  toggleShortcut,
  toneIdeas,
  toneWordsOf,
} from "./ai-brief.js";

type BriefChange = (recipe: (brief: ConceptBrief) => ConceptBrief) => void;

/**
 * Step 1 of "Diseñar con IA" (relevo 29, 2026-10-03): what the owner wants,
 * asked for the Experience being designed (a Menú, a Formulario…), with
 * examples to start from, quick additions, the photo choice and, folded
 * away, the tone.
 */
export function AiBriefForm({
  type,
  brief,
  photos,
  onBrief,
  onPhotos,
  disabled,
  descriptionRef,
}: {
  type: DesignableExperienceType;
  brief: ConceptBrief;
  photos: DesignPhotoMode;
  onBrief: BriefChange;
  onPhotos: (mode: DesignPhotoMode) => void;
  disabled: boolean;
  descriptionRef?: Ref<HTMLTextAreaElement | null> | undefined;
}) {
  const id = useId();
  const copy = aiTypeCopy[type];
  const max = CUSTOM_HTML_LIMITS.briefDescription;
  const length = brief.description.length;
  const tone = brief.tone ?? "";
  const toneWords = toneWordsOf(tone);

  function addExample(text: string) {
    onBrief((current) => {
      const base = current.description.trim();
      if (base.includes(text)) return current;
      return {
        ...current,
        description: (base ? `${base} ${text}` : text).slice(0, max),
      };
    });
  }

  function toggleTone(word: string) {
    onBrief((current) => {
      const words = toneWordsOf(current.tone);
      const next = words.includes(word)
        ? words.filter((item) => item !== word)
        : [...words, word];
      const { tone: _tone, ...rest } = current;
      return next.length ? { ...rest, tone: next.join(", ") } : rest;
    });
  }

  const selectedPhoto = photoModeOptions.find(
    (option) => option.mode === photos,
  );

  return (
    <div className="es-aif">
      <section className="es-aif-block">
        <div className="es-aif-label-row">
          <label className="es-aif-label" htmlFor={`${id}-description`}>
            {copy.question}
          </label>
          <span
            className={
              length > max * 0.9 ? "es-aif-count is-near" : "es-aif-count"
            }
          >
            {length}/{max}
          </span>
        </div>
        <textarea
          className="es-aif-textarea"
          disabled={disabled}
          id={`${id}-description`}
          maxLength={max}
          onChange={(event) => {
            const value = event.target.value;
            onBrief((current) => ({ ...current, description: value }));
          }}
          placeholder={copy.placeholder}
          ref={descriptionRef}
          rows={5}
          value={brief.description}
        />
        <div className="es-aif-examples">
          <span className="es-aif-examples-label">Para empezar:</span>
          {copy.examples.map((example) => (
            <button
              className="es-aif-example"
              disabled={disabled}
              key={example.label}
              onClick={() => addExample(example.text)}
              title={example.text}
              type="button"
            >
              {example.label}
            </button>
          ))}
        </div>
      </section>

      <section className="es-aif-block">
        <p className="es-aif-label">Agrega a tu pedido</p>
        <div className="es-aif-chips">
          {copy.shortcuts.map((shortcut) => {
            const active = shortcutActive(brief, shortcut);
            return (
              <button
                aria-pressed={active}
                className="es-aif-chip"
                disabled={disabled}
                key={shortcut.id}
                onClick={() =>
                  onBrief((current) => toggleShortcut(current, shortcut, max))
                }
                type="button"
              >
                <Icon name={active ? "check" : shortcut.icon} size={14} />
                {shortcut.label}
              </button>
            );
          })}
        </div>
      </section>

      {copy.photoChoice ? (
        <fieldset className="es-aif-block es-aif-fieldset">
          <legend className="es-aif-label">Fotos</legend>
          <div className="es-aif-segmented">
            {photoModeOptions.map((option) => (
              <label
                className="es-aif-segment"
                data-checked={photos === option.mode || undefined}
                key={option.mode}
              >
                <input
                  checked={photos === option.mode}
                  className="visually-hidden"
                  disabled={disabled}
                  name={`${id}-photos`}
                  onChange={() => onPhotos(option.mode)}
                  type="radio"
                />
                {option.label}
              </label>
            ))}
          </div>
          {selectedPhoto ? (
            <p className="es-aif-hint">{selectedPhoto.hint}</p>
          ) : null}
        </fieldset>
      ) : null}

      {photos !== "without" || !copy.photoChoice ? (
        <section className="es-aif-block">
          <AiPhotosField brief={brief} disabled={disabled} onChange={onBrief} />
        </section>
      ) : null}

      <details className="es-aif-more">
        <summary>
          Tono{" "}
          <span className="es-aif-more-value">
            {toneWords.length ? toneWords.join(", ") : "opcional"}
          </span>
        </summary>
        <div className="es-aif-chips">
          {toneIdeas.map((word) => {
            const active = toneWords.includes(word);
            return (
              <button
                aria-pressed={active}
                className="es-aif-chip"
                disabled={disabled}
                key={word}
                onClick={() => toggleTone(word)}
                type="button"
              >
                {active ? <Icon name="check" size={14} /> : null}
                {word}
              </button>
            );
          })}
        </div>
        <input
          aria-label="Otro tono"
          className="es-aif-input"
          disabled={disabled}
          maxLength={200}
          onChange={(event) => {
            const value = event.target.value;
            onBrief((current) => {
              const { tone: _tone, ...rest } = current;
              return value ? { ...rest, tone: value } : rest;
            });
          }}
          placeholder="O escribe otro: familiar, juvenil…"
          value={tone}
        />
      </details>
    </div>
  );
}
