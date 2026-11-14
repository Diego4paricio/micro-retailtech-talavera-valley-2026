import { BlockStyleSchema, DesignBlockSchema } from "@kardo/contracts";

// ---------------------------------------------------------------------------
// Repairs for the mistakes the AI test bench saw over and over (2026-10-02),
// every one of them with a single obvious meaning, so the review loop fixes
// them in place instead of spending a whole turn (and, with Haiku 4.5, often
// a broken rewrite of the entire JSON) on them:
// - a palette token ("background", "accent", ...) where a background needs
//   a hex color: the palette's own hex;
// - `overlay` written as a CSS color ("rgba(0,0,0,0.25)", "#3a2142cc") or a
//   fraction (0.25): the integer percent the contract asks for, at most 80;
// - CSS names in a block's `style`: `textAlign` becomes `align`, `weight`
//   becomes `fontWeight`, and anything else the block style does not have
//   (`maxWidth`, `margin`, ...) goes away.
// `lockWhatsAppLinks` (2026-10-03) keeps every WhatsApp button on the
// organization's own number.
// - the blurred backdrop (`ambient`, absent = "auto") on a pale page: off
//   (relevo 37, IA2). It muddied pale palettes and the designers of the
//   simulated-user study turned it off by hand again and again.
// Anything else still goes through the schema and `checkDesign` untouched.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const HEX = /^#[0-9a-f]{6}$/i;
const paletteTokens = ["background", "surface", "text", "muted", "accent"];
const styleKeys = new Set(
  Object.keys(
    (BlockStyleSchema as unknown as { properties: Record<string, unknown> })
      .properties,
  ),
);
const alignByCss: Record<string, string> = {
  left: "start",
  start: "start",
  center: "center",
  right: "end",
  end: "end",
};
const knownKinds = new Set(
  (
    DesignBlockSchema as unknown as {
      anyOf: { properties?: { kind?: { const?: string } } }[];
    }
  ).anyOf.map((variant) => variant.properties?.kind?.const),
);

export type DesignRepair = { path: string; what: string };

function overlayPercent(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const percent = value > 0 && value <= 1 ? value * 100 : value;
    return Math.max(0, Math.min(80, Math.round(percent)));
  }
  if (typeof value === "string") {
    const alpha = /rgba?\([^)]*,\s*([0-9.]+)\s*\)/i.exec(value)?.[1];
    const percent = /^\s*([0-9.]+)\s*%\s*$/.exec(value)?.[1];
    // "#rrggbbaa": the last two hex digits are the alpha.
    const hexAlpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(value.trim())?.[1];
    const number = alpha
      ? Number(alpha) * 100
      : percent
        ? Number(percent)
        : hexAlpha
          ? (Number.parseInt(hexAlpha, 16) / 255) * 100
          : Number.NaN;
    if (Number.isFinite(number))
      return Math.max(0, Math.min(80, Math.round(number)));
  }
  return undefined;
}

function repairBackground(
  background: unknown,
  palette: Json,
  path: string,
  repairs: DesignRepair[],
): void {
  if (!isRecord(background)) return;
  for (const key of ["color", "colorTo"]) {
    const value = background[key];
    if (
      typeof value === "string" &&
      !HEX.test(value) &&
      paletteTokens.includes(value) &&
      typeof palette[value] === "string" &&
      HEX.test(palette[value] as string)
    ) {
      background[key] = palette[value];
      repairs.push({ path: `${path}/${key}`, what: `token ${value}` });
    }
  }
  if ("overlay" in background && !Number.isInteger(background.overlay)) {
    const percent = overlayPercent(background.overlay);
    if (percent === undefined) delete background.overlay;
    else background.overlay = percent;
    repairs.push({ path: `${path}/overlay`, what: "overlay" });
  }
}

function repairBlockStyle(
  block: unknown,
  path: string,
  repairs: DesignRepair[],
): void {
  if (!isRecord(block) || !knownKinds.has(block.kind as string)) return;
  const style = block.style;
  if (!isRecord(style)) return;
  if ("textAlign" in style) {
    const align = alignByCss[String(style.textAlign).toLowerCase()];
    if (align && !("align" in style)) style.align = align;
    delete style.textAlign;
    repairs.push({ path: `${path}/style/textAlign`, what: "textAlign" });
  }
  if ("weight" in style) {
    const weight = Number(style.weight);
    if ([400, 500, 600, 700].includes(weight) && !("fontWeight" in style))
      style.fontWeight = weight;
    delete style.weight;
    repairs.push({ path: `${path}/style/weight`, what: "weight" });
  }
  if (typeof style.fontWeight === "string") {
    const weight = Number(style.fontWeight);
    if ([400, 500, 600, 700].includes(weight)) style.fontWeight = weight;
  }
  for (const key of Object.keys(style)) {
    if (!styleKeys.has(key)) {
      delete style[key];
      repairs.push({ path: `${path}/style/${key}`, what: "unknown" });
    }
  }
}

