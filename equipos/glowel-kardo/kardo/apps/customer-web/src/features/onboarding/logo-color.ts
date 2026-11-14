import type { WorkspaceProfile } from "@kardo/contracts";
import { useEffect, useState } from "react";

const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0");

type Bucket = { r: number; g: number; b: number; n: number; score: number };

/**
 * The logo's most brand-like color, from its RGBA pixels. A strong color
 * (saturated, neither pale nor dark) wins even when it covers little, like
 * a thin letter on a pastel circle; a pastel one only when the logo has
 * nothing stronger. Null for a black, white or gray logo.
 */
export function logoAccent(pixels: ArrayLike<number>): string | null {
  const strong = new Map<number, Bucket>();
  const any = new Map<number, Bucket>();
  let opaque = 0;
  let strongCount = 0;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    if ((pixels[index + 3] ?? 0) < 128) continue;
    opaque++;
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const lightness = (max + min) / 2;
    const saturation =
      max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
    if (saturation < 0.25 || lightness < 0.08 || lightness > 0.92) continue;
    const middle = Math.max(0, 1 - Math.abs(lightness - 0.45) / 0.5);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const score = saturation * middle * middle;
    add(any, key, r, g, b, score);
    if (lightness >= 0.12 && lightness <= 0.8) {
      add(strong, key, r, g, b, score);
      strongCount++;
    }
  }
  const best = strongCount >= opaque * 0.01 ? top(strong) : (top(any) ?? null);
  if (!best || best.score <= 0 || best.n < opaque * 0.002) return null;
  return `#${hex(best.r / best.n)}${hex(best.g / best.n)}${hex(best.b / best.n)}`;
}

function add(
  buckets: Map<number, Bucket>,
  key: number,
  r: number,
  g: number,
  b: number,
  score: number,
) {
  const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0, score: 0 };
  bucket.r += r;
  bucket.g += g;
  bucket.b += b;
  bucket.n++;
  bucket.score += score;
  buckets.set(key, bucket);
}

function top(buckets: Map<number, Bucket>): Bucket | null {
  let best: Bucket | null = null;
  for (const bucket of buckets.values())
    if (!best || bucket.score > best.score) best = bucket;
  return best;
}

/**
 * The color of the logo at `url` (an image the panel already loaded).
 * Undefined while it is read; null when there is no logo or no color.
 */
export function useLogoColor(
  url: string | null,
  status: "idle" | "loading" | "ready" | "error",
): string | null | undefined {
  const [read, setRead] = useState<{ url: string; color: string | null }>();
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      let color: string | null = null;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 96;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context?.drawImage(image, 0, 0, 96, 96);
        const pixels = context?.getImageData(0, 0, 96, 96).data;
        color = pixels ? logoAccent(pixels) : null;
      } catch {
        color = null;
      }
      setRead({ url, color });
    };
    image.onerror = () => {
      if (!cancelled) setRead({ url, color: null });
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (status === "idle" || status === "error") return null;
  if (!url || read?.url !== url) return undefined;
  return read.color;
}

/**
 * The brand to keep from the logo's color (A2-6): only once, and only when
 * the organization has no brand yet, so Configuración → Marca already shows
 * it and the color is not read again on every visit. Never over a brand the
 * owner chose, and never for someone who cannot edit the business.
 */
export function logoBrandToSave(input: {
  profile: WorkspaceProfile | null;
  logoColor: string | null | undefined;
  canManage: boolean;
}): { primary: string; accent: string } | null {
  if (!input.canManage || !input.profile || input.profile.brand) return null;
  const color = input.logoColor;
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  return { primary: color.toLowerCase(), accent: color.toLowerCase() };
}
