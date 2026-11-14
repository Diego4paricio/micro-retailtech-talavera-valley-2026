import type {
  QrEyeBallShape,
  QrEyeFrameShape,
  QrModuleShape,
} from "@kardo/contracts";
import type { PathCommand } from "./types.js";

/**
 * Path geometry for QR modules and finder ("eye") patterns, all as absolute
 * M/L/C/Z commands. Circles and rounded corners are converted to cubic
 * Béziers with the standard κ ≈ 0.5523 constant.
 */

const KAPPA = 0.5522847498307936;

// --- Generic building blocks (reused by frames.ts, icons.ts, kardo-mark.ts) -

export function moveTo(x: number, y: number): PathCommand {
  return ["M", x, y];
}
export function lineTo(x: number, y: number): PathCommand {
  return ["L", x, y];
}
export function curveTo(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
): PathCommand {
  return ["C", x1, y1, x2, y2, x, y];
}
export function closePath(): PathCommand {
  return ["Z"];
}

export function rectPath(
  x: number,
  y: number,
  width: number,
  height: number,
): PathCommand[] {
  return [
    moveTo(x, y),
    lineTo(x + width, y),
    lineTo(x + width, y + height),
    lineTo(x, y + height),
    closePath(),
  ];
}

export type CornerRadii = {
  tl: number;
  tr: number;
  br: number;
  bl: number;
};

/** Axis-aligned rounded rectangle with an independent radius per corner. */
export function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: CornerRadii,
): PathCommand[] {
  const maxRadius = Math.min(width, height) / 2;
  const tl = Math.min(Math.max(radii.tl, 0), maxRadius);
  const tr = Math.min(Math.max(radii.tr, 0), maxRadius);
  const br = Math.min(Math.max(radii.br, 0), maxRadius);
  const bl = Math.min(Math.max(radii.bl, 0), maxRadius);
  const commands: PathCommand[] = [moveTo(x + tl, y)];

  commands.push(lineTo(x + width - tr, y));
  if (tr > 0)
    commands.push(
      curveTo(
        x + width - tr + tr * KAPPA,
        y,
        x + width,
        y + tr - tr * KAPPA,
        x + width,
        y + tr,
      ),
    );

  commands.push(lineTo(x + width, y + height - br));
  if (br > 0)
    commands.push(
      curveTo(
        x + width,
        y + height - br + br * KAPPA,
        x + width - br + br * KAPPA,
        y + height,
        x + width - br,
        y + height,
      ),
    );

  commands.push(lineTo(x + bl, y + height));
  if (bl > 0)
    commands.push(
      curveTo(
        x + bl - bl * KAPPA,
        y + height,
        x,
        y + height - bl + bl * KAPPA,
        x,
        y + height - bl,
      ),
    );

  commands.push(lineTo(x, y + tl));
  if (tl > 0)
    commands.push(
      curveTo(x, y + tl - tl * KAPPA, x + tl - tl * KAPPA, y, x + tl, y),
    );

  commands.push(closePath());
  return commands;
}

/** Full circle as four cubic Bézier arcs. */
export function circlePath(cx: number, cy: number, r: number): PathCommand[] {
  const k = KAPPA * r;
  return [
    moveTo(cx + r, cy),
    curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
    curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
    curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
    curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
    closePath(),
  ];
}

/**
 * Rhombus centred in the `size × size` box at `(x, y)`, optionally scaled up
 * past the box (`scale` > 1): each vertex sits `size/2 * scale` from the
 * centre instead of `size/2`. A lone rhombus only covers half its box, so
 * `diamondModules` below scales it up so filled neighbours visually merge —
 * the tip only pokes a little way into a light neighbour's edge, nowhere
 * near its centre, so it never reads as a false-positive module.
 */
export function diamondPath(
  x: number,
  y: number,
  size: number,
  scale = 1,
): PathCommand[] {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const half = (size / 2) * scale;
  return [
    moveTo(cx, cy - half),
    lineTo(cx + half, cy),
    lineTo(cx, cy + half),
    lineTo(cx - half, cy),
    closePath(),
  ];
}

