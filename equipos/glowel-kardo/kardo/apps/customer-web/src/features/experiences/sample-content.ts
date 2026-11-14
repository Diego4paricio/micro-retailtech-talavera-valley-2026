import {
  type DesignBlock,
  type ExperienceContent,
  type ExperienceType,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";

/**
 * Example text a new Experience or a template starts with («Sección 1»,
 * «Platillo 1», «Producto 1», «Mi enlace», a WhatsApp button with a sample
 * number). Published as is, a customer sees the placeholder or writes to a
 * number that is not the business's: in the simulated-user study 3 of the
 * 4 owners who published did exactly that without noticing (relevo 31,
 * finding 8). It is found before publishing so the owner can fix it; it
 * never blocks a publication.
 */
export type SampleIssue = {
  /** What a person sees on the page, quoted in the notice. */
  label: string;
  kind: "section" | "item" | "link" | "button" | "whatsapp";
};

/**
 * The example texts, defined once (domain audit A2-28): what a new page is
 * seeded with is written with these, and what the notices find is read with
 * the same words, so changing one can no longer leave the other blind.
 */
const samplePrefix = {
  section: "Sección",
  menuItem: "Platillo",
  catalogItem: "Producto",
} as const;
export const sampleText = {
  section: (n: number) => `${samplePrefix.section} ${n}`,
  menuItem: (n: number) => `${samplePrefix.menuItem} ${n}`,
  catalogItem: (n: number) => `${samplePrefix.catalogItem} ${n}`,
  linkLabel: "Mi enlace",
  linkUrl: "https://ejemplo.com",
} as const;
const numbered = (prefix: string) => new RegExp(`^${prefix} \\d+$`);
const sampleSection = numbered(samplePrefix.section);
const sampleMenuItem = numbered(samplePrefix.menuItem);
const sampleCatalogItem = numbered(samplePrefix.catalogItem);
const sampleLinkLabel = sampleText.linkLabel;
const sampleLinkHost = new URL(sampleText.linkUrl).hostname.replaceAll(
  ".",
  "\\.",
);
/** The «Servicios» form template's rows (a features block): "Tu primer
 * servicio", "Tu segundo servicio"… */
const sampleFeature =
  /^Tu (?:primer|segundo|tercer|cuarto|quinto) (?:servicio|producto|platillo)$/i;
/** Hosts and numbers only used as examples (seed content, old templates). */
const sampleHref = new RegExp(
  `(?:^https://(?:www\\.)?${sampleLinkHost})|wa\\.me/52?5555555555\\b`,
);

/** The name is one of the seeded placeholders («Sección 1»). */
export const isSampleSection = (name: string) =>
  sampleSection.test(name.trim());
/** The name is a seeded dish or product («Platillo 1», «Producto 1»). */
export const isSampleItem = (name: string) =>
  sampleMenuItem.test(name.trim()) || sampleCatalogItem.test(name.trim());
/** A link that is still the example («Mi enlace», ejemplo.com). */
export const isSampleLink = (link: { label?: string; url?: string }) =>
  (link.label ?? "").trim() === sampleLinkLabel ||
  sampleHref.test(link.url ?? "");
export const isSampleHref = (href: string) => sampleHref.test(href);

export function findSampleContent(
  type: ExperienceType,
  content: ExperienceContent,
  /** The business's own WhatsApp (`whatsappUrlFromPhone` of its profile):
   * any other wa.me number on a button is flagged too, e.g. one copied from
   * an example. */
  ownWhatsappUrl?: string,
): SampleIssue[] {
  const own = ownWhatsappUrl ? whatsappDigits(ownWhatsappUrl) : null;
  const issues: SampleIssue[] = [];
  const value = content as Record<string, unknown>;
  if (type === "menu") {
    for (const section of (value.sections as MenuLike[] | undefined) ?? []) {
      if (sampleSection.test(section.name.trim()))
        issues.push({ label: section.name.trim(), kind: "section" });
      for (const item of section.items)
        if (sampleMenuItem.test(item.name.trim()))
          issues.push({ label: item.name.trim(), kind: "item" });
    }
  }
  if (type === "catalog")
    for (const item of (value.items as NamedLike[] | undefined) ?? [])
      if (sampleCatalogItem.test(item.name.trim()))
        issues.push({ label: item.name.trim(), kind: "item" });
  if (type === "links" || type === "linkpage" || type === "profile")
    for (const link of (value.links as LinkLike[] | undefined) ?? [])
      if (link.label.trim() === sampleLinkLabel || sampleHref.test(link.url))
        issues.push({ label: link.label.trim() || link.url, kind: "link" });
  const design = value.design as PageDesign | undefined;
  for (const block of design ? designBlocksOf(design) : []) {
    if (block.kind === "features")
      for (const item of block.items)
        if (sampleFeature.test(item.title.trim()))
          issues.push({ label: item.title.trim(), kind: "item" });
    if (block.kind === "button" || block.kind === "brandButton") {
      const label = block.label.trim() || "Un botón";
      const digits = whatsappDigits(block.href);
      if (sampleHref.test(block.href)) issues.push({ label, kind: "button" });
      else if (own && digits && digits !== own)
        issues.push({ label, kind: "whatsapp" });
    }
  }
  return dedupe(issues);
}

/** «Platillo 1», «Sección 1» y un botón de WhatsApp con un número de ejemplo. */
export function describeSampleIssues(issues: readonly SampleIssue[]): string {
  const quoted = issues
    .filter((issue) => issue.kind !== "button" && issue.kind !== "whatsapp")
    .map((issue) => `«${issue.label}»`);
  const shown = quoted.slice(0, 3);
  if (quoted.length > 3) shown.push(`${quoted.length - 3} más`);
  const buttons = issues.filter((issue) => issue.kind === "button").length;
  if (buttons)
    shown.push(
      buttons === 1
        ? "un botón con un enlace de ejemplo"
        : `${buttons} botones con enlaces de ejemplo`,
    );
  const others = issues.filter((issue) => issue.kind === "whatsapp").length;
  if (others)
    shown.push(
      others === 1
        ? "un botón de WhatsApp con un número que no es el tuyo"
        : `${others} botones de WhatsApp con un número que no es el tuyo`,
    );
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} y ${shown[shown.length - 1]}`;
}

type NamedLike = { name: string };
type MenuLike = { name: string; items: NamedLike[] };
type LinkLike = { label: string; url: string };

/**
 * A page with nothing real to show (relevo 37, B4): a Perfil without a real
 * name or any way to reach the business (Raúl), or a Menú, Catálogo or
 * Página de enlaces that is only the seed's placeholders — «Sección 1»,
 * «Platillo 1», «Producto 1», «Mi enlace» (Marisol). Unlike
 * `findSampleContent`, which flags a few placeholders left in otherwise real
 * content, this is for a page a customer could not use at all.
 */
export type EmptyPageReason =
  | { kind: "profile-missing" }
  | { kind: "all-sample"; issues: SampleIssue[] };

const genericProfileName = /^(p|perfil|tu negocio|mi negocio|sin nombre)$/i;

export function emptyPageReason(
  type: ExperienceType,
  content: ExperienceContent,
  ownWhatsappUrl?: string,
): EmptyPageReason | null {
  const value = content as Record<string, unknown>;
  if (type === "profile") {
    const name = String((value.displayName as string | undefined) ?? "").trim();
    const hasName = name.length > 0 && !genericProfileName.test(name);
    const linksArr = (value.links as LinkLike[] | undefined) ?? [];
    const hasContactLink = linksArr.some(
      (link) =>
        link.url.trim() &&
        link.label.trim() !== sampleLinkLabel &&
        !sampleHref.test(link.url),
    );
    const design = value.design as PageDesign | undefined;
    const hasContactButton = (design ? designBlocksOf(design) : []).some(
      (block) =>
        (block.kind === "button" || block.kind === "brandButton") &&
        block.href.trim().length > 0 &&
        !sampleHref.test(block.href),
    );
    return hasName || hasContactLink || hasContactButton
      ? null
      : { kind: "profile-missing" };
  }
  if (type === "menu") {
    const sections = (value.sections as MenuLike[] | undefined) ?? [];
    const items = sections.flatMap((section) => section.items);
    const real = items.filter((item) => !sampleMenuItem.test(item.name.trim()));
    if (real.length) return null;
    return {
      kind: "all-sample",
      issues: findSampleContent(type, content, ownWhatsappUrl),
    };
  }
  if (type === "catalog") {
    const items = (value.items as NamedLike[] | undefined) ?? [];
    const real = items.filter(
      (item) => !sampleCatalogItem.test(item.name.trim()),
    );
    if (real.length) return null;
    return {
      kind: "all-sample",
      issues: findSampleContent(type, content, ownWhatsappUrl),
    };
  }
  if (type === "links" || type === "linkpage") {
    const links = (value.links as LinkLike[] | undefined) ?? [];
    const real = links.filter(
      (link) =>
        link.label.trim() !== sampleLinkLabel && !sampleHref.test(link.url),
    );
    if (real.length) return null;
    return {
      kind: "all-sample",
      issues: findSampleContent(type, content, ownWhatsappUrl),
    };
  }
  return null;
}

/** «Tus clientes verán una página vacía», explained in one line. */
export function describeEmptyPage(reason: EmptyPageReason): string {
  if (reason.kind === "profile-missing")
    return "Sin nombre ni una forma de contactarte (teléfono, WhatsApp o un enlace).";
  if (!reason.issues.length) return "Todavía no tiene nada que mostrar.";
  return `Solo tiene ${describeSampleIssues(reason.issues)}.`;
}

/** The number of a wa.me link, without the country code 52 when it has
 * 12 digits, so "wa.me/52…" and "wa.me/…" compare equal. */
function whatsappDigits(href: string): string | null {
  const match = /wa\.me\/(\d{10,15})/.exec(href);
  if (!match?.[1]) return null;
  const digits = match[1];
  return digits.length === 12 && digits.startsWith("52")
    ? digits.slice(2)
    : digits;
}

function designBlocksOf(design: PageDesign): DesignBlock[] {
  const blocks: DesignBlock[] = [];
  for (const section of design.sections) {
    if (isCanvasSection(section))
      for (const item of section.items) blocks.push(item.block);
    else for (const column of section.columns) blocks.push(...column);
  }
  return blocks;
}

function dedupe(issues: SampleIssue[]): SampleIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.kind}:${issue.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
