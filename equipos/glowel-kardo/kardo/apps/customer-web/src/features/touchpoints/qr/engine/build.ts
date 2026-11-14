import type {
  QrDesign,
  QrErrorCorrectionLevel,
  QrEyeBallShape,
  QrEyeFrameShape,
  QrFrameStyle,
  QrLogoPlate,
  QrModuleShape,
} from "@kardo/contracts";
import QRCode from "qrcode";
import { assessDesign, contrastRatio } from "../qr-design.js";
import {
  type ClearArea,
  computeBudget,
  intersectsFunctionalPattern,
  isModuleCleared,
  logoClearArea,
  logoImageBox,
  maxLogoSize,
} from "./budget.js";
import { buildFrame } from "./frames.js";
import { kardoMarkPaths } from "./kardo-mark.js";
import {
  alignmentPatternPositions,
  finderPatternOrigins,
  functionalProtectedAreas,
  symbolSize,
} from "./matrix.js";
import { paintRepresentativeColor, resolvePaint } from "./paint.js";
import type { ModuleGrid as ShapesModuleGrid } from "./shapes.js";
import {
  alignmentPatternPath,
  circlePath,
  eyeBallPath,
  eyeFramePath,
  moduleShapePath,
  rectPath,
  roundedRectPath,
  transformPath,
} from "./shapes.js";
import type {
  PathCommand,
  QrAnalysis,
  QrBuild,
  QrBuildInput,
  QrWarning,
  Rect,
  Scene,
  SceneImageNode,
  SceneNode,
  ScenePaint,
} from "./types.js";

export { shapeSwatch } from "./shapes.js";

// `QrDesign`'s closed-choice fields (module/eye shapes, logo plate, frame
// style, error-correction level…) are typed `string` instead of their
// literal union — a bug in the shared, read-only `packages/contracts/src/qr.ts`
// `closedChoice` helper (reported upstream, not fixed here since that file is
// read-only for this engine). `normalizeQrDesign` guarantees the runtime
// value is always one of the listed literals, so these casts just restore
// the type the rest of the engine already relies on.
const asLevel = (value: string) => value as QrErrorCorrectionLevel;
const asModuleShape = (value: string) => value as QrModuleShape;
const asEyeFrameShape = (value: string) => value as QrEyeFrameShape;
const asEyeBallShape = (value: string) => value as QrEyeBallShape;
const asLogoPlate = (value: string) => value as QrLogoPlate;
const asFrameStyle = (value: string) => value as QrFrameStyle;

type LogoAspect = { width: number; height: number };

/**
 * Builds the renderer-agnostic `Scene` for `(url, design, logo)`: picks the
 * QR version (bumping it, and only it, when the logo demands room), clears
 * its logo area without ever touching a functional module or exceeding the
 * error-correction budget, and lays out the frame, CTA and Kardo mark around
 * it. Pure and synchronous — safe to call on every keystroke of the editor.
 */