/** Quarter-disc pie slice, used to smooth concave joins ("fluid" modules). */
export function quarterDiscPath(
  cx: number,
  cy: number,
  r: number,
  quadrant: "tl" | "tr" | "br" | "bl",
): PathCommand[] {
  const k = KAPPA * r;
  switch (quadrant) {
    case "tl":
      return [
        moveTo(cx, cy),
        lineTo(cx - r, cy),
        curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
        closePath(),
      ];
    case "tr":
      return [
        moveTo(cx, cy),
        lineTo(cx, cy - r),
        curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
        closePath(),
      ];
    case "br":
      return [
        moveTo(cx, cy),
        lineTo(cx + r, cy),
        curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
        closePath(),
      ];
    default:
      return [
        moveTo(cx, cy),
        lineTo(cx, cy + r),
        curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
        closePath(),
      ];
  }
}

/**
 * "Pillow" shape: rounded corners with sides that bow outward, kept INSCRIBED
 * in the `size × size` box at `(x, y)` — the bulge reaches at most the
 * original edge (at each edge's midpoint), never past it.
 *
 * The base rectangle is first inset by `bulge` on every side, then each edge
 * is curved back out toward the *original* box edge (the control points sit
 * exactly on it). A cubic Bézier never reaches its control points, so the
 * curve's actual extremum (at the edge's midpoint) lands a quarter of the
 * way short of them — i.e. strictly inside the original box — which is what
 * keeps two nested cushions (an eye frame's outer/inner silhouette, or a
 * finder ring around a cushion hole) from bulging into each other.
 */
export function cushionPath(
  x: number,
  y: number,
  size: number,
  cornerRadius: number,
  bulge: number,
): PathCommand[] {
  const insetSize = size - 2 * bulge;
  const r = Math.min(cornerRadius, insetSize / 2);
  const k = KAPPA * r;
  const span = insetSize - 2 * r;
  const third = span / 3;
  const top = y + bulge;
  const bottom = y + size - bulge;
  const left = x + bulge;
  const right = x + size - bulge;

  return [
    moveTo(left + r, top),
    // top edge, bowed outward (upward) toward the original box edge
    curveTo(
      left + r + third,
      top - bulge,
      right - r - third,
      top - bulge,
      right - r,
      top,
    ),
    curveTo(
      right - r + r * KAPPA,
      top,
      right,
      top + r - r * KAPPA,
      right,
      top + r,
    ),
    // right edge, bowed outward
    curveTo(
      right + bulge,
      top + r + third,
      right + bulge,
      bottom - r - third,
      right,
      bottom - r,
    ),
    curveTo(right, bottom - r + k, right - r + k, bottom, right - r, bottom),
    // bottom edge, bowed outward
    curveTo(
      right - r - third,
      bottom + bulge,
      left + r + third,
      bottom + bulge,
      left + r,
      bottom,
    ),
    curveTo(left + r - k, bottom, left, bottom - r + k, left, bottom - r),
    // left edge, bowed outward
    curveTo(
      left - bulge,
      bottom - r - third,
      left - bulge,
      top + r + third,
      left,
      top + r,
    ),
    curveTo(left, top + r - k, left + r - k, top, left + r, top),
    closePath(),
  ];
}

/** Translates + uniformly scales a path (reused to place icons and the Kardo mark). */
export function transformPath(
  path: readonly PathCommand[],
  x: number,
  y: number,
  scale: number,
): PathCommand[] {
  return path.map((command) => {
    if (command[0] === "Z") return command;
    if (command[0] === "M" || command[0] === "L")
      return [command[0], x + command[1] * scale, y + command[2] * scale];
    return [
      "C",
      x + command[1] * scale,
      y + command[2] * scale,
      x + command[3] * scale,
      y + command[4] * scale,
      x + command[5] * scale,
      y + command[6] * scale,
    ];
  });
}

