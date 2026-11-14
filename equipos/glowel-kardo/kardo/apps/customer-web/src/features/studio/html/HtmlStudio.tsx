import {
  type Asset,
  type ConceptBrief,
  CUSTOM_HTML_LIMITS,
  type CustomHtml,
  type DesignableExperienceType,
  type ExperienceContent,
} from "@kardo/contracts";
import { DropdownMenu, RadioGroup, Tabs } from "radix-ui";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfirmDialog, Dialog } from "../../../components/Dialog.js";
import { Icon, type IconName } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { useToast } from "../../../components/Toast.js";
import { copyText } from "../../../lib/clipboard.js";
import { useWorkspaceProfile } from "../../settings/use-workspace-profile.js";
import { useAiUsage } from "../ai/use-ai-usage.js";
import { contentTitle, toDesignableContent } from "../model/content.js";
import { useDesignImages } from "../preview/images.js";
import type { Zoom } from "../stage/Stage.js";
import type { DesktopWidth, Device } from "../stage/viewports.js";
import { AiHelpDialog, type AiPath } from "./AiHelp.js";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor.js";
import { prepareSource, renderSourceDocument } from "./engine.js";
import { HtmlStage } from "./HtmlStage.js";
import { ConnectImageDialog, ImagesPanel } from "./ImagesPanel.js";
import {
  connectImageSlot,
  findImageSlots,
  type ImageSlot,
  imageSlotLabels,
} from "./images.js";
import { useKardoAi } from "./kardo-ai.js";
import {
  briefReady,
  emptyBrief,
  formatCount,
  imageSnippet,
  prepareCustomHtml,
  starterCode,
  widgetsFor,
} from "./model.js";
import { PasteBox, ReportCard } from "./parts.js";
import type { PastedCode } from "./paste.js";
import {
  type AiService,
  aiServices,
  aiServiceUrl,
  customHtmlPrompt,
  imageLabel,
  promptInputFrom,
} from "./prompt.js";
import type { UseAsBlockResult } from "./use-as-block.js";
import "./html-mode.css";

type Tab = "html" | "css" | "images";
type CodeTab = "html" | "css";
type LayoutMode = "wide" | "medium" | "compact" | "phone";

export type HtmlStudioProps = {
  type: DesignableExperienceType;
  content: ExperienceContent;
  value: CustomHtml;
  change: (recipe: (current: CustomHtml) => CustomHtml, key?: string) => void;
  /** Turns what the page publishes on or off (outside the code's undo). */
  onPublishChange: (active: boolean) => void;
  undo: () => void;
  redo: () => void;
  /** Owner/admin (`experiences.custom_html`) and the page is editable. */
  canEdit: boolean;
  /** Why the HTML is read-only, when it is. */
  lockedNote: string | null;
  experienceId: string;
  workspaceId: string;
  businessName: string;
  assets: readonly Asset[];
  addAsset: (asset: Asset) => void;
  canUploadAssets: boolean;
  brandColors: readonly string[];
  layout: LayoutMode;
  /** Device, desktop width and zoom: the same state (and the same header
   * controls, `StudioBar`'s `ViewTools`) Bloques uses, so both simulators
   * look and behave identically. */
  device: Device;
  desktopWidth: DesktopWidth;
  zoom: Zoom;
  onFitChange: (fit: number) => void;
  /** Set by the Estudio when saving finds something to fix. */
  focusRequest: { area: "code" | "concept"; at: number } | null;
  /** "Usar como bloque" (addendum 3): sends the current html/css to a new
   * `html` design block, in one step the Estudio's own undo covers; it also
   * switches the Estudio to Bloques and selects the new block. Returns why
   * it could not (too many blocks already, or the source is too big for
   * one), which this component only shows — `DesignStudio` decides. */
  onUseAsBlock: (html: string, css: string) => UseAsBlockResult;
  /** True when the blocks design changed after the person's last hand edit
   * of this HTML (sync between the two editors): shows the stale-blocks
   * banner with "Traer los cambios de bloques" / "Mantener mi HTML". */
  blocksChangedSinceEdit: boolean;
  /** "Traer los cambios de bloques" (the stale-blocks banner): replaces the
   * editor with a fresh render of the current blocks, one undoable step. */
  onBringBlocksChanges: () => void;
  /** "Mantener mi HTML" (the stale-blocks banner): dismisses it without
   * touching the editor. */
  onKeepMyHtml: () => void;
  /** "Generar desde bloques" (always in the toolbar): the same replace, for
   * when the person wants to start over from the blocks design on purpose —
   * also how an emptied editor gets its code back without leaving the tab. */
  onGenerateFromBlocks: () => void;
};

