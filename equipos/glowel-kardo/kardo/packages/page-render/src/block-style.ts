import type { BlockStyle } from "@kardo/contracts";
import {
  alignCss,
  clampInt,
  colorTokenCss,
  fontFamilyDecl,
  shadowCss,
  textAlignCss,
} from "./css.js";
import { plainPx } from "./types.js";

/**
 * A per-block `style` override (ADR 018's "modo avanzado") as a list of CSS
 * declarations. Every declaration here goes through the same
 * validated/clamped/enum-mapped helpers as the shared stylesheet in `css.ts`
 * — an inline attribute is still CSS, so it follows the same "never
 * interpolate a free string" rule.
 */
export function blockStyleDecls(
  style: BlockStyle | undefined,
  px: (value: number) => string = plainPx,
): string[] {
  if (!style) return [];
  const decls: string[] = [];

  if (style.align !== undefined) {
    decls.push(`align-self:${alignCss(style.align)}`);
    decls.push(`text-align:${textAlignCss(style.align)}`);
  }
  if (style.color !== undefined) {
    decls.push(`color:${colorTokenCss(style.color, "inherit")}`);
  }
  if (style.background !== undefined) {
    if (style.background === "none") {
      decls.push("background:transparent");
    } else if (style.backgroundTo !== undefined) {
      const from = colorTokenCss(style.background, "transparent");
      const to = colorTokenCss(style.backgroundTo, from);
      const angle = clampInt(style.backgroundAngle, 0, 360, 180);
      decls.push(`background:linear-gradient(${angle}deg, ${from}, ${to})`);
    } else {
      decls.push(
        `background:${colorTokenCss(style.background, "transparent")}`,
      );
    }
  }
  if (style.borderWidth !== undefined) {
    const width = px(clampInt(style.borderWidth, 0, 12, 0));
    const color = colorTokenCss(style.borderColor, "currentColor");
    decls.push(`border:${width} solid ${color}`);
  }
  if (style.fontSize !== undefined) {
    decls.push(`font-size:${px(clampInt(style.fontSize, 12, 72, 16))}`);
  }
  if (style.fontWeight !== undefined) {
    const allowed = [400, 500, 600, 700] as const;
    const weight = (allowed as readonly number[]).includes(style.fontWeight)
      ? style.fontWeight
      : 400;
    decls.push(`font-weight:${weight}`);
  }
  if (style.font !== undefined) {
    decls.push(`font-family:${fontFamilyDecl(style.font)}`);
  }
  if (style.letterSpacing !== undefined) {
    const hundredths = clampInt(style.letterSpacing, -5, 30, 0);
    decls.push(`letter-spacing:${(hundredths / 100).toFixed(2)}em`);
  }
  if (style.lineHeight !== undefined) {
    const tenths = clampInt(style.lineHeight, 10, 20, 15);
    decls.push(`line-height:${(tenths / 10).toFixed(1)}`);
  }
  if (style.radius !== undefined) {
    decls.push(`border-radius:${px(clampInt(style.radius, 0, 48, 0))}`);
  }
  if (style.paddingX !== undefined) {
    const x = clampInt(style.paddingX, 0, 64, 0);
    decls.push(`padding-left:${px(x)}`, `padding-right:${px(x)}`);
  }
  if (style.paddingY !== undefined) {
    const y = clampInt(style.paddingY, 0, 64, 0);
    decls.push(`padding-top:${px(y)}`, `padding-bottom:${px(y)}`);
  }
  if (style.marginTop !== undefined) {
    decls.push(`margin-top:${px(clampInt(style.marginTop, 0, 96, 0))}`);
  }
  if (style.marginBottom !== undefined) {
    decls.push(`margin-bottom:${px(clampInt(style.marginBottom, 0, 96, 0))}`);
  }
  if (style.opacity !== undefined) {
    const percent = clampInt(style.opacity, 20, 100, 100);
    decls.push(`opacity:${(percent / 100).toFixed(2)}`);
  }
  if (style.shadow !== undefined) {
    decls.push(`box-shadow:${shadowCss(style.shadow)}`);
  }
  if (style.width !== undefined) {
    decls.push(style.width === "full" ? "width:100%" : "width:auto");
    if (style.width === "full") decls.push("align-self:stretch");
  }

  return decls;
}

/**
 * Wraps a list of CSS declarations (already produced by validated/clamped
 * helpers — never a free string) as an inline `style="..."` attribute, or
 * `""` when there is nothing to apply.
 */
export function styleAttr(decls: readonly string[]): string {
  if (decls.length === 0) return "";
  return ` style="${decls.join(";").replace(/"/g, "&quot;")}"`;
}

/** Convenience: `styleAttr(blockStyleDecls(style, px))`. */
export function blockStyleAttr(
  style: BlockStyle | undefined,
  px?: (value: number) => string,
): string {
  return styleAttr(blockStyleDecls(style, px));
}