// --- Module shapes ----------------------------------------------------------

export type ModuleGrid = {
  size: number;
  /** Whether module `(row, col)` should be painted with the module shape. */
  isFilled: (row: number, col: number) => boolean;
};

function mergeHorizontalRuns(grid: ModuleGrid): PathCommand[] {
  const { size, isFilled } = grid;
  const commands: PathCommand[] = [];
  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      if (!isFilled(row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < size && isFilled(row, col)) col += 1;
      commands.push(...rectPath(start, row, col - start, 1));
    }
  }
  return commands;
}

/** Runs of ≥ 2 filled modules become capsules; single modules become circles. */
function capsuleRuns(grid: ModuleGrid, axis: "row" | "col"): PathCommand[] {
  const { size, isFilled } = grid;
  const commands: PathCommand[] = [];
  const outerLength = size;
  for (let outer = 0; outer < outerLength; outer += 1) {
    let inner = 0;
    while (inner < size) {
      const filled =
        axis === "row" ? isFilled(outer, inner) : isFilled(inner, outer);
      if (!filled) {
        inner += 1;
        continue;
      }
      const start = inner;
      while (
        inner < size &&
        (axis === "row" ? isFilled(outer, inner) : isFilled(inner, outer))
      )
        inner += 1;
      const length = inner - start;
      const radius = 0.5;
      if (axis === "row") {
        commands.push(
          ...roundedRectPath(start, outer, length, 1, {
            tl: radius,
            tr: radius,
            br: radius,
            bl: radius,
          }),
        );
      } else {
        commands.push(
          ...roundedRectPath(outer, start, 1, length, {
            tl: radius,
            tr: radius,
            br: radius,
            bl: radius,
          }),
        );
      }
    }
  }
  return commands;
}

function neighbors(grid: ModuleGrid, row: number, col: number) {
  const { isFilled } = grid;
  return {
    up: isFilled(row - 1, col),
    down: isFilled(row + 1, col),
    left: isFilled(row, col - 1),
    right: isFilled(row, col + 1),
    upLeft: isFilled(row - 1, col - 1),
    upRight: isFilled(row - 1, col + 1),
    downLeft: isFilled(row + 1, col - 1),
    downRight: isFilled(row + 1, col + 1),
  };
}

function roundedModules(
  grid: ModuleGrid,
  radius: number,
  corners: { tl: boolean; tr: boolean; br: boolean; bl: boolean },
): PathCommand[] {
  const { size, isFilled } = grid;
  const commands: PathCommand[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isFilled(row, col)) continue;
      const n = neighbors(grid, row, col);
      commands.push(
        ...roundedRectPath(col, row, 1, 1, {
          tl: corners.tl && !n.up && !n.left ? radius : 0,
          tr: corners.tr && !n.up && !n.right ? radius : 0,
          br: corners.br && !n.down && !n.right ? radius : 0,
          bl: corners.bl && !n.down && !n.left ? radius : 0,
        }),
      );
    }
  }
  return commands;
}

function fluidModules(grid: ModuleGrid): PathCommand[] {
  const { size, isFilled } = grid;
  const commands: PathCommand[] = [];
  const radius = 0.42;
  const bridgeRadius = 0.3;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isFilled(row, col)) continue;
      const n = neighbors(grid, row, col);
      commands.push(
        ...roundedRectPath(col, row, 1, 1, {
          tl: !n.up && !n.left ? radius : 0,
          tr: !n.up && !n.right ? radius : 0,
          br: !n.down && !n.right ? radius : 0,
          bl: !n.down && !n.left ? radius : 0,
        }),
      );
      // Concave joins: two orthogonal neighbours present, diagonal empty —
      // patch the notch so adjacent clusters read as one connected shape.
      if (n.up && n.left && !n.upLeft)
        commands.push(...quarterDiscPath(col, row, bridgeRadius, "tl"));
      if (n.up && n.right && !n.upRight)
        commands.push(...quarterDiscPath(col + 1, row, bridgeRadius, "tr"));
      if (n.down && n.right && !n.downRight)
        commands.push(...quarterDiscPath(col + 1, row + 1, bridgeRadius, "br"));
      if (n.down && n.left && !n.downLeft)
        commands.push(...quarterDiscPath(col, row + 1, bridgeRadius, "bl"));
    }
  }
  return commands;
}

