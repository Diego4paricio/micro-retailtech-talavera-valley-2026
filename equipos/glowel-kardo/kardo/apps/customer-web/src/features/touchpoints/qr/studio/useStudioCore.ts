import type { QrDesign } from "@kardo/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  acceptedAssetTypes,
  assetsApi,
  maxAssetBytes,
} from "../../../../api/assets.js";
import { qrTemplatesApi } from "../../../../api/qr-designs.js";
import { useToast } from "../../../../components/Toast.js";
import { ApiRequestError, errorMessage } from "../../../../lib/api.js";
import { useResource } from "../../../../lib/use-resource.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import { useWorkspaceProfile } from "../../../settings/use-workspace-profile.js";
import { rasterizeLogo } from "../engine/index.js";
import { qrBrandSwatches } from "../qr-design.js";
import type { Swatch } from "./controls.js";
import { svgDataUrl, useLegibility, useQrBuild } from "./hooks.js";
import { exportGate } from "./Legibility.js";
import { type StudioSectionId, warningSections } from "./labels.js";
import { cacheLogo, dataUrlToFile } from "./logo-cache.js";
import { type SectionFlags, sectionDomId } from "./PropertiesPanel.js";
import type { LogoTools } from "./StudioContext.js";
import { defaultLogoSettings } from "./sections/LogoSection.js";
import { useDesignHistory } from "./useDesignHistory.js";
import { useLogoRaster } from "./useLogoRaster.js";

/**
 * Everything both editors (a Touchpoint's design and a library design)
 * share: the design history, the organization data the panel needs, the
 * logo, the live build, legibility and the export gate, section navigation
 * and color suggestions.
 */