export function buildQr(input: QrBuildInput): QrBuild {
  const { url, design, logo, variables } = input;
  const warnings: QrWarning[] = [...assessDesign(design)];

  const logoDesign = design.logo;
  const hasLogo = logoDesign !== null;
  const effectiveLevel: QrErrorCorrectionLevel = hasLogo
    ? "H"
    : asLevel(design.errorCorrection);

  const dataMinVersion = QRCode.create(url, {
    errorCorrectionLevel: effectiveLevel,
  }).version;

  if (design.minVersion !== null && design.minVersion < dataMinVersion) {
    warnings.push({
      code: "version-too-small",
      level: "info",
      message: `La versión mínima elegida (${design.minVersion}) es menor que la necesaria para estos datos con corrección ${effectiveLevel} (versión ${dataMinVersion}); se usará la versión ${dataMinVersion}.`,
    });
  }
  const baseline = Math.max(dataMinVersion, design.minVersion ?? 1);

  let version = baseline;
  let versionReason: QrAnalysis["versionReason"] =
    design.minVersion !== null ? "manual" : "data";
  let clearedArea: ClearArea | null = null;
  let budget: QrAnalysis["budget"] = null;
  let effectiveLogoSize = hasLogo ? logoDesign.size : 0;
  let maxLogoSizeForVersion: number | null = null;

  if (logoDesign) {
    const plate = asLogoPlate(logoDesign.plate);
    const aspect: LogoAspect = logo
      ? { width: logo.width, height: logo.height }
      : { width: 1, height: 1 };

    let found = false;
    for (let candidate = baseline; candidate <= 25; candidate += 1) {
      const area = logoClearArea(
        candidate,
        { size: logoDesign.size, padding: logoDesign.padding, plate },
        aspect,
      );
      if (intersectsFunctionalPattern(candidate, area)) continue;
      const candidateBudget = computeBudget(candidate, effectiveLevel, area);
      if (candidateBudget.ratio > 1) continue;
      version = candidate;
      clearedArea = area;
      budget = candidateBudget;
      found = true;
      break;
    }

    if (!found) {
      version = baseline;
      const fallbackSize = maxLogoSize(
        version,
        { padding: logoDesign.padding, plate },
        aspect,
        effectiveLevel,
      );
      effectiveLogoSize = fallbackSize;
      if (fallbackSize > 0) {
        clearedArea = logoClearArea(
          version,
          { size: fallbackSize, padding: logoDesign.padding, plate },
          aspect,
        );
        budget = computeBudget(version, effectiveLevel, clearedArea);
      } else {
        clearedArea = null;
        budget = computeBudget(version, effectiveLevel, null);
      }
      warnings.push({
        code: "logo-over-budget",
        level: "warning",
        message:
          "El logo era demasiado grande para el código: se redujo su tamaño para no dañar la lectura ni tapar patrones del código.",
      });
    }

    maxLogoSizeForVersion = maxLogoSize(
      version,
      { padding: logoDesign.padding, plate },
      aspect,
      effectiveLevel,
    );
    if (version > baseline) {
      versionReason = "logo";
      const finalSize = symbolSize(version);
      warnings.push({
        code: "logo-version-bumped",
        level: "info",
        message: `El logo requirió una versión más grande del código (versión ${version}, ${finalSize}×${finalSize} módulos) para mantenerlo legible.`,
      });
    }
    if (!logo) {
      warnings.push({
        code: "logo-missing",
        level: "info",
        message:
          "El logo está configurado pero todavía no se cargó una imagen; su espacio ya está reservado en el código.",
      });
    }
  }

  if (version >= 10) {
    const denseSize = symbolSize(version);
    warnings.push({
      code: "dense-code",
      level: "info",
      message: `Código denso: la versión ${version} tiene ${denseSize}×${denseSize} módulos. Imprímelo en un tamaño generoso para que se lea bien de cerca.`,
    });
  }

  const scene = assembleScene({
    url,
    design,
    logo,
    ...(variables === undefined ? {} : { variables }),
    version,
    effectiveLevel,
    clearedArea,
    effectiveLogoSize,
  });

  const size = symbolSize(version);
  const matrixOriginX = scene.symbol.x;
  const matrixOriginY = scene.symbol.y;
  const protectedAreas: Rect[] = functionalProtectedAreas(version).map(
    (rect) => ({
      x: rect.x + matrixOriginX,
      y: rect.y + matrixOriginY,
      width: rect.width,
      height: rect.height,
    }),
  );
  const clearedAreaScene: QrAnalysis["clearedArea"] = clearedArea
    ? {
        x: clearedArea.x + matrixOriginX,
        y: clearedArea.y + matrixOriginY,
        width: clearedArea.width,
        height: clearedArea.height,
        shape: clearedArea.shape,
      }
    : null;

  const analysis: QrAnalysis = {
    version,
    size,
    errorCorrection: effectiveLevel,
    dataMinVersion,
    versionReason,
    budget,
    maxLogoSize: hasLogo ? maxLogoSizeForVersion : null,
    protectedAreas,
    clearedArea: clearedAreaScene,
    warnings,
  };

  return { scene, analysis };
}

function resolveFrameText(
  design: QrDesign,
  variables?: { nombre?: string },
): string {
  const substituted = design.frame.text.replace(
    /\{nombre\}/g,
    variables?.nombre ?? "",
  );
  const text = design.frame.uppercase
    ? substituted.toLocaleUpperCase("es")
    : substituted;
  return text.trim();
}

function buildLogoPlateNode(
  design: QrDesign,
  areaScene: Rect & { shape: "rect" | "circle" },
): SceneNode | null {
  const logoDesign = design.logo;
  if (!logoDesign || logoDesign.plate === "none") return null;
  const color = logoDesign.plateColor ?? design.background.color;
  let d: readonly PathCommand[];
  if (areaScene.shape === "circle") {
    d = circlePath(
      areaScene.x + areaScene.width / 2,
      areaScene.y + areaScene.height / 2,
      areaScene.width / 2,
    );
  } else if (logoDesign.plate === "rounded") {
    const radius = areaScene.width * 0.2;
    d = roundedRectPath(
      areaScene.x,
      areaScene.y,
      areaScene.width,
      areaScene.height,
      {
        tl: radius,
        tr: radius,
        br: radius,
        bl: radius,
      },
    );
  } else {
    d = rectPath(areaScene.x, areaScene.y, areaScene.width, areaScene.height);
  }
  return {
    type: "path",
    role: "logo-plate",
    d,
    fill: { kind: "solid", color },
    fillRule: "nonzero",
  };
}