// A lone dot needs enough coverage to survive blur/noise on its own — every
// isolated module (data bits, the alternating timing pattern) is a lone dot,
// never a merged run. r = 0.44 (88 % diameter) measured right at jsQR's
// breaking point in the legibility harness; 0.47 (94 % diameter) clears it
// with margin while still reading as a dot, not a square.
const DOT_MODULE_RADIUS = 0.47;

function dotModules(grid: ModuleGrid): PathCommand[] {
  const { size, isFilled } = grid;
  const commands: PathCommand[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isFilled(row, col)) continue;
      commands.push(...circlePath(col + 0.5, row + 0.5, DOT_MODULE_RADIUS));
    }
  }
  return commands;
}

// A unit rhombus only covers 50 % of its module (`diamondPath`'s default
// scale) — nowhere near enough for a binarizer sampling near a module's edge.
// Scaling every diamond up by 1.18 (≈ 70 % area coverage) lets same-row/
// column neighbours' tips overlap instead of leaving a diamond-shaped hole of
// light between them, while each tip only pokes 0.09 module past its own
// cell — nowhere near a light neighbour's centre (0.5 module away).
const DIAMOND_MODULE_SCALE = 1.18;

function diamondModules(grid: ModuleGrid): PathCommand[] {
  const { size, isFilled } = grid;
  const commands: PathCommand[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isFilled(row, col)) continue;
      commands.push(...diamondPath(col, row, 1, DIAMOND_MODULE_SCALE));
    }
  }
  return commands;
}

/** Builds the merged path for every filled module of the grid. */
export function moduleShapePath(
  shape: QrModuleShape,
  grid: ModuleGrid,
): PathCommand[] {
  switch (shape) {
    case "square":
      return mergeHorizontalRuns(grid);
    case "rounded":
      return roundedModules(grid, 0.32, {
        tl: true,
        tr: true,
        br: true,
        bl: true,
      });
    case "dots":
      return dotModules(grid);
    case "diamond":
      return diamondModules(grid);
    case "fluid":
      return fluidModules(grid);
    case "classy":
      return roundedModules(grid, 0.5, {
        tl: true,
        tr: false,
        br: true,
        bl: false,
      });
    case "vertical":
      return capsuleRuns(grid, "col");
    default:
      return capsuleRuns(grid, "row");
  }
}

// --- Finder ("eye") patterns -------------------------------------------------

const EYE_BOX = 7;
const EYE_BALL_BOX = 3;
const EYE_BALL_INSET = (EYE_BOX - EYE_BALL_BOX) / 2; // 2
/** Alignment pattern: 5×5 ring (1 module thick) around a 1×1 centre. */
const ALIGNMENT_BOX = 5;

type EyeOuterShape =
  | "square"
  | "rounded"
  | "extra-rounded"
  | "circle"
  | "leaf"
  | "cushion";

/**
 * Cushion bulge/corner radius as a fraction of `size`, so the outer (7×7) and
 * inner (5×5) silhouettes of one ring are always self-similar — the inner one
 * is exactly the outer one scaled down and recentred, never a differently-
 * proportioned shape. That self-similarity is what keeps the inner shape
 * strictly nested inside the outer one at *every* row/column, not just the
 * exact centre: a bulge/radius fixed to an absolute size (tried first here)
 * makes the inner silhouette relatively pointier than the outer one, so its
 * own top/bottom tips fall short of where the outer one is still wide open —
 * the "ring" then has no hole at all near the top and bottom, which reads as
 * a solid blob instead of a finder pattern.
 *
 * The trade-off: the ring at the exact central row/column is not exactly 1
 * module (it is `size * 0.09` short — about 5–6 %, since both edges'
 * bulge shrinks by the same fraction), but every row keeps a real, roughly
 * uniform ring, which is what a decoder scanning near — not exactly at — the
 * centre actually needs.
 */
