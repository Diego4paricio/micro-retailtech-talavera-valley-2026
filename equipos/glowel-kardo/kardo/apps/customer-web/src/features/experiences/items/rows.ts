import {
  type ExperienceContent,
  MENU_ITEM_CHOICES_MAX,
} from "@kardo/contracts";
import { limits, newItemId } from "../content.js";
import { isSampleItem, isSampleSection } from "../sample-content.js";
import {
  emptyRow,
  type FirstPageType,
  filledRows,
  formatPrice,
  type ItemChoice,
  type ItemRow,
  parsePrice,
  type SectionRows,
} from "./pasted-list.js";

/**
 * A Menú's dishes or a Catálogo's products as rows of name and price, and
 * back to the page's content (domain audit A2-28: this lived in Primeros
 * pasos, and «Editar productos» depended on it). The placeholders a new page
 * is seeded with are recognized by `sample-content.ts`, the one place that
 * defines them.
 */

/** The items the owner really wrote (the seed «Platillo 1» does not count). */
export function realItems(
  type: FirstPageType,
  content: ExperienceContent,
): { name: string; price?: number | undefined }[] {
  const value = content as {
    sections?: { items: { name: string; price?: number }[] }[];
    items?: { name: string; price?: number }[];
  };
  const items =
    type === "menu"
      ? (value.sections ?? []).flatMap((section) => section.items)
      : (value.items ?? []);
  return items.filter((item) => {
    const name = item.name.trim();
    return name && !isSampleItem(name);
  });
}

/** Rows to edit from the current content, placeholders left out, with one
 * empty row to type in. */
export function rowsFromContent(
  type: FirstPageType,
  content: ExperienceContent | null,
  defaultSection: string,
): SectionRows[] {
  const toRow = (item: {
    id: string;
    name: string;
    price?: number;
    imageAssetId?: string;
    choices?: ItemChoice[];
    choicesLabel?: string;
  }): ItemRow => ({
    id: item.id,
    name: item.name,
    price: item.price === undefined ? "" : formatPrice(item.price),
    ...(item.imageAssetId ? { imageAssetId: item.imageAssetId } : {}),
    ...(item.choices?.length ? { choices: item.choices } : {}),
    ...(item.choicesLabel ? { choicesLabel: item.choicesLabel } : {}),
  });
  const keep = (item: { name: string }) =>
    item.name.trim() && !isSampleItem(item.name);
  type ContentItem = {
    id: string;
    name: string;
    price?: number;
    imageAssetId?: string;
    choices?: ItemChoice[];
    choicesLabel?: string;
  };
  const value = (content ?? {}) as {
    sections?: { id: string; name: string; items: ContentItem[] }[];
    items?: ContentItem[];
  };
  if (type === "menu") {
    const sections = (value.sections ?? [])
      .map((section) => ({
        id: section.id,
        name: isSampleSection(section.name) ? "" : section.name,
        rows: section.items.filter(keep).map(toRow),
      }))
      .filter((section) => section.rows.length > 0);
    if (!sections.length)
      return [{ id: newItemId(), name: defaultSection, rows: [emptyRow()] }];
    return sections.map((section) => ({
      ...section,
      rows: [...section.rows, emptyRow()],
    }));
  }
  const rows = (value.items ?? []).filter(keep).map(toRow);
  return [{ id: "items", name: "", rows: [...rows, emptyRow()] }];
}

/**
 * The content to save from the rows: a Menú keeps each section (named, or
 * the default name) and a Catálogo one list. Items that already existed
 * keep their description and photo.
 */
export function contentFromRows(input: {
  type: FirstPageType;
  base: ExperienceContent | null;
  sections: readonly SectionRows[];
  title: string;
  defaultSection: string;
}): ExperienceContent {
  const value = (input.base ?? {}) as Record<string, unknown>;
  const existing = new Map<string, Record<string, unknown>>();
  const sections =
    (value.sections as { items: { id: string }[] }[] | undefined) ?? [];
  for (const section of sections)
    for (const item of section.items) existing.set(item.id, item);
  for (const item of (value.items as { id: string }[] | undefined) ?? [])
    existing.set(item.id, item);
  const toItem = (row: ItemRow) => {
    const price = parsePrice(row.price);
    const {
      price: _old,
      imageAssetId: _oldImage,
      choices: _oldChoices,
      choicesLabel: _oldChoicesLabel,
      ...rest
    } = existing.get(row.id) ?? {};
    const choices = row.choices?.slice(0, MENU_ITEM_CHOICES_MAX);
    return {
      ...rest,
      id: row.id,
      name: row.name.trim().slice(0, limits.title),
      ...(price === undefined ? {} : { price }),
      ...(row.imageAssetId ? { imageAssetId: row.imageAssetId } : {}),
      // Guisados are a Menú dish only (MenuItemSchema); never on a Catálogo.
      ...(input.type === "menu" && choices?.length ? { choices } : {}),
      ...(input.type === "menu" && choices?.length && row.choicesLabel?.trim()
        ? { choicesLabel: row.choicesLabel.trim().slice(0, 40) }
        : {}),
    };
  };
  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title
      : input.title;
  const currency = typeof value.currency === "string" ? value.currency : "MXN";
  if (input.type === "menu") {
    const built = input.sections
      .map((section) => ({
        id: section.id,
        name:
          section.name.trim().slice(0, limits.title) || input.defaultSection,
        items: filledRows(section.rows)
          .slice(0, limits.menuItemsPerSection)
          .map(toItem),
      }))
      .filter((section) => section.items.length > 0)
      .slice(0, limits.menuSections);
    return { ...value, title, currency, sections: built } as ExperienceContent;
  }
  const items = input.sections
    .flatMap((section) => filledRows(section.rows))
    .slice(0, limits.catalogItems)
    .map(toItem);
  return { ...value, title, currency, items } as ExperienceContent;
}
