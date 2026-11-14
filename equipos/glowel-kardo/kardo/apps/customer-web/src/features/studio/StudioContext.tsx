import type {
  Asset,
  DesignableExperienceType,
  DesignBlockKind,
  DesignItemPhoto,
  ExperienceContent,
  PageDesign,
  SectionLayout,
} from "@kardo/contracts";
import { createContext, useContext } from "react";
import type { Swatch } from "../../components/controls/index.js";
import type { Route } from "../../lib/router.js";
import type { AiApplyNotice } from "./ai/apply-design.js";
import type { AiWaiting } from "./ai/use-ai-waiting.js";
import type { BlockTarget } from "./model/operations.js";
import type { StudioTemplate } from "./model/templates.js";
import type { StudioIssue } from "./model/validate.js";
import type { PublishBadge } from "./stage/publish-status.js";

export type Selection =
  | { kind: "section"; id: string }
  | { kind: "block"; id: string }
  /** Several items of one canvas section (shift-click or marquee). */
  | { kind: "blocks"; ids: string[] }
  | null;

export const railSectionIds = [
  "content",
  "templates",
  "add",
  "layers",
  "style",
  "background",
  "ai",
] as const;
export type RailSection = (typeof railSectionIds)[number];

export type DesignChange = (
  recipe: (design: PageDesign) => PageDesign,
  /** Updates sharing a key coalesce into one undo step (sliders, typing). */
  key?: string,
) => void;

/** Edits the Experience's content (titles, links, dishes, products…) from
 * inside the Estudio; shares the undo history and Guardar with the design. */
export type ContentChange = (
  recipe: (content: ExperienceContent) => ExperienceContent,
  key?: string,
) => void;

export type StudioActions = {
  addBlock: (kind: DesignBlockKind, target?: BlockTarget) => void;
  /** "Redes en círculo" (addendum: forma): WhatsApp, Instagram, TikTok and
   * Facebook, already in círculo look, inserted together as one row. */
  addBrandCircleRow: (target?: BlockTarget) => void;
  addSection: (layout: SectionLayout, index?: number) => void;
  removeBlock: (blockId: string) => void;
  duplicateBlock: (blockId: string) => void;
  moveBlockStep: (blockId: string, direction: -1 | 1) => void;
  moveBlockToSection: (blockId: string, sectionId: string) => void;
  removeSection: (sectionId: string) => void;
  duplicateSection: (sectionId: string) => void;
  moveSectionStep: (sectionId: string, direction: -1 | 1) => void;
  applyTemplate: (template: StudioTemplate) => void;
  restoreCurrentLook: () => void;
};

export type StudioContextValue = {
  type: DesignableExperienceType;
  /** Saves what is unsaved before the AI reads the page (it designs with
   * the saved content). Resolves `true` when there is nothing left unsaved. */
  ensureSaved: () => Promise<boolean>;
  design: PageDesign;
  change: DesignChange;
  readOnly: boolean;
  content: ExperienceContent;
  /** Edits the content in place (the "Contenido" rail and inline text). */
  changeContent: ContentChange;
  /** Content fields that need fixing before saving, keyed like
   * `validateContent` (features/experiences/content.ts). */
  contentErrors: Readonly<Record<string, string>>;
  contentIds: readonly string[];
  /** Where the content (links, socials, names) is edited. */
  contentRoute: Route;
  /** Owner or Admin: may add or change `html` blocks (same permission as
   * the modo HTML, `experiences.custom_html`). */
  canEditHtml: boolean;
  selection: Selection;
  select: (selection: Selection) => void;
  /** Validation issues of the current design. */
  issues: readonly StudioIssue[];
  workspaceId: string;
  /** The Experience being designed (the AI-in-blocks endpoints need it). */
  experienceId: string;
  assets: readonly Asset[];
  addAsset: (asset: Asset) => void;
  canUploadAssets: boolean;
  swatches: readonly Swatch[];
  templates: readonly StudioTemplate[];
  actions: StudioActions;
  openRail: (section: RailSection) => void;
  /** Opens Contenido on one field (a key of `contentErrors`); the panel
   * scrolls to it and focuses it when `contentFocus.at` changes. */
  focusContent: (field: string) => void;
  contentFocus: { field: string; at: number } | null;
  /** Starts writing on the page itself on a text block (título, texto,
   * botones) or a bound block's text (título de la página, nombre). */
  editOnPage: (blockId: string) => void;
  /** What the AI has for the owner outside the "IA" rail: running, ideas
   * or a design not used yet (relevo 31, finding 2). The rail flags it. */
  aiWaiting: NonNullable<AiWaiting>["status"] | null;
  /** The "IA" rail reports what it shows, so closing it can ask first and
   * the Estudio can tell when a design is ready (`use-ai-waiting.ts`). */
  reportAi: (waiting: AiWaiting) => void;
  /** Whether the page already has a saved design to tweak (B3e): with one,
   * the IA rail opens on "¿Qué le cambio?" instead of the full brief. */
  hasSavedDesign: boolean;
  /** "¿Publicada o solo guardada?" (E6/B3d): the dot + word next to
   * Publicar; null hides it (nothing to compare the draft against yet, or
   * a publish already in flight or failed — its own notice says so). */
  publishBadge: PublishBadge | null;
  /** What "Usar este diseño" left behind this session (B3c/B3d): null once
   * nothing from the IA is pending, saved-but-unpublished, or stuck. */
  aiApply: AiApplyNotice | null;
  /** "Usar este diseño": applies it (one undoable change) and saves right
   * away, with `aiApply` tracking the save. */
  applyAiDesign: (result: {
    design: PageDesign;
    itemPhotos: readonly DesignItemPhoto[];
  }) => void;
  /** "Deshacer" on `aiApply`: restores the draft from right before the
   * last `applyAiDesign` and saves that too. */
  undoAiApply: () => void;
  /** "Reintentar" when the save after applying failed. */
  retryAiApplySave: () => void;
  /** "Publicar ahora" from the IA rail: the same Publicar the header button
   * uses (saves first if the draft is dirty), so it opens the one publish
   * flow the Estudio already has instead of a second one. */
  requestPublish: () => void;
};

/** The block ids a selection covers (none for a section). */
export function selectedBlockIds(selection: Selection): string[] {
  if (selection?.kind === "block") return [selection.id];
  if (selection?.kind === "blocks") return selection.ids;
  return [];
}

/** The one block selected, if exactly one is. */
export function singleBlockId(selection: Selection): string | null {
  if (selection?.kind === "block") return selection.id;
  if (selection?.kind === "blocks" && selection.ids.length === 1)
    return selection.ids[0] ?? null;
  return null;
}

export const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio must be used inside the Estudio.");
  return value;
}