function shapeOuterPath(
  shape: EyeOuterShape,
  x: number,
  y: number,
  size: number,
): PathCommand[] {
  switch (shape) {
    case "circle":
      return circlePath(x + size / 2, y + size / 2, size / 2);
    case "rounded":
      return roundedRectPath(x, y, size, size, {
        tl: size * 0.22,
        tr: size * 0.22,
        br: size * 0.22,
        bl: size * 0.22,
      });
    case "extra-rounded":
      return roundedRectPath(x, y, size, size, {
        tl: size * 0.38,
        tr: size * 0.38,
        br: size * 0.38,
        bl: size * 0.38,
      });
    case "leaf":
      return roundedRectPath(x, y, size, size, {
        tl: size * 0.5,
        tr: 0,
        br: size * 0.5,
        bl: 0,
      });
    case "cushion":
      return cushionPath(x, y, size, size * 0.14, size * 0.05);
    default:
      return rectPath(x, y, size, size);
  }
}

/**
 * The finder frame as a single evenodd path: a `size`-wide outer silhouette
 * with a concentric hole one module in from every edge, leaving a ring about
 * one module thick (the classic 1:1:3:1:1 finder cross-section, separator
 * excluded since callers only ever draw within the 7×7 box).
 */
export function eyeFramePath(
  shape: QrEyeFrameShape,
  x: number,
  y: number,
): readonly PathCommand[] {
  const outer = shapeOuterPath(shape, x, y, EYE_BOX);
  const inner = shapeOuterPath(shape, x + 1, y + 1, EYE_BOX - 2);
  return [...outer, ...inner];
}

/** The finder centre (3×3 inset by 2 modules) as a single filled path. */
/**
 * Pairings of opposite silhouettes are harmonized slightly: decoders
 * cross-check the finder along its diagonals, where a square centre inside a
 * round ring (or a heavily rounded centre inside a square ring) leaves too
 * thin a margin once a camera adds noise. The adjustment keeps the chosen
 * look (a softened square, a flatter leaf/cushion) and the 3×3 box.
 */
function harmonizedBall(
  shape: QrEyeBallShape,
  frameShape: QrEyeFrameShape | undefined,
): { squareRadius: number; leafRadius: number; cushion: [number, number] } {
  const roundFrame = frameShape === "circle" || frameShape === "leaf";
  const squareFrame = frameShape === "square";
  return {
    squareRadius: shape === "square" && roundFrame ? 0.6 : 0,
    leafRadius: EYE_BALL_BOX * (squareFrame ? 0.3 : 0.5),
    cushion: squareFrame
      ? [EYE_BALL_BOX * 0.14, EYE_BALL_BOX * 0.05]
      : [EYE_BALL_BOX * 0.22, EYE_BALL_BOX * 0.1],
  };
}

export function eyeBallPath(
  shape: QrEyeBallShape,
  x: number,
  y: number,
  frameShape?: QrEyeFrameShape,
): readonly PathCommand[] {
  const bx = x + EYE_BALL_INSET;
  const by = y + EYE_BALL_INSET;
  const harmony = harmonizedBall(shape, frameShape);
  switch (shape) {
    case "circle":
      return circlePath(
        bx + EYE_BALL_BOX / 2,
        by + EYE_BALL_BOX / 2,
        EYE_BALL_BOX / 2,
      );
    case "rounded":
      return roundedRectPath(bx, by, EYE_BALL_BOX, EYE_BALL_BOX, {
        tl: EYE_BALL_BOX * 0.3,
        tr: EYE_BALL_BOX * 0.3,
        br: EYE_BALL_BOX * 0.3,
        bl: EYE_BALL_BOX * 0.3,
      });
    case "leaf":
      return roundedRectPath(bx, by, EYE_BALL_BOX, EYE_BALL_BOX, {
        tl: harmony.leafRadius,
        tr: 0,
        br: harmony.leafRadius,
        bl: 0,
      });
    case "cushion":
      return cushionPath(bx, by, EYE_BALL_BOX, ...harmony.cushion);
    default:
      return harmony.squareRadius > 0
        ? roundedRectPath(bx, by, EYE_BALL_BOX, EYE_BALL_BOX, {
            tl: harmony.squareRadius,
            tr: harmony.squareRadius,
            br: harmony.squareRadius,
            bl: harmony.squareRadius,
          })
        : rectPath(bx, by, EYE_BALL_BOX, EYE_BALL_BOX);
  }
}

