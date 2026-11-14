import type {
  QrDesign,
  QrErrorCorrectionLevel,
  QrFrameFont,
} from "@kardo/contracts";

/**
 * Estudio QR engine — shared types.
 *
 * The engine turns (url, design, logo) into a renderer-agnostic `Scene`
 * measured in QR *module units* (1 = one module). The same scene is written
 * to SVG (preview and vector download), Canvas/PNG, vector PDF, and to a pure
 * JavaScript rasterizer that feeds the legibility checks — so what is
 * verified is exactly what is exported.
 *
 * Paths only use absolute M/L/C/Z commands (circles and arcs are converted to
 * cubic Béziers), which every target understands without translation.
 */

export type PathCommand =
  | readonly ["M", number, number]
  | readonly ["L", number, number]
  | readonly ["C", number, number, number, number, number, number]
  | readonly ["Z"];

/** Resolved paint in scene coordinates (gradients are absolute, userSpace). */
export type ScenePaint =
  | { kind: "solid"; color: string }
  | {
      kind: "linear";
      from: string;
      to: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      kind: "radial";
      from: string;
      to: string;
      cx: number;
      cy: number;
      r: number;
    };

export type SceneRole =
  | "background"
  | "frame"
  | "module"
  | "eye-frame"
  | "eye-ball"
  | "logo-plate"
  | "icon"
  | "kardo-mark"
  | "decoration";

export type ScenePathNode = {
  type: "path";
  role: SceneRole;
  d: readonly PathCommand[];
  fill: ScenePaint;
  fillRule: "nonzero" | "evenodd";
  /** 0..1, defaults to 1. */
  opacity?: number;
};

export type SceneImageNode = {
  type: "image";
  role: "logo";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rasterized, metadata-free PNG data URL (see `LogoRaster`). */
  href: string;
};

export type SceneTextNode = {
  type: "text";
  role: "cta";
  /** Horizontal centre and vertical centre of the text line. */
  x: number;
  y: number;
  text: string;
  font: QrFrameFont;
  weight: 400 | 700;
  size: number;
  color: string;
  letterSpacing: number;
  /** The renderer must shrink the text to fit this width. */
  maxWidth: number;
};

export type SceneNode = ScenePathNode | SceneImageNode | SceneTextNode;

export type Rect = { x: number; y: number; width: number; height: number };

export type Scene = {
  /** Whole design, frame included, in module units. */
  width: number;
  height: number;
  /** Painted in order (first = bottom). */
  nodes: readonly SceneNode[];
  /** Where module (0, 0) sits and how large the symbol is. */
  symbol: { x: number; y: number; size: number; quietZone: number };
};

/** A logo already rasterized in the browser (never the original file). */
export type LogoRaster = {
  /** `data:image/png;base64,…` */
  href: string;
  /** Intrinsic pixel size, used for the aspect ratio. */
  width: number;
  height: number;
};

export type QrBuildInput = {
  url: string;
  design: QrDesign;
  /** `null` while the logo loads: the area is still reserved and verified. */
  logo: LogoRaster | null;
  /** `{nombre}` in the frame text is replaced by `variables.nombre`. */
  variables?: { nombre?: string };
};

/** Error-correction budget of the worst Reed–Solomon block. */
export type QrBudget = {
  /** Codewords touched by cleared modules in the worst block. */
  damagedCodewords: number;
  /** floor(EC codewords / 2) of that block. */
  correctableCodewords: number;
  /** correctableCodewords × (1 − safety margin). */
  allowedCodewords: number;
  /** damaged / allowed: ≤ 1 fits the budget. */
  ratio: number;
  clearedModules: number;
  dataModules: number;
};

export type QrWarningCode =
  | "contrast-inverted"
  | "contrast-low"
  | "contrast-fair"
  | "eye-contrast"
  | "frame-text-contrast"
  | "transparent-background"
  | "logo-over-budget"
  | "logo-version-bumped"
  | "logo-missing"
  | "dense-code"
  | "version-too-small";

export type QrWarning = {
  code: QrWarningCode;
  level: "info" | "warning" | "error";
  /** Spanish, ready to show. */
  message: string;
};

export type QrAnalysis = {
  version: number;
  /** Modules per side (4 × version + 17). */
  size: number;
  /** Effective level (always H with a logo). */
  errorCorrection: QrErrorCorrectionLevel;
  /** Smallest version that fits the data at the effective level. */
  dataMinVersion: number;
  versionReason: "data" | "manual" | "logo";
  /** `null` without a logo. */
  budget: QrBudget | null;
  /** Largest `logo.size` that fits at this version (`null` without a logo). */
  maxLogoSize: number | null;
  /** Function patterns (finders + separators, timing, alignment, format, version), in scene coordinates (same space as the scene's viewBox). */
  protectedAreas: readonly Rect[];
  /** Area cleared for the logo, in scene coordinates. */
  clearedArea: (Rect & { shape: "rect" | "circle" }) | null;
  warnings: readonly QrWarning[];
};

export type QrBuild = { scene: Scene; analysis: QrAnalysis };

export type LegibilityCheck = {
  id: string;
  /** Spanish, e.g. "Tamaño pequeño (3 px por módulo)". */
  label: string;
  /** Critical checks must pass before exporting. */
  critical: boolean;
  passed: boolean;
};

export type LegibilityReport = {
  /** Every critical check passed and the decoded text equals the URL. */
  ok: boolean;
  /** 0..100 */
  score: number;
  checks: readonly LegibilityCheck[];
};

export type PrintPaper = "a4" | "letter";
