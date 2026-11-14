import {
  type DesignBlock,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import { normalizeSchema } from "./operations.js";

/**
 * The exact design sent to the API: trimmed labels, normalized URLs, no
 * empty optional values (the contract forbids them) and the schema its
 * sections need. Run right before validating and saving, never while typing.
 */
export function prepareDesign(design: PageDesign): PageDesign {
  const url = (value: string) => {
    const trimmed = value.trim();
    return normalizePublicHttpsUrl(trimmed) ?? trimmed;
  };
  const block = (item: DesignBlock): DesignBlock => {
    switch (item.kind) {
      case "heading":
        return { ...item, text: item.text.trim() };
      case "button":
      case "brandButton":
        return { ...item, label: item.label.trim(), href: url(item.href) };
      case "image": {
        const { href, ...rest } = item;
        const alt = item.alt.trim();
        return href?.trim()
          ? { ...rest, alt, href: url(href) }
          : { ...rest, alt };
      }
      case "text": {
        const runs = item.runs
          .filter((run) => run.text.length > 0)
          .map((run) => {
            const { href, ...rest } = run;
            return href?.trim() ? { ...rest, href: url(href) } : rest;
          });
        return { ...item, runs: runs.length ? runs : item.runs };
      }
      case "features":
        return {
          ...item,
          items: item.items.map((entry) => {
            const text = entry.text?.trim();
            const { text: _old, ...rest } = entry;
            return {
              ...rest,
              title: entry.title.trim(),
              ...(text ? { text } : {}),
            };
          }),
        };
      case "gallery":
        return {
          ...item,
          images: item.images.map((image) => ({
            ...image,
            alt: image.alt.trim(),
          })),
        };
      case "featuredItems": {
        const label = item.label?.trim();
        const { label: _old, ...rest } = item;
        return label ? { ...rest, label } : rest;
      }
      default:
        return item;
    }
  };
  return normalizeSchema({
    ...design,
    sections: design.sections.map((section) =>
      isCanvasSection(section)
        ? {
            ...section,
            items: section.items.map((item) => ({
              ...item,
              block: block(item.block),
            })),
          }
        : {
            ...section,
            columns: section.columns.map((column) => column.map(block)),
          },
    ),
  });
}