/**
 * The alignment pattern's 1×1 centre. Unlike the eye frame's ring, this is a
 * single solid contour (no inner/outer pairing to keep exact), so it is kept
 * deliberately plain: a full-size box big enough that a lone module reads
 * solidly dark, only softened to echo a rounded/circular frame style. Never
 * routed through `cushionPath` — bulging a box this small (1 module) by the
 * same absolute amount used for the 5×5/3×3 ring would pinch it into a
 * self-intersecting sliver.
 */
function alignmentCenterPath(
  shape: QrEyeFrameShape,
  x: number,
  y: number,
): PathCommand[] {
  if (shape === "circle") return circlePath(x + 0.5, y + 0.5, 0.5);
  if (shape === "square") return rectPath(x, y, 1, 1);
  return roundedRectPath(x, y, 1, 1, { tl: 0.3, tr: 0.3, br: 0.3, bl: 0.3 });
}

/**
 * Alignment pattern as a single evenodd path: a solid 5×5 ring (1 module
 * thick) around a solid 1×1 centre, echoing the eye frame's chosen style —
 * always a *continuous* silhouette, never the general per-module shape
 * function. `moduleShapePath`'s dots/diamond/etc. leave gaps between
 * adjacent modules (by design, so isolated data bits don't fuse into
 * blobs), but the alignment pattern's border and centre are single
 * unbroken marks the decoder scans across; a fractional-module gap in either
 * one breaks the pattern it is looking for.
 */
export function alignmentPatternPath(
  shape: QrEyeFrameShape,
  x: number,
  y: number,
): readonly PathCommand[] {
  const outer = shapeOuterPath(shape, x, y, ALIGNMENT_BOX);
  const inner = shapeOuterPath(shape, x + 1, y + 1, ALIGNMENT_BOX - 2);
  const center = alignmentCenterPath(shape, x + 2, y + 2);
  return [...outer, ...inner, ...center];
}

// --- Pickers -----------------------------------------------------------------

export type ShapeSwatchKind = "module" | "eye-frame" | "eye-ball";

/** Small canned pattern for the shape pickers, in module units. */
export function shapeSwatch(
  kind: ShapeSwatchKind,
  shape: string,
): {
  d: readonly PathCommand[];
  size: number;
  fillRule: "nonzero" | "evenodd";
} {
  if (kind === "eye-frame") {
    return {
      d: eyeFramePath(shape as QrEyeFrameShape, 0, 0),
      size: EYE_BOX,
      fillRule: "evenodd",
    };
  }
  if (kind === "eye-ball") {
    return {
      d: eyeBallPath(shape as QrEyeBallShape, -EYE_BALL_INSET, -EYE_BALL_INSET),
      size: EYE_BALL_BOX,
      fillRule: "nonzero",
    };
  }
  // A representative 5×5 module pattern: a plus sign, sparse enough to show
  // isolated corners as well as adjoined runs.
  const pattern = [
    [0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ];
  const grid: ModuleGrid = {
    size: 5,
    isFilled: (row, col) => {
      if (row < 0 || row >= 5 || col < 0 || col >= 5) return false;
      return pattern[row]?.[col] === 1;
    },
  };
  return {
    d: moduleShapePath(shape as QrModuleShape, grid),
    size: 5,
    fillRule: "nonzero",
  };
}
