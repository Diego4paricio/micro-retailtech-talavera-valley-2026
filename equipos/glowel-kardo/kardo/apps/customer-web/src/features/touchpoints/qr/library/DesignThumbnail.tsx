import type { QrDesign } from "@kardo/contracts";
import { stableKey } from "../studio/history.js";
import { buildDesign, svgDataUrl, useIdleValue } from "../studio/hooks.js";
import { useLogoRaster } from "../studio/useLogoRaster.js";

/**
 * A real, small render of a design (engine + its logo), built once the
 * browser is idle. Decorative: the surrounding control carries the name.
 */
export function DesignThumbnail({
  design,
  url,
  nombre,
  workspaceId,
  brandAssetId,
  className,
}: {
  design: QrDesign;
  url: string;
  nombre: string;
  workspaceId: string;
  brandAssetId: string | null | undefined;
  className?: string | undefined;
}) {
  const logo = useLogoRaster({
    workspaceId,
    logo: design.logo,
    brandAssetId,
    revision: 0,
  });
  const raster = logo.raster;
  const src = useIdleValue(
    () => {
      const result = buildDesign({ url, design, logo: raster, nombre });
      return result.ok ? svgDataUrl(result.svg) : "";
    },
    `${stableKey(design)}:${raster?.href.length ?? 0}:${url}:${nombre}`,
  );
  return (
    <span
      aria-hidden="true"
      className={className ? `qrs-thumb ${className}` : "qrs-thumb"}
    >
      {src ? <img alt="" src={src} /> : null}
    </span>
  );
}
