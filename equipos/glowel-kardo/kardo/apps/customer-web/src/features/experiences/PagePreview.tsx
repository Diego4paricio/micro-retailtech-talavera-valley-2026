import type {
  Asset,
  DesignableExperienceType,
  ExperienceContent,
  ExperienceType,
} from "@kardo/contracts";
import { useMemo, useRef } from "react";
import { useElementWidth } from "../../lib/use-element-width.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { prepareSource, renderSourceDocument } from "../studio/html/engine.js";
import {
  contentDesign,
  contentTitle,
  isDesignableType,
  toDesignableContent,
} from "../studio/model/content.js";
import { designFromContent } from "../studio/model/from-content.js";
import { DesignedPreview } from "../studio/preview/DesignedPreview.js";
import { useDesignImages } from "../studio/preview/images.js";
import { SwapFrame } from "../studio/preview/SwapFrame.js";
import { ExperiencePreview } from "./ExperiencePreview.js";
import { activeCustomHtml, pagePreviewKind } from "./page-preview-model.js";

/**
 * The one phone preview of a page (domain audit A2-26): modo HTML when it is
 * active, then the Estudio design, then the design built from the content,
 * and the theme preview for a Redirección. Diseño and Historial both use
 * it, so a version looks the same in both and like customers will see it.
 */
export function PagePreview({
  type,
  content,
}: {
  type: ExperienceType;
  content: ExperienceContent;
  /** No longer needed (every type renders like the public page); kept
   * optional so older callers compile. */
  assets?: readonly Asset[] | undefined;
}) {
  const kind = pagePreviewKind(type, content);
  if (kind === "html" && isDesignableType(type))
    return <HtmlPreview content={content} type={type} />;
  if (isDesignableType(type) && kind !== "theme")
    return (
      <DesignedPreview
        content={content}
        design={contentDesign(content) ?? designFromContent(type, content)}
        type={type}
      />
    );
  return <ExperiencePreview content={content} type={type} />;
}

function HtmlPreview({
  type,
  content,
}: {
  type: DesignableExperienceType;
  content: ExperienceContent;
}) {
  const { workspace } = useWorkspace();
  const source = activeCustomHtml(type, content);
  const prepared = useMemo(
    () => prepareSource({ html: source?.html ?? "", css: source?.css ?? "" }),
    [source?.html, source?.css],
  );
  const images = useDesignImages(workspace.id, prepared.imageRefs);
  const title = contentTitle(type, content);
  const document = useMemo(
    () =>
      renderSourceDocument(
        toDesignableContent(type, content),
        prepared,
        images.resolve,
        title,
      ).replace("</head>", "<style>html{scrollbar-width:none}</style></head>"),
    [type, content, prepared, images.resolve, title],
  );
  const screenRef = useRef<HTMLDivElement>(null);
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
            srcDoc={document}
            style={{ transform: `scale(${scale})` }}
            title={`Vista previa de ${title}`}
          />
        </div>
      </div>
      <p className="es-designed-note">Vista previa de tu página en HTML.</p>
    </div>
  );
}
