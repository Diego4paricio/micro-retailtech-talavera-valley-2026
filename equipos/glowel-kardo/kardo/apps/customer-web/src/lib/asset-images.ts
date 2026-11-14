import { type Asset, isImageMediaType } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { assetReadApi } from "../api/assets.js";
import { isDemoMode } from "./demo.js";

/**
 * Reads a private library image the same way everywhere it appears outside
 * Assets (an Experience's theme background, a Perfil/Página de Link avatar, a
 * Menú/Catálogo item photo, an Imagen Experience's picture, the Estudio QR
 * logo): a short-lived signed URL (`assetReadApi.authorize`), fetched without
 * credentials, turned into a local `blob:` URL (the page's CSP allows
 * same-origin, data: and blob: images — see vite.config.ts).
 *
 * `"thumb"` scales the shorter edge down to ~160px (a chip, an avatar, a menu
 * row); `"full"` scales the longer edge down to ~1600px (a background, the
 * Imagen Experience's picture). Reads are deduplicated per asset+size, capped
 * at a few concurrent fetches, cached with an LRU eviction that revokes the
 * blob URL it drops, and retried: a freshly uploaded asset may still be
 * finalizing (not yet `validated`), so a handful of quick retries (roughly
 * 1s, 2s, 4s) run before a longer cool-down between attempts. Demo mode has
 * no readable library, so it never asks — placeholders stay in place there.
 */

export type AssetImageSize = "thumb" | "full";

const THUMB_EDGE = 160;
const FULL_EDGE = 1_600;
const QUICK_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const LONG_RETRY_AFTER_MS = 60_000;
const MAX_CONCURRENT = 3;
const MAX_CACHED = 300;

const ready = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();
const failedAt = new Map<string, number>();
const retrySubscribers = new Map<string, Set<() => void>>();
const waiting: (() => void)[] = [];
let active = 0;

function cacheKey(assetId: string, size: AssetImageSize): string {
  return `${assetId}:${size}`;
}

/** The cached `blob:` URL for this asset, if one is already in memory. */
export function cachedAssetImage(
  assetId: string,
  size: AssetImageSize = "thumb",
): string | null {
  return ready.get(cacheKey(assetId, size)) ?? null;
}

/**
 * Resolves to a local `blob:` URL for the asset, reusing the cache and any
 * in-flight read for the same asset+size. Rejects (after the quick retries)
 * when the image cannot be read right now; a later call retries once the
 * cool-down has passed.
 */
