import {
  CANVAS_WIDTH,
  type CanvasSection,
  type DesignableExperienceType,
  type DesignBlock,
  type PageDesign,
  type PageSection,
} from "@kardo/contracts";
import { contrastRatio } from "../../../lib/color.js";
import { withBusinessData } from "./business-contact.js";
import type { NewId } from "./ids.js";

/**
 * The organization's brand in the Estudio (2026-10-02): what Configuración →
 * Marca holds (logo, cover, brand colors), applied on its own to the
 * designs the Estudio starts from, so a new page already looks like the
 * business without anyone choosing the logo again. Since 2026-10-03 it also
 * carries the business's WhatsApp, built from Configuración → General's
 * phone the same way Kardo's AI builds it (`whatsappUrlFromPhone`), and its
 * hours.
 */
export type StudioOrganizationBrand = {
  name: string;
  logoAssetId?: string | undefined;
  coverAssetId?: string | undefined;
  brand?: { primary: string; accent: string } | undefined;
  whatsappUrl?: string | undefined;
  hours?: string | undefined;
};

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

/** The brand color a design's buttons and highlights should use: the
 * primary when it reads against the page's surface (3:1, the bar for large
 * text and controls), else the accent, else the design's own accent. */
export function brandAccentFor(
  surface: string,
  brand: { primary: string; accent: string },
): string | undefined {
  if (!isHex(surface)) return undefined;
  return [brand.primary, brand.accent].find(
    (color) => isHex(color) && contrastRatio(color, surface) >= 3,
  );
}

/** Types whose page is the content itself (a single photo, a PDF read edge
 * to edge): a brand header on top would compete with it. */
const noHeaderTypes: readonly DesignableExperienceType[] = [
  "image",
  "document",
];
/** Types that already open with the person's own photo (profileHeader): the
 * cover goes above it, the logo would repeat it. */
const ownPhotoTypes: readonly DesignableExperienceType[] = [
  "profile",
  "linkpage",
];

const COVER_HEIGHT = 176;
/** The white disc the logo sits on. */
const LOGO_DISC = 104;
/** The logo itself, whole (never cropped by a mask: a logo often has its
 * name in the corners), centered inside the disc. */
const LOGO_SIZE = 72;
/** Most top padding the first section keeps under the brand header, which
 * already opens the page. */
const PADDING_UNDER_HEADER = 12;

/** A canvas section with the cover across the top and, below its lower
 * edge, the logo inside a ring of the page's surface color. */
export function brandHeaderSection(
  org: StudioOrganizationBrand,
  type: DesignableExperienceType,
  newId: NewId,
): CanvasSection | null {
  if (noHeaderTypes.includes(type)) return null;
  const cover = org.coverAssetId;
  const logo = ownPhotoTypes.includes(type) ? undefined : org.logoAssetId;
  if (!cover && !logo) return null;

  const items: CanvasSection["items"] = [];
  const discTop = cover ? COVER_HEIGHT - LOGO_DISC / 2 : 16;
  if (cover) {
    items.push({
      block: {
        id: newId("b"),
        kind: "image",
        imageRef: cover,
        alt: `Portada de ${org.name}`,
        aspect: "auto",
        fit: "cover",
      } as DesignBlock,
      x: 0,
      y: 0,
      w: CANVAS_WIDTH,
      h: COVER_HEIGHT,
      z: 0,
    });
  }
  if (logo) {
    const inset = (LOGO_DISC - LOGO_SIZE) / 2;
    items.push(
      {
        block: {
          id: newId("b"),
          kind: "shape",
          shape: "ellipse",
          fill: "surface",
        } as DesignBlock,
        x: (CANVAS_WIDTH - LOGO_DISC) / 2,
        y: discTop,
        w: LOGO_DISC,
        h: LOGO_DISC,
        z: 1,
      },
      {
        block: {
          id: newId("b"),
          kind: "image",
          imageRef: logo,
          alt: `Logo de ${org.name}`,
          aspect: "1:1",
          fit: "contain",
        } as DesignBlock,
        x: (CANVAS_WIDTH - LOGO_SIZE) / 2,
        y: discTop + inset,
        w: LOGO_SIZE,
        h: LOGO_SIZE,
        z: 2,
      },
    );
  }
  const bottom = logo ? discTop + LOGO_DISC + 8 : COVER_HEIGHT;
  return {
    id: newId("s"),
    kind: "canvas",
    height: Math.max(80, bottom),
    items,
  };
}

/**
 * The design with the organization's brand: its header (cover and logo) on
 * top, unless the design already opens with a canvas of its own, and, when
 * `recolor` is set (Kardo's templates, which bring their own palette, and a
 * page that has no theme of its own), the brand color as the accent. A page
 * with its own theme keeps its colors: they are already the business's.
 * A template's example WhatsApp and hours become the business's own. With
 * no phone the WhatsApp button stays empty, to be filled before saving;
 * with no hours the example schedule comes out.
 */
export function withOrganizationBrand(
  design: PageDesign,
  type: DesignableExperienceType,
  org: StudioOrganizationBrand | null,
  newId: NewId,
  options: { recolor?: boolean } = {},
): PageDesign {
  let next = withBusinessData(design, org);
  if (!org) return next;

  if (options.recolor && org.brand) {
    const accent = brandAccentFor(design.style.palette.surface, org.brand);
    if (accent) {
      next = {
        ...next,
        style: {
          ...next.style,
          palette: { ...next.style.palette, accent },
        },
      };
    }
  }

  const first = next.sections[0] as PageSection | undefined;
  const opensWithCanvas =
    first !== undefined && "kind" in first && first.kind === "canvas";
  const header = opensWithCanvas ? null : brandHeaderSection(org, type, newId);
  if (header) {
    const [firstSection, ...rest] = next.sections;
    const tightened =
      firstSection &&
      !("kind" in firstSection && firstSection.kind === "canvas")
        ? {
            ...firstSection,
            paddingTop: Math.min(
              (firstSection as { paddingTop: number }).paddingTop,
              PADDING_UNDER_HEADER,
            ),
          }
        : firstSection;
    next = {
      ...next,
      schema: 2,
      sections: [
        header,
        ...(tightened ? [tightened as PageSection] : []),
        ...rest,
      ],
    };
  }
  return next;
}
