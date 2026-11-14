import {
  type DesignBlock,
  designBlocks,
  isCanvasSection,
  type PageDesign,
  type PageSection,
} from "@kardo/contracts";

/**
 * The WhatsApp link Kardo's giro templates are written with. It never
 * reaches a page: `withBusinessWhatsApp` swaps it for the organization's
 * own number (Configuración → General), or leaves the button empty for the
 * owner to fill in when the business has no phone. In the 2026-10-03 study,
 * two of two owners who used a template published this number without
 * noticing.
 */
export const TEMPLATE_WHATSAPP = "https://wa.me/525555555555";

/** The templates' number, with or without the country code and the old
 * mobile "1". A number the AI makes up is caught on the API instead
 * (`design-repair.ts`), against the organization's own. */
const exampleWhatsAppPattern =
  /^https:\/\/wa\.me\/(?:52)?1?5555555555(?:[/?]|$)/;

export function isExampleWhatsApp(href: string): boolean {
  return exampleWhatsAppPattern.test(href.trim());
}

function isExampleWhatsAppButton(block: DesignBlock): boolean {
  return (
    (block.kind === "button" || block.kind === "brandButton") &&
    isExampleWhatsApp(block.href)
  );
}

/** A button that opens a WhatsApp chat, or one waiting for its number: a
 * WhatsApp brand button, a `wa.me` link, or an empty button whose text
 * says WhatsApp (a template's, when the business has no phone yet). */
export function isWhatsAppButton(
  block: DesignBlock,
): block is Extract<DesignBlock, { kind: "button" | "brandButton" }> {
  if (block.kind === "brandButton") return block.brand === "whatsapp";
  if (block.kind !== "button") return false;
  const href = block.href.trim();
  return (
    /^https:\/\/wa\.me\//i.test(href) ||
    (!href && /whatsapp/i.test(block.label))
  );
}

/** The organization's link, keeping the example's own `?text=` message. */
function businessHref(example: string, whatsappUrl: string): string {
  const query = example.indexOf("?");
  return query < 0 ? whatsappUrl : `${whatsappUrl}${example.slice(query)}`;
}

/**
 * The design with the business's own WhatsApp on every button that still
 * carries an example number (2026-10-03 study, finding 5). With no phone the
 * button stays, empty: the Estudio asks for the number and does not save or
 * publish until it has one (owner's decision, 2026-10-03). Never a fake
 * number on a published page.
 */
export function withBusinessWhatsApp(
  design: PageDesign,
  whatsappUrl: string | undefined,
): PageDesign {
  if (!designBlocks(design).some(isExampleWhatsAppButton)) return design;
  const fill = (block: DesignBlock): DesignBlock =>
    (block.kind === "button" || block.kind === "brandButton") &&
    isExampleWhatsApp(block.href)
      ? {
          ...block,
          href: whatsappUrl ? businessHref(block.href, whatsappUrl) : "",
        }
      : block;
  return {
    ...design,
    sections: design.sections.map(
      (section): PageSection =>
        isCanvasSection(section)
          ? {
              ...section,
              items: section.items.map((item) => ({
                ...item,
                block: fill(item.block),
              })),
            }
          : {
              ...section,
              columns: section.columns.map((column) => column.map(fill)),
            },
    ),
  };
}

/** What `withBusinessWhatsApp` will do to a template, for the message the
 * Estudio shows when it is applied. */
export function templateWhatsAppOutcome(
  design: PageDesign,
  whatsappUrl: string | undefined,
): "filled" | "empty" | "none" {
  if (!designBlocks(design).some(isExampleWhatsAppButton)) return "none";
  return whatsappUrl ? "filled" : "empty";
}

/** `33 1234 5678` for a Mexican `https://wa.me/52…` link, else its digits. */
export function whatsappNumberLabel(whatsappUrl: string): string {
  const digits = /wa\.me\/(\d+)/.exec(whatsappUrl)?.[1] ?? "";
  const national =
    digits.length === 12 && digits.startsWith("52") ? digits.slice(2) : "";
  return national
    ? `${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`
    : digits;
}

const hoursHeading = /^horarios?$/i;

/** A flow column's «Horario» label and the example sentence under it,
 * with the business's own hours, or both gone when it has none. */
function hoursColumn(
  column: DesignBlock[],
  hours: string | undefined,
): DesignBlock[] {
  const at = column.findIndex(
    (block, index) =>
      block.kind === "heading" &&
      hoursHeading.test(block.text.trim()) &&
      column[index + 1]?.kind === "text",
  );
  if (at < 0) return column;
  const sentence = column[at + 1];
  if (sentence?.kind !== "text") return column;
  if (!hours) return [...column.slice(0, at), ...column.slice(at + 2)];
  return [
    ...column.slice(0, at + 1),
    { ...sentence, runs: [{ text: hours }] },
    ...column.slice(at + 2),
  ];
}

/**
 * Kardo's templates write an example schedule under their «Horario» label
 * («Martes a domingo, de la comida a la cena»). The business's own hours
 * (Configuración → General) replace it; with none, the label and the
 * sentence come out, so no page promises hours the business never gave
 * (2026-10-03 study, finding 13).
 */
export function withBusinessHours(
  design: PageDesign,
  hours: string | undefined,
): PageDesign {
  const trimmed = hours?.trim() || undefined;
  const sections = design.sections.map((section) => {
    if (isCanvasSection(section)) return section;
    const columns = section.columns.map((column) =>
      hoursColumn(column, trimmed),
    );
    return columns.some((column, index) => column !== section.columns[index])
      ? { ...section, columns }
      : section;
  });
  return sections.some((section, index) => section !== design.sections[index])
    ? { ...design, sections }
    : design;
}

/** What Configuración → General says about the business, as the Estudio
 * puts it on a template: its WhatsApp and its hours. */
export type BusinessData = {
  whatsappUrl?: string | undefined;
  hours?: string | undefined;
};

/** `withBusinessWhatsApp` and `withBusinessHours` together. `null` (the
 * profile has not loaded, or could not be read) means neither is known. */
export function withBusinessData(
  design: PageDesign,
  business: BusinessData | null,
): PageDesign {
  return withBusinessHours(
    withBusinessWhatsApp(design, business?.whatsappUrl),
    business?.hours,
  );
}
