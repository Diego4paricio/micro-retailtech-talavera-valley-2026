import type { DesignableContent } from "@kardo/page-render";
import { useCallback, useEffect, useState } from "react";
import { cachedAssetImage, loadAssetImage } from "../../../lib/asset-images.js";

/**
 * Library images of a design (blocks, backgrounds, the avatar) as local
 * `blob:` URLs for the preview. The renderer reads them synchronously
 * through `resolve`; `revision` changes whenever one arrives, so the
 * preview renders again with it. Demo mode never reads the library: the
 * renderer keeps its placeholders.
 */
export function useDesignImages(
  workspaceId: string,
  refs: readonly string[],
): { resolve: (ref: string) => string | null; revision: number } {
  const [revision, setRevision] = useState(0);
  const key = [...new Set(refs.filter(Boolean))].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    for (const ref of key.split(",").filter(Boolean)) {
      if (cachedAssetImage(ref, "full")) continue;
      loadAssetImage(workspaceId, ref, "full")
        .then(() => {
          if (!cancelled) setRevision((value) => value + 1);
        })
        .catch(() => {
          // The renderer keeps a neutral placeholder for this image.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [workspaceId, key]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new function per arrived image re-renders the preview
  const resolve = useCallback(
    (ref: string) => (ref ? cachedAssetImage(ref, "full") : null),
    [revision],
  );
  return { resolve, revision };
}

/** Library images a page's content shows (avatar, dish and product photos,
 * the PDF's pages, the main image), as the renderer references them. */
export function contentImageRefs(content: DesignableContent): string[] {
  switch (content.type) {
    case "profile":
    case "linkpage":
      return content.avatarRef ? [content.avatarRef] : [];
    case "menu":
      return content.sections.flatMap((section) =>
        section.items.flatMap((item) => (item.imageRef ? [item.imageRef] : [])),
      );
    case "catalog":
      return content.items.flatMap((item) =>
        item.imageRef ? [item.imageRef] : [],
      );
    case "document":
      return content.pages.map((page) => page.ref);
    case "image":
      return content.imageRef ? [content.imageRef] : [];
    default:
      return [];
  }
}