function assembleScene(options: {
  url: string;
  design: QrDesign;
  logo: QrBuildInput["logo"];
  variables?: { nombre?: string };
  version: number;
  effectiveLevel: QrErrorCorrectionLevel;
  clearedArea: ClearArea | null;
  effectiveLogoSize: number;
}): Scene {
  const {
    url,
    design,
    logo,
    variables,
    version,
    effectiveLevel,
    clearedArea,
    effectiveLogoSize,
  } = options;
  const size = symbolSize(version);
  const qrUnitsSize = size + design.quietZone * 2;

  const resolvedText = resolveFrameText(design, variables);
  const moduleInk = paintRepresentativeColor(design.modules.fill);
  // What sits on the paper (caption text, the Kardo mark outside a card) must
  // read against the print surface, whatever colour the card text uses.
  const pageTextInk = readableInk(design.background.color, [
    design.frame.textColor,
    design.frame.color,
    moduleInk,
  ]);
  const pageMarkInk = readableInk(design.background.color, [
    moduleInk,
    design.frame.color,
  ]);
  const frameBuild = buildFrame(
    asFrameStyle(design.frame.style),
    design.frame,
    qrUnitsSize,
    resolvedText,
    pageTextInk,
  );
  const matrixOriginX = frameBuild.symbolBlockX + design.quietZone;
  const matrixOriginY = frameBuild.symbolBlockY + design.quietZone;

  const code = QRCode.create(url, {
    errorCorrectionLevel: effectiveLevel,
    version,
  });
  const isDark = (row: number, col: number): boolean =>
    code.modules.data[row * size + col] === 1;

  const origins = finderPatternOrigins(version);
  const inFinderBox = (row: number, col: number): boolean => {
    for (const key of ["topLeft", "topRight", "bottomLeft"] as const) {
      const [originRow, originCol] = origins[key];
      if (
        row >= originRow &&
        row < originRow + 7 &&
        col >= originCol &&
        col < originCol + 7
      )
        return true;
    }
    return false;
  };

  const eyeFrameShape = asEyeFrameShape(design.eyes.frameShape);

  // Alignment patterns are drawn as their own solid `alignmentPatternPath`
  // node (see shapes.ts), never through the general per-module shape
  // function: dots/diamond/etc. deliberately leave a gap between adjacent
  // modules, but the alignment pattern's ring and centre are the single
  // continuous marks a decoder scans across, so any gap in them breaks
  // alignment detection outright.
  const alignmentOrigins = alignmentPatternPositions(version).map(
    ([row, col]) => ({ row: row - 2, col: col - 2 }),
  );
  const inAlignmentBox = (row: number, col: number): boolean => {
    for (const origin of alignmentOrigins) {
      if (
        row >= origin.row &&
        row < origin.row + 5 &&
        col >= origin.col &&
        col < origin.col + 5
      )
        return true;
    }
    return false;
  };

  const grid: ShapesModuleGrid = {
    size,
    isFilled: (row, col) => {
      if (row < 0 || row >= size || col < 0 || col >= size) return false;
      if (!isDark(row, col)) return false;
      if (inFinderBox(row, col)) return false;
      if (inAlignmentBox(row, col)) return false;
      if (clearedArea && isModuleCleared(clearedArea, row, col)) return false;
      return true;
    },
  };
  const modulePaint: ScenePaint = resolvePaint(design.modules.fill, {
    x: matrixOriginX,
    y: matrixOriginY,
    size,
  });
  const moduleNode: SceneNode = {
    type: "path",
    role: "module",
    d: transformPath(
      moduleShapePath(asModuleShape(design.modules.shape), grid),
      matrixOriginX,
      matrixOriginY,
      1,
    ),
    fill: modulePaint,
    fillRule: "nonzero",
  };

  // A logo's clear area can never overlap an alignment pattern in the first
  // place (`intersectsFunctionalPattern` rejects any candidate that would),
  // so every alignment origin here is always drawn in full.
  const alignmentNodes: SceneNode[] = alignmentOrigins.map((origin) => ({
    type: "path",
    role: "module",
    d: transformPath(
      alignmentPatternPath(eyeFrameShape, origin.col, origin.row),
      matrixOriginX,
      matrixOriginY,
      1,
    ),
    fill: modulePaint,
    fillRule: "evenodd",
  }));
  const eyeBallShape = asEyeBallShape(design.eyes.ballShape);
  const eyePaint = (colorHex: string | null): ScenePaint =>
    colorHex ? { kind: "solid", color: colorHex } : modulePaint;
  const eyeNodes: SceneNode[] = [];
  for (const key of ["topLeft", "topRight", "bottomLeft"] as const) {
    const [row, col] = origins[key];
    const x = matrixOriginX + col;
    const y = matrixOriginY + row;
    const colors = design.eyes[key];
    eyeNodes.push({
      type: "path",
      role: "eye-frame",
      d: eyeFramePath(eyeFrameShape, x, y),
      fill: eyePaint(colors.frame),
      fillRule: "evenodd",
    });
    eyeNodes.push({
      type: "path",
      role: "eye-ball",
      d: eyeBallPath(eyeBallShape, x, y, eyeFrameShape),
      fill: eyePaint(colors.ball),
      fillRule: "nonzero",
    });
  }

  const logoNodes: SceneNode[] = [];
  if (clearedArea) {
    const areaScene: Rect & { shape: "rect" | "circle" } = {
      x: matrixOriginX + clearedArea.x,
      y: matrixOriginY + clearedArea.y,
      width: clearedArea.width,
      height: clearedArea.height,
      shape: clearedArea.shape,
    };
    const plateNode = buildLogoPlateNode(design, areaScene);
    if (plateNode) logoNodes.push(plateNode);
    if (logo) {
      const box = logoImageBox(version, effectiveLogoSize, {
        width: logo.width,
        height: logo.height,
      });
      const imageNode: SceneImageNode = {
        type: "image",
        role: "logo",
        x: areaScene.x + (areaScene.width - box.width) / 2,
        y: areaScene.y + (areaScene.height - box.height) / 2,
        width: box.width,
        height: box.height,
        href: logo.href,
      };
      logoNodes.push(imageNode);
    }
  }

  const backgroundNodes: SceneNode[] = [];
  if (!design.background.transparent) {
    backgroundNodes.push({
      type: "path",
      role: "background",
      // Without a card the whole design is one sheet of the background
      // colour (the caption strip included); with a card, only its window.
      d: isFullSheet(frameBuild.markOnPage, design)
        ? rectPath(0, 0, frameBuild.width, frameBuild.height)
        : rectPath(
            matrixOriginX - design.quietZone,
            matrixOriginY - design.quietZone,
            qrUnitsSize,
            qrUnitsSize,
          ),
      fill: { kind: "solid", color: design.background.color },
      fillRule: "nonzero",
    });
  }

  const chromeNodes = frameBuild.nodes.filter((node) => node.role === "frame");
  const ctaNodes = frameBuild.nodes.filter((node) => node.role !== "frame");

  const markColor = frameBuild.markOnPage
    ? pageMarkInk
    : readableInk(design.frame.color, [design.frame.textColor]);
  const kardoNodes: SceneNode[] = kardoMarkPaths(
    frameBuild.markSlot.x,
    frameBuild.markSlot.y,
    frameBuild.markSlot.height,
  ).map((markPath) => ({
    type: "path",
    role: "kardo-mark",
    d: markPath.d,
    fill: { kind: "solid", color: markColor },
    fillRule: markPath.fillRule,
    ...(markPath.opacity === undefined ? {} : { opacity: markPath.opacity }),
  }));

  // A full-sheet background goes under everything (brackets included); a
  // card's window background goes on top of the card.
  const fullSheet = isFullSheet(frameBuild.markOnPage, design);
  const nodes: SceneNode[] = [
    ...(fullSheet ? backgroundNodes : []),
    ...chromeNodes,
    ...(fullSheet ? [] : backgroundNodes),
    moduleNode,
    ...alignmentNodes,
    ...eyeNodes,
    ...logoNodes,
    ...ctaNodes,
    ...kardoNodes,
  ];

  return {
    width: frameBuild.width,
    height: frameBuild.height,
    nodes,
    symbol: {
      x: matrixOriginX,
      y: matrixOriginY,
      size,
      quietZone: design.quietZone,
    },
  };
}

/** No card behind the symbol: the background colour covers the whole sheet. */
function isFullSheet(markOnPage: boolean, design: QrDesign): boolean {
  return (
    markOnPage && ["none", "caption", "brackets"].includes(design.frame.style)
  );
}

/** First candidate with at least 3:1 contrast on `surface`; ink or paper otherwise. */
function readableInk(surface: string, candidates: readonly string[]): string {
  for (const color of candidates)
    if (contrastRatio(color, surface) >= 3) return color;
  return contrastRatio("#16232e", surface) >= contrastRatio("#ffffff", surface)
    ? "#16232e"
    : "#ffffff";
}
