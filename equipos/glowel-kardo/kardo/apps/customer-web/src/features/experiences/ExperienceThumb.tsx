import type { ExperienceSummary } from "@kardo/contracts";
import { useMemo, useRef } from "react";
import { useElementWidth } from "../../lib/use-element-width.js";
import { PageTypeIcon } from "../onboarding/first-steps-icons.js";
import { contentDesign, isDesignableType } from "../studio/model/content.js";
import { designFromContent } from "../studio/model/from-content.js";
import { DesignThumbnail } from "../studio/preview/DesignThumbnail.js";
import "./experience-tiles.css";

/**
 * The top of an Experience's real page, as a picture (Links redesign,
 * relevo 34): its Estudio design, or the one its content already implies
 * (as «Diseño» shows it). The box sets the size; the page scales to its
 * width and is cut at its height.
 */
export function ExperienceThumb({
  experience,
  className,
}: {
  experience: Pick<ExperienceSummary, "name" | "type" | "content">;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const width = useElementWidth(ref, 0);
  const { type, content } = experience;
  const design = useMemo(
    () =>
      isDesignableType(type)
        ? (contentDesign(content) ?? designFromContent(type, content))
        : null,
    [type, content],
  );
  return (
    <span
      aria-hidden="true"
      className={`link-thumb${className ? ` ${className}` : ""}`}
      ref={ref}
    >
      {design && isDesignableType(type) ? (
        width > 0 ? (
          <DesignThumbnail
            content={content}
            design={design}
            label={experience.name}
            scale={width / 390}
            type={type}
          />
        ) : null
      ) : (
        <span className="link-thumb-icon">
          <PageTypeIcon type={type} />
        </span>
      )}
    </span>
  );
}
