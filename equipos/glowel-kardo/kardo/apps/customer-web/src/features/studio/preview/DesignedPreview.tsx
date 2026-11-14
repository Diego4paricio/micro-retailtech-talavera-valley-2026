import type {
  DesignableExperienceType,
  ExperienceContent,
  PageDesign,
} from "@kardo/contracts";
import { designImageRefs } from "@kardo/contracts";
import { useMemo, useRef } from "react";
import { useElementWidth } from "../../../lib/use-element-width.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { contentTitle, toDesignableContent } from "../model/content.js";
import { contentImageRefs, useDesignImages } from "./images.js";
import { renderPreviewDocument } from "./renderer.js";
import { SwapFrame } from "./SwapFrame.js";

/**
 * The phone preview of a page that already has an Estudio design (Diseño of
 * an Experience, the Link page): the real renderer instead of the theme
 * preview, scrollable, and inert (links never navigate inside it).
 */
export function DesignedPreview({
  type,
  content,
  design,
  placeholders = true,
}: {
  type: DesignableExperienceType;
  content: ExperienceContent;
  design: PageDesign;
  /** `false`: as customers see it, without "espacio para foto". */
  placeholders?: boolean | undefined;
}) {
  const { workspace } = useWorkspace();
  // The design's images and the content's own (a PDF's pages, the dishes'
  // photos, the avatar), as the thumbnails already load them.
  const refs = useMemo(
    () => [
      ...designImageRefs(design),
      ...contentImageRefs(toDesignableContent(type, content)),
    ],
    [design, type, content],
  );
  const images = useDesignImages(workspace.id, refs);
  const html = useMemo(
    () =>
      renderPreviewDocument(
        toDesignableContent(type, content),
        design,
        images.resolve,
        contentTitle(type, content),
        { imagePlaceholders: placeholders },
      ).replace("</head>", "<style>html{scrollbar-width:none}</style></head>"),
    [type, content, design, images.resolve, placeholders],
  );
  const screenRef = useRef<HTMLDivElement>(null);
  // A 390 px wide phone page, scaled to the preview column.
  const scale = useElementWidth(screenRef, 280) / 390;
  return (
    <div className="es-designed-preview">
      <div className="es-designed-phone">
        <div className="es-designed-screen" ref={screenRef}>
          <SwapFrame
            onDocument={(doc) =>
              doc.addEventListener(
                "click",
                (event) => event.preventDefault(),
                true,
              )
            }
            sandbox="allow-same-origin"
            srcDoc={html}
            style={{ transform: `scale(${scale})` }}
            title={`Vista previa de ${contentTitle(type, content)}`}
          />
        </div>
      </div>
      <p className="es-designed-note">
        Vista previa real del diseño del Estudio.
      </p>
    </div>
  );
}
