import {
  type Active,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  type Over,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  type Asset,
  type CustomHtml,
  type DesignableExperienceType,
  type DesignBlockKind,
  type DesignItemPhoto,
  designBlocks,
  designHtmlAssetRefs,
  designHtmlBlocks,
  designImageRefs,
  type ExperienceContent,
  isCanvasSection,
  type PageDesign,
  type SectionLayout,
  supportsCustomHtml,
} from "@kardo/contracts";
import {
  type ComponentType,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { designAiSessionApi } from "../../api/design-ai.js";
import type { Swatch } from "../../components/controls/index.js";
import { Dialog } from "../../components/Dialog.js";
import { Icon, type IconName } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { formatRelative } from "../../lib/format.js";
import { stableKey } from "../../lib/history.js";
import type { Route } from "../../lib/router.js";
import { useDesignHistory } from "../../lib/use-design-history.js";
import { useMediaQuery } from "../../lib/use-media-query.js";
import {
  useStudioShortcuts,
  useUnsavedGuard,
} from "../../lib/use-studio-effects.js";
import { useTick } from "../../lib/use-tick.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { validateContent } from "../experiences/content.js";
import { useWorkspaceProfile } from "../settings/use-workspace-profile.js";
import {
  aiApplyNoticeOf,
  aiApplyReducer,
  aiApplyUndoTarget,
  applyAiResult,
  idleAiApply,
} from "./ai/apply-design.js";
import { useAiSessionOpener } from "./ai/use-ai-session-opener.js";
import { useAiWaiting } from "./ai/use-ai-waiting.js";
import {
  type DragData,
  type DropData,
  studioAnnouncements,
  studioCollisions,
  studioScreenReaderInstructions,
} from "./dnd.js";
import {
  initialGeneratedBaseline,
  useBlocksHtmlSync,
} from "./html/blocks-sync.js";
import { prepareSource, renderSourceDocument } from "./html/engine.js";
import { designToCustomCode } from "./html/from-design.js";
import {
  canSaveCustomHtml,
  customHtmlChanged,
  emptyCustomHtml,
  isCustomHtmlBlank,
  prepareCustomHtml,
  type StudioMode,
  validateCustomHtml,
} from "./html/model.js";
import { customCodeToDesign, type SyncPlan } from "./html/to-design.js";
import {
  htmlBlockBlocker,
  type UseAsBlockResult,
} from "./html/use-as-block.js";
import {
  type FidelityGateResult,
  useFidelityGate,
} from "./html/use-fidelity-gate.js";
import { Inspector } from "./inspector/Inspector.js";
import {
  blockKindIcon,
  blockKindLabel,
  createBlock,
  createBrandCircleRow,
} from "./model/blocks.js";
import {
  isWhatsAppButton,
  templateWhatsAppOutcome,
} from "./model/business-contact.js";
import {
  addBrandCircleRowToCanvas,
  canvasItemOf,
  copyCanvasItems,
  duplicateCanvasItems,
  pasteCanvasItems,
  removeCanvasItems,
} from "./model/canvas.js";
import {
  contentFeaturableItemIds,
  contentItemIds,
  contentMenuSectionIds,
  contentTitle,
  toDesignableContent,
} from "./model/content.js";
import { designFromContent } from "./model/from-content.js";
import { idFactoryFor } from "./model/ids.js";
import {
  addBlockBlocker,
  addSectionBlocker,
  columnFull,
  designCounts,
  duplicateBlockBlocker,
  duplicateSectionBlocker,
  moveToSectionBlocker,
  removeBlockBlocker,
  removeSectionBlocker,
  saveHtmlBlocksBlocker,
} from "./model/limits.js";
import {
  addSection,
  type BlockTarget,
  createSection,
  duplicateBlock,
  duplicateSection,
  findFlowSection,
  findSection,
  insertBlock,
  locateBlock,
  moveBlock,
  moveBlockStep,
  moveBlockToSection,
  moveSection,
  removeBlock,
  removeSection,
  sectionIndexOf,
  targetNextTo,
} from "./model/operations.js";
import { withOrganizationBrand } from "./model/organization-brand.js";
import { prepareDesign } from "./model/prepare.js";
import { pruneEmptyItems } from "./model/prune-items.js";
import {
  adaptTemplateDesign,
  type StudioTemplate,
  studioTemplatesFor,
} from "./model/templates.js";
import { type StudioIssue, validateDesign } from "./model/validate.js";
import { AddBlockPanel } from "./panels/AddBlockPanel.js";
import {
  type LayersDrop,
  LayersDropContext,
  LayersPanel,
} from "./panels/LayersPanel.js";
import { BackgroundPanel, StylePanel } from "./panels/StylePanels.js";
import { TemplatesPanel } from "./panels/TemplatesPanel.js";
import { useHtmlBlockRenderer } from "./preview/html-blocks.js";
import { contentImageRefs, useDesignImages } from "./preview/images.js";
import { renderPreviewDocument } from "./preview/renderer.js";
import {
  type ContentChange,
  type DesignChange,
  type RailSection,
  type Selection,
  type StudioActions,
  StudioContext,
  type StudioContextValue,
  selectedBlockIds,
  singleBlockId,
  useStudio,
} from "./StudioContext.js";
import { CanvasOverlay } from "./stage/CanvasOverlay.js";
import { itemForBlock } from "./stage/canvas-geometry.js";
import { isTyping, useCanvasKeyboard } from "./stage/canvas-keyboard.js";
import {
  canvasPointFromClient,
  previewDocument,
} from "./stage/canvas-measure.js";
import { copiedItems, copyItems } from "./stage/clipboard.js";
import { screenTone } from "./stage/DeviceFrame.js";
import { writesOnPage } from "./stage/inline-edit.js";
import {
  type PublishStatusInput,
  publishStatusOf,
} from "./stage/publish-status.js";
import {
  type DropLine,
  Stage,
  type StageApi,
  type Zoom,
} from "./stage/Stage.js";
import { StudioBar, type StudioBarLink } from "./stage/StudioBar.js";
import { railInfo, StudioRail } from "./stage/StudioRail.js";
import { pruneSelection, selectionOf, stepBlock } from "./stage/selection.js";
import { useInlineEditing } from "./stage/useInlineEditing.js";
import {
  type DesktopWidth,
  type Device,
  isDesktopWidth,
  isDevice,
  readPreference,
  writePreference,
} from "./stage/viewports.js";
import { clearStudioRail, readStudioRail } from "./studio-entry-rail.js";
import { useOrganizationBrand } from "./use-organization-brand.js";

// The modo HTML (and its code editor) loads only when it is opened.
const HtmlStudio = lazy(() => import("./html/HtmlStudio.js"));

// Contenido and IA come from their own modules (the content editors of
// every type, the AI flow), loaded when their panel first opens.
const contentPanels = import.meta.glob<{ ContentPanel?: ComponentType }>(
  "./panels/ContentPanel.tsx",
);
const aiPanels = import.meta.glob<{ BlocksAiPanel?: ComponentType }>(
  "./ai/BlocksAiPanel.tsx",
);
const ContentPanel = lazy(async () => {
  const load = Object.values(contentPanels)[0];
  const module = load ? await load() : null;
  return { default: module?.ContentPanel ?? PanelComingSoon };
});
const BlocksAiPanel = lazy(async () => {
  const load = Object.values(aiPanels)[0];
  const module = load ? await load() : null;
  return { default: module?.BlocksAiPanel ?? PanelComingSoon };
});

function PanelComingSoon() {
  return (
    <p className="es-panel-empty">
      Este panel se está preparando. Mientras tanto, usa las otras herramientas.
    </p>
  );
}

/** What Guardar writes: only the parts that changed. */
export type StudioSaveChanges = {
  design?: PageDesign | undefined;
  customHtml?: CustomHtml | undefined;
  /** The content as edited in the Estudio (without `design` or
   * `customHtml`, which travel on their own). */
  content?: ExperienceContent | undefined;
};

export type StudioHost = {
  type: DesignableExperienceType;
  /** The Experience being designed (the AI endpoint needs it). */
  experienceId: string;
  /** Header: what is being designed and where "Volver" goes. */
  kicker: string;
  title: string;
  back: { to: Route; label: string };
  /** The Experience's other views, next to Guardar (Destinos, Historial). */
  links?: readonly StudioBarLink[] | undefined;
  /** Where links, names and socials are edited outside the Estudio. */
  contentRoute: Route;
  /** The content the Estudio opens with; it is edited in the Estudio too
   * (Contenido and the texts on the page) and saved with the design. */
  content: ExperienceContent;
  /** The design the Estudio opens with. */
  initialDesign: PageDesign;
  /** The saved design; `null` when this design was never saved. */
  savedDesign: PageDesign | null;
  /**
   * The opening design is unsaved work (a template or the current look
   * chosen on the start screen). Defaults to `savedDesign === null`.
   */
  designPending?: boolean | undefined;
  /** The saved modo HTML source (`content.customHtml`), if any. */
  savedCustomHtml: CustomHtml | null;
  /** Where the Estudio opens: blocks (default) or HTML. */
  initialMode?: StudioMode | undefined;
  savedAt: string | null;
  readOnly: boolean;
  readOnlyReason: string | null;
  canPublish: boolean;
  isPublishing: boolean;
  /** "¿Publicada o solo guardada?" (relevo 37, E6/B3d): what the dot + word
   * next to Publicar needs, straight from the Experience's or Link's own
   * summary (`publicationStatus`, `hasUnpublishedChanges`,
   * `liveTouchpointCount`). */
  publication: PublishStatusInput;
  assets: readonly Asset[];
  addAsset: (asset: Asset) => void;
  /** Persists what changed (one request); notifies the person itself. */
  onSave: (changes: StudioSaveChanges) => Promise<boolean>;
  /** Runs once everything is saved. */
  onPublish: () => void;
  /** Extra notices under the bar (e.g. a failed publication). */
  notices?: ReactNode | undefined;
};

type LayoutMode = "wide" | "medium" | "compact" | "phone";

/** Rail, panel, stage and inspector side by side from 980 px; below, the
 * panel and the inspector open over the stage; phones get sheets. */
export function layoutFor(width: number, phone: boolean): LayoutMode {
  if (phone) return "phone";
  if (width >= 1240) return "wide";
  if (width >= 980) return "medium";
  return "compact";
}

/** The content without the parts that travel on their own. */
function contentBody(content: ExperienceContent): ExperienceContent {
  const {
    design: _design,
    customHtml: _customHtml,
    ...rest
  } = content as ExperienceContent & {
    design?: unknown;
    customHtml?: unknown;
  };
  return rest as ExperienceContent;
}

type Draft = { design: PageDesign; content: ExperienceContent };

function clientPoint(event: Event | null): { x: number; y: number } | null {
  if (!event) return null;
  if ("clientX" in event && typeof event.clientX === "number")
    return { x: event.clientX, y: (event as MouseEvent).clientY };
  const touch = (event as TouchEvent).touches?.[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

function center(rect: { top: number; height: number } | null | undefined) {
  return rect ? rect.top + rect.height / 2 : 0;
}

/**
 * Estudio de Experiences, Canva style: the whole screen for one page. A
 * one-line header (history, save state, device and zoom, what publishes,
 * Guardar, Publicar); a rail with Contenido, Plantillas, Agregar, Capas,
 * Estilo, Fondo and IA; the live page in a faithful phone or browser
 * window, where blocks are selected, written on, moved, turned and
 * aligned; and the inspector of the selection. Content and design share
 * one undo history and one Guardar.
 */
export function DesignStudio({ host }: { host: StudioHost }) {
  const { workspace, can } = useWorkspace();
  const { notify } = useToast();
  const profile = useWorkspaceProfile();
  const organization = useOrganizationBrand();
  const { type, readOnly } = host;

  // --- Content and design: one draft, one history ------------------------
  const history = useDesignHistory<Draft>(() => ({
    design: host.initialDesign,
    content: contentBody(host.content),
  }));
  const { design, content } = history.value;
  const [baseline, setBaseline] = useState<PageDesign | null>(host.savedDesign);
  const [initialDesignKey] = useState(() => stableKey(host.initialDesign));
  const [contentBaseline, setContentBaseline] = useState(() =>
    stableKey(contentBody(host.content)),
  );
  const designPending = host.designPending ?? host.savedDesign === null;
  const { update } = history;

  const change = useCallback<DesignChange>(
    (recipe, key) =>
      update((draft) => {
        const next = recipe(draft.design);
        return next === draft.design ? draft : { ...draft, design: next };
      }, key && `design:${key}`),
    [update],
  );
  const changeContent = useCallback<ContentChange>(
    (recipe, key) =>
      update((draft) => {
        const next = recipe(draft.content);
        return next === draft.content ? draft : { ...draft, content: next };
      }, key && `content:${key}`),
    [update],
  );

  // --- Modo HTML: its own source and history, next to the design ----------
  const htmlHistory = useDesignHistory<CustomHtml>(
    () => host.savedCustomHtml ?? emptyCustomHtml(),
  );
  // What the page publishes (Bloques or HTML) is a decision of the page, not
  // an edit of the code: it lives outside the editor's undo history, so ⌘Z
  // in the code never flips what customers see (domain audit A2-40).
  const [htmlActive, setHtmlActive] = useState(
    host.savedCustomHtml?.active ?? false,
  );
  const htmlValue = htmlHistory.value;
  const customHtml = useMemo<CustomHtml>(
    () => ({ ...htmlValue, active: htmlActive }),
    [htmlValue, htmlActive],
  );
  const [htmlBaseline, setHtmlBaseline] = useState<CustomHtml | null>(
    host.savedCustomHtml,
  );
  // Only links, profile and linkpage carry a full-page modo HTML
  // (`content.customHtml`); the other types design with blocks, `html`
  // blocks included.
  const htmlMode = supportsCustomHtml(type);
  const [studioMode, setStudioMode] = useState<StudioMode>(
    htmlMode ? (host.initialMode ?? "blocks") : "blocks",
  );
  // Mounted on first use, then kept (hidden) so its state survives switching.
  const [htmlMounted, setHtmlMounted] = useState(studioMode === "html");
  const [htmlFocus, setHtmlFocus] = useState<{
    area: "code" | "concept";
    at: number;
  } | null>(null);
  const canEditCustomHtml = !readOnly && can("experiences.custom_html");

  // --- Bloques ↔ HTML sync (html/blocks-sync.ts) ---------------------------
  const {
    syncHtmlOnEnter,
    generateHtmlFromBlocks,
    keepCurrentHtml,
    blocksChangedSinceEdit,
  } = useBlocksHtmlSync({
    type,
    content,
    design,
    customHtml,
    htmlHistory,
    notify,
    initial: () =>
      initialGeneratedBaseline({
        htmlMode,
        type,
        content: contentBody(host.content),
        design: host.savedDesign ?? host.initialDesign,
        savedCustomHtml: host.savedCustomHtml,
      }),
  });
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null);

  // Only when the Estudio opens straight into modo HTML (a deep link); the
  // ordinary path (clicking "HTML") runs the same check from `changeMode`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: first render only
  useEffect(() => {
    if (htmlMode && studioMode === "html") syncHtmlOnEnter();
  }, []);

  /** "Llevar a bloques" (the HTML → Bloques dialog): applies the plan's
   * design as one undoable step of the blocks history and switches to
   * Bloques. Only reachable once the fidelity gate finds nothing wrong
   * (`SyncPlanDialog`'s own `canApply`). */
  const applySyncPlan = useCallback(() => {
    if (!syncPlan) return;
    change(() => syncPlan.design, "html-to-blocks");
    notify("Listo: llevamos tus cambios de HTML a bloques.", "success", {
      action: { label: "Deshacer", onClick: history.undo },
      duration: 8_000,
    });
    setSyncPlan(null);
    setStudioMode("blocks");
  }, [syncPlan, change, notify, history.undo]);

  /** "Seguir en HTML": closes the dialog without switching modes. */
  const keepInHtml = useCallback(() => setSyncPlan(null), []);

  /** "Ver bloques sin llevar cambios": switches to Bloques but never applies
   * the plan — the design stays exactly as it was last saved/edited there. */
  const viewBlocksWithoutApplying = useCallback(() => {
    setSyncPlan(null);
    setStudioMode("blocks");
  }, []);

  // What the page shows (blocks or the HTML) is a decision of the page, not
  // of the editor: the header control and the notices all change it here.
  const setPublishedHtml = useCallback(
    (active: boolean) => {
      setHtmlActive(active);
      notify(
        active
          ? "Tu página mostrará tu HTML cuando publiques."
          : "Tu página mostrará el diseño de bloques cuando publiques.",
        "info",
      );
    },
    [notify],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  // Primeros pasos may ask for one rail ("Pídeselo a la IA"): it opens with
  // its panel, also on a phone.
  const [entryRail] = useState(() => readStudioRail(host.experienceId));
  useEffect(() => {
    if (entryRail) clearStudioRail(host.experienceId);
  }, [entryRail, host.experienceId]);
  const [rail, setRail] = useState<RailSection>(
    entryRail ?? (host.savedDesign ? "content" : "templates"),
  );
  const [panelOpen, setPanelOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [contentFocus, setContentFocus] = useState<{
    field: string;
    at: number;
  } | null>(null);
  // How the preview is shown is a per-person convenience kept in this
  // browser: the device, the computer width and the phone docked right.
  const [device, setDeviceState] = useState<Device>(() =>
    readPreference("kardo.estudio.device", "phone", isDevice),
  );
  const [desktopWidth, setDesktopWidthState] = useState<DesktopWidth>(() =>
    readPreference("kardo.estudio.desktopWidth", 1280, isDesktopWidth),
  );
  const setDesktopWidth = useCallback((next: DesktopWidth) => {
    setDesktopWidthState(next);
    writePreference("kardo.estudio.desktopWidth", next);
  }, []);
  const [phoneRight, setPhoneRightState] = useState<boolean>(() =>
    readPreference("kardo.estudio.phoneRight", false, isBoolean),
  );
  const setPhoneRight = useCallback((next: boolean) => {
    setPhoneRightState(next);
    writePreference("kardo.estudio.phoneRight", next);
  }, []);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fit, setFit] = useState(0.8);
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const phone = useMediaQuery("(max-width: 40rem)");
  const mode = layoutFor(width, phone);
  const stageApi = useRef<StageApi | null>(null);
  const stageFocus = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Panels fold on narrow screens; they open over the stage there.
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    if (mode === "compact" || mode === "phone") {
      setPanelOpen(false);
      setInspectorOpen(false);
    } else setPanelOpen(true);
  }, [mode]);
  // Only on the first render: the Estudio opens with its panel on wide
  // screens and without it on narrow ones.
  // biome-ignore lint/correctness/useExhaustiveDependencies: first render only
  useEffect(() => {
    if ((mode === "compact" || mode === "phone") && !entryRail)
      setPanelOpen(false);
  }, []);

  const setDevice = useCallback(
    (next: Device) => {
      setDeviceState(next);
      writePreference("kardo.estudio.device", next);
      // "Ambos" needs the room: the panel folds (the rail reopens it).
      if (next === "both" && (mode === "wide" || mode === "medium"))
        setPanelOpen(false);
    },
    [mode],
  );

  const contentIds = useMemo(() => contentItemIds(content), [content]);
  const menuSectionIds = useMemo(
    () => contentMenuSectionIds(content),
    [content],
  );
  const featurableItemIds = useMemo(
    () => contentFeaturableItemIds(type, content),
    [type, content],
  );
  const title = contentTitle(type, content);

  // --- "Llevar a bloques": the fidelity gate ------------------------------
  // The same document modo HTML's own preview renders, so the gate measures
  // against exactly what the person currently sees — only computed from
  // `customHtml` (cheap: a few KB of html/css), not the full page design.
  const htmlPrepared = useMemo(
    () => prepareSource({ html: customHtml.html, css: customHtml.css }),
    [customHtml.html, customHtml.css],
  );
  const htmlImages = useDesignImages(workspace.id, htmlPrepared.imageRefs);
  const lastGoodLiveHtml = useRef("");
  const liveHtml = useMemo(() => {
    try {
      lastGoodLiveHtml.current = renderSourceDocument(
        toDesignableContent(type, content),
        htmlPrepared,
        htmlImages.resolve,
        title,
      );
    } catch {
      // Keep the last document that rendered.
    }
    return lastGoodLiveHtml.current;
  }, [type, content, htmlPrepared, htmlImages.resolve, title]);
  const fidelity = useFidelityGate(
    syncPlan,
    design,
    type,
    liveHtml,
    htmlImages.resolve,
  );

  const designDirty =
    !readOnly &&
    (baseline === null
      ? designPending || stableKey(design) !== initialDesignKey
      : stableKey(design) !== stableKey(baseline));
  const contentDirty = !readOnly && stableKey(content) !== contentBaseline;
  const htmlDirty = !readOnly && customHtmlChanged(htmlBaseline, customHtml);
  const isDirty = designDirty || contentDirty || htmlDirty;
  const contentErrors = useMemo(
    () => validateContent(type, content),
    [type, content],
  );

  // --- Preview -----------------------------------------------------------
  const deferred = useDeferredValue(history.value);
  const designable = useMemo(
    () => toDesignableContent(type, deferred.content),
    [type, deferred.content],
  );
  const imageRefs = useMemo(
    () => [
      ...designImageRefs(deferred.design),
      ...designHtmlAssetRefs(deferred.design),
      ...contentImageRefs(designable),
    ],
    [deferred.design, designable],
  );
  const images = useDesignImages(workspace.id, imageRefs);
  const hasHtmlBlocks = useMemo(
    () => designHtmlBlocks(deferred.design).length > 0,
    [deferred.design],
  );
  const renderHtmlBlock = useHtmlBlockRenderer(hasHtmlBlocks, images.resolve);
  const lastGood = useRef<string | null>(null);
  const deferredTitle = contentTitle(type, deferred.content);
  const rendered = useMemo(() => {
    try {
      const html = renderPreviewDocument(
        designable,
        deferred.design,
        images.resolve,
        deferredTitle,
        { renderHtmlBlock },
      );
      lastGood.current = html;
      return { html, error: null };
    } catch {
      return {
        html: lastGood.current,
        error:
          "No pudimos dibujar el último cambio. Deshazlo o revisa el bloque.",
      };
    }
  }, [
    designable,
    deferred.design,
    images.resolve,
    deferredTitle,
    renderHtmlBlock,
  ]);
  const tone = useMemo(() => screenTone(deferred.design), [deferred.design]);

  const issues = useMemo(
    () =>
      validateDesign(
        type,
        prepareDesign(deferred.design),
        contentIds,
        menuSectionIds,
        featurableItemIds,
      ),
    [type, deferred.design, contentIds, menuSectionIds, featurableItemIds],
  );

  // --- Selection follows edits (a removed block drops out) ----------------
  useEffect(() => {
    setSelection((current) => pruneSelection(design, current));
  }, [design]);

  const select = useCallback(
    (next: Selection) => {
      setSelection(next);
      // On narrow screens the quick actions cover most edits; the
      // inspector opens from them ("Más opciones").
      if (!next && mode === "phone") setInspectorOpen(false);
    },
    [mode],
  );

  const openRail = useCallback(
    (section: RailSection) => {
      setRail(section);
      setPanelOpen(true);
      if (mode === "compact" || mode === "phone") setInspectorOpen(false);
    },
    [mode],
  );

  // A generation that ran while the owner was away (a reload, another tab)
  // waits in the "IA" rail: open it (relevo 29).
  useAiSessionOpener({
    workspaceId: workspace.id,
    experienceId: host.experienceId,
    enabled: !readOnly && studioMode === "blocks",
    onOpen: () => openRail("ai"),
  });

  // A design (or ideas) from the AI waiting outside the rail: closing the
  // rail asks first, and a notice stays until it is used or seen (relevo
  // 31, finding 2).
  const ai = useAiWaiting({
    workspaceId: workspace.id,
    experienceId: host.experienceId,
    railOpen: panelOpen && rail === "ai",
    enabled: !readOnly && studioMode === "blocks",
  });
  const [askAiClose, setAskAiClose] = useState(false);
  // The waiting design whose pill the owner closed; a new one shows again.
  const [hiddenWaiting, setHiddenWaiting] = useState<typeof ai.waiting>(null);
  const closePanel = useCallback(() => {
    if (rail === "ai" && ai.waiting?.status === "ready") setAskAiClose(true);
    else setPanelOpen(false);
  }, [rail, ai.waiting]);
  const focusContent = useCallback(
    (field: string) => {
      openRail("content");
      setContentFocus({ field, at: Date.now() });
    },
    [openRail],
  );

  // --- Swatches: the brand first, then the palette ----------------------
  const swatches = useMemo<Swatch[]>(() => {
    const brand = profile.data?.brand;
    const list: Swatch[] = [
      ...(brand
        ? [
            { name: "Primario de tu marca", color: brand.primary },
            { name: "Acento de tu marca", color: brand.accent },
          ]
        : []),
      { name: "Fondo", color: design.style.palette.background },
      { name: "Superficie", color: design.style.palette.surface },
      { name: "Texto", color: design.style.palette.text },
      { name: "Acento", color: design.style.palette.accent },
      { name: "Blanco", color: "#ffffff" },
      { name: "Tinta", color: "#16232e" },
    ];
    const seen = new Set<string>();
    return list.filter((swatch) => {
      const key = swatch.color.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [profile.data, design.style.palette]);

  const brandColors = useMemo(() => {
    const brand = profile.data?.brand;
    return brand ? [brand.primary, brand.accent] : [];
  }, [profile.data]);

  // --- Actions -----------------------------------------------------------
  const newId = useCallback(
    () => idFactoryFor(design, contentIds),
    [design, contentIds],
  );

  const defaultTarget = useCallback((): BlockTarget | null => {
    const single = singleBlockId(selection);
    if (single) return targetNextTo(design, single, "after");
    const section =
      selection?.kind === "section"
        ? findSection(design, selection.id)
        : design.sections.at(-1);
    if (!section) return null;
    return {
      sectionId: section.id,
      columnIndex: 0,
      index: isCanvasSection(section)
        ? section.items.length
        : (section.columns[0]?.length ?? 0),
    };
  }, [design, selection]);

  const addBlockAt = useCallback(
    (kind: DesignBlockKind, target: BlockTarget | null) => {
      if (!target) return;
      const blocked = addBlockBlocker(design, type, kind, target);
      if (blocked) {
        notify(blocked, "info");
        return;
      }
      const block = createBlock(kind, newId(), organization.brand?.whatsappUrl);
      change((current) => insertBlock(current, block, target));
      setSelection({ kind: "block", id: block.id });
    },
    [design, type, newId, notify, change, organization.brand?.whatsappUrl],
  );

  /** "Redes en círculo" (addendum: forma): WhatsApp, Instagram, TikTok and
   * Facebook as one row of círculo brand buttons, added together as one
   * undoable step. On a canvas they land centered as a row (one square item
   * each); in a flow column they stack in order (the renderer groups
   * consecutive círculo buttons into one row on its own). */
  const addBrandCircleRow = useCallback(
    (target: BlockTarget | null) => {
      if (!target) return;
      const blocked = addBlockBlocker(design, type, "brandButton", target);
      if (blocked) {
        notify(blocked, "info");
        return;
      }
      const whatsappUrl = organization.brand?.whatsappUrl;
      const blocks = createBrandCircleRow(newId(), whatsappUrl);
      const section = findSection(design, target.sectionId);
      const next =
        section && isCanvasSection(section)
          ? addBrandCircleRowToCanvas(
              design,
              target.sectionId,
              blocks,
              target.at,
            )
          : blocks.reduce(
              (current, block, index) =>
                insertBlock(current, block, {
                  ...target,
                  index: target.index + index,
                }),
              design,
            );
      change(() => next, "add-brand-circle-row");
      setSelection(selectionOf(blocks.map((block) => block.id)));
      notify(
        whatsappUrl
          ? "Agregaste tus redes en círculo. WhatsApp ya lleva tu número; llena los enlaces de las demás."
          : "Agregaste tus redes en círculo. Llena sus enlaces, empezando por tu WhatsApp.",
        "info",
      );
    },
    [design, type, newId, notify, change, organization.brand?.whatsappUrl],
  );

  const actions = useMemo<StudioActions>(
    () => ({
      addBlock: (kind, target) => addBlockAt(kind, target ?? defaultTarget()),
      addBrandCircleRow: (target) =>
        addBrandCircleRow(target ?? defaultTarget()),
      addSection: (layout: SectionLayout, index?: number) => {
        const blocked = addSectionBlocker(design);
        if (blocked) {
          notify(blocked, "info");
          return;
        }
        const section = createSection(newId(), layout);
        change((current) => addSection(current, section, index));
        setSelection({ kind: "section", id: section.id });
      },
      removeBlock: (blockId) => {
        const blocked = removeBlockBlocker(
          design,
          type,
          blockId,
          canEditCustomHtml,
        );
        if (blocked) {
          notify(blocked, "info");
          return;
        }
        const at = locateBlock(design, blockId);
        change((current) => removeBlock(current, blockId));
        notify(
          `Eliminaste «${at ? blockKindLabel(at.block.kind, type) : "el bloque"}».`,
          "info",
          { action: { label: "Deshacer", onClick: history.undo } },
        );
      },
      duplicateBlock: (blockId) => {
        const blocked = duplicateBlockBlocker(
          design,
          type,
          blockId,
          canEditCustomHtml,
        );
        if (blocked) {
          notify(blocked, "info");
          return;
        }
        const result = duplicateBlock(design, blockId, newId());
        if (!result) return;
        change(() => result.design);
        setSelection({ kind: "block", id: result.id });
      },
      moveBlockStep: (blockId, direction) =>
        change((current) => moveBlockStep(current, blockId, direction)),
      moveBlockToSection: (blockId, sectionId) => {
        const blocked = moveToSectionBlocker(
          design,
          type,
          blockId,
          sectionId,
          canEditCustomHtml,
        );
        if (blocked) {
          notify(blocked, "info");
          return;
        }
        change((current) => moveBlockToSection(current, blockId, sectionId));
      },
      removeSection: (sectionId) => {
        const blocked = removeSectionBlocker(
          design,
          type,
          sectionId,
          canEditCustomHtml,
        );
        if (blocked) {
          notify(blocked, "info");
          return;
        }
        const index = sectionIndexOf(design, sectionId);
        change((current) => removeSection(current, sectionId));
        notify(`Eliminaste la sección ${index + 1}.`, "info", {
          action: { label: "Deshacer", onClick: history.undo },
        });
      },
      duplicateSection: (sectionId) => {
        const blocked = duplicateSectionBlocker(
          design,
          sectionId,
          canEditCustomHtml,
        );
        if (blocked) {
          notify(blocked, "info");
          return;
        }
        const result = duplicateSection(design, sectionId, newId());
        if (!result) return;
        change(() => result.design);
        setSelection({ kind: "section", id: result.id });
      },
      moveSectionStep: (sectionId, direction) =>
        change((current) =>
          moveSection(
            current,
            sectionId,
            sectionIndexOf(current, sectionId) + direction,
          ),
        ),
      applyTemplate: (template: StudioTemplate) => {
        const adapted = adaptTemplateDesign(template.design, type, contentIds);
        const next = withOrganizationBrand(
          adapted,
          type,
          organization.brand,
          idFactoryFor(adapted, contentIds),
          { recolor: true },
        );
        change(() => next);
        const whatsapp = templateWhatsAppOutcome(
          adapted,
          organization.brand?.whatsappUrl,
        );
        // No phone yet: the inspector opens on the empty WhatsApp button.
        const waiting =
          whatsapp === "empty"
            ? designBlocks(next).find(
                (block) => isWhatsAppButton(block) && !block.href.trim(),
              )
            : undefined;
        setSelection(waiting ? { kind: "block", id: waiting.id } : null);
        notify(
          whatsapp === "filled"
            ? `Aplicaste «${template.name}». Sus botones de WhatsApp ya llevan tu número.`
            : whatsapp === "empty"
              ? `Aplicaste «${template.name}». Escribe tu número en su botón de WhatsApp: sin él no se puede guardar.`
              : `Aplicaste «${template.name}».`,
          "success",
          { action: { label: "Deshacer", onClick: history.undo } },
        );
      },
      restoreCurrentLook: () => {
        change(() => {
          const own = designFromContent(
            type,
            content,
            idFactoryFor(null, contentIds),
          );
          return withOrganizationBrand(
            own,
            type,
            organization.brand,
            idFactoryFor(own, contentIds),
            { recolor: !(content as { theme?: unknown }).theme },
          );
        });
        setSelection(null);
        notify("Volviste al tema de tu página.", "success", {
          action: { label: "Deshacer", onClick: history.undo },
        });
      },
    }),
    [
      addBlockAt,
      addBrandCircleRow,
      defaultTarget,
      design,
      type,
      content,
      contentIds,
      newId,
      notify,
      change,
      history.undo,
      organization.brand,
      canEditCustomHtml,
    ],
  );

  // --- Save and publish --------------------------------------------------
  const focusIssue = useCallback(
    (issue: StudioIssue) => {
      if (issue.blockId) setSelection({ kind: "block", id: issue.blockId });
      else if (issue.sectionId)
        setSelection({ kind: "section", id: issue.sectionId });
      else openRail(issue.field === "background" ? "background" : "style");
      if ((issue.blockId || issue.sectionId) && mode !== "wide")
        setInspectorOpen(true);
    },
    [openRail, mode],
  );

  const commitTextRef = useRef<() => void>(() => undefined);

  const save = useCallback(async (): Promise<boolean> => {
    if (readOnly || isSaving) return false;
    commitTextRef.current();
    if (!isDirty) {
      notify("Todo está guardado.", "info");
      return true;
    }
    // C5c: a product or dish added and left empty (no name, no price —
    // e.g. clicking "Añadir producto" more than once) never blocks
    // Guardar: it disappears on its own instead of failing the save
    // silently, which is how Ana lost her catalog on her phone.
    const pruned = pruneEmptyItems(type, content);
    const effectiveContent = pruned.content;
    if (pruned.removed) {
      changeContent(() => effectiveContent, "prune-empty-items");
      notify(
        pruned.removed === 1
          ? "Quitamos 1 producto vacío."
          : `Quitamos ${pruned.removed} productos vacíos.`,
        "info",
      );
    }
    const effectiveErrors = pruned.removed
      ? validateContent(type, effectiveContent)
      : contentErrors;
    const firstContentError = Object.keys(effectiveErrors)[0];
    if (firstContentError) {
      setStudioMode("blocks");
      focusContent(firstContentError);
      const count = Object.keys(effectiveErrors).length;
      notify(
        count === 1
          ? `Antes de guardar, revisa Contenido: ${effectiveErrors[firstContentError]}`
          : `Antes de guardar, revisa ${count} campos en Contenido.`,
        "error",
        {
          action: {
            label: "Ir al campo",
            onClick: () => focusContent(firstContentError),
          },
        },
      );
      return false;
    }
    const changes: StudioSaveChanges = {};
    if (designDirty) {
      const prepared = prepareDesign(design);
      const found = validateDesign(
        type,
        prepared,
        contentIds,
        menuSectionIds,
        featurableItemIds,
      );
      const first = found[0];
      if (first) {
        setStudioMode("blocks");
        focusIssue(first);
        notify(
          found.length === 1
            ? `Antes de guardar: ${first.message}`
            : `Antes de guardar, completa ${found.length} pendientes. ${first.message}`,
          "error",
        );
        return false;
      }
      // The API refuses a save that creates, changes, removes or reorders a
      // code block without the permission; say why here (A2-35).
      const noCodeBlocks = saveHtmlBlocksBlocker(
        canEditCustomHtml,
        baseline,
        prepared,
      );
      if (noCodeBlocks) {
        notify(noCodeBlocks, "error");
        return false;
      }
      changes.design = prepared;
    }
    if (htmlDirty) {
      // The API refuses a changed customHtml from editors; say it first.
      if (!canSaveCustomHtml(canEditCustomHtml, htmlBaseline, customHtml)) {
        notify(
          "Solo Owners y Admins pueden cambiar el HTML de la página.",
          "error",
        );
        return false;
      }
      const prepared = prepareCustomHtml(customHtml);
      const first = validateCustomHtml(prepared)[0];
      if (first) {
        setStudioMode("html");
        setHtmlMounted(true);
        setHtmlFocus({ area: first.area, at: Date.now() });
        notify(`Antes de guardar: ${first.message}`, "error");
        return false;
      }
      changes.customHtml = prepared;
    }
    if (contentDirty) changes.content = effectiveContent;
    setIsSaving(true);
    try {
      const ok = await host.onSave(changes);
      if (ok) {
        const savedDesign = changes.design;
        if (savedDesign) {
          const key = stableKey(design);
          update((current) =>
            stableKey(current.design) === key
              ? { ...current, design: savedDesign }
              : current,
          );
          setBaseline(savedDesign);
        }
        if (changes.content) setContentBaseline(stableKey(changes.content));
        const savedHtml = changes.customHtml;
        if (savedHtml) {
          const key = stableKey(customHtml);
          htmlHistory.update((current) =>
            stableKey({ ...current, active: savedHtml.active }) === key
              ? savedHtml
              : current,
          );
          setHtmlBaseline(savedHtml);
        }
      }
      return ok;
    } finally {
      setIsSaving(false);
    }
  }, [
    readOnly,
    isSaving,
    isDirty,
    designDirty,
    contentDirty,
    htmlDirty,
    contentErrors,
    changeContent,
    design,
    content,
    type,
    contentIds,
    menuSectionIds,
    featurableItemIds,
    focusIssue,
    focusContent,
    notify,
    host,
    update,
    canEditCustomHtml,
    baseline,
    htmlBaseline,
    customHtml,
    htmlHistory.update,
  ]);

  /** The AI designs with the saved content, so unsaved content is saved
   * first (A2-39). `true` when nothing is left unsaved. */
  const ensureSaved = useCallback(async (): Promise<boolean> => {
    commitTextRef.current();
    if (!contentDirty) return true;
    return save();
  }, [contentDirty, save]);

  const publish = useCallback(async () => {
    commitTextRef.current();
    if (isDirty) {
      const ok = await save();
      if (!ok) return;
    }
    host.onPublish();
  }, [isDirty, save, host]);

  /** "Publicar ahora" from the IA rail (B3d): the very same Publicar the
   * header button uses, so there is only ever one publish flow. */
  const requestPublish = useCallback(() => {
    void publish();
  }, [publish]);

  // --- "Usar este diseño" guarda, con reintento y Deshacer (B3c/B3d) -----
  // Karla lost her applied design because it only ever changed the draft in
  // memory; Fernanda and Sofía saved it and had no way to tell their
  // customers still saw the old page. `aiApplyReducer` (apply-design.ts) is
  // the pure model; this wires it to the Estudio's own `save`.
  const [aiApplyState, dispatchAiApply] = useReducer(
    aiApplyReducer<Draft>,
    idleAiApply<Draft>(),
  );
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (aiApplyState.phase !== "pending") return;
    let cancelled = false;
    void (async () => {
      const ok = await saveRef.current();
      if (!cancelled) dispatchAiApply({ type: "save-settled", ok });
    })();
    return () => {
      cancelled = true;
    };
  }, [aiApplyState]);

  const applyAiDesign = useCallback(
    (result: {
      design: PageDesign;
      itemPhotos: readonly DesignItemPhoto[];
    }) => {
      if (readOnly || aiApplyState.phase === "pending") return;
      const before = history.value;
      const message = applyAiResult(result, {
        canEditHtml: canEditCustomHtml,
        currentDesign: history.value.design,
        change,
        changeContent,
      });
      notify(message, "success");
      dispatchAiApply({ type: "apply", before });
    },
    [
      readOnly,
      aiApplyState.phase,
      history.value,
      canEditCustomHtml,
      change,
      changeContent,
      notify,
    ],
  );

  /** The design (or ideas) the IA left outside the rail (relevo 31, finding
   * 2: the rail was closed while it worked). Applying it now goes through
   * the same save/undo/publish story as from inside the rail — opening the
   * rail puts that banner in view, instead of leaving the owner with just
   * a toast and no way to tell it saved (B3c). */
  const applyWaitingDesign = useCallback(() => {
    if (ai.waiting?.status !== "ready" || readOnly) return;
    applyAiDesign(ai.waiting.result);
    ai.report(null);
    openRail("ai");
    void designAiSessionApi
      .clear(workspace.id, host.experienceId, true)
      .catch(() => undefined);
  }, [ai, readOnly, applyAiDesign, openRail, workspace.id, host.experienceId]);

  const retryAiApplySave = useCallback(() => {
    dispatchAiApply({ type: "retry" });
  }, []);

  const undoAiApply = useCallback(() => {
    const target = aiApplyUndoTarget(aiApplyState);
    if (!target) return;
    update(() => target, "ai-undo");
    dispatchAiApply({ type: "undo" });
  }, [aiApplyState, update]);

  const publishStatus = useMemo(
    () => publishStatusOf(host.publication),
    [host.publication],
  );
  const aiApplyNotice = useMemo(
    () =>
      aiApplyNoticeOf(
        aiApplyState,
        publishStatus.live,
        publishStatus.badge?.label === "Publicada",
      ),
    [aiApplyState, publishStatus.live, publishStatus.badge?.label],
  );

  // --- Writing on the page -------------------------------------------------
  const inline = useInlineEditing({
    design,
    type,
    readOnly,
    change,
    changeContent,
    select: setSelection,
    notify,
    save: () => void save(),
  });
  commitTextRef.current = inline.commit;
  const editOnPage = useCallback(
    (blockId: string) => {
      if (!inline.begin(previewDocument(), blockId)) {
        const at = locateBlock(design, blockId);
        if (at && !writesOnPage(at.block.kind))
          notify("Este bloque se ajusta en el inspector.", "info");
      }
    },
    [inline.begin, design, notify],
  );

  const changeMode = useCallback(
    (next: StudioMode) => {
      inline.commit();
      if (htmlMode && next === "html" && studioMode !== "html") {
        syncHtmlOnEnter();
        setStudioMode(next);
        setHtmlMounted(true);
        return;
      }
      if (
        htmlMode &&
        next === "blocks" &&
        studioMode === "html" &&
        canEditCustomHtml
      ) {
        const generated = designToCustomCode(type, content, design);
        if (
          customHtml.html !== generated.html ||
          customHtml.css !== generated.css
        ) {
          const plan = customCodeToDesign(type, design, contentIds, generated, {
            html: customHtml.html,
            css: customHtml.css,
          });
          if (plan.changedBlocks.length || plan.notes.length) {
            // The gate: stays in modo HTML until the person resolves the
            // dialog (seguir en HTML, ver bloques sin llevar cambios, or
            // llevar a bloques once nothing fails the fidelity check).
            setSyncPlan(plan);
            return;
          }
        }
      }
      setStudioMode(next);
      if (next === "html") setHtmlMounted(true);
    },
    [
      inline.commit,
      htmlMode,
      studioMode,
      syncHtmlOnEnter,
      type,
      content,
      design,
      customHtml,
      canEditCustomHtml,
      contentIds,
    ],
  );

  // "Usar como bloque" (modo HTML → bloques, addendum 3): the current modo
  // HTML source becomes a new `html` design block, at the end of the last
  // flow section (or a new one, if every section is a canvas), then the
  // Estudio switches to bloques with that block selected.
  const useAsBlock = useCallback(
    (html: string, css: string): UseAsBlockResult => {
      const reason = htmlBlockBlocker(
        html,
        css,
        designCounts(design).htmlBlocks,
      );
      if (reason) return { ok: false, reason };
      const factory = idFactoryFor(design, contentIds);
      const block = { ...createBlock("html", factory), html, css };
      const lastFlow = design.sections
        .filter((section) => !isCanvasSection(section))
        .at(-1);
      let next = design;
      let sectionId = lastFlow?.id;
      if (!sectionId) {
        const section = createSection(factory);
        next = addSection(next, section);
        sectionId = section.id;
      }
      const flow = findFlowSection(next, sectionId);
      const target: BlockTarget = {
        sectionId,
        columnIndex: 0,
        index: flow?.columns[0]?.length ?? 0,
      };
      next = insertBlock(next, block, target);
      change(() => next, "use-as-block");
      changeMode("blocks");
      setSelection({ kind: "block", id: block.id });
      return {
        ok: true,
        message: "Tu HTML ahora es un bloque. Sigue editándolo en Bloques.",
      };
    },
    [design, contentIds, change, changeMode],
  );

  useUnsavedGuard(
    isDirty,
    "Si sales ahora, se pierden los cambios de tu página.",
    save,
  );
  const activeHistory = studioMode === "html" ? htmlHistory : history;
  useStudioShortcuts({
    enabled: !readOnly && !inline.editing,
    undo: activeHistory.undo,
    redo: activeHistory.redo,
    save: () => void save(),
  });
  useTick();

  // --- Keys of the stage: selection, clipboard, deleting, writing ---------
  const clipboardScope = host.experienceId;
  const keys = useRef({
    design,
    selection,
    readOnly,
    studioMode,
    editing: inline.editing,
    actions,
  });
  keys.current = {
    design,
    selection,
    readOnly,
    studioMode,
    editing: inline.editing,
    actions,
  };

  const copySelection = useCallback((): number => {
    const { design, selection } = keys.current;
    const ids = selectedBlockIds(selection);
    const onCanvas = ids.filter((id) => canvasItemOf(design, id));
    const items =
      onCanvas.length === ids.length
        ? copyCanvasItems(design, ids)
        : ids.flatMap((id) => {
            const at = locateBlock(design, id);
            return at ? [itemForBlock(structuredClone(at.block))] : [];
          });
    if (items.length) copyItems(clipboardScope, items);
    return items.length;
  }, [clipboardScope]);

  const pasteClipboard = useCallback(() => {
    const items = copiedItems(clipboardScope);
    if (!items) return;
    const { design, selection } = keys.current;
    const factory = idFactoryFor(design, contentIds);
    const firstId = selectedBlockIds(selection)[0];
    const at = firstId ? locateBlock(design, firstId) : null;
    const section =
      at?.section ??
      (selection?.kind === "section"
        ? findSection(design, selection.id)
        : null) ??
      design.sections.find(isCanvasSection) ??
      design.sections.at(-1);
    if (!section) return;
    if (isCanvasSection(section)) {
      const result = pasteCanvasItems(
        design,
        type,
        section.id,
        items,
        factory,
        undefined,
        canEditCustomHtml,
      );
      if (result.ids.length) {
        change(() => result.design);
        setSelection(selectionOf(result.ids));
      }
      if (result.reason) notify(result.reason, "info");
      return;
    }
    // A flow section: the blocks go after the selected one, in order.
    let next = design;
    let target: BlockTarget =
      at?.on === "flow"
        ? {
            sectionId: section.id,
            columnIndex: at.columnIndex,
            index: at.blockIndex + 1,
          }
        : {
            sectionId: section.id,
            columnIndex: 0,
            index: section.columns[0]?.length ?? 0,
          };
    const pasted: string[] = [];
    let reason: string | null = null;
    for (const item of items) {
      const blocked = addBlockBlocker(
        next,
        type,
        item.block.kind,
        target,
        canEditCustomHtml,
      );
      if (blocked) {
        reason ??= blocked;
        continue;
      }
      const block = { ...structuredClone(item.block), id: factory("b") };
      next = insertBlock(next, block, target);
      pasted.push(block.id);
      target = { ...target, index: target.index + 1 };
    }
    if (pasted.length) {
      const result = next;
      change(() => result);
      setSelection(selectionOf(pasted));
    }
    if (reason) notify(reason, "info");
  }, [clipboardScope, contentIds, type, change, notify, canEditCustomHtml]);

  const duplicateSelection = useCallback(() => {
    const { design, selection, actions } = keys.current;
    const ids = selectedBlockIds(selection);
    if (ids.length === 1 && ids[0]) {
      actions.duplicateBlock(ids[0]);
      return;
    }
    if (ids.length > 1) {
      const result = duplicateCanvasItems(
        design,
        type,
        ids,
        idFactoryFor(design, contentIds),
        canEditCustomHtml,
      );
      if (result.ids.length) {
        change(() => result.design);
        setSelection(selectionOf(result.ids));
      }
      if (result.reason) notify(result.reason, "info");
      return;
    }
    if (selection?.kind === "section") actions.duplicateSection(selection.id);
  }, [type, contentIds, change, notify, canEditCustomHtml]);

  const removeSelection = useCallback(() => {
    const { design, selection, actions } = keys.current;
    const ids = selectedBlockIds(selection);
    if (ids.length === 1 && ids[0]) {
      actions.removeBlock(ids[0]);
      return;
    }
    if (ids.length > 1) {
      const result = removeCanvasItems(design, type, ids, canEditCustomHtml);
      if (result.removed) {
        change(() => result.design);
        notify(
          result.removed === 1
            ? "Eliminaste 1 bloque."
            : `Eliminaste ${result.removed} bloques.`,
          "info",
          { action: { label: "Deshacer", onClick: history.undo } },
        );
      }
      if (result.reason) notify(result.reason, "info");
      setSelection(null);
    }
  }, [type, change, notify, history.undo, canEditCustomHtml]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { selection, readOnly, studioMode, editing, design } = keys.current;
      if (studioMode !== "blocks" || editing || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (isTyping(target)) return;
      const onStage =
        target === document.body ||
        target === null ||
        Boolean(target.closest?.(".es-stage"));
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (key === "Escape" && selection) {
        setSelection(null);
        return;
      }
      if (key === "Tab" && onStage && !mod && !event.altKey) {
        const next = stepBlock(design, selection, event.shiftKey ? -1 : 1);
        if (next) {
          event.preventDefault();
          setSelection({ kind: "block", id: next });
        }
        return;
      }
      if (readOnly || !onStage) return;
      if ((key === "Delete" || key === "Backspace") && !mod) {
        if (!selectedBlockIds(selection).length) return;
        event.preventDefault();
        removeSelection();
        return;
      }
      if (key === "Enter" && !mod) {
        const single = singleBlockId(selection);
        if (!single) return;
        event.preventDefault();
        editOnPage(single);
        return;
      }
      if (!mod || event.altKey) return;
      const lower = key.toLowerCase();
      if (lower === "c" || lower === "x") {
        const count = copySelection();
        if (!count) return;
        event.preventDefault();
        if (lower === "x") removeSelection();
        else
          notify(
            count === 1 ? "Copiaste 1 bloque." : `Copiaste ${count} bloques.`,
            "info",
          );
        return;
      }
      if (lower === "v") {
        event.preventDefault();
        pasteClipboard();
        return;
      }
      if (lower === "d") {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (lower === "a") {
        const id = selectedBlockIds(selection)[0];
        const at = id ? canvasItemOf(design, id) : null;
        const section =
          at?.section ??
          (selection?.kind === "section"
            ? findSection(design, selection.id)
            : null);
        if (section && isCanvasSection(section)) {
          event.preventDefault();
          setSelection(
            selectionOf(
              section.items
                .filter((item) => !item.locked && !item.hidden)
                .map((item) => item.block.id),
            ),
          );
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    copySelection,
    pasteClipboard,
    duplicateSelection,
    removeSelection,
    editOnPage,
    notify,
  ]);

  // --- Drag and drop -------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [dragging, setDragging] = useState<DragData | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [stageDrop, setStageDrop] = useState<{
    sectionId: string;
    columnIndex: number;
    index: number;
    line: DropLine;
  } | null>(null);
  const [layersDrop, setLayersDrop] = useState<LayersDrop | null>(null);

  const trackTargets = useCallback(
    (active: Active, over: Over | null) => {
      const drag = active.data.current as DragData | undefined;
      const drop = over?.data.current as DropData | undefined;
      if (!drag || drag.type === "section" || !drop) {
        setStageDrop(null);
        setLayersDrop(null);
        return;
      }
      if (
        drop.type === "column" &&
        drop.origin === "stage" &&
        pointer.current
      ) {
        const section = findFlowSection(design, drop.sectionId);
        const ids = (section?.columns[drop.columnIndex] ?? [])
          .map((block) => block.id)
          .filter((id) => drag.type !== "block" || id !== drag.blockId);
        const target = stageApi.current?.columnTarget(
          drop.sectionId,
          drop.columnIndex,
          ids,
          pointer.current.x,
          pointer.current.y,
        );
        setLayersDrop(null);
        setStageDrop((current) =>
          target &&
          (current?.index !== target.index ||
            current.sectionId !== drop.sectionId ||
            current.columnIndex !== drop.columnIndex ||
            current.line.y !== target.line.y)
            ? {
                sectionId: drop.sectionId,
                columnIndex: drop.columnIndex,
                ...target,
              }
            : target
              ? current
              : null,
        );
        return;
      }
      setStageDrop(null);
      if (
        drop.type === "block" &&
        !(
          drag.type === "block" &&
          drag.sectionId === drop.sectionId &&
          drag.columnIndex === drop.columnIndex
        )
      ) {
        const placement =
          center(active.rect.current.translated) > center(over?.rect)
            ? "after"
            : "before";
        setLayersDrop((current) =>
          current?.overId === drop.blockId && current.placement === placement
            ? current
            : { overId: drop.blockId, placement },
        );
        return;
      }
      setLayersDrop(null);
    },
    [design],
  );

  function onDragStart(event: DragStartEvent) {
    inline.commit();
    setDragging((event.active.data.current as DragData | undefined) ?? null);
    start.current = clientPoint(event.activatorEvent);
    pointer.current = start.current;
  }

  function onDragMove(event: DragMoveEvent) {
    if (start.current)
      pointer.current = {
        x: start.current.x + event.delta.x,
        y: start.current.y + event.delta.y,
      };
    trackTargets(event.active, event.over);
  }

  function resetDrag() {
    setDragging(null);
    setStageDrop(null);
    setLayersDrop(null);
    start.current = null;
    pointer.current = null;
  }

  function onDragEnd(event: DragEndEvent) {
    const drag = event.active.data.current as DragData | undefined;
    const drop = event.over?.data.current as DropData | undefined;
    const stage = stageDrop;
    const layers = layersDrop;
    // Read before resetDrag clears it: where a block lands on a canvas.
    const point = pointer.current;
    resetDrag();
    if (!drag || !drop || readOnly) return;

    if (drag.type === "section") {
      if (drop.type !== "section" || drop.sectionId === drag.sectionId) return;
      change((current) =>
        moveSection(
          current,
          drag.sectionId,
          sectionIndexOf(current, drop.sectionId),
        ),
      );
      return;
    }

    let target: BlockTarget | null = null;
    if (drop.type === "canvas") {
      const doc = previewDocument();
      const at =
        doc && point
          ? canvasPointFromClient(doc, drop.sectionId, point.x, point.y)
          : null;
      target = {
        sectionId: drop.sectionId,
        columnIndex: 0,
        index: 0,
        ...(at ? { at } : {}),
      };
    } else if (drop.type === "column") {
      const section = findFlowSection(design, drop.sectionId);
      const column = (section?.columns[drop.columnIndex] ?? []).filter(
        (block) => drag.type !== "block" || block.id !== drag.blockId,
      );
      target = {
        sectionId: drop.sectionId,
        columnIndex: drop.columnIndex,
        index:
          drop.origin === "stage" &&
          stage &&
          stage.sectionId === drop.sectionId &&
          stage.columnIndex === drop.columnIndex
            ? stage.index
            : column.length,
      };
    } else if (drop.type === "block") {
      const anchor = locateBlock(design, drop.blockId);
      if (anchor?.on !== "flow") return;
      if (
        drag.type === "block" &&
        drag.sectionId === drop.sectionId &&
        drag.columnIndex === drop.columnIndex
      ) {
        // Same column: the sortable order (like arrayMove).
        if (drag.blockId === drop.blockId) return;
        target = {
          sectionId: drop.sectionId,
          columnIndex: drop.columnIndex,
          index: anchor.blockIndex,
        };
      } else {
        const placement =
          layers?.overId === drop.blockId ? layers.placement : "before";
        target = {
          sectionId: drop.sectionId,
          columnIndex: drop.columnIndex,
          index: anchor.blockIndex + (placement === "after" ? 1 : 0),
        };
      }
    }
    if (!target) return;

    if (drag.type === "palette") {
      addBlockAt(drag.kind, target);
      return;
    }
    const moving = locateBlock(design, drag.blockId);
    if (!moving) return;
    const sameColumn =
      moving.on === "flow" &&
      moving.section.id === target.sectionId &&
      moving.columnIndex === target.columnIndex;
    if (
      !sameColumn &&
      columnFull(design, target.sectionId, target.columnIndex)
    ) {
      notify("Esa columna ya está llena.", "info");
      return;
    }
    const finalTarget = target;
    change((current) => moveBlock(current, drag.blockId, finalTarget));
    setSelection({ kind: "block", id: drag.blockId });
  }

  const templates = useMemo(() => studioTemplatesFor(type), [type]);

  // --- Status --------------------------------------------------------------
  const status = readOnly
    ? { icon: "lock" as IconName, text: "Solo lectura", kind: "readonly" }
    : isSaving
      ? { icon: "loader" as IconName, text: "Guardando…", kind: "saving" }
      : isDirty
        ? {
            icon: "alert" as IconName,
            text:
              designDirty && !baseline && designPending
                ? "Diseño sin guardar todavía"
                : "Cambios sin guardar",
            kind: "dirty",
          }
        : {
            icon: "circle-check" as IconName,
            text: host.savedAt
              ? `Guardado ${formatRelative(host.savedAt)}`
              : "Guardado",
            kind: "saved",
          };

  const context: StudioContextValue = {
    type,
    ensureSaved,
    design,
    change,
    readOnly,
    content,
    changeContent,
    contentErrors,
    contentIds,
    contentRoute: host.contentRoute,
    canEditHtml: canEditCustomHtml,
    selection,
    select,
    issues,
    workspaceId: workspace.id,
    experienceId: host.experienceId,
    assets: host.assets,
    addAsset: host.addAsset,
    canUploadAssets: can("assets.manage"),
    swatches,
    templates,
    actions,
    openRail,
    focusContent,
    contentFocus,
    editOnPage,
    aiWaiting: ai.waiting?.status ?? null,
    reportAi: ai.report,
    hasSavedDesign: !designPending,
    publishBadge: readOnly ? null : publishStatus.badge,
    aiApply: aiApplyNotice,
    applyAiDesign,
    undoAiApply,
    retryAiApplySave,
    requestPublish,
  };

  const narrow = mode === "compact" || mode === "phone";
  const showPanel = panelOpen;
  const inspectorAsColumn = mode === "wide" || mode === "medium";
  const showInspector =
    inspectorAsColumn || (inspectorOpen && selection !== null);
  const info = railInfo(rail);

  const panel = (
    <div className="es-panel" id="es-rail-panel">
      <div className="es-panel-head">
        <div>
          <h2 tabIndex={-1}>{info.title}</h2>
          {info.description ? <p>{info.description}</p> : null}
        </div>
        <button
          aria-label="Cerrar el panel"
          className="icon-button es-panel-close"
          onClick={closePanel}
          type="button"
        >
          <Icon name={narrow ? "close" : "panel-close"} size={18} />
        </button>
      </div>
      <div className="es-panel-body">
        {rail === "content" ? (
          <Suspense fallback={<Skeleton label="Abriendo…" lines={5} />}>
            <ContentPanel />
          </Suspense>
        ) : rail === "ai" ? (
          <Suspense fallback={<Skeleton label="Abriendo…" lines={5} />}>
            <BlocksAiPanel />
          </Suspense>
        ) : rail === "templates" ? (
          <TemplatesPanel />
        ) : rail === "add" ? (
          <AddBlockPanel />
        ) : rail === "layers" ? (
          <LayersPanel />
        ) : rail === "style" ? (
          <StylePanel />
        ) : (
          <BackgroundPanel />
        )}
      </div>
    </div>
  );

  return (
    <StudioContext.Provider value={context}>
      <CanvasKeyboard
        enabled={studioMode === "blocks" && !readOnly && !inline.editing}
      />
      <DndContext
        accessibility={{
          announcements: studioAnnouncements,
          screenReaderInstructions: studioScreenReaderInstructions,
        }}
        collisionDetection={studioCollisions}
        onDragCancel={resetDrag}
        onDragEnd={onDragEnd}
        onDragMove={onDragMove}
        onDragOver={(event) => trackTargets(event.active, event.over)}
        onDragStart={onDragStart}
        sensors={sensors}
      >
        <LayersDropContext.Provider value={layersDrop}>
          <div
            className="es-page"
            data-dragging={dragging ? dragging.type : undefined}
            data-mode={mode}
            data-studio-mode={studioMode}
            ref={rootRef}
          >
            <StudioBar
              back={host.back}
              canPublish={host.canPublish}
              canRedo={activeHistory.canRedo}
              canSave={!readOnly}
              canUndo={activeHistory.canUndo}
              htmlActive={customHtml.active}
              htmlMode={htmlMode}
              isDirty={isDirty}
              isPublishing={host.isPublishing}
              isSaving={isSaving}
              issues={studioMode === "blocks" ? issues : []}
              kicker={host.kicker}
              links={host.links ?? []}
              onIssue={focusIssue}
              onModeChange={changeMode}
              onPublish={() => void publish()}
              onRedo={activeHistory.redo}
              onSave={() => void save()}
              onUndo={activeHistory.undo}
              publishBadge={readOnly ? null : publishStatus.badge}
              published={
                readOnly
                  ? null
                  : {
                      html: customHtml.active,
                      canChange: canEditCustomHtml,
                      htmlBlank: isCustomHtmlBlank(customHtml),
                      onChange: setPublishedHtml,
                    }
              }
              status={status}
              studioMode={studioMode}
              title={host.title}
              view={{
                device,
                onDeviceChange: setDevice,
                desktopWidth,
                onDesktopWidthChange: setDesktopWidth,
                zoom,
                fit,
                onZoomChange: setZoom,
                // "Teléfono a la derecha" only means something in the
                // Bloques layout (`.es-body[data-phone-right]`); modo HTML
                // has its own two-pane layout and never reads it.
                phoneRight:
                  studioMode === "blocks" && mode === "wide"
                    ? phoneRight
                    : null,
                onPhoneRightChange: setPhoneRight,
              }}
            />
            {host.readOnlyReason ||
            host.notices ||
            (studioMode === "blocks" && customHtml.active) ? (
              <div className="es-notices">
                {host.readOnlyReason ? (
                  <Notice tone="info">{host.readOnlyReason}</Notice>
                ) : null}
                {host.notices}
                {studioMode === "blocks" && customHtml.active ? (
                  <Notice
                    action={
                      <span className="es-notice-actions">
                        {canEditCustomHtml ? (
                          <button
                            className="text-action"
                            onClick={() => setPublishedHtml(false)}
                            type="button"
                          >
                            Mostrar bloques
                          </button>
                        ) : null}
                        <button
                          className="text-action"
                          onClick={() => changeMode("html")}
                          type="button"
                        >
                          Ir a HTML
                        </button>
                      </span>
                    }
                    icon="code"
                    tone="info"
                  >
                    Estás editando bloques, pero tu página muestra tu HTML. Lo
                    que cambies aquí se guarda, pero no se verá en tu página
                    hasta que elijas «Bloques» en «Se publica».
                  </Notice>
                ) : null}
              </div>
            ) : null}

            {htmlMounted ? (
              <div className="es-html-slot" hidden={studioMode !== "html"}>
                <Suspense
                  fallback={
                    <div className="es-html-loading">
                      <Skeleton label="Abriendo el modo HTML…" lines={6} />
                    </div>
                  }
                >
                  <HtmlStudio
                    addAsset={host.addAsset}
                    assets={host.assets}
                    blocksChangedSinceEdit={htmlMode && blocksChangedSinceEdit}
                    brandColors={brandColors}
                    businessName={workspace.name}
                    canEdit={canEditCustomHtml}
                    canUploadAssets={can("assets.manage")}
                    change={htmlHistory.update}
                    onPublishChange={setPublishedHtml}
                    content={content}
                    desktopWidth={desktopWidth}
                    device={device}
                    experienceId={host.experienceId}
                    focusRequest={htmlFocus}
                    layout={mode}
                    lockedNote={
                      readOnly
                        ? null
                        : canEditCustomHtml
                          ? null
                          : "Solo Owners y Admins pueden cambiar el HTML de la página. Puedes verlo y seguir diseñando con bloques."
                    }
                    onBringBlocksChanges={generateHtmlFromBlocks}
                    onFitChange={setFit}
                    onGenerateFromBlocks={generateHtmlFromBlocks}
                    onKeepMyHtml={keepCurrentHtml}
                    onUseAsBlock={useAsBlock}
                    redo={htmlHistory.redo}
                    type={type}
                    undo={htmlHistory.undo}
                    value={customHtml}
                    workspaceId={workspace.id}
                    zoom={zoom}
                  />
                </Suspense>
              </div>
            ) : null}

            {studioMode === "blocks" ? (
              <div
                className="es-body"
                data-mode={mode}
                data-panel={showPanel || undefined}
                data-phone-right={
                  (mode === "wide" && phoneRight && device === "phone") ||
                  undefined
                }
              >
                <StudioRail
                  onSelect={(section) => {
                    if (showPanel && rail === section) closePanel();
                    else openRail(section);
                  }}
                  open={showPanel}
                  orientation={mode === "phone" ? "horizontal" : "vertical"}
                  value={rail}
                />
                {showPanel ? (
                  <div
                    className="es-panel-slot"
                    data-drawer={narrow || undefined}
                  >
                    {panel}
                  </div>
                ) : null}
                <div className="es-stage-slot">
                  {rendered.html ? (
                    <Stage
                      alert={
                        rendered.error ? (
                          <p className="qrs-stage-problem">
                            <Icon name="octagon-alert" size={16} />
                            <span>{rendered.error}</span>
                          </p>
                        ) : null
                      }
                      apiRef={stageApi}
                      desktopWidth={desktopWidth}
                      device={device}
                      dragging={dragging}
                      dropLine={stageDrop?.line ?? null}
                      focusRef={stageFocus}
                      frozen={inline.editing !== null}
                      html={rendered.html}
                      onEdit={(doc, blockId, clicked, point) =>
                        inline.begin(doc, blockId, clicked, point)
                      }
                      onFitChange={setFit}
                      onInspect={
                        inspectorAsColumn
                          ? undefined
                          : () => setInspectorOpen(true)
                      }
                      overlay={({ doc, scale, version, primary }) =>
                        // The canvas editor lives on the primary view only
                        // (the phone when both are shown).
                        primary ? (
                          <CanvasOverlay
                            doc={doc}
                            readOnly={readOnly}
                            scale={scale}
                            version={version}
                          />
                        ) : null
                      }
                      title={title}
                      tone={tone}
                      zoom={zoom}
                    />
                  ) : (
                    <Notice tone="danger">
                      No pudimos dibujar la vista previa. Recarga la página.
                    </Notice>
                  )}
                </div>
                {showInspector ? (
                  <aside
                    aria-label="Inspector"
                    className="es-inspector"
                    data-drawer={!inspectorAsColumn || undefined}
                    data-sheet={mode === "phone" || undefined}
                  >
                    <Inspector
                      onClose={
                        inspectorAsColumn
                          ? undefined
                          : () => setInspectorOpen(false)
                      }
                    />
                  </aside>
                ) : null}
              </div>
            ) : null}
          </div>
        </LayersDropContext.Provider>
        <DragOverlay dropAnimation={null}>
          {dragging ? <DragChip data={dragging} /> : null}
        </DragOverlay>
      </DndContext>
      <SyncPlanDialog
        fidelity={fidelity}
        onApply={applySyncPlan}
        onKeepInHtml={keepInHtml}
        onViewBlocks={viewBlocksWithoutApplying}
        plan={syncPlan}
      />
      <AiCloseDialog
        onCloseAnyway={() => {
          setAskAiClose(false);
          setPanelOpen(false);
        }}
        onStay={() => setAskAiClose(false)}
        onUse={() => {
          applyWaitingDesign();
          setAskAiClose(false);
        }}
        open={askAiClose}
      />
      {ai.waiting &&
      ai.waiting.status !== "running" &&
      ai.waiting !== hiddenWaiting &&
      !(showPanel && rail === "ai") &&
      studioMode === "blocks" ? (
        // On a phone it hides while a panel is open, so it never covers what
        // the owner is editing (relevo 37, round 3: it sat over Javier's
        // «Contenido»); the dot on «IA» still says it is there.
        <div
          className="es-ai-waiting"
          data-panel-open={showPanel ? "" : undefined}
          role="status"
        >
          <Icon name="sparkles" size={16} />
          <span>
            {ai.waiting.status === "ready"
              ? "Tu diseño de la IA está listo."
              : "Tus ideas de la IA están listas."}
          </span>
          <button
            className="button button-secondary button-small"
            onClick={() => openRail("ai")}
            type="button"
          >
            {ai.waiting.status === "ready" ? "Verlo" : "Verlas"}
          </button>
          {ai.waiting.status === "ready" && !readOnly ? (
            <button
              className="button button-primary button-small"
              onClick={applyWaitingDesign}
              type="button"
            >
              Usar este diseño
            </button>
          ) : null}
          <button
            aria-label="Quitar este aviso (sigue en «IA»)"
            className="icon-button es-ai-waiting-close"
            onClick={() => setHiddenWaiting(ai.waiting)}
            type="button"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}
    </StudioContext.Provider>
  );
}

/** "Llevar tus cambios a bloques": shown once, right after switching from
 * HTML to Bloques, when the html editor diverged from what the blocks would
 * generate. Lists what will change; applying is one undoable step. */
/**
 * "Llevar tus cambios a bloques": a gate, not just a preview. While it is
 * open the Estudio stays in modo HTML (`DesignStudio`'s `changeMode` never
 * switches until it closes). Every "changed" module the plan would turn
 * into an `html` bloque is measured isolated, at the same width, against how
 * it looks right now (`fidelity`, `use-fidelity-gate.ts`); a module that
 * does not come out the same size disables "Llevar a bloques" and is listed,
 * leaving "Seguir en HTML" (closes, stays put) and "Ver bloques sin llevar
 * cambios" (switches without applying) as the only ways out.
 */
function SyncPlanDialog({
  plan,
  fidelity,
  onApply,
  onKeepInHtml,
  onViewBlocks,
}: {
  plan: SyncPlan | null;
  fidelity: FidelityGateResult;
  onApply: () => void;
  onKeepInHtml: () => void;
  onViewBlocks: () => void;
}) {
  const changed =
    plan?.changedBlocks.filter((c) => c.action === "changed").length ?? 0;
  const added =
    plan?.changedBlocks.filter((c) => c.action === "added").length ?? 0;
  const removed =
    plan?.changedBlocks.filter((c) => c.action === "removed").length ?? 0;
  const hasChanges = changed > 0 || added > 0 || removed > 0;
  const checking = fidelity.status === "checking";
  const blocked = fidelity.issues.length > 0;
  const canApply = hasChanges && !checking && !blocked;
  return (
    <Dialog
      description="Esto es lo que cambiaría en tus bloques con tu HTML actual."
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onKeepInHtml}
            type="button"
          >
            Seguir en HTML
          </button>
          <button
            className="button button-secondary"
            onClick={onViewBlocks}
            type="button"
          >
            Ver bloques sin llevar cambios
          </button>
          {hasChanges ? (
            <button
              className="button button-primary"
              disabled={!canApply}
              onClick={onApply}
              title={
                blocked
                  ? "Arregla o borra los módulos listados para poder llevarlos a bloques."
                  : undefined
              }
              type="button"
            >
              Llevar a bloques
            </button>
          ) : null}
        </>
      }
      onClose={onKeepInHtml}
      open={plan !== null}
      title="Llevar tus cambios a bloques"
    >
      {plan ? (
        <div className="es-sync-plan">
          {hasChanges ? (
            <ul className="es-sync-plan-counts">
              {changed ? (
                <li>
                  {changed === 1
                    ? "1 bloque se vuelve HTML"
                    : `${changed} bloques se vuelven HTML`}
                </li>
              ) : null}
              {added ? (
                <li>
                  {added === 1 ? "1 bloque nuevo" : `${added} bloques nuevos`}
                </li>
              ) : null}
              {removed ? (
                <li>
                  {removed === 1
                    ? "1 bloque quitado"
                    : `${removed} bloques quitados`}
                </li>
              ) : null}
            </ul>
          ) : null}
          {plan.notes.length ? (
            <ul className="es-sync-plan-notes">
              {plan.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          {checking ? (
            <Notice tone="info">
              Comprobando que tus módulos se vean igual como bloques…
            </Notice>
          ) : blocked ? (
            <Notice title="No se ven igual como bloques" tone="warning">
              <p>
                {fidelity.issues.length === 1
                  ? "Este módulo no se ve igual como bloque. Arréglalo o bórralo en el HTML para llevar tus cambios a bloques."
                  : "Estos módulos no se ven igual como bloques. Arréglalos o bórralos en el HTML para llevar tus cambios a bloques."}
              </p>
              <ul className="es-sync-plan-issues">
                {fidelity.issues.map((issue) => (
                  <li key={issue.blockId}>{issue.label}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function DragChip({ data }: { data: DragData }) {
  const { design } = useStudio();
  const icon: IconName =
    data.type === "palette"
      ? blockKindIcon(data.kind)
      : data.type === "block"
        ? blockKindIcon(locateBlock(design, data.blockId)?.block.kind ?? "text")
        : "section";
  return (
    <div className="es-drag-chip">
      <Icon name={icon} size={16} />
      <span>{data.label.replace(/[«»]/g, "")}</span>
    </div>
  );
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** Arrow keys nudge the selected canvas blocks (1 px, 10 px with Shift).
 * Lives inside the Estudio's context, which the canvas hook reads. */
function CanvasKeyboard({ enabled }: { enabled: boolean }) {
  const canvasKeys = useCanvasKeyboard();
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (canvasKeys(event)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, canvasKeys]);
  return null;
}

/** Closing the "IA" rail with a design ready and not used yet (relevo 31,
 * finding 2): use it, look at it again, or close and keep it waiting. */
function AiCloseDialog({
  open,
  onUse,
  onStay,
  onCloseAnyway,
}: {
  open: boolean;
  onUse: () => void;
  onStay: () => void;
  onCloseAnyway: () => void;
}) {
  return (
    <Dialog
      description="Todavía no lo usas en tu página. Si lo usas, lo puedes deshacer."
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onCloseAnyway}
            type="button"
          >
            Cerrar sin usarlo
          </button>
          <button
            className="button button-primary"
            onClick={onUse}
            type="button"
          >
            Usar este diseño
          </button>
        </>
      }
      onClose={onStay}
      open={open}
      title="Tu diseño de la IA está listo"
    />
  );
}
