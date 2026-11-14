import type {
  Asset,
  QrDesign,
  QrTemplate,
  WorkspaceProfile,
} from "@kardo/contracts";
import { createContext, useContext } from "react";
import type { Resource } from "../../../../lib/use-resource.js";
import type { QrBuild } from "../engine/index.js";
import type { Swatch } from "./controls.js";
import type { StudioSectionId } from "./labels.js";
import type { LogoState } from "./useLogoRaster.js";

export type DesignChange = (
  recipe: (design: QrDesign) => QrDesign,
  /** Updates sharing a key coalesce into one undo step (drags, typing). */
  key?: string,
) => void;

export type LogoTools = {
  state: LogoState;
  retry: () => void;
  /** Rasterizes locally, uploads to the library and selects it. */
  upload: (file: File) => Promise<boolean>;
  isUploading: boolean;
  /** A v1 logo that only lived in this browser, offered for upload. */
  legacyHref: string | null;
  uploadLegacy: () => Promise<void>;
  dismissLegacy: () => void;
};

export type StudioContextValue = {
  design: QrDesign;
  change: DesignChange;
  readOnly: boolean;
  /** The latest successful build (its analysis drives many controls). */
  build: QrBuild | null;
  url: string;
  touchpointName: string;
  /** Suggested colors: dark ones for modules, light ones for backgrounds. */
  swatches: {
    ink: readonly Swatch[];
    background: readonly Swatch[];
    all: readonly Swatch[];
  };
  logo: LogoTools;
  assets: Resource<Asset[]>;
  profile: Resource<WorkspaceProfile>;
  templates: Resource<QrTemplate[]>;
  canManageTemplates: boolean;
  canUploadAssets: boolean;
  goToSection: (section: StudioSectionId) => void;
  /** Saves the current look as a new library design (Touchpoint editor). */
  openSaveTemplate: (() => void) | null;
  /**
   * How the "Biblioteca" tab applies a library design. In a Touchpoint it
   * links the design (by reference); in the library editor it is `null`.
   */
  library: LibraryBinding | null;
};

export type LibraryBinding = {
  /** The library design this Touchpoint follows now, if any. */
  currentTemplateId: string | null;
  use: (template: QrTemplate) => void;
};

export const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio must be used inside the Estudio QR.");
  return value;
}
