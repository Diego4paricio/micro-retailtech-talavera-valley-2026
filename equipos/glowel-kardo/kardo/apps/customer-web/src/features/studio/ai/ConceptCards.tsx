import {
  type DesignConcept,
  type DesignFont,
  designDirections,
} from "@kardo/contracts";
import { type CSSProperties, useEffect, useState } from "react";
import { Icon } from "../../../components/Icon.js";
import { useAssetImage } from "../../../lib/asset-images.js";
import { prefersInkText } from "../../experiences/theme-style.js";
import { fontLabels, fontSampleStacks } from "../labels.js";
import { loadPanelFont } from "../preview/fonts.js";

/** The real webfonts of each idea, loaded into the panel for its sample. */
function usePanelFont(font: DesignFont): string {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadPanelFont(font).then((loaded) => {
      if (live) setFamily(loaded);
    });
    return () => {
      live = false;
    };
  }, [font]);
  return family
    ? `"${family}", ${fontSampleStacks[font]}`
    : fontSampleStacks[font];
}

const buttonRadius = { pill: "999px", rounded: "10px", square: "3px" };

/** A small drawing of the idea's first screen: its palette, its fonts and
 * its kind of cover (with the organization's own cover photo when there
 * is one). Not the final design: the AI builds that after the choice. */
function ConceptSample({
  concept,
  businessName,
  coverUrl,
}: {
  concept: DesignConcept;
  businessName: string;
  coverUrl: string | null;
}) {
  const heading = usePanelFont(concept.fonts.heading);
  const body = usePanelFont(concept.fonts.body);
  const { palette } = concept;
  const onPhoto = concept.cover === "photo";
  const style = {
    "--cs-bg": palette.background,
    "--cs-surface": palette.surface,
    "--cs-text": palette.text,
    "--cs-muted": palette.muted,
    "--cs-accent": palette.accent,
    "--cs-on-accent": prefersInkText(palette.accent) ? "#111111" : "#ffffff",
    "--cs-radius": `${Math.min(concept.radius, 18)}px`,
    "--cs-button-radius": buttonRadius[concept.buttonShape],
    "--cs-heading": heading,
    "--cs-body": body,
    ...(onPhoto && coverUrl ? { "--cs-photo": `url("${coverUrl}")` } : {}),
  } as CSSProperties;
  return (
    <div
      aria-hidden="true"
      className={`es-concept-sample es-concept-sample--${concept.cover}${coverUrl ? " has-photo" : ""}`}
      style={style}
    >
      {concept.cover === "split" ? (
        <span
          className="es-concept-sample-photo"
          style={
            coverUrl ? { backgroundImage: `url("${coverUrl}")` } : undefined
          }
        />
      ) : null}
      <span className="es-concept-sample-copy">
        {concept.cover === "type" ? (
          <span className="es-concept-sample-eyebrow">{concept.name}</span>
        ) : null}
        <span className="es-concept-sample-title">{businessName}</span>
        <span className="es-concept-sample-line">{concept.highlights[0]}</span>
        <span className="es-concept-sample-button">Pedir</span>
      </span>
      <span className="es-concept-sample-swatches">
        {(["background", "surface", "accent", "text"] as const).map((key) => (
          <span key={key} style={{ background: palette[key] }} />
        ))}
      </span>
    </div>
  );
}

/**
 * The AI's ideas as cards to choose from ("3 ideas, then 1 design",
 * 2026-10-03): each one shows a sample of its first screen, its name, what
 * it promises and its fonts. Choosing one and designing uses one of
 * today's designs; asking for other ideas does not.
 */
export function ConceptCards({
  concepts,
  businessName,
  workspaceId,
  coverAssetId,
  selected,
  onSelect,
}: {
  concepts: readonly DesignConcept[];
  businessName: string;
  workspaceId: string;
  coverAssetId: string | undefined;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const cover = useAssetImage(workspaceId, coverAssetId, "full");
  return (
    <fieldset className="es-concepts">
      <legend className="visually-hidden">Ideas de la IA de Kardo</legend>
      {concepts.map((concept, index) => {
        const active = index === selected;
        const direction = designDirections[concept.direction];
        return (
          <label
            className={`es-concept${active ? " is-active" : ""}`}
            key={`${concept.direction}-${concept.name}`}
          >
            <input
              checked={active}
              className="visually-hidden"
              name="es-design-idea"
              onChange={() => onSelect(index)}
              type="radio"
            />
            <ConceptSample
              businessName={businessName}
              concept={concept}
              coverUrl={cover.url}
            />
            <span className="es-concept-body">
              <span className="es-concept-head">
                <strong>{concept.name}</strong>
                <span className="es-concept-direction">{direction.name}</span>
              </span>
              <span className="es-concept-pitch">{concept.pitch}</span>
              <span className="es-concept-highlights">
                {concept.highlights.map((line) => (
                  <span key={line}>
                    <Icon name="check" size={13} /> {line}
                  </span>
                ))}
              </span>
              <span className="es-concept-fonts">
                {fontLabels[concept.fonts.heading]}
                {concept.fonts.body !== concept.fonts.heading
                  ? ` y ${fontLabels[concept.fonts.body]}`
                  : ""}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