export function loadAssetImage(
  workspaceId: string,
  assetId: string,
  size: AssetImageSize = "thumb",
): Promise<string> {
  const key = cacheKey(assetId, size);
  const cached = ready.get(key);
  if (cached) return Promise.resolve(cached);
  if (isDemoMode)
    return Promise.reject(new Error("La biblioteca no se lee en el demo."));
  const lastFailure = failedAt.get(key);
  if (
    lastFailure !== undefined &&
    Date.now() - lastFailure < LONG_RETRY_AFTER_MS
  )
    return Promise.reject(new Error("Imagen no disponible por ahora."));
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = attemptWithRetries(workspaceId, assetId, size)
    .then((url) => {
      remember(key, url);
      failedAt.delete(key);
      return url;
    })
    .catch((error: unknown) => {
      failedAt.set(key, Date.now());
      throw error;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/**
 * Clears any cool-down for this asset (every size) and wakes every mounted
 * `useAssetImage` currently watching it, so a page that learns — from a
 * refreshed asset list — that a previously unreadable asset is now
 * `validated` doesn't have to wait out the long cool-down to try again.
 */
export function markAssetValidated(assetId: string): void {
  for (const size of ["thumb", "full"] as const) {
    const key = cacheKey(assetId, size);
    failedAt.delete(key);
    for (const wake of retrySubscribers.get(key) ?? []) wake();
  }
}

/** Convenience for a freshly (re)loaded asset list: marks every `validated` row. */
export function notifyValidatedAssets(
  assets: readonly Pick<Asset, "id" | "status">[],
): void {
  for (const asset of assets)
    if (asset.status === "validated") markAssetValidated(asset.id);
}

export type AssetImageState = {
  url: string | null;
  status: "idle" | "loading" | "ready" | "error";
};

/**
 * The library image as a `blob:` URL, loading it (and retrying) as needed.
 * Re-requests when `workspaceId`, `assetId` or `size` changes, and whenever
 * `markAssetValidated`/`notifyValidatedAssets` reports this asset is ready.
 */
export function useAssetImage(
  workspaceId: string,
  assetId: string | undefined,
  size: AssetImageSize = "thumb",
): AssetImageState {
  const [state, setState] = useState<AssetImageState>(() =>
    initialState(assetId, size),
  );

  useEffect(() => {
    if (!assetId) {
      setState({ url: null, status: "idle" });
      return;
    }
    const cached = cachedAssetImage(assetId, size);
    if (cached) {
      setState({ url: cached, status: "ready" });
      return;
    }
    let cancelled = false;
    const key = cacheKey(assetId, size);
    const attempt = () => {
      if (cancelled) return;
      setState({ url: null, status: "loading" });
      loadAssetImage(workspaceId, assetId, size)
        .then((url) => {
          if (!cancelled) setState({ url, status: "ready" });
        })
        .catch(() => {
          if (!cancelled) setState({ url: null, status: "error" });
        });
    };
    let subscribers = retrySubscribers.get(key);
    if (!subscribers) {
      subscribers = new Set();
      retrySubscribers.set(key, subscribers);
    }
    subscribers.add(attempt);
    attempt();
    return () => {
      cancelled = true;
      const set = retrySubscribers.get(key);
      if (!set) return;
      set.delete(attempt);
      if (set.size === 0) retrySubscribers.delete(key);
    };
  }, [workspaceId, assetId, size]);

  return state;
}

function initialState(
  assetId: string | undefined,
  size: AssetImageSize,
): AssetImageState {
  if (!assetId) return { url: null, status: "idle" };
  const cached = cachedAssetImage(assetId, size);
  return cached
    ? { url: cached, status: "ready" }
    : { url: null, status: "loading" };
}

async function attemptWithRetries(
  workspaceId: string,
  assetId: string,
  size: AssetImageSize,
): Promise<string> {
  let lastError: unknown;
  for (let attemptIndex = 0; ; attemptIndex++) {
    try {
      return await limited(() => read(workspaceId, assetId, size));
    } catch (error) {
      lastError = error;
      const delayMs = QUICK_RETRY_DELAYS_MS[attemptIndex];
      if (delayMs === undefined) break;
      await sleep(delayMs);
    }
  }
  throw lastError;
}

async function read(
  workspaceId: string,
  assetId: string,
  size: AssetImageSize,
): Promise<string> {
  const authorization = await assetReadApi.authorize(workspaceId, assetId);
  const response = await fetch(authorization.url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`read ${response.status}`);
  const blob = await response.blob();
  if (!isImageMediaType(blob.type || authorization.mediaType))
    throw new Error("not an image");
  return URL.createObjectURL(await resize(blob, size));
}

/**
 * Scales the blob down for its size ("thumb": shorter edge to THUMB_EDGE;
 * "full": longer edge to FULL_EDGE), never up; the original on any failure.
 */
async function resize(blob: Blob, size: AssetImageSize): Promise<Blob> {
  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  )
    return blob;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const edge =
      size === "thumb"
        ? Math.min(bitmap.width, bitmap.height)
        : Math.max(bitmap.width, bitmap.height);
    const target = size === "thumb" ? THUMB_EDGE : FULL_EDGE;
    const scale = target / edge;
    if (!Number.isFinite(scale) || scale >= 1) return blob;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const small = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    return small ?? blob;
  } catch {
    return blob;
  } finally {
    bitmap?.close();
  }
}

function remember(key: string, url: string): void {
  ready.delete(key);
  ready.set(key, url);
  while (ready.size > MAX_CACHED) {
    const oldest = ready.keys().next().value;
    if (oldest === undefined) break;
    const oldUrl = ready.get(oldest);
    ready.delete(oldest);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
  }
}

function limited<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          waiting.shift()?.();
        });
    };
    if (active < MAX_CONCURRENT) run();
    else waiting.push(run);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
