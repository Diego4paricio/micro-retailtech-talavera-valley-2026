import type {
  CanvasItem,
  DesignBackground,
  DesignBlock,
  DesignFont,
  DesignShape,
  DesignStyle,
} from "@kardo/contracts";
import { balancedWidth, fitSize, initialOf, wrapLines } from "./text.js";

/** A typeface as the covers measure it: `glyphWidths` has `font-weight`. */
export type Face = {
  font: DesignFont;
  weight: 400 | 600 | 700;
  /** Letter spacing, hundredths of an em. */
  spacing?: number;
};

export type Theme = {
  style: DesignStyle;
  /** The cover canvas's own background, when it is not the page's. */
  coverBackground?: DesignBackground;
  coverText: string;
  coverMuted: string;
  /** A light tint and a dark shade of the accent, for shapes. */
  tint: string;
  deep: string;
  title: Face;
  phrase: Face;
};

export type NewId = (prefix: "s" | "b") => string;

export type CoverInput = {
  title: string;
  phrase: string;
  logoAssetId?: string | undefined;
  newId: NewId;
};

type ShapeExtra = {
  stroke?: string;
  strokeWidth?: number;
  fillTo?: string;
  angle?: number;
  radius?: number;
  opacity?: number;
};

export type TitleBox = { size: number; w: number; h: number };

/**
 * What a cover is drawn with: shapes, the title and the phrase measured
 * before they are placed, and the business's mark (its logo on a disc, or
 * the initial of its name as a monogram). Every position is a whole design
 * px of the 390 px canvas.
 */
export class CoverKit {
  readonly items: CanvasItem[] = [];

  constructor(
    readonly input: CoverInput,
    readonly theme: Theme,
    /** A shorter cover: a PDF or a form shows its content sooner. */
    readonly compact: boolean,
  ) {}

  /** The business uploaded its logo: every look shows it on its cover. */
  get hasLogo(): boolean {
    return Boolean(this.input.logoAssetId);
  }

  private id(prefix: "s" | "b") {
    return this.input.newId(prefix);
  }

  shape(
    shape: DesignShape,
    fill: string,
    x: number,
    y: number,
    w: number,
    h: number,
    extra: ShapeExtra = {},
    z = 0,
    rotate?: number,
  ): void {
    const { radius, opacity, ...rest } = extra;
    const style = {
      ...(radius !== undefined ? { radius } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
    };
    this.items.push({
      block: {
        id: this.id("b"),
        kind: "shape",
        shape,
        fill,
        ...rest,
        ...(Object.keys(style).length ? { style } : {}),
      } as DesignBlock,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
      z,
      ...(rotate ? { r: rotate } : {}),
    });
  }

  /** A hairline across the cover (1 px, the text color at 15%). */
  divider(x: number, y: number, w: number): void {
    this.items.push({
      block: { id: this.id("b"), kind: "divider" } as DesignBlock,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      z: 1,
    });
  }

  /** The title's size (the largest of `sizes` within `maxLines`), its box
   * (as narrow as its lines allow) and its height. */
  measureTitle(
    sizes: readonly number[],
    width: number,
    lineHeight = 11,
    maxLines = 2,
  ): TitleBox {
    const face = this.theme.title;
    const key = `${face.font}-${face.weight}`;
    const spacing = face.spacing ?? 0;
    const size = fitSize(
      this.input.title,
      key,
      sizes,
      width,
      maxLines,
      spacing,
    );
    const lines = wrapLines(this.input.title, key, size, width, spacing);
    return {
      size,
      w: Math.round(balancedWidth(this.input.title, key, size, width, spacing)),
      h: Math.ceil(lines * size * (lineHeight / 10)),
    };
  }

  title(
    box: TitleBox,
    x: number,
    y: number,
    align: "start" | "center",
    lineHeight = 11,
    color = this.theme.coverText,
  ): void {
    const face = this.theme.title;
    // Centered titles keep their center; the box is as narrow as it can be.
    const left = align === "center" ? Math.round(x - box.w / 2) : Math.round(x);
    this.items.push({
      block: {
        id: this.id("b"),
        kind: "heading",
        level: 1,
        text: this.input.title,
        style: {
          fontSize: box.size,
          lineHeight,
          fontWeight: face.weight,
          color,
          align,
          ...(face.spacing ? { letterSpacing: face.spacing } : {}),
        },
      } as DesignBlock,
      x: left,
      y: Math.round(y),
      w: box.w,
      z: 4,
    });
  }

  measurePhrase(size: number, width: number, face = this.theme.phrase): number {
    if (!this.input.phrase.trim()) return 0;
    const lines = wrapLines(
      this.input.phrase,
      `${face.font}-${face.weight}`,
      size,
      width,
    );
    const lineHeight = face.font === "caveat" ? 1.2 : 1.5;
    return Math.ceil(lines * size * lineHeight);
  }

  phrase(
    size: number,
    x: number,
    y: number,
    width: number,
    align: "start" | "center",
    color = this.theme.coverMuted,
    face = this.theme.phrase,
  ): void {
    if (!this.input.phrase.trim()) return;
    const body = this.theme.style.fonts.body;
    this.items.push({
      block: {
        id: this.id("b"),
        kind: "text",
        runs: [{ text: this.input.phrase }],
        style: {
          fontSize: size,
          lineHeight: face.font === "caveat" ? 12 : 15,
          color,
          align,
          ...(face.font !== body ? { font: face.font } : {}),
          ...(face.weight !== 400 ? { fontWeight: face.weight } : {}),
        },
      } as DesignBlock,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(width),
      z: 4,
    });
  }

  /** The logo on a white disc, or the initial in the title's typeface. */
  mark(
    x: number,
    y: number,
    size: number,
    colors: { fill: string; ink: string; ring?: string },
  ): void {
    const ring = colors.ring
      ? { stroke: colors.ring, strokeWidth: Math.max(1, Math.round(size / 64)) }
      : {};
    if (this.input.logoAssetId) {
      this.shape("ellipse", "#ffffff", x, y, size, size, ring, 3);
      const inner = Math.round(size * 0.66);
      this.items.push({
        block: {
          id: this.id("b"),
          kind: "image",
          imageRef: this.input.logoAssetId,
          alt: `Logo de ${this.input.title}`,
          aspect: "1:1",
          fit: "contain",
        } as DesignBlock,
        x: Math.round(x + (size - inner) / 2),
        y: Math.round(y + (size - inner) / 2),
        w: inner,
        h: inner,
        z: 4,
      });
      return;
    }
    this.shape("ellipse", colors.fill, x, y, size, size, ring, 3);
    const face = this.theme.title;
    const letter = Math.round(size * 0.5);
    this.items.push({
      block: {
        id: this.id("b"),
        kind: "text",
        runs: [{ text: initialOf(this.input.title) }],
        style: {
          fontSize: letter,
          lineHeight: 10,
          color: colors.ink,
          align: "center",
          font: face.font,
          fontWeight: face.weight,
        },
      } as DesignBlock,
      x: Math.round(x),
      y: Math.round(y + (size - letter) / 2 - 1),
      w: Math.round(size),
      z: 4,
    });
  }
}
