import type {
  Asset,
  DesignBlock,
  ExperienceContent,
  PageDesign,
} from "@kardo/contracts";
import { useCallback, useEffect, useRef } from "react";
import { useToast } from "../../../components/Toast.js";
import { isOpenImageBackground } from "../ai/apply-design.js";
import { useImageUpload } from "../html/ImageLibrary.js";
import { updateBlock } from "../model/operations.js";
import { useStudio } from "../StudioContext.js";

/**
 * Espacios para foto (2026-10-03, owner's request): when a design needs a
 * photo the business does not have yet, Kardo's AI leaves a space with the
 * photo's final size and a line saying which photo goes there. In the
 * Estudio the owner taps the space and uploads the photo, right there:
 * - an `image` block without `imageRef` (`data-placeholder` on the block);
 * - a photo of a `gallery` without `imageRef` (`data-gallery-slot`);
 * - a dish or product without photo in a Menú or Catálogo block
 *   (`data-item-photo`), which updates the content itself;
 * - the page's or a section's own background, when it is `kind: "image"`
 *   without `imageRef` (relevo 37, B3: it already drew a "Foto de fondo"
 *   corner label — `@kardo/page-render`'s `isBackgroundPlaceholder` — but
 *   tapping it did nothing). The published page never shows an empty space.
 */
export type PhotoSpace =
  | { kind: "block"; blockId: string }
  | { kind: "gallery"; blockId: string; index: number }
  | { kind: "item"; itemId: string }
  | { kind: "page-background" }
  | { kind: "section-background"; sectionId: string };

/** The photo space under a click in the preview, if any. Needs the current
 * `design` to tell a section or the page's own background apart from an
 * ordinary one (nothing in the rendered page marks that by itself). */
export function photoSpaceOf(
  node: Element,
  design: PageDesign,
): PhotoSpace | null {
  const item = node.closest("[data-item-photo]");
  const itemId = item?.getAttribute("data-item-photo");
  if (itemId) return { kind: "item", itemId };
  const block = node.closest("[data-block-id]");
  const blockId = block?.getAttribute("data-block-id");
  if (blockId) {
    const slot = node.closest("[data-gallery-slot]");
    const index = Number(slot?.getAttribute("data-gallery-slot"));
    if (slot && Number.isInteger(index) && index >= 0)
      return { kind: "gallery", blockId, index };
    if (node.closest("[data-placeholder]")) return { kind: "block", blockId };
    return null;
  }
  const section = node.closest("[data-section-id]");
  const sectionId = section?.getAttribute("data-section-id");
  const found = sectionId
    ? design.sections.find((item) => item.id === sectionId)
    : undefined;
  if (sectionId && isOpenImageBackground(found?.background))
    return { kind: "section-background", sectionId };
  if (
    node.closest(".kd-page") &&
    isOpenImageBackground(design.style.background)
  )
    return { kind: "page-background" };
  return null;
}

/** The design with the uploaded photo in its space. */
export function fillBlockSpace(
  design: PageDesign,
  space: Extract<PhotoSpace, { kind: "block" | "gallery" }>,
  assetId: string,
): PageDesign {
  return updateBlock(design, space.blockId, (block): DesignBlock => {
    if (space.kind === "block" && block.kind === "image")
      return { ...block, imageRef: assetId };
    if (space.kind === "gallery" && block.kind === "gallery")
      return {
        ...block,
        images: block.images.map((image, index) =>
          index === space.index ? { ...image, imageRef: assetId } : image,
        ),
      };
    return block;
  });
}

/** The design with the uploaded photo as the page's own background. */
export function fillPageBackgroundSpace(
  design: PageDesign,
  assetId: string,
): PageDesign {
  const background = design.style.background;
  if (!isOpenImageBackground(background)) return design;
  return {
    ...design,
    style: {
      ...design.style,
      background: { ...background, imageRef: assetId },
    },
  };
}

/** The design with the uploaded photo as one section's own background. */
export function fillSectionBackgroundSpace(
  design: PageDesign,
  sectionId: string,
  assetId: string,
): PageDesign {
  return {
    ...design,
    sections: design.sections.map((section) => {
      if (
        section.id !== sectionId ||
        !isOpenImageBackground(section.background)
      )
        return section;
      return {
        ...section,
        background: { ...section.background, imageRef: assetId },
      };
    }),
  };
}

/** The Menú or Catálogo with the uploaded photo on that dish or product. */
export function fillItemSpace(
  content: ExperienceContent,
  itemId: string,
  assetId: string,
): ExperienceContent {
  const fill = <T extends { id: string; imageAssetId?: string | undefined }>(
    item: T,
  ): T => (item.id === itemId ? { ...item, imageAssetId: assetId } : item);
  const value = content as {
    sections?: { items: { id: string }[] }[];
    items?: { id: string }[];
  };
  if (Array.isArray(value.sections))
    return {
      ...content,
      sections: value.sections.map((section) => ({
        ...section,
        items: section.items.map(fill),
      })),
    } as ExperienceContent;
  if (Array.isArray(value.items))
    return { ...content, items: value.items.map(fill) } as ExperienceContent;
  return content;
}

/**
 * One hidden file input for the whole stage: `open(space)` asks for a photo
 * (the click on the space is the user gesture the browser requires) and
 * puts the uploaded library image in that space, as one undo step.
 */
export function usePhotoSpaces() {
  const { change, changeContent, addAsset, readOnly, canUploadAssets } =
    useStudio();
  const { notify } = useToast();
  const pending = useRef<PhotoSpace | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const { upload, isUploading, error } = useImageUpload((asset: Asset) => {
    const space = pending.current;
    pending.current = null;
    if (!space) return;
    addAsset(asset);
    if (space.kind === "item")
      changeContent((content) =>
        fillItemSpace(content, space.itemId, asset.id),
      );
    else if (space.kind === "page-background")
      change((design) => fillPageBackgroundSpace(design, asset.id));
    else if (space.kind === "section-background")
      change((design) =>
        fillSectionBackgroundSpace(design, space.sectionId, asset.id),
      );
    else change((design) => fillBlockSpace(design, space, asset.id));
    notify("Listo, tu foto ya está en su lugar.", "success");
  });

  useEffect(() => {
    if (error) notify(error, "error");
  }, [error, notify]);

  const canFill = !readOnly && canUploadAssets;

  const open = useCallback(
    (space: PhotoSpace) => {
      if (!canFill || !input.current) return;
      pending.current = space;
      input.current.value = "";
      input.current.click();
    },
    [canFill],
  );

  const onFile = useCallback(
    (file: File | undefined) => {
      if (!file) {
        pending.current = null;
        return;
      }
      notify("Subiendo tu foto…", "info");
      void upload(file);
    },
    [notify, upload],
  );

  return { open, input, onFile, isUploading, canFill };
}
