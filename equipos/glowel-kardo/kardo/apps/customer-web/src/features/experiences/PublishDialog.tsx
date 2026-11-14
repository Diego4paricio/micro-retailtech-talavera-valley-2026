import {
  type ExperienceTargets,
  type Touchpoint,
  whatsappUrlFromPhone,
} from "@kardo/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { experiencesApi } from "../../api/experiences.js";
import { linksApi } from "../../api/links.js";
import { touchpointsApi } from "../../api/touchpoints.js";
import { Dialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { errorMessage } from "../../lib/api.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { linkTitle, useLinkQuickActions } from "../links/LinkActions.js";
import { LinkAddressField } from "../links/LinkAddressField.js";
import { useWorkspaceProfile } from "../settings/use-workspace-profile.js";
import { isDesignableType } from "../studio/model/content.js";
import { TouchpointQrDownload } from "../touchpoints/QrDownload.js";
import "./publish-dialog.css";
import { flattenGroupTree, indentedName } from "../touchpoints/group-tree.js";
import {
  suggestedDestinationNameChips,
  suggestedQrName,
} from "../touchpoints/naming.js";
import { useExperienceWorkspace } from "./ExperienceWorkspaceContext.js";
import {
  conflictingTouchpoints,
  defaultPickMode,
  isUnpublishedPage,
  keptDestinationLine,
  newDestinationTargets,
  onlyDestinationKind,
  type PublishPickMode,
  replaceWarningText,
  type ShareWhere,
  shareKind,
  shareOptions,
  takenNameNote,
} from "./publish-model.js";
import {
  describeEmptyPage,
  describeSampleIssues,
  emptyPageReason,
  findSampleContent,
} from "./sample-content.js";
import { TargetPicker } from "./TargetPicker.js";
import { planPublication, sameTargets } from "./targets.js";
import { experienceViewRoute, publishDialogState } from "./workspace-model.js";

const namesShown = 4;
/** A long QR name stays readable inside «Publicar en «…»». */
const buttonNameMax = 24;

/**
 * One dialog for the whole publish flow: it saves pending changes first
 * ("Guardar y publicar"), shows where the Experience will be published and,
 * when nothing is chosen yet, lets the person pick Touchpoints or groups
 * right there. A publish attempt keeps one idempotency key for its retries.
 *
 * A page that has never gone live defaults to a brand-new destination
 * instead of silently taking over a QR, an NFC tag or a link that already
 * shows something else (relevo 37, B2 — Lucía's «Menú», Ernesto's tarjeta).
 * Replacing one that is live is always chosen on purpose, with a clear
 * warning and an explicit confirmation, never a default.
 *
 * A new destination starts with «¿Dónde lo vas a compartir?» (prototipo P2
 * de la ronda 4, approved by the owner): Instagram or WhatsApp get a link,
 * the local gets a QR, and an NFC tag is its own answer. No answer is
 * preselected — a QR first is how Karla, Ana and Mateo, who share on
 * Instagram, ended up with one.
 */
export function PublishDialog() {
  const ws = useExperienceWorkspace();
  const {
    workspace,
    touchpoints,
    groups,
    experiences,
    can,
    upsertTouchpoint,
    refreshPublicationState,
  } = useWorkspace();
  const { route, navigate } = useRouter();
  const linkActions = useLinkQuickActions();
  const open = ws.isPublishOpen;
  const canCreateDestination = can("touchpoints.manage");

  const [selection, setSelection] = useState<ExperienceTargets>(ws.targets);
  const [isPicking, setIsPicking] = useState(false);
  const [pickMode, setPickMode] = useState<PublishPickMode>("existing");
  const [openedUnpublished, setOpenedUnpublished] = useState(false);
  const [shareWhere, setShareWhere] = useState<ShareWhere | null>(null);
  const [destName, setDestName] = useState("");
  const [customDestName, setCustomDestName] = useState(false);
  const [linkSlug, setLinkSlug] = useState("");
  const [linkSlugReady, setLinkSlugReady] = useState(false);
  const [isCreatingDestination, setIsCreatingDestination] = useState(false);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  // Created, but publishing failed: retrying publishes it instead of
  // creating a second one (relevo 37, mirrors Primeros pasos's ShareStep).
  const [pendingDestination, setPendingDestination] =
    useState<Touchpoint | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [justPublished, setJustPublished] = useState<Touchpoint | null>(null);
  const [downloading, setDownloading] = useState(false);
  // A new QR or tag can go in a group, like one made in «QR y etiquetas»
  // (domain audit A9-9): it then takes the group's design.
  const [destGroupId, setDestGroupId] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const profile = useWorkspaceProfile();
  const industry = profile.data?.industry ?? null;

  // Every opening starts from the current (possibly unsaved) destinations,
  // with a fresh idempotency key reused by this attempt's retries.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
  useEffect(() => {
    if (!open) return;
    keyRef.current = crypto.randomUUID();
    setSelection(ws.targets);
    const unpublished = isUnpublishedPage(ws.experience);
    // A page that never went live and only carries destinations showing
    // other pages (an old copy) starts by asking where to share it, not by
    // offering to replace them (round 4, Sofía's «Buen Fin»).
    const onlyTakeovers =
      unpublished &&
      ws.resolvedTargets.length > 0 &&
      ws.resolvedTargets.every(
        (touchpoint) =>
          touchpoint.live && touchpoint.live.experienceId !== ws.experienceId,
      );
    setIsPicking(
      ws.resolvedTargets.length === 0 ||
        (canCreateDestination && onlyTakeovers),
    );
    setOpenedUnpublished(unpublished);
    const conflicts = conflictingTouchpoints(
      touchpoints.data ?? [],
      ws.experienceId,
    );
    setPickMode(
      canCreateDestination
        ? defaultPickMode({
            isUnpublished: unpublished,
            hasConflict: conflicts.length > 0,
          })
        : "existing",
    );
    setShareWhere(null);
    setCustomDestName(false);
    setDestName("");
    setLinkSlug("");
    setLinkSlugReady(false);
    setIsCreatingDestination(false);
    setDestinationError(null);
    setPendingDestination(null);
    setReplaceConfirmed(false);
    setJustPublished(null);
    setError(null);
  }, [open]);

  // Example or missing content (relevo 31, finding 8; relevo 37, B4): a
  // page with nothing real blocks with "Completar"; a few leftover
  // placeholders only warn.
  const ownWhatsapp = whatsappUrlFromPhone(
    profile.data?.phone,
    profile.data?.country,
  );
  const sampleIssues = useMemo(
    () => (open ? findSampleContent(ws.type, ws.content, ownWhatsapp) : []),
    [open, ws.type, ws.content, ownWhatsapp],
  );
  const emptyReason = useMemo(
    () => (open ? emptyPageReason(ws.type, ws.content, ownWhatsapp) : null),
    [open, ws.type, ws.content, ownWhatsapp],
  );

  const conflicts = useMemo(
    () =>
      open
        ? conflictingTouchpoints(touchpoints.data ?? [], ws.experienceId)
        : [],
    [open, touchpoints.data, ws.experienceId],
  );
  const newKind = shareWhere ? shareKind(shareWhere) : null;

  function updateSelection(next: ExperienceTargets) {
    setSelection(next);
    setReplaceConfirmed(false);
  }

  function destinationNameChips(kind: "qr" | "nfc") {
    return suggestedDestinationNameChips(
      kind,
      ws.type,
      industry,
      workspace.name,
      (touchpoints.data ?? []).map((touchpoint) => touchpoint.operationalName),
      ws.name,
    );
  }

  /** Kardo's usual name for this kind, before skipping the taken ones.
   * With the giro and the business's own name: a food truck or a tianguis
   * stall has no giro of its own (relevo 37, C9a and C9b). */
  function usualName(kind: "qr" | "nfc") {
    return kind === "qr"
      ? suggestedQrName(ws.type, industry, workspace.name)
      : (suggestedDestinationNameChips(kind, ws.type, industry)[0] ?? "");
  }

  function pickWhere(where: ShareWhere) {
    setShareWhere(where);
    setDestinationError(null);
    setPendingDestination(null);
    const kind = shareKind(where);
    if (kind !== "link") {
      // The first free name, already marked: Ana got a second «Mostrador»
      // with no chip marked and «Publicar» active (round 4).
      setCustomDestName(false);
      setDestName(destinationNameChips(kind)[0] ?? "");
    }
  }

  function startNewDestination() {
    setIsPicking(true);
    setPickMode("new");
    setShareWhere(null);
    setReplaceConfirmed(false);
    setDestinationError(null);
    setPendingDestination(null);
  }

  /**
   * The new destination: one button creates it (unless a previous attempt
   * already did and only publishing failed) and publishes right away — never
   * "Crear" and then a separate, disabled "Publicar" (relevo 37, B2
   * follow-up). A creation failure stops here, in `destinationError`, with
   * nothing published. A page that never went live goes only to the new
   * destination (`newDestinationTargets`, round 4 B1); a live one adds it.
   */
  async function createAndPublish() {
    if (isCreatingDestination || !newKind) return;
    setDestinationError(null);
    setIsCreatingDestination(true);
    try {
      if (newKind === "link") {
        await createLinkAndPublish();
        return;
      }
      let touchpoint = pendingDestination;
      if (!touchpoint) {
        const operationalName = destName.trim();
        if (!operationalName) return;
        touchpoint = await touchpointsApi.create(workspace.id, {
          operationalName,
          kind: newKind,
          ...(destGroupId ? { groupId: destGroupId } : {}),
        });
        upsertTouchpoint(touchpoint);
      }
      const nextSelection = newDestinationTargets({
        isUnpublished: openedUnpublished,
        current: ws.targets,
        touchpointId: touchpoint.id,
      });
      const result = await ws.publish({
        targets: nextSelection,
        idempotencyKey: keyRef.current ?? crypto.randomUUID(),
        // A new destination never takes over anything else.
        replaceTargets: [],
      });
      if (!result.ok) {
        setPendingDestination(touchpoint);
        setDestinationError(result.message);
        return;
      }
      keyRef.current = null;
      setPendingDestination(null);
      setSelection(nextSelection);
      setReplaceConfirmed(false);
      setJustPublished(touchpoint);
    } catch (cause) {
      setDestinationError(errorMessage(cause));
    } finally {
      setIsCreatingDestination(false);
    }
  }

  /**
   * A link points at a saved page, so the page is saved first (quietly: a
   * new page stays where it is). Creating the link adds it to the page's
   * destinations on the server; a page that never went live is then left
   * with only that link before publishing, so a copy never also publishes
   * over what it carried from its original (Sofía's «Buen Fin» replaced
   * /productos, round 4 B1).
   */
  async function createLinkAndPublish() {
    const saved = await ws.saveDraft();
    if (!saved) {
      setDestinationError(
        isDesignableType(ws.type)
          ? "Revisa los campos marcados en el Estudio antes de publicar."
          : "Revisa los campos marcados en Diseño antes de publicar.",
      );
      return;
    }
    let link = pendingDestination;
    if (!link) {
      if (!linkSlugReady) return;
      link = await linksApi.createWithoutPublishing(workspace.id, {
        experienceId: saved.id,
        slug: linkSlug,
      });
      upsertTouchpoint(link);
    }
    // The server added the link to the saved destinations.
    const nextSelection = newDestinationTargets({
      isUnpublished: openedUnpublished,
      current: ws.savedTargets,
      touchpointId: link.id,
    });
    try {
      if (openedUnpublished)
        await experiencesApi.setTargets(workspace.id, saved.id, nextSelection);
      await experiencesApi.publish(
        workspace.id,
        saved.id,
        keyRef.current ?? undefined,
        { replaceTargets: [] },
      );
    } catch (cause) {
      setPendingDestination(link);
      setDestinationError(errorMessage(cause));
      return;
    }
    ws.adoptSavedTargets(nextSelection);
    void refreshPublicationState();
    keyRef.current = null;
    setPendingDestination(null);
    setSelection(nextSelection);
    setReplaceConfirmed(false);
    setJustPublished(link);
  }

  const plan = useMemo(
    () =>
      planPublication({
        experienceId: ws.experienceId,
        targets: selection,
        touchpoints: touchpoints.data ?? [],
        experiences: experiences.data ?? [],
        groups: groups.data ?? [],
      }),
    [
      ws.experienceId,
      selection,
      touchpoints.data,
      experiences.data,
      groups.data,
    ],
  );
  const resolvedCount = plan.publishable.length + plan.skipped.length;
  // Every kind counts: a page already live only on a link is already
  // published (relevo 37, E3 — Diego, Fernanda), not waiting for a QR.
  const destinationCount = (touchpoints.data ?? []).filter(
    (item) => item.status !== "retired",
  ).length;
  const state = publishDialogState({
    isDirty: ws.isDirty,
    targetsChanged: !sameTargets(selection, ws.savedTargets),
    errorCount: ws.errorCount,
    hasTouchpoints: destinationCount > 0,
    resolvedCount,
    publishableCount: plan.publishable.length,
    isInFlight: ws.isPublicationInFlight,
    isBusy,
  });
  const replaced = plan.publishable.filter((entry) => entry.replacing);
  const canConfirm = state.canConfirm && (!replaced.length || replaceConfirmed);
  const onlyLink = onlyDestinationKind(plan.publishable, "link");
  // "En un QR o link nuevo" is showing its fields: the footer offers one
  // button that creates and publishes, never a disabled "Publicar" waiting
  // on a separate "Crear".
  const showingNewDestinationForm =
    canCreateDestination &&
    (destinationCount === 0 || (isPicking && pickMode === "new"));
  const canCreateAndPublish =
    newKind !== null &&
    (Boolean(pendingDestination) ||
      (newKind === "link" ? linkSlugReady : destName.trim().length > 0));
  // «Publicar en /buen-fin», «Publicar en «Recepción»»: the button says
  // where, so nothing else needs to.
  const createLabel =
    newKind === "link" && linkSlugReady && linkSlug
      ? `Publicar en /${linkSlug}`
      : newKind && newKind !== "link" && destName.trim()
        ? `Publicar en «${shortName(destName.trim())}»`
        : "Publicar";
  // The page carries destinations from before (an old copy) or is live:
  // «Cambiar» and the summary read accordingly.
  const liveHere = (touchpoint: Touchpoint) =>
    touchpoint.live?.experienceId === ws.experienceId;

  async function confirm() {
    if (!canConfirm) return;
    setIsBusy(true);
    setError(null);
    const result = await ws.publish({
      targets: selection,
      idempotencyKey: keyRef.current ?? crypto.randomUUID(),
      // Only what the owner just confirmed under «Vas a reemplazar…».
      replaceTargets: replaced.map((entry) => entry.touchpoint.id),
    });
    setIsBusy(false);
    if (result.ok) {
      keyRef.current = null;
      // Exactly one physical destination, just published here: the QR is
      // easy to miss afterwards (relevo 37, S8 — Chema).
      const single =
        plan.publishable.length === 1 ? plan.publishable[0]?.touchpoint : null;
      if (single && (single.kind ?? "qr") !== "link") setJustPublished(single);
      else ws.closePublish();
      return;
    }
    setError(result.message);
    if (
      result.code === "TARGETS_REQUIRED" ||
      result.code === "TARGETS_OVERRIDDEN" ||
      result.code === "REPLACE_NOT_CONFIRMED"
    )
      setIsPicking(true);
  }

  /** "Publicar de todos modos" (B4): whichever of the two publish actions
   * applies to the state showing right now. */
  function publishAnyway() {
    void (showingNewDestinationForm ? createAndPublish() : confirm());
  }

  function close() {
    if (isBusy) return;
    ws.closePublish();
  }

  function goToComplete() {
    const id = ws.experienceId;
    ws.closePublish();
    if (id) navigate(experienceViewRoute(id, "diseno"));
  }

  const names = plan.publishable.map(
    (entry) => entry.touchpoint.operationalName,
  );

  function renderNewDestinationFields() {
    const kind = newKind;
    const groupList = flattenGroupTree(groups.data ?? []);
    const chips = kind && kind !== "link" ? destinationNameChips(kind) : [];
    const needsAddress = kind === "link" && !workspace.slug;
    const takenNote =
      kind && kind !== "link"
        ? takenNameNote(usualName(kind), touchpoints.data ?? [])
        : null;
    const keptLine =
      shareWhere && openedUnpublished
        ? keptDestinationLine(shareWhere, conflicts)
        : null;
    return (
      <div className="xpp-newdest">
        <div
          aria-label="¿Dónde lo vas a compartir?"
          className="xpp-share"
          role="radiogroup"
        >
          {shareOptions.map((option) => (
            <label
              className={
                shareWhere === option.value
                  ? "xpp-share-opt xpp-share-opt-on"
                  : "xpp-share-opt"
              }
              key={option.value}
            >
              <input
                checked={shareWhere === option.value}
                name="xpp-share"
                onChange={() => pickWhere(option.value)}
                type="radio"
              />
              <span aria-hidden="true" className="xpp-share-icon">
                <Icon name={option.icon} size={18} />
              </span>
              <span className="xpp-share-main">
                <strong>{option.title}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </div>
        {kind === "link" ? (
          needsAddress ? (
            <p className="xpp-note">
              Primero elige tu link en Kardo, en Configuración.
            </p>
          ) : (
            <LinkAddressField
              businessSlug={workspace.slug}
              experience={{ name: ws.name, type: ws.type }}
              label="Tu link"
              onChange={(next) => {
                setLinkSlug(next);
                setDestinationError(null);
              }}
              onReadyChange={setLinkSlugReady}
              value={linkSlug}
              workspaceId={workspace.id}
            />
          )
        ) : kind ? (
          <div className="xpp-name-field">
            <label htmlFor="xpp-dest-name">
              ¿Dónde lo vas a poner?{" "}
              <small>
                (así se llamará tu {kind === "nfc" ? "etiqueta" : "QR"})
              </small>
            </label>
            <div className="xpp-name-chips">
              {chips.map((chip) => (
                <button
                  aria-pressed={!customDestName && destName === chip}
                  className={
                    !customDestName && destName === chip
                      ? "xpp-name-chip xpp-name-chip-on"
                      : "xpp-name-chip"
                  }
                  key={chip}
                  onClick={() => {
                    setCustomDestName(false);
                    setDestName(chip);
                  }}
                  type="button"
                >
                  {chip}
                </button>
              ))}
              <button
                aria-pressed={customDestName}
                className={
                  customDestName
                    ? "xpp-name-chip xpp-name-chip-on"
                    : "xpp-name-chip"
                }
                onClick={() => {
                  setCustomDestName(true);
                  setDestName("");
                }}
                type="button"
              >
                Otro nombre
              </button>
            </div>
            {customDestName ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: the only field revealed by "Otro nombre"
                autoFocus
                className="input"
                id="xpp-dest-name"
                maxLength={120}
                onChange={(event) => setDestName(event.target.value)}
                placeholder="Escribe un nombre"
                value={destName}
              />
            ) : null}
            {takenNote ? <p className="xpp-note">{takenNote}</p> : null}
            {groupList.length > 0 ? (
              <div className="xpp-group-field">
                <label htmlFor="xpp-dest-group">¿En qué grupo va?</label>
                <select
                  className="input"
                  id="xpp-dest-group"
                  onChange={(event) => setDestGroupId(event.target.value)}
                  value={destGroupId}
                >
                  <option value="">Sin grupo</option>
                  {groupList.map(({ group, depth }) => (
                    <option key={group.id} value={group.id}>
                      {indentedName(group.name, depth)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        ) : null}
        {keptLine ? (
          <p className="xpp-kept">
            <Icon name="check" size={15} />
            {keptLine}
          </p>
        ) : null}
        {destinationError ? (
          <p className="field-error" role="alert">
            {destinationError}
          </p>
        ) : null}
        {destinationCount > 0 ? (
          <button
            className="link-button xpp-switch"
            onClick={() => {
              setPickMode("existing");
              setDestinationError(null);
              setPendingDestination(null);
            }}
            type="button"
          >
            Mejor mostrarla en uno que ya tengo…
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <Dialog
        description={
          justPublished
            ? undefined
            : showingNewDestinationForm
              ? "¿Dónde lo vas a compartir?"
              : "¿Dónde la ven tus clientes?"
        }
        footer={
          justPublished ? (
            <button
              className="button button-primary"
              onClick={() => ws.closePublish()}
              type="button"
            >
              Listo
            </button>
          ) : emptyReason ? (
            <>
              <button
                className="button button-secondary"
                disabled={isBusy}
                onClick={close}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                onClick={goToComplete}
                type="button"
              >
                Completar
              </button>
            </>
          ) : showingNewDestinationForm ? (
            <>
              <button
                className="button button-secondary"
                disabled={isCreatingDestination}
                onClick={close}
                type="button"
              >
                Cancelar
              </button>
              <button
                aria-busy={isCreatingDestination || undefined}
                className="button button-primary"
                disabled={!canCreateAndPublish || isCreatingDestination}
                onClick={() => void createAndPublish()}
                type="button"
              >
                {isCreatingDestination ? (
                  <>
                    <span aria-hidden="true" className="button-spinner" />
                    Publicando…
                  </>
                ) : destinationError ? (
                  "Reintentar"
                ) : (
                  createLabel
                )}
              </button>
            </>
          ) : (
            <>
              <button
                className="button button-secondary"
                disabled={isBusy}
                onClick={close}
                type="button"
              >
                Cancelar
              </button>
              <button
                aria-busy={isBusy || undefined}
                className="button button-primary"
                disabled={!canConfirm}
                onClick={() => void confirm()}
                type="button"
              >
                {isBusy ? (
                  <>
                    <span aria-hidden="true" className="button-spinner" />
                    {state.needsSave
                      ? "Guardando y publicando…"
                      : "Publicando…"}
                  </>
                ) : error ? (
                  "Reintentar"
                ) : (
                  state.confirmLabel
                )}
              </button>
            </>
          )
        }
        onClose={close}
        open={open}
        size={
          (isPicking || showingNewDestinationForm) && !justPublished
            ? "large"
            : "medium"
        }
        title={`Publicar «${ws.name.trim() || "Nueva página"}»`}
      >
        <div className="xpp">
          {justPublished ? (
            <div className="xpp-done">
              <span aria-hidden="true" className="xpp-done-icon">
                <Icon name="check" size={18} />
              </span>
              <div className="xpp-done-body">
                <strong>
                  Ya se ve en tu{" "}
                  {justPublished.kind === "nfc"
                    ? "etiqueta"
                    : justPublished.kind === "link"
                      ? "link"
                      : "QR"}{" "}
                  «
                  {justPublished.kind === "link"
                    ? linkTitle(justPublished)
                    : justPublished.operationalName}
                  »
                </strong>
                <p>Tus clientes ya pueden verla ahí.</p>
              </div>
              {justPublished.kind === "link" ? (
                <button
                  className="button button-secondary"
                  onClick={() => linkActions.copy(justPublished)}
                  type="button"
                >
                  <Icon name="copy" size={16} /> Copiar el link
                </button>
              ) : justPublished.kind === "qr" ? (
                // The QR's own download (domain audit A9-2): its design, the
                // legibility check, and a recorded print.
                <button
                  className="button button-secondary"
                  onClick={() => setDownloading(true)}
                  type="button"
                >
                  <Icon name="download" size={16} /> Descargar tu QR
                </button>
              ) : (
                // A tag is recorded on its page: «Graba tu etiqueta» and its
                // backup QR live there.
                <button
                  className="button button-secondary"
                  onClick={() =>
                    navigate({ name: "touchpoint", id: justPublished.id })
                  }
                  type="button"
                >
                  <Icon name="touchpoint" size={16} />{" "}
                  {justPublished.kind === "nfc"
                    ? "Graba tu etiqueta"
                    : "Ver cómo colocarlo"}
                </button>
              )}
            </div>
          ) : (
            <>
              {state.needsSave ? (
                <p className="xpp-step">
                  <span aria-hidden="true" className="xpp-step-icon">
                    <Icon name="save" size={15} />
                  </span>
                  Primero se guardarán tus cambios sin guardar.
                </p>
              ) : null}

              {state.blocker === "invalid-content" ? (
                <Notice
                  action={
                    <button
                      className="text-action"
                      onClick={() => {
                        const id = ws.experienceId;
                        ws.closePublish();
                        if (id && route.name === "experience" && route.view)
                          navigate(experienceViewRoute(id, "diseno"));
                        ws.revealErrors();
                      }}
                      type="button"
                    >
                      Revisar
                    </button>
                  }
                  tone="warning"
                >
                  Revisa{" "}
                  {ws.errorCount === 1
                    ? "1 campo incompleto"
                    : `${ws.errorCount} campos incompletos`}{" "}
                  {isDesignableType(ws.type) ? "en el Estudio" : "en Diseño"}{" "}
                  antes de publicar.
                </Notice>
              ) : null}

              {destinationCount === 0 ? (
                canCreateDestination ? (
                  <section aria-label="Crear tu primer destino">
                    {renderNewDestinationFields()}
                  </section>
                ) : (
                  <div className="xpp-empty">
                    <Icon name="touchpoint" size={20} />
                    <div>
                      <strong>Aún no hay QR ni etiquetas</strong>
                      <p>
                        Tu página queda guardada. Pide a un Owner, Admin o
                        Editor que cree un QR para publicarla.
                      </p>
                    </div>
                  </div>
                )
              ) : isPicking ? (
                <section className="xpp-picker">
                  {pickMode === "new" && canCreateDestination ? (
                    renderNewDestinationFields()
                  ) : (
                    <>
                      <TargetPicker
                        currentExperienceId={ws.experienceId}
                        groups={groups.data ?? []}
                        legend="¿Dónde la publicas?"
                        onChange={updateSelection}
                        touchpoints={touchpoints.data ?? []}
                        value={selection}
                      />
                      {canCreateDestination ? (
                        <button
                          className="link-button xpp-switch"
                          onClick={startNewDestination}
                          type="button"
                        >
                          Mejor en un lugar nuevo…
                        </button>
                      ) : null}
                    </>
                  )}
                </section>
              ) : (
                <section aria-label="Dónde se publicará" className="xpp-where">
                  <div className="xpp-where-head">
                    <p className="xpp-label">
                      {onlyLink && plan.publishable[0]
                        ? // «Ya se ve» only when it is live there: Sofía's copy
                          // carried /productos from its original and read as
                          // already being there (round 4, B1).
                          `${liveHere(plan.publishable[0].touchpoint) ? "Ya se ve" : "Se publicará"} en tu link ${linkTitle(plan.publishable[0].touchpoint)}`
                        : "Dónde se publicará"}
                    </p>
                    {ws.canEdit ? (
                      <button
                        className="link-button"
                        onClick={() => setIsPicking(true)}
                        type="button"
                      >
                        <Icon name="edit" size={14} /> Cambiar
                      </button>
                    ) : null}
                  </div>
                  {onlyLink ? null : (
                    <ul className="xpp-chips">
                      {names.slice(0, namesShown).map((name) => (
                        <li key={name}>
                          <Icon name="touchpoint" size={14} />
                          {name}
                        </li>
                      ))}
                      {names.length > namesShown ? (
                        <li className="xpp-chip-more">
                          y {names.length - namesShown} más
                        </li>
                      ) : null}
                    </ul>
                  )}
                  {!openedUnpublished && canCreateDestination && ws.canEdit ? (
                    <button
                      className="link-button"
                      onClick={startNewDestination}
                      type="button"
                    >
                      <Icon name="plus" size={14} /> Compartirla también en otro
                      lugar
                    </button>
                  ) : null}
                </section>
              )}

              {/* About the destinations picked above: a new one replaces
                nothing, so none of these apply to it. */}
              {replaced.length && !showingNewDestinationForm ? (
                <Notice
                  title={
                    replaced.length === 1
                      ? "Vas a reemplazar una página"
                      : "Vas a reemplazar varias páginas"
                  }
                  tone="warning"
                >
                  <p className="xpp-replace-text">
                    {replaceWarningText(replaced)}
                  </p>
                  <label className="xpp-replace-confirm">
                    <input
                      checked={replaceConfirmed}
                      onChange={(event) =>
                        setReplaceConfirmed(event.target.checked)
                      }
                      type="checkbox"
                    />
                    {replaced.length === 1
                      ? "Entiendo, quiero reemplazarla."
                      : "Entiendo, quiero reemplazarlas."}
                  </label>
                </Notice>
              ) : null}
              {plan.paused && !showingNewDestinationForm ? (
                <p className="xpp-note">
                  {plan.paused === 1
                    ? "1 QR o etiqueta está pausado y seguirá bloqueado hasta que lo reanudes."
                    : `${plan.paused} QR o etiquetas están pausados y seguirán bloqueados hasta que los reanudes.`}
                </p>
              ) : null}
              {plan.skipped.length && !showingNewDestinationForm ? (
                <Notice title="Gana lo más cercano" tone="info">
                  {plan.skipped.length === 1
                    ? "1 QR o etiqueta conservará la página que le llega más de cerca (asignada directamente o desde un grupo más cercano): "
                    : `${plan.skipped.length} QR o etiquetas conservarán la página que les llega más de cerca (asignada directamente o desde un grupo más cercano): `}
                  {plan.skipped
                    .slice(0, 4)
                    .map(
                      (entry) =>
                        `${entry.touchpoint.operationalName} («${entry.keeps}»)`,
                    )
                    .join(", ")}
                  .
                </Notice>
              ) : null}
              {state.blocker === "all-overridden" &&
              !showingNewDestinationForm ? (
                <Notice tone="warning">
                  Todos los QR o etiquetas elegidos ya muestran otra página que
                  les llega más de cerca (asignada directamente o desde un grupo
                  más cercano). Elige otros destinos.
                </Notice>
              ) : null}
              {emptyReason ? (
                <Notice
                  action={
                    <button
                      className="text-action"
                      onClick={publishAnyway}
                      type="button"
                    >
                      Publicar de todos modos
                    </button>
                  }
                  title="Tus clientes verán una página vacía"
                  tone="warning"
                >
                  {describeEmptyPage(emptyReason)}
                </Notice>
              ) : sampleIssues.length ? (
                <Notice
                  title="Tu página todavía tiene textos de ejemplo"
                  tone="warning"
                >
                  Tus clientes verían {describeSampleIssues(sampleIssues)}.
                  Cámbialos antes de publicar, o publícala así y corrígelos
                  después.
                </Notice>
              ) : null}
              {error ? (
                <Notice tone="danger" title="No se publicó">
                  {error} Puedes reintentar.
                </Notice>
              ) : null}
            </>
          )}
        </div>
      </Dialog>
      {justPublished?.kind === "qr" ? (
        <TouchpointQrDownload
          onClose={() => setDownloading(false)}
          open={downloading}
          touchpoint={justPublished}
        />
      ) : null}
    </>
  );
}

function shortName(name: string): string {
  return name.length > buttonNameMax
    ? `${name.slice(0, buttonNameMax - 1).trimEnd()}…`
    : name;
}
