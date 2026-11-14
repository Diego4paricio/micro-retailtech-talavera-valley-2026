import {
  type DesignShape,
  designBlocks,
  type ImageMask,
  type PageDesign,
} from "@kardo/contracts";
import { clampInt, colorTokenCss, pick } from "./css.js";

// ---------------------------------------------------------------------------
// Shapes (`shape` blocks, canvas only) and image masks (`image`/`imageMain`
// blocks) — ADR 018 addendum 3. Every one of them scales with its own box:
// `clip-path` polygons in percent, or `border-radius` percentages, never a
// fixed px value baked into the shape itself.
// ---------------------------------------------------------------------------

const trianglePolygon = "polygon(50% 0%, 0% 100%, 100% 100%)";
const diamondPolygon = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
const hexagonPolygon =
  "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
const starPolygon =
  "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";

const polygonShapes: Partial<Record<DesignShape, string>> = {
  triangle: trianglePolygon,
  diamond: diamondPolygon,
  hexagon: hexagonPolygon,
  star: starPolygon,
};

/** An elliptical dome on top, flat on the bottom (a doorway/arch). */
const archRadius = "50% 50% 0 0 / 100% 100% 0 0";
/** A fixed, gently asymmetric organic blob. */
const blobRadius = "60% 40% 30% 70% / 60% 30% 70% 40%";

function radiusFor(shape: DesignShape): string | undefined {
  switch (shape) {
    case "ellipse":
      return "50%";
    case "pill":
      return "999px";
    case "arch":
      return archRadius;
    case "blob":
      return blobRadius;
    default:
      return undefined;
  }
}

/** `border-radius`/`clip-path` declarations for a `shape` block. Rect keeps
 * whichever `style.radius` the block itself sets (handled by
 * `blockStyleDecls`), so it contributes nothing here. */
export function shapeGeometryDecls(shape: DesignShape): string[] {
  const decls: string[] = [];
  const clip = polygonShapes[shape];
  if (clip) decls.push(`clip-path:${clip}`);
  const radius = radiusFor(shape);
  if (radius) decls.push(`border-radius:${radius}`);
  return decls;
}

/** `background` declaration for a shape's fill: a solid color token, or a
 * gradient to `fillTo` at `angle` (default 180deg, top to bottom). */
export function shapeFillDecl(
  fill: string,
  fillTo: string | undefined,
  angle: number | undefined,
): string {
  const from = colorTokenCss(fill, "var(--kd-accent)");
  if (fillTo === undefined) return `background:${from}`;
  const to = colorTokenCss(fillTo, from);
  const deg = clampInt(angle, 0, 360, 180);
  return `background:linear-gradient(${deg}deg, ${from}, ${to})`;
}

/** Shapes whose inside stays a plain rectangle/ellipse/pill box, so an inset
 * outline reads as a clean stroke (a `clip-path` polygon's inset shadow would
 * cut across its own corners instead of following the outline). */
const strokeableShapes = new Set<DesignShape>(["rect", "ellipse", "pill"]);

/** Inset `box-shadow` standing in for a border that follows the shape (a real
 * `border` would sit outside a `clip-path`), only for the shapes it draws
 * cleanly on. `null` when the shape/stroke combination does not apply. */
export function shapeStrokeDecl(
  shape: DesignShape,
  stroke: string | undefined,
  strokeWidth: number | undefined,
  px: (value: number) => string,
): string | null {
  if (stroke === undefined || !strokeableShapes.has(shape)) return null;
  const width = px(clampInt(strokeWidth, 0, 24, 2));
  const color = colorTokenCss(stroke, "var(--kd-text)");
  return `box-shadow:inset 0 0 0 ${width} ${color}`;
}

// ---------------------------------------------------------------------------
// Image masks: global `.kd-mask--*` classes, included in the page CSS only
// when the design actually uses one (on an `image` block or an `imageMain`
// bound block). `image` applies the class itself (`blocks.ts`); `imageMain`
// is R2's (`bound.ts`) — this module only owns the shared class definitions.
// ---------------------------------------------------------------------------

const maskPolygons: Partial<Record<ImageMask, string>> = {
  diamond: diamondPolygon,
  hexagon: hexagonPolygon,
  star: starPolygon,
};

function maskRadius(mask: ImageMask): string | undefined {
  switch (mask) {
    case "circle":
      return "50%";
    // A generous, fixed rounding — more than the page's own card radius, but
    // still a soft rectangle rather than a pill.
    case "rounded":
      return "22%";
    case "arch":
      return archRadius;
    case "blob":
      return blobRadius;
    default:
      return undefined;
  }
}

/** The `kd-mask--*` class to add to an image element, or `""` for `"none"`/
 * absent (the image keeps the page's own rectangle radius). */
export function imageMaskClass(mask: ImageMask | undefined): string {
  return mask && mask !== "none" ? ` kd-mask--${mask}` : "";
}

/** Every mask an `image`/`imageMain` block in this design actually uses. */
export function designImageMasks(design: PageDesign): Set<ImageMask> {
  const masks = new Set<ImageMask>();
  for (const block of designBlocks(design)) {
    if (
      (block.kind === "image" || block.kind === "imageMain") &&
      block.mask &&
      block.mask !== "none"
    ) {
      masks.add(block.mask);
    }
  }
  return masks;
}

/** CSS for exactly the masks this design uses — `""` when it uses none. */
export function imageMaskCss(masks: ReadonlySet<ImageMask>): string {
  if (masks.size === 0) return "";
  const rules: string[] = [];
  for (const mask of masks) {
    const clip = maskPolygons[mask];
    if (clip) {
      rules.push(`.kd-mask--${mask}{clip-path:${clip};border-radius:0}`);
      continue;
    }
    // Radius masks are clips too: as a border-radius they lost to the page's
    // own image radius (`.kd-figure img`, more specific), so circle,
    // rounded, arch and blob never showed. `circle(closest-side)` keeps a
    // true circle on any aspect ratio.
    const radius = maskRadius(mask);
    if (!radius) continue;
    const roundClip =
      mask === "circle"
        ? "circle(closest-side at 50% 50%)"
        : `inset(0 round ${radius})`;
    rules.push(`.kd-mask--${mask}{clip-path:${roundClip};border-radius:0}`);
  }
  return rules.join("\n");
}

/** `pick` table for the shape block's structural class name — every shape is
 * a real, closed enum value, so this is just a safe passthrough. */
export const shapeClassValues: Record<DesignShape, DesignShape> = {
  rect: "rect",
  ellipse: "ellipse",
  pill: "pill",
  triangle: "triangle",
  diamond: "diamond",
  hexagon: "hexagon",
  star: "star",
  arch: "arch",
  blob: "blob",
};

export function shapeClassName(shape: DesignShape | undefined): DesignShape {
  return pick(shape, shapeClassValues, "rect");
}
