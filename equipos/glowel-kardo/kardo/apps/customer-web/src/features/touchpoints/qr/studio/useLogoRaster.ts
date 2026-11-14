import type { QrLogo } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { assetReadApi } from "../../../../api/qr-designs.js";
import { ApiRequestError, isAbortError } from "../../../../lib/api.js";
import { type LogoRaster, rasterizeLogo } from "../engine/index.js";
import { cacheLogo, readCachedLogo } from "./logo-cache.js";

export type LogoState =
  | { status: "none"; raster: null; assetId: null; message: null }
  | { status: "loading"; raster: null; assetId: string | null; message: null }
  | { status: "ready"; raster: LogoRaster; assetId: string; message: null }
  | {
      /** The design asks for a logo that cannot be shown right now. */
      status: "unavailable";
      raster: null;
      assetId: string | null;
      message: string;
    };

const none: LogoState = {
  status: "none",
  raster: null,
  assetId: null,
  message: null,
};

/** The library asset a logo points to (`undefined` while the profile loads). */
export function logoAssetId(
  logo: QrLogo | null,
  brandAssetId: string | null | undefined,
): string | null | undefined {
  if (!logo) return null;
  if (logo.source === "brand") return brandAssetId;
  return logo.assetId ?? null;
}

// One read per asset at a time, however many previews ask for it.
const inFlight = new Map<string, Promise<LogoRaster>>();

/**
 * Rasterizes a library image: the local cache first, then a short-lived
 * signed read. Throws `ApiRequestError`/`Error` when it cannot be read.
 */
export function loadLogoRaster(
  workspaceId: string,
  assetId: string,
): Promise<LogoRaster> {
  const cached = readCachedLogo(assetId);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(assetId);
  if (pending) return pending;
  const request = (async () => {
    const authorization = await assetReadApi.authorize(workspaceId, assetId);
    const response = await fetch(authorization.url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error(`read ${response.status}`);
    const raster = await rasterizeLogo(await response.blob());
    cacheLogo(assetId, raster);
    return raster;
  })().finally(() => inFlight.delete(assetId));
  inFlight.set(assetId, request);
  return request;
}

/**
 * Resolves the design's logo to a rasterized image. `brandAssetId` is
 * `undefined` while the organization profile loads and `null` when the
 * organization has no logo.
 */
export function useLogoRaster({
  workspaceId,
  logo,
  brandAssetId,
  revision,
}: {
  workspaceId: string;
  logo: QrLogo | null;
  brandAssetId: string | null | undefined;
  /** Bump to retry after a failure. */
  revision: number;
}): LogoState {
  const source = logo?.source ?? null;
  const resolved = logoAssetId(logo, brandAssetId);
  const assetId = resolved ?? null;
  const waitingForProfile = source === "brand" && resolved === undefined;

  const [state, setState] = useState<LogoState>(none);

  useEffect(() => {
    void revision; // A new revision retries with the same inputs.
    if (!source) {
      setState(none);
      return;
    }
    if (waitingForProfile) {
      setState({
        status: "loading",
        raster: null,
        assetId: null,
        message: null,
      });
      return;
    }
    if (!assetId) {
      setState({
        status: "unavailable",
        raster: null,
        assetId: null,
        message:
          source === "brand"
            ? "Tu organización todavía no tiene logo. Agrégalo en Configuración, sección Marca, o elige una imagen de la biblioteca."
            : "Elige una imagen de la biblioteca o sube una nueva.",
      });
      return;
    }
    const cached = readCachedLogo(assetId);
    if (cached) {
      setState({ status: "ready", raster: cached, assetId, message: null });
      return;
    }

    let cancelled = false;
    setState({ status: "loading", raster: null, assetId, message: null });
    loadLogoRaster(workspaceId, assetId)
      .then((raster) => {
        if (!cancelled)
          setState({ status: "ready", raster, assetId, message: null });
      })
      .catch((error: unknown) => {
        if (cancelled || isAbortError(error)) return;
        setState({
          status: "unavailable",
          raster: null,
          assetId,
          message: unavailableMessage(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [source, assetId, waitingForProfile, workspaceId, revision]);

  return state;
}

function unavailableMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 503)
      return "Las imágenes de la biblioteca no se pueden leer en este momento. Sube el logo desde aquí (queda guardado en este navegador) o elige otra imagen.";
    if (error.status === 404)
      return "Esa imagen ya no está en la biblioteca. Elige otra o sube una nueva.";
    return error.message;
  }
  return "No pudimos cargar el logo. Elige otra imagen o inténtalo de nuevo.";
}
