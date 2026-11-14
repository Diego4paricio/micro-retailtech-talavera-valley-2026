import {
  type DesignableExperienceType,
  designImageRefs,
  type ExperienceContent,
  type PageDesign,
} from "@kardo/contracts";
import { useMemo } from "react";
import { cachedAssetImage } from "../../../lib/asset-images.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { contentTitle, toDesignableContent } from "../model/content.js";
import { contentImageRefs, useDesignImages } from "./images.js";
import { renderPreviewDocument } from "./renderer.js";
import { SwapFrame } from "./SwapFrame.js";

const width = 390;
const height = 640;

/**
 * A small, static, real render of a design with this page's content (the
 * template cards and the start screen). Sandboxed like the stage (no
 * scripts), without listeners: it is only a picture.
 */
export function DesignThumbnail({
  type,
  content,
  design,
  scale = 0.36,
  label,
  placeholders = true,
}: {
  type: DesignableExperienceType;
  content: ExperienceContent;
  design: PageDesign;
  scale?: number | undefined;
  label: string;
  /** `false`: as customers see it, without "espacio para foto". */
  placeholders?: boolean | undefined;
}) {
  const { workspace } = useWorkspace();
  const designable = useMemo(
    () => toDesignableContent(type, content),
    [type, content],
  );
  // Loads the library images the design and the content show (the brand's
  // cover and logo, 2026-10-02, are the first free images a template has):
  // each one that arrives re-renders the thumbnail.
  const refs = useMemo(
    () => [...designImageRefs(design), ...contentImageRefs(designable)],
    [design, designable],
  );
  const { revision } = useDesignImages(workspace.id, refs);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` changes when a library image arrives
  const html = useMemo(
    () =>
      renderPreviewDocument(
        designable,
        design,
        (ref) =>
          ref
            ? (cachedAssetImage(ref, "full") ?? cachedAssetImage(ref, "thumb"))
            : null,
        contentTitle(type, content),
        { imagePlaceholders: placeholders },
      ).replace("</head>", "<style>html{overflow:hidden}</style></head>"),
    [designable, type, content, design, revision, placeholders],
  );
  return (
    <span
      aria-hidden="true"
      className="es-thumb"
      style={{ width: width * scale, height: height * scale }}
    >
      <SwapFrame
        loading="lazy"
        // Same origin only to read library images (blob:) and fonts.
        sandbox="allow-same-origin"
        srcDoc={html}
        style={{ width, height, transform: `scale(${scale})` }}
        title={label}
      />
    </span>
  );
}