const widgetCopy: Record<
  "kardo-links" | "kardo-socials" | "kardo-profile",
  { label: string; hint: string; icon: IconName }
> = {
  "kardo-links": {
    label: "Tus enlaces",
    hint: "Los botones de tu página, medidos por Kardo",
    icon: "link-list",
  },
  "kardo-socials": {
    label: "Tus redes",
    hint: "Íconos de tus redes sociales",
    icon: "share",
  },
  "kardo-profile": {
    label: "Tu perfil",
    hint: "Foto, nombre y descripción",
    icon: "profile",
  },
};

/**
 * Modo HTML del Estudio (loaded on demand, with the code editor). It opens
 * straight into the code (HTML, CSS and Imágenes) next to the live preview.
 * "Ayuda de la IA" opens a guided onboarding in a dialog; the Imágenes tab
 * uploads to Assets, inserts library images and connects the images the code
 * uses that are not in the library yet. Whether the page shows this HTML or
 * the blocks design is a page-level choice made from the Estudio's header;
 * here, an inactive HTML only shows a banner to turn it on.
 */
export default function HtmlStudio(props: HtmlStudioProps) {
  const {
    type,
    content,
    value,
    change,
    onPublishChange,
    undo,
    redo,
    canEdit,
    lockedNote,
    experienceId,
    workspaceId,
    businessName,
    assets,
    addAsset,
    canUploadAssets,
    brandColors,
    layout,
    device,
    desktopWidth,
    zoom,
    onFitChange,
    focusRequest,
    onUseAsBlock,
    blocksChangedSinceEdit,
    onBringBlocksChanges,
    onKeepMyHtml,
    onGenerateFromBlocks,
  } = props;
  const { notify } = useToast();
  const profile = useWorkspaceProfile();
  const title = contentTitle(type, content);
  const brief = value.brief ?? emptyBrief();
  const ready = briefReady(value.brief);
  const hasCode = Boolean(value.html.trim() || value.css.trim());
  const canUpload = canUploadAssets && canEdit;

  const [tab, setTab] = useState<Tab>("html");
  const [phonePane, setPhonePane] = useState<"code" | "preview">("code");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPath, setAiPath] = useState<AiPath>("own");
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [pendingPaste, setPendingPaste] = useState<PastedCode | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [connecting, setConnecting] = useState<ImageSlot | null>(null);
  const [refineCurrent, setRefineCurrent] = useState(true);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const { usage: aiUsage, reload: reloadAiUsage } = useAiUsage(workspaceId);
  const htmlEditor = useRef<CodeEditorHandle>(null);
  const cssEditor = useRef<CodeEditorHandle>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // --- Concept and prompt ------------------------------------------------
  const onBriefChange = useCallback(
    (recipe: (brief: ConceptBrief) => ConceptBrief, key?: string) =>
      change(
        (current) => ({
          ...current,
          brief: recipe(current.brief ?? emptyBrief()),
        }),
        key,
      ),
    [change],
  );

  const prompt = useMemo(
    () =>
      ready
        ? customHtmlPrompt(
            promptInputFrom({
              type,
              businessName,
              brief,
              content,
              assets,
              profile: profile.data,
            }),
          )
        : "",
    [ready, type, businessName, brief, content, assets, profile.data],
  );

  // Changing the concept means copying the instructions again.
  const briefKey = JSON.stringify(value.brief ?? null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on every concept change
  useEffect(() => {
    setCopied(false);
  }, [briefKey]);

  async function copyPrompt() {
    if (!prompt) return;
    const ok = await copyText(prompt);
    if (ok) {
      setCopied(true);
      notify("Copiamos las instrucciones. Pégalas en tu IA.", "success");
    } else
      notify(
        "No pudimos copiar. Abre «Ver instrucciones» y cópialas desde ahí.",
        "error",
      );
  }

  function openService(service: AiService) {
    if (!prompt) return;
    const { url, prefilled } = aiServiceUrl(service, prompt);
    // Copy first (while this page still has focus), then open the AI.
    void copyText(prompt).then((ok) => {
      if (ok) setCopied(true);
    });
    window.open(url, "_blank", "noopener,noreferrer");
    setOpened(true);
    const label = aiServices[service].label;
    notify(
      prefilled
        ? `Abrimos ${label} con tus instrucciones. Adjunta tus imágenes y envíalas.`
        : `Copiamos las instrucciones: pégalas en ${label} y adjunta tus imágenes.`,
      "info",
      { duration: 7_000 },
    );
  }

  // --- Putting code in the editor (one undoable step) ----------------------
  const applyCode = useCallback(
    (
      code: { html: string; css: string },
      message: string,
      show: "code" | "preview" = "preview",
    ) => {
      change((current) => ({ ...current, html: code.html, css: code.css }));
      // A note about an earlier design no longer applies.
      setAiNote(null);
      setAiOpen(false);
      setPasteOpen(false);
      setTab("html");
      setPhonePane(show);
      notify(message, "success", {
        action: { label: "Deshacer", onClick: undo },
        duration: 8_000,
      });
    },
    [change, notify, undo],
  );

  function takePasted(code: PastedCode) {
    if (hasCode) setPendingPaste(code);
    else applyCode(code, pasteMessage(code));
  }

  function startWithBase() {
    applyCode(
      starterCode(type, title),
      "Listo: tu base está en el editor. Escribe sobre ella.",
      "code",
    );
    requestAnimationFrame(() => htmlEditor.current?.focus());
  }

  const ai = useKardoAi({
    workspaceId,
    experienceId,
    onResult: (result) => {
      applyCode(
        result,
        "La IA de Kardo diseñó tu página. Revísala y ajústala.",
      );
      setAiNote(result.notes || null);
      void reloadAiUsage();
    },
  });

  // A refusal (too many requests, no quota) changes the counter too.
  const aiStatus = ai.state.status;
  useEffect(() => {
    if (aiStatus !== "idle" && aiStatus !== "running" && aiStatus !== "done")
      void reloadAiUsage();
  }, [aiStatus, reloadAiUsage]);

  function generate() {
    const prepared = prepareCustomHtml(value).brief;
    if (!prepared || !canEdit) return;
    void ai.generate(
      prepared,
      refineCurrent && hasCode ? { html: value.html, css: value.css } : null,
    );
  }

  // --- "Usar como bloque" (addendum 3) --------------------------------------
  function useAsBlock() {
    if (!canEdit) return;
    const result = onUseAsBlock(value.html, value.css);
    notify(
      result.ok ? result.message : result.reason,
      result.ok ? "success" : "info",
    );
  }

  // --- Inserts -------------------------------------------------------------
  function insertInto(target: CodeTab, text: string) {
    setTab(target);
    setPhonePane("code");
    requestAnimationFrame(() => {
      const editor = target === "html" ? htmlEditor.current : cssEditor.current;
      editor?.refresh();
      editor?.insert(text);
    });
  }

  // --- Focus requests from Guardar ------------------------------------------
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.area === "concept") {
      setAiOpen(true);
      const timer = window.setTimeout(
        () => descriptionRef.current?.focus(),
        60,
      );
      return () => window.clearTimeout(timer);
    }
    setTab("html");
    setPhonePane("code");
    const frame = requestAnimationFrame(() => htmlEditor.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  useEffect(() => {
    if (tab === "html") htmlEditor.current?.refresh();
    if (tab === "css") cssEditor.current?.refresh();
  }, [tab]);

  // --- Preview and images ------------------------------------------------------
  const deferredHtml = useDeferredValue(value.html);
  const deferredCss = useDeferredValue(value.css);
  const prepared = useMemo(
    () => prepareSource({ html: deferredHtml, css: deferredCss }),
    [deferredHtml, deferredCss],
  );
  const slots = useMemo(
    () => findImageSlots({ html: deferredHtml, css: deferredCss }),
    [deferredHtml, deferredCss],
  );
  const slotLabels = useMemo(() => imageSlotLabels(slots), [slots]);
  const avatarRef = (content as { avatarAssetId?: string }).avatarAssetId;
  const imageRefs = useMemo(
    () => [...prepared.imageRefs, ...(avatarRef ? [avatarRef] : [])],
    [prepared.imageRefs, avatarRef],
  );
  const images = useDesignImages(workspaceId, imageRefs);
  const lastGood = useRef<string>("");
  const previewHtml = useMemo(() => {
    try {
      lastGood.current = renderSourceDocument(
        toDesignableContent(type, content),
        prepared,
        images.resolve,
        title,
      );
    } catch {
      // Keep the last page that rendered.
    }
    return lastGood.current;
  }, [type, content, prepared, images.resolve, title]);

  function connect(slot: ImageSlot, asset: Asset) {
    const label = slotLabels.get(slot.value) ?? slot.value;
    change((current) => ({
      ...current,
      ...connectImageSlot(current, slot.value, asset.id),
    }));
    setConnecting(null);
    notify(`Listo: ${label} ahora muestra «${asset.filename}».`, "success", {
      action: { label: "Deshacer", onClick: undo },
      duration: 8_000,
    });
  }

  function uploaded(asset: Asset) {
    addAsset(asset);
    if (asset.status === "validated")
      notify(`Subimos «${asset.filename}» a Archivos.`, "success");
    else if (asset.status === "rejected")
      notify(
        `«${asset.filename}» no pasó la revisión. Usa una imagen PNG, JPEG o WebP válida.`,
        "error",
      );
    else notify(`«${asset.filename}» está en revisión.`, "info");
  }

  async function copyImageCode(asset: Asset) {
    const ok = await copyText(
      imageSnippet(asset.id, "html", imageLabel(asset)),
    );
    notify(
      ok
        ? "Copiamos el código de la imagen. Pégalo en tu HTML."
        : "No pudimos copiar. Usa Insertar en HTML.",
      ok ? "success" : "error",
    );
  }

  // --- Layout ------------------------------------------------------------------
  const codeTab: CodeTab = tab === "css" ? "css" : "html";
  const count = codeTab === "html" ? value.html.length : value.css.length;
  const limit =
    codeTab === "html" ? CUSTOM_HTML_LIMITS.html : CUSTOM_HTML_LIMITS.css;
  const running = ai.state.status === "running";

  const stage = (
    <HtmlStage
      desktopWidth={desktopWidth}
      device={device}
      html={previewHtml}
      onFitChange={onFitChange}
      title={title}
      zoom={zoom}
    />
  );

  const code = (
    <div className="esh-code-col">
      <div className="esh-toolbar">
        <button
          aria-busy={running || undefined}
          className="button button-secondary button-small esh-ai-open"
          onClick={() => setAiOpen(true)}
          type="button"
        >
          {running ? (
            <span aria-hidden="true" className="button-spinner" />
          ) : (
            <Icon name="sparkles" size={15} />
          )}
          {running ? "La IA está diseñando…" : "Ayuda de la IA"}
        </button>
        <button
          className="button button-secondary button-small"
          disabled={!canEdit}
          onClick={() => setPasteOpen(true)}
          title="Pegar el código de tu IA"
          type="button"
        >
          <Icon name="paste" size={15} />
          <span className="esh-label">Pegar código</span>
        </button>
        <button
          className="button button-secondary button-small"
          disabled={!canEdit || !hasCode}
          onClick={useAsBlock}
          title="Convierte tu HTML y tu CSS en un bloque del diseño de Bloques"
          type="button"
        >
          <Icon name="board" size={15} />
          <span className="esh-label">Usar como bloque</span>
        </button>
        <button
          className="button button-secondary button-small"
          disabled={!canEdit}
          onClick={onGenerateFromBlocks}
          title="Reemplaza tu código con el de tu diseño de bloques actual"
          type="button"
        >
          <Icon name="refresh" size={15} />
          <span className="esh-label">Generar desde bloques</span>
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild disabled={!canEdit}>
            <button
              className="button button-secondary button-small"
              title="Insertar imagen, enlaces, redes o perfil"
              type="button"
            >
              <Icon name="plus" size={15} />
              <span className="esh-label">Insertar</span>
              <Icon name="chevron-down" size={14} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="kd-dropdown-content esh-insert-menu"
              sideOffset={4}
            >
              <DropdownMenu.Item
                className="kd-dropdown-item"
                onSelect={() => setTab("images")}
              >
                <Icon name="image-plus" size={16} />
                <span className="esh-menu-text">
                  <strong className="esh-menu-title">Una imagen</strong>
                  <small className="esh-menu-hint">
                    Súbela o elígela en la pestaña Imágenes
                  </small>
                </span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="kd-dropdown-separator" />
              {widgetsFor(type).map((tag) => (
                <DropdownMenu.Item
                  className="kd-dropdown-item"
                  key={tag}
                  onSelect={() => insertInto("html", `<${tag}></${tag}>`)}
                >
                  <Icon name={widgetCopy[tag].icon} size={16} />
                  <span className="esh-menu-text">
                    <strong className="esh-menu-title">
                      {widgetCopy[tag].label}
                    </strong>
                    <small className="esh-menu-hint">
                      &lt;{tag}&gt; · {widgetCopy[tag].hint}
                    </small>
                  </span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {!value.active ? (
        <Notice
          action={
            canEdit ? (
              <button
                className="button button-secondary button-small"
                onClick={() => onPublishChange(true)}
                type="button"
              >
                Mostrar este HTML en mi página
              </button>
            ) : undefined
          }
          tone="info"
          variant="banner"
        >
          Tu página muestra el diseño de bloques. Este HTML no se publica.
        </Notice>
      ) : null}

      {blocksChangedSinceEdit ? (
        <Notice
          action={
            <span className="esh-notice-actions">
              {canEdit ? (
                <button
                  className="text-action"
                  onClick={onBringBlocksChanges}
                  type="button"
                >
                  Traer los cambios de bloques
                </button>
              ) : null}
              <button
                className="text-action"
                onClick={onKeepMyHtml}
                type="button"
              >
                Mantener mi HTML
              </button>
            </span>
          }
          tone="warning"
          variant="banner"
        >
          Tus bloques cambiaron después de tu última edición en HTML.
        </Notice>
      ) : null}

      {aiNote ? (
        <Notice
          onDismiss={() => setAiNote(null)}
          title="Nota de la IA de Kardo"
          tone="info"
        >
          {aiNote}
        </Notice>
      ) : null}

      <Tabs.Root
        className="esh-editor"
        onValueChange={(next) => setTab(next as Tab)}
        value={tab}
      >
        <div className="esh-tabs">
          <Tabs.List aria-label="Tu código" className="esh-tab-list">
            <Tabs.Trigger className="esh-tab" value="html">
              HTML
            </Tabs.Trigger>
            <Tabs.Trigger className="esh-tab" value="css">
              CSS
            </Tabs.Trigger>
            <Tabs.Trigger className="esh-tab esh-tab-images" value="images">
              Imágenes
              {slots.length ? (
                <>
                  <span aria-hidden="true" className="esh-badge">
                    {slots.length}
                  </span>
                  <span className="visually-hidden">
                    {slots.length === 1
                      ? ", 1 por conectar"
                      : `, ${slots.length} por conectar`}
                  </span>
                </>
              ) : null}
            </Tabs.Trigger>
          </Tabs.List>
          {tab !== "images" ? (
            <span
              className="esh-counter"
              data-level={
                count > limit
                  ? "over"
                  : count > limit * 0.9
                    ? "near"
                    : undefined
              }
            >
              {formatCount(count)}
              <span className="esh-counter-limit"> / {formatCount(limit)}</span>
            </span>
          ) : null}
        </div>
        <div className="esh-editor-panes">
          <Tabs.Content
            className="esh-pane"
            forceMount
            tabIndex={-1}
            value="html"
          >
            <CodeEditor
              handleRef={htmlEditor}
              label="HTML de tu página"
              language="html"
              onChange={(next, kind) =>
                change(
                  (current) => ({ ...current, html: next }),
                  kind === "typing" ? "code:html" : undefined,
                )
              }
              onRedo={redo}
              onUndo={undo}
              placeholderText={`<section class="portada">\n  <h1>Tu negocio</h1>\n  <kardo-links></kardo-links>\n</section>`}
              readOnly={!canEdit}
              value={value.html}
            />
          </Tabs.Content>
          <Tabs.Content
            className="esh-pane"
            forceMount
            tabIndex={-1}
            value="css"
          >
            <CodeEditor
              handleRef={cssEditor}
              label="CSS de tu página"
              language="css"
              onChange={(next, kind) =>
                change(
                  (current) => ({ ...current, css: next }),
                  kind === "typing" ? "code:css" : undefined,
                )
              }
              onRedo={redo}
              onUndo={undo}
              placeholderText={
                '.portada {\n  padding: 48px 24px;\n  font-family: "Playfair Display";\n}'
              }
              readOnly={!canEdit}
              value={value.css}
            />
          </Tabs.Content>
          <Tabs.Content className="esh-pane esh-pane-images" value="images">
            <ImagesPanel
              assets={assets}
              canEdit={canEdit}
              canUpload={canUpload}
              onConnect={setConnecting}
              onCopy={(asset) => void copyImageCode(asset)}
              onInsertHtml={(asset) =>
                insertInto(
                  "html",
                  imageSnippet(asset.id, "html", imageLabel(asset)),
                )
              }
              onUploaded={uploaded}
              onUseBackground={(asset) => {
                insertInto("css", imageSnippet(asset.id, "css"));
                notify(
                  "La pusimos en tu CSS como url(…). Úsala dentro de background-image.",
                  "info",
                );
              }}
              slotLabels={slotLabels}
              slots={slots}
              workspaceId={workspaceId}
            />
          </Tabs.Content>
          {!hasCode && tab !== "images" ? (
            <EmptyCode
              canEdit={canEdit}
              onAiHelp={() => setAiOpen(true)}
              onBase={startWithBase}
              onPaste={() => setPasteOpen(true)}
            />
          ) : null}
        </div>
      </Tabs.Root>

      {hasCode ? (
        <ReportCard
          onConnectImages={
            slots.length && tab !== "images"
              ? () => setTab("images")
              : undefined
          }
          report={prepared.report}
        />
      ) : null}
    </div>
  );

  return (
    <div className="esh" data-device={device} data-layout={layout}>
      {lockedNote ? (
        <Notice icon="lock" tone="info">
          {lockedNote}
        </Notice>
      ) : null}

      {layout === "phone" ? (
        <div className="esh-editor-view" data-phone="">
          <RadioGroup.Root
            aria-label="Ver"
            className="qrs-segmented qrs-segmented-fill"
            loop
            onValueChange={(next) => {
              if (next) setPhonePane(next as "code" | "preview");
            }}
            orientation="horizontal"
            value={phonePane}
          >
            {(
              [
                ["code", "Código", "code"],
                ["preview", "Vista previa", "eye"],
              ] as const
            ).map(([pane, label, icon]) => (
              <RadioGroup.Item className="qrs-segment" key={pane} value={pane}>
                <Icon name={icon} size={15} />
                <span>{label}</span>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
          {phonePane === "code" ? (
            code
          ) : (
            <div className="esh-preview-col">{stage}</div>
          )}
        </div>
      ) : (
        <div className="esh-editor-view">
          {code}
          <div className="esh-preview-col">{stage}</div>
        </div>
      )}

      <AiHelpDialog
        ai={ai.state}
        aiUsage={aiUsage}
        assets={assets}
        brandColors={brandColors}
        brief={brief}
        canEdit={canEdit}
        canUpload={canUpload}
        copied={copied}
        descriptionRef={descriptionRef}
        hasCode={hasCode}
        onAssetUploaded={addAsset}
        onBriefChange={onBriefChange}
        onCancelGenerate={ai.cancel}
        onClose={() => setAiOpen(false)}
        onCopy={() => void copyPrompt()}
        onGenerate={generate}
        onOpen={openService}
        onPaste={takePasted}
        onPathChange={setAiPath}
        onRefineCurrentChange={setRefineCurrent}
        onShowPrompt={() => setShowPrompt(true)}
        open={aiOpen}
        opened={opened}
        path={aiPath}
        ready={ready}
        refineCurrent={refineCurrent}
        workspaceId={workspaceId}
      />

      <Dialog
        description="Esto es lo que copias para tu IA. Incluye tu concepto, tu contenido y las reglas para que el código se pueda publicar."
        footer={
          <>
            <span className="esh-dialog-meta">
              {formatCount(prompt.length)} caracteres
            </span>
            <button
              className="button button-primary"
              onClick={() => void copyPrompt()}
              type="button"
            >
              <Icon name="copy" size={16} /> Copiar instrucciones
            </button>
          </>
        }
        onClose={() => setShowPrompt(false)}
        open={showPrompt}
        size="large"
        title="Instrucciones para tu IA"
      >
        <textarea
          aria-label="Instrucciones para tu IA"
          className="esh-prompt"
          readOnly
          rows={16}
          value={prompt}
        />
      </Dialog>

      <Dialog
        description="Pega lo que te respondió tu IA. Reemplaza el código del editor; puedes deshacerlo."
        onClose={() => setPasteOpen(false)}
        open={pasteOpen}
        size="large"
        title="Pegar el código de tu IA"
      >
        <PasteBox compact disabled={!canEdit} onUse={takePasted} />
      </Dialog>

      <ConfirmDialog
        confirmLabel="Reemplazar mi código"
        description="El código que pegaste reemplaza el HTML y el CSS del editor. Si cambias de idea, deshazlo con ⌘Z."
        onClose={() => setPendingPaste(null)}
        onConfirm={() => {
          if (pendingPaste) applyCode(pendingPaste, pasteMessage(pendingPaste));
          setPendingPaste(null);
        }}
        open={pendingPaste !== null}
        title="¿Reemplazar tu código actual?"
      />

      <ConnectImageDialog
        assets={assets}
        canUpload={canUpload}
        label={
          connecting
            ? (slotLabels.get(connecting.value) ?? connecting.value)
            : ""
        }
        onClose={() => setConnecting(null)}
        onConnect={(asset) => {
          if (connecting) connect(connecting, asset);
        }}
        onUploaded={uploaded}
        slot={connecting}
        workspaceId={workspaceId}
      />
    </div>
  );
}

function pasteMessage(code: PastedCode): string {
  return code.notes.length
    ? `Listo: tu código está en el editor. ${code.notes[0]}`
    : "Listo: tu código está en el editor.";
}

/** An empty editor: write over the placeholder, or start another way. */
function EmptyCode({
  canEdit,
  onAiHelp,
  onPaste,
  onBase,
}: {
  canEdit: boolean;
  onAiHelp: () => void;
  onPaste: () => void;
  onBase: () => void;
}) {
  const titleId = useId();
  if (!canEdit)
    return (
      <div className="esh-empty">
        <div className="esh-empty-card" data-quiet="">
          <p className="esh-empty-lead">Esta página todavía no tiene HTML.</p>
        </div>
      </div>
    );
  const options: {
    icon: IconName;
    title: string;
    hint: string;
    onClick: () => void;
  }[] = [
    {
      icon: "sparkles",
      title: "Ayuda de la IA",
      hint: "Tu IA o la de Kardo lo diseñan con tu concepto.",
      onClick: onAiHelp,
    },
    {
      icon: "paste",
      title: "Pegar código",
      hint: "¿Ya lo tienes? Pégalo y lo acomodamos.",
      onClick: onPaste,
    },
    {
      icon: "template",
      title: "Empezar con una base",
      hint: "Una estructura mínima con tus enlaces.",
      onClick: onBase,
    },
  ];
  return (
    <div className="esh-empty">
      <section aria-labelledby={titleId} className="esh-empty-card">
        <h3 id={titleId}>Empieza tu página</h3>
        <p className="esh-empty-lead">
          Escribe tu código arriba o elige cómo empezar.
        </p>
        <ul className="esh-empty-options">
          {options.map((option) => (
            <li key={option.title}>
              <button
                className="esh-empty-option"
                onClick={option.onClick}
                type="button"
              >
                <span aria-hidden="true" className="esh-empty-icon">
                  <Icon name={option.icon} size={16} />
                </span>
                <span className="esh-empty-text">
                  <strong>{option.title}</strong>
                  <small>{option.hint}</small>
                </span>
                <Icon name="chevron-right" size={16} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