/** sRGB relative luminance of a `#rrggbb` color (WCAG). */
function luminance(hex: string): number {
  const channel = (index: number) => {
    const value =
      Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Pale page backgrounds (cream, white, pastel) at or above this luminance
 * get no blurred backdrop unless the model chose a custom one. */
const PALE_BACKGROUND = 0.7;

function repairAmbient(style: Json, palette: Json, repairs: DesignRepair[]) {
  const background = palette.background;
  if (typeof background !== "string" || !HEX.test(background)) return;
  const ambient = isRecord(style.ambient) ? style.ambient : undefined;
  if (ambient && ambient.kind !== "auto") return;
  if (luminance(background) < PALE_BACKGROUND) return;
  style.ambient = { kind: "none" };
  repairs.push({
    path: "/style/ambient",
    what: "the blurred backdrop is off on a pale page",
  });
}

/** Repairs `design` in place (it is the freshly parsed, model-owned draft)
 * and says what it changed. */
export function repairCommonDesignMistakes(design: unknown): DesignRepair[] {
  const repairs: DesignRepair[] = [];
  if (!isRecord(design)) return repairs;
  const style = isRecord(design.style) ? design.style : {};
  const palette = isRecord(style.palette) ? style.palette : {};
  repairBackground(style.background, palette, "/style/background", repairs);
  if (isRecord(design.style)) repairAmbient(design.style, palette, repairs);
  if (!Array.isArray(design.sections)) return repairs;
  design.sections.forEach((section: unknown, sectionIndex) => {
    if (!isRecord(section)) return;
    const path = `/sections/${sectionIndex}`;
    repairBackground(
      section.background,
      palette,
      `${path}/background`,
      repairs,
    );
    if (Array.isArray(section.items)) {
      section.items.forEach((item: unknown, itemIndex) => {
        if (isRecord(item))
          repairBlockStyle(
            item.block,
            `${path}/items/${itemIndex}/block`,
            repairs,
          );
      });
    }
    if (Array.isArray(section.columns)) {
      section.columns.forEach((column: unknown, columnIndex) => {
        if (!Array.isArray(column)) return;
        column.forEach((block: unknown, blockIndex) => {
          repairBlockStyle(
            block,
            `${path}/columns/${columnIndex}/${blockIndex}`,
            repairs,
          );
        });
      });
    }
  });
  return repairs;
}

const WHATSAPP_LINK = /^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i;

function whatsappDigits(href: string): string {
  try {
    const url = new URL(href);
    const phone =
      url.hostname.toLowerCase() === "wa.me"
        ? url.pathname
        : (url.searchParams.get("phone") ?? "");
    return phone.replace(/\D/g, "");
  } catch {
    return "";
  }
}

/** The organization's link with the model's own `?text=` message, if any. */
function withMessageOf(href: string, whatsappUrl: string): string {
  try {
    const text = new URL(href).searchParams.get("text");
    return text
      ? `${whatsappUrl}?text=${encodeURIComponent(text)}`
      : whatsappUrl;
  } catch {
    return whatsappUrl;
  }
}

/** A button whose WhatsApp link is not the organization's: the new href, or
 * `null` when the button has to go (the business has no phone). Anything
 * else returns `undefined` and stays as it is. */
function lockedWhatsAppHref(
  block: unknown,
  whatsappUrl: string | undefined,
): string | null | undefined {
  if (!isRecord(block)) return undefined;
  if (block.kind !== "button" && block.kind !== "brandButton") return undefined;
  if (typeof block.href !== "string" || !WHATSAPP_LINK.test(block.href))
    return undefined;
  if (!whatsappUrl) return null;
  if (whatsappDigits(block.href) === whatsappDigits(whatsappUrl))
    return undefined;
  return withMessageOf(block.href, whatsappUrl);
}

/**
 * The only WhatsApp a design may link to is the organization's own
 * (`whatsappUrlFromPhone` of Configuración → General's phone), the one the
 * prompt hands the model. A number the model made up (copying the prompt's
 * example, or inventing one for a business that has no phone) becomes the
 * organization's, keeping its message; with no phone the button goes
 * away. Never a stranger's number on a published page (2026-10-03 study,
 * finding 5). Repairs `design` in place, like `repairCommonDesignMistakes`.
 */
export function lockWhatsAppLinks(
  design: unknown,
  whatsappUrl: string | undefined,
): DesignRepair[] {
  const repairs: DesignRepair[] = [];
  if (!isRecord(design) || !Array.isArray(design.sections)) return repairs;
  design.sections.forEach((section: unknown, sectionIndex) => {
    if (!isRecord(section)) return;
    const path = `/sections/${sectionIndex}`;
    if (Array.isArray(section.items)) {
      section.items = section.items.filter((item: unknown, itemIndex) => {
        if (!isRecord(item)) return true;
        const locked = lockedWhatsAppHref(item.block, whatsappUrl);
        const at = `${path}/items/${itemIndex}/block`;
        if (locked === null) {
          repairs.push({ path: at, what: "removed a made-up WhatsApp button" });
          return false;
        }
        if (locked !== undefined && isRecord(item.block)) {
          item.block.href = locked;
          repairs.push({ path: at, what: "used the business's WhatsApp" });
        }
        return true;
      });
    }
    if (Array.isArray(section.columns)) {
      section.columns = section.columns.map((column: unknown, columnIndex) => {
        if (!Array.isArray(column)) return column;
        return column.filter((block: unknown, blockIndex) => {
          const locked = lockedWhatsAppHref(block, whatsappUrl);
          const at = `${path}/columns/${columnIndex}/${blockIndex}`;
          if (locked === null) {
            repairs.push({
              path: at,
              what: "removed a made-up WhatsApp button",
            });
            return false;
          }
          if (locked !== undefined && isRecord(block)) {
            block.href = locked;
            repairs.push({ path: at, what: "used the business's WhatsApp" });
          }
          return true;
        });
      });
    }
  });
  return repairs;
}
