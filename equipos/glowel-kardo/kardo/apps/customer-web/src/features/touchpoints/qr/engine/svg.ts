import type { QrFrameFont } from "@kardo/contracts";
import type { PathCommand, Scene, SceneNode, ScenePaint } from "./types.js";

/**
 * SVG renderer: a self-contained, static `<svg>` string. No
 * `dangerouslySetInnerHTML` anywhere in the app ever touches this output —
 * it is either downloaded directly or set as an `<img src>`/background via a
 * data URL, so every bit of text is escaped here.
 */

/** Shared with `canvas.ts` so both renderers agree on font fallbacks. */
export const FONT_STACKS: Record<QrFrameFont, string> = {
  sans: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
  serif: "'Fraunces', Georgia, serif",
  mono: "ui-monospace, Menlo, monospace",
};

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Path `d` attribute, absolute commands only, numbers rounded to 3 decimals. */
export function pathData(d: readonly PathCommand[]): string {
  return d
    .map((command) => {
      const [type, ...args] = command;
      if (type === "Z") return "Z";
      return `${type}${args.map(formatNumber).join(" ")}`;
    })
    .join(" ");
}

/**
 * Defence in depth: designs are validated before they reach the engine, but a
 * downloaded SVG opened in a browser is a document, so no colour is ever
 * written into an attribute unless it is a plain `#rrggbb`.
 */
function svgColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

type GradientEntry = {
  id: string;
  paint: Extract<ScenePaint, { kind: "linear" | "radial" }>;
};

function collectGradients(
  nodes: readonly SceneNode[],
): Map<string, GradientEntry> {
  const gradients = new Map<string, GradientEntry>();
  let counter = 0;
  for (const node of nodes) {
    if (node.type !== "path") continue;
    const paint = node.fill;
    if (paint.kind === "solid") continue;
    const key = JSON.stringify(paint);
    if (!gradients.has(key)) {
      gradients.set(key, { id: `qr-grad-${counter}`, paint });
      counter += 1;
    }
  }
  return gradients;
}

function fillAttribute(
  paint: ScenePaint,
  gradients: Map<string, GradientEntry>,
): string {
  if (paint.kind === "solid") return svgColor(paint.color);
  const key = JSON.stringify(paint);
  const entry = gradients.get(key);
  return entry ? `url(#${entry.id})` : svgColor(paint.from);
}

function renderGradientDefs(gradients: Map<string, GradientEntry>): string {
  let markup = "";
  for (const { id, paint } of gradients.values()) {
    if (paint.kind === "linear") {
      markup += `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${formatNumber(paint.x1)}" y1="${formatNumber(paint.y1)}" x2="${formatNumber(paint.x2)}" y2="${formatNumber(paint.y2)}"><stop offset="0" stop-color="${svgColor(paint.from)}"/><stop offset="1" stop-color="${svgColor(paint.to)}"/></linearGradient>`;
    } else {
      markup += `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${formatNumber(paint.cx)}" cy="${formatNumber(paint.cy)}" r="${formatNumber(paint.r)}"><stop offset="0" stop-color="${svgColor(paint.from)}"/><stop offset="1" stop-color="${svgColor(paint.to)}"/></radialGradient>`;
    }
  }
  return markup;
}

function renderNode(
  node: SceneNode,
  gradients: Map<string, GradientEntry>,
): string {
  if (node.type === "path") {
    const opacity =
      node.opacity === undefined
        ? ""
        : ` opacity="${formatNumber(node.opacity)}"`;
    return `<path d="${pathData(node.d)}" fill="${fillAttribute(node.fill, gradients)}" fill-rule="${node.fillRule}"${opacity}/>`;
  }
  if (node.type === "image") {
    return `<image x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" href="${escapeXml(node.href)}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const letterSpacing =
    node.letterSpacing !== 0
      ? ` letter-spacing="${formatNumber(node.letterSpacing)}"`
      : "";
  return `<text x="${formatNumber(node.x)}" y="${formatNumber(node.y)}" fill="${svgColor(node.color)}" font-family="${FONT_STACKS[node.font]}" font-size="${formatNumber(node.size)}" font-weight="${node.weight}" text-anchor="middle" dominant-baseline="central"${letterSpacing}>${escapeXml(node.text)}</text>`;
}

/** A self-contained SVG document for `scene` (preview and vector download). */
export function sceneToSvg(
  scene: Scene,
  options?: { title?: string; widthPx?: number },
): string {
  const widthPx = options?.widthPx ?? Math.round(scene.width * 24);
  const heightPx = Math.round(widthPx * (scene.height / scene.width));
  const gradients = collectGradients(scene.nodes);
  const defs =
    gradients.size > 0 ? `<defs>${renderGradientDefs(gradients)}</defs>` : "";
  const title = options?.title
    ? `<title>${escapeXml(options.title)}</title>`
    : "";
  const body = scene.nodes.map((node) => renderNode(node, gradients)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${formatNumber(scene.width)} ${formatNumber(scene.height)}" width="${widthPx}" height="${heightPx}">${title}${defs}${body}</svg>`;
}