export function useStudioCore({
  initialDesign,
  url,
  nombre,
  legacyLogo,
}: {
  initialDesign: QrDesign;
  /** Address encoded in the preview (and verified). */
  url: string;
  /** Value of `{nombre}` in the frame text. */
  nombre: string;
  legacyLogo?: string | null | undefined;
}) {
  const { workspace, can } = useWorkspace();
  const { notify } = useToast();
  const canUploadAssets = can("assets.manage");

  const history = useDesignHistory(() => initialDesign);
  const design = history.value;

  const profile = useWorkspaceProfile();
  const assets = useResource(`assets:${workspace.id}`, (signal) =>
    assetsApi.list(workspace.id, signal),
  );
  const templates = useResource(`qr-templates:${workspace.id}`, (signal) =>
    qrTemplatesApi.list(workspace.id, signal),
  );

  // --- Logo ------------------------------------------------------------------
  const [logoRevision, setLogoRevision] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [legacyHref, setLegacyHref] = useState(legacyLogo ?? null);
  const brandAssetId =
    profile.data !== null
      ? (profile.data.logoAssetId ?? null)
      : profile.error
        ? null
        : undefined;
  const logoState = useLogoRaster({
    workspaceId: workspace.id,
    logo: design.logo,
    brandAssetId,
    revision: logoRevision,
  });

  const { setData: setAssets } = assets;
  const { update } = history;
  const uploadLogo = useCallback(
    async (file: File): Promise<boolean> => {
      if (
        !(acceptedAssetTypes as readonly string[]).includes(file.type) ||
        !file.type.startsWith("image/")
      ) {
        notify("Usa una imagen PNG, JPG o WebP.", "error");
        return false;
      }
      if (file.size > maxAssetBytes) {
        notify("La imagen pesa más de 5 MB. Usa una más ligera.", "error");
        return false;
      }
      setIsUploading(true);
      try {
        // Rasterized first: an unusable file fails here, before uploading.
        const raster = await rasterizeLogo(file);
        const asset = await assetsApi.upload(workspace.id, file);
        cacheLogo(asset.id, raster);
        setAssets((items) => [
          asset,
          ...(items ?? []).filter((item) => item.id !== asset.id),
        ]);
        update((current) => ({
          ...current,
          logo: {
            source: "asset",
            assetId: asset.id,
            size: current.logo?.size ?? defaultLogoSettings.size,
            plate: current.logo?.plate ?? defaultLogoSettings.plate,
            padding: current.logo?.padding ?? defaultLogoSettings.padding,
            plateColor:
              current.logo?.plateColor ?? defaultLogoSettings.plateColor,
          },
        }));
        notify(
          `«${asset.filename}» se subió a la biblioteca y ya está en tu QR.`,
        );
        return true;
      } catch (error) {
        notify(
          error instanceof ApiRequestError
            ? errorMessage(error)
            : "No pudimos usar esa imagen. Prueba con otro PNG, JPG o WebP.",
          "error",
        );
        return false;
      } finally {
        setIsUploading(false);
      }
    },
    [notify, setAssets, update, workspace.id],
  );

  const logoTools = useMemo<LogoTools>(
    () => ({
      state: logoState,
      retry: () => setLogoRevision((value) => value + 1),
      upload: uploadLogo,
      isUploading,
      legacyHref,
      uploadLegacy: async () => {
        if (!legacyHref) return;
        const uploaded = await uploadLogo(
          dataUrlToFile(legacyHref, "logo-qr.png"),
        );
        if (uploaded) setLegacyHref(null);
      },
      dismissLegacy: () => setLegacyHref(null),
    }),
    [logoState, uploadLogo, isUploading, legacyHref],
  );

  // --- Build + legibility ----------------------------------------------------
  const result = useQrBuild({ url, design, logo: logoState.raster, nombre });
  const build = result.ok ? result.build : null;
  const [lastBuild, setLastBuild] = useState(build);
  useEffect(() => {
    if (build) setLastBuild(build);
  }, [build]);
  const shownBuild = build ?? lastBuild;
  const svgUrl = useMemo(
    () => (result.ok ? svgDataUrl(result.svg) : null),
    [result],
  );
  const legibility = useLegibility(build?.scene ?? null, url);
  const gate = exportGate({
    buildError: result.ok ? null : result.error,
    analysis: build?.analysis ?? null,
    logo: logoState,
    legibility,
  });

  // --- Sections --------------------------------------------------------------
  const [section, setSection] = useState<StudioSectionId>("templates");
  // Phones start with every section closed, so all of them are in view.
  const [openSection, setOpenSection] = useState<StudioSectionId | "">("");
  const goToSection = useCallback((id: StudioSectionId) => {
    setSection(id);
    setOpenSection(id);
    window.requestAnimationFrame(() => {
      const element = document.getElementById(sectionDomId(id));
      element?.scrollIntoView({ block: "start", behavior: "smooth" });
      element?.querySelector<HTMLElement>("h2[tabindex]")?.focus({
        preventScroll: true,
      });
    });
  }, []);
  const flags = useMemo(() => {
    const result: SectionFlags = {};
    for (const warning of shownBuild?.analysis.warnings ?? []) {
      if (warning.level === "info") continue;
      const id = warningSections[warning.code];
      if (result[id] !== "error") result[id] = warning.level;
    }
    if (logoState.status === "unavailable") result.logo = "error";
    return result;
  }, [shownBuild, logoState.status]);

  // --- Swatches --------------------------------------------------------------
  const swatches = useMemo(() => {
    const brand = profile.data?.brand;
    const own: Swatch[] = brand
      ? [
          { name: "Primario de tu marca", color: brand.primary },
          { name: "Acento de tu marca", color: brand.accent },
        ]
      : [];
    const unique = (list: readonly Swatch[]) => {
      const seen = new Set<string>();
      return list.filter((swatch) => {
        const key = swatch.color.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const of = (kind: "ink" | "background") =>
      qrBrandSwatches
        .filter((swatch) => swatch.kind === kind)
        .map(({ name, color }) => ({ name, color }));
    return {
      ink: unique([...own, ...of("ink")]),
      background: unique([...of("background"), ...own]),
      all: unique([...own, ...of("ink"), ...of("background")]),
    };
  }, [profile.data]);

  return {
    history,
    design,
    profile,
    assets,
    templates,
    brandAssetId,
    logoState,
    logoTools,
    canUploadAssets,
    result,
    build,
    shownBuild,
    lastBuild,
    svgUrl,
    legibility,
    gate,
    section,
    setSection,
    openSection,
    setOpenSection,
    goToSection,
    flags,
    swatches,
    url,
    nombre,
  };
}

export type StudioCore = ReturnType<typeof useStudioCore>;
