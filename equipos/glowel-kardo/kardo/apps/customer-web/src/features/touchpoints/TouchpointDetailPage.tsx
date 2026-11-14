import type {
  ExperienceSummary,
  Touchpoint,
  UpdateTouchpoint,
} from "@kardo/contracts";
import { DropdownMenu } from "radix-ui";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { qrDesignsApi, qrTemplatesApi } from "../../api/qr-designs.js";
import { touchpointsApi } from "../../api/touchpoints.js";
import { ConfirmDialog, Dialog } from "../../components/Dialog.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Field } from "../../components/Field.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { copyText } from "../../lib/clipboard.js";
import { Link, useRouter } from "../../lib/router.js";
import { touchpointUrls } from "../../lib/touchpoint-urls.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { showExperienceOn } from "../experiences/assign.js";
import {
  ExperienceTiles,
  linkableExperiences,
} from "../experiences/ExperienceTiles.js";
import { experienceTypeLabels } from "../experiences/labels.js";
import { latestExperience } from "../experiences/quick-qr.js";
import { experienceTargetsTouchpoint } from "../experiences/TargetPicker.js";
import { experiencePlaces } from "../experiences/targets.js";
import { ConnectObject, type QrTools } from "./ConnectObject.js";
import {
  flattenGroupTree,
  groupPathLabel,
  indentedName,
  nearestServedName,
} from "./group-tree.js";
import {
  effectiveKind,
  formatKinds,
  type PhysicalTouchpointKind,
  touchpointKindDescriptions,
  touchpointKindIcons,
  touchpointKindLabels,
} from "./kind.js";
import { touchpointBadge } from "./labels.js";
import { objectFlow, objectStateView } from "./object-steps.js";
import { PieceCard } from "./pieces/PieceCard.js";
import {
  PieceThumb,
  pieceKindLabel,
  pieceModelOf,
} from "./pieces/PieceThumb.js";
import { effectiveDesign, QrDownloadDialog } from "./QrDownload.js";
import { QrCodeCard, ShowsCard, VisitsCard } from "./TouchpointCards.js";

export function TouchpointDetailPage({
  touchpointId,
}: {
  touchpointId: string;
}) {
  const { touchpoints, groups, experiences, can } = useWorkspace();
  const found = touchpoints.data?.find((item) => item.id === touchpointId);
  // Links (`kind: "link"`) are a separate product with their own page; a
  // stray link to `/touchpoints/:id` for one never renders as a Touchpoint.
  const touchpoint = found?.kind === "link" ? undefined : found;

  if (!touchpoint) {
    if (touchpoints.isLoading) return <Skeleton lines={5} />;
    return (
      <div className="page">
        <EmptyState
          action={
            <Link
              className="button button-primary"
              to={{ name: "touchpoints" }}
            >
              Ver QR y etiquetas
            </Link>
          }
          icon="touchpoint"
          title="No encontramos este QR o etiqueta"
        >
          Puede que se haya movido a otro espacio o que no tengas acceso.
        </EmptyState>
      </div>
    );
  }

  const related = (experiences.data ?? []).filter((item) =>
    experienceTargetsTouchpoint(item, touchpoint, groups.data ?? []),
  );
  return (
    <TouchpointDetail
      canEdit={can("experiences.edit")}
      canManage={can("touchpoints.manage")}
      canPublish={can("experiences.publish") && can("experiences.edit")}
      canRetire={can("touchpoints.retire")}
      related={related}
      touchpoint={touchpoint}
    />
  );
}

type DialogKind = "edit" | "retire" | "pause" | "shows" | "download";

const toneClass = {
  success: "tp-state-placed",
  info: "tp-state-ready",
  warning: "tp-state-ready",
  danger: "tp-state-danger",
  neutral: "tp-state-pending",
} as const;

const notPublishedYet: Record<PhysicalTouchpointKind, string> = {
  nfc: "Puedes grabar la tarjeta desde ahora: empieza a funcionar en cuanto publiques, sin volver a grabarla.",
  qr: "Puedes imprimir el QR desde ahora: empieza a funcionar en cuanto publiques, sin volver a imprimirlo.",
  other:
    "Puedes poner la dirección desde ahora: empieza a funcionar en cuanto publiques.",
  kardo:
    "Tu pieza ya trae su QR y su NFC: empieza a funcionar en cuanto publiques una página.",
};

/**
 * A Touchpoint's page (relevo 36, prototype approved 2026-10-07): its name,
 * two states (its page and its object) as a plain dot and a word, and
 * «Conecta el objeto» until it is in its place. What it shows, its backup
 * QR (NFC) or its code (QR) and its visits sit beside. Pause, change format
 * and retire live in «⋯».
 */
function TouchpointDetail({
  touchpoint,
  related,
  canManage,
  canEdit,
  canPublish,
  canRetire,
}: {
  touchpoint: Touchpoint;
  related: ExperienceSummary[];
  canManage: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canRetire: boolean;
}) {
  const { workspace, groups, experiences, refreshPublicationState } =
    useWorkspace();
  const { notify } = useToast();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const urls = touchpointUrls(touchpoint.publicId);
  const badge = touchpointBadge(touchpoint);
  const objectView = objectStateView(touchpoint);
  const kind = effectiveKind(touchpoint.kind);
  const pieceModel = pieceModelOf(touchpoint);
  const isRetired = touchpoint.status === "retired";
  const isSuspended = Boolean(touchpoint.suspended);
  const complete = objectFlow(touchpoint).complete;
  // A QR's design and download live on its page (owner, 2026-10-07), and
  // so do an NFC's backup QR's (relevo 38, model A).
  const hasQr = (kind === "qr" || kind === "nfc") && !isRetired;
  const qrState = useResource(
    hasQr ? `qr-design:${workspace.id}:${touchpoint.id}` : null,
    (signal) => qrDesignsApi.get(workspace.id, touchpoint.id, signal),
  );
  const qrTemplates = useResource(
    hasQr ? `qr-templates:${workspace.id}` : null,
    (signal) => qrTemplatesApi.list(workspace.id, signal),
  );
  const qr: QrTools | undefined = hasQr
    ? {
        state: qrState,
        templates: qrTemplates,
        ready: Boolean(qrState.data),
        onDownload: () => setDialog("download"),
      }
    : undefined;
  const groupName = touchpoint.groupId
    ? groupPathLabel(groups.data ?? [], touchpoint.groupId) || null
    : null;
  // A page on its way here (the few seconds the Publisher takes): say so,
  // instead of «Aún no muestra nada» with another page to publish.
  const publishingHere =
    touchpoint.status === "assigned"
      ? (related.find(
          (item) =>
            item.publicationStatus === "pending" ||
            item.publicationStatus === "processing",
        ) ?? null)
      : null;
  // Nothing published yet: offer the Experience edited last (relevo 31).
  const latest =
    touchpoint.status === "assigned"
      ? latestExperience(experiences.data ?? [])
      : null;
  // Those that point here but are not what it shows: no «Publicada» badge
  // (relevo 36, E1: it read as published here).
  const others = related.filter(
    (item) => item.id !== touchpoint.live?.experienceId && !item.archivedAt,
  );

  async function publishLatest() {
    if (!latest) return;
    setIsPublishing(true);
    try {
      await showExperienceOn(workspace.id, latest, touchpoint.id);
      await refreshPublicationState();
      notify(`Publicando «${latest.name}» aquí. Se activa en unos segundos.`);
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        actions={
          <div className="tp-head-actions">
            <a
              className="button button-secondary"
              href={urls.preview}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Icon name="eye" size={16} /> Ver página
            </a>
            {canManage && !isRetired ? (
              <button
                className="button button-secondary"
                onClick={() => setDialog("edit")}
                type="button"
              >
                <Icon name="edit" size={16} />{" "}
                {pieceModel ? "Nombre y grupo" : "Nombre y tipo"}
              </button>
            ) : null}
            {/* The main action (relevo 37, S2): Rosa tapped «Editar» to
                change her menu and got the QR or NFC type instead. */}
            {canPublish && !isRetired && !isSuspended ? (
              <button
                className="button button-primary"
                onClick={() => setDialog("shows")}
                type="button"
              >
                <Icon name="refresh" size={16} /> Cambiar lo que muestra
              </button>
            ) : null}
            <TouchpointMenu
              canManage={canManage}
              canRetire={canRetire}
              onDialog={setDialog}
              touchpoint={touchpoint}
            />
          </div>
        }
        back={
          <Link className="text-action" to={{ name: "touchpoints" }}>
            <Icon name="arrow-left" size={16} /> QR y etiquetas
          </Link>
        }
        description={
          <span className="tp-head-meta">
            <span className="tp-head-facts">
              {pieceModel ? (
                <span>
                  <PieceThumb model={pieceModel} size={18} />
                  {pieceKindLabel(pieceModel)}
                </span>
              ) : (
                <span>
                  <Icon name={touchpointKindIcons[kind]} size={16} />
                  {touchpointKindLabels[kind]}
                </span>
              )}
              {groupName ? (
                <span>
                  <Icon name="layers" size={16} /> {groupName}
                </span>
              ) : null}
            </span>
            <span className="tp-head-states">
              <span className={`tp-state ${toneClass[badge.tone]}`}>
                <small>Página</small>
                {badge.label}
              </span>
              {!isRetired ? (
                <span className={`tp-state tp-state-${objectView.tone}`}>
                  <small>Objeto</small>
                  {objectView.label}
                </span>
              ) : null}
            </span>
          </span>
        }
        help="touchpoints"
        title={touchpoint.operationalName}
      />

      {isSuspended ? (
        <Notice title="Suspendido por Kardo" tone="warning">
          Kardo lo suspendió y tú no puedes reanudarlo. Escríbenos si crees que
          es un error.
        </Notice>
      ) : isRetired ? (
        <Notice title="Retirado para siempre">
          Lo que grabaste o imprimiste muestra «ya no está activo». No se puede
          deshacer.
        </Notice>
      ) : touchpoint.planExcluded ? (
        <Notice title="Fuera del plan" tone="warning">
          Quedó fuera de lo que incluye tu plan: su página está en pausa. Un
          Owner o Admin puede activarlo en{" "}
          <Link to={{ name: "settings", section: "plan" }}>
            Plan y facturación
          </Link>
          , en «Qué sigue activo», o subir de plan.
        </Notice>
      ) : touchpoint.status === "paused" ? (
        <Notice title="Pausado" tone="warning">
          Quien lo use verá que no está disponible. Lo publicado se conserva y
          vuelve al reanudar.
        </Notice>
      ) : publishingHere ? (
        <Notice title={`Publicando «${publishingHere.name}»`}>
          En unos segundos ya se ve aquí.
        </Notice>
      ) : touchpoint.status === "assigned" ? (
        <Notice
          action={
            latest && canPublish ? (
              <button
                aria-busy={isPublishing || undefined}
                className="button button-primary button-small"
                disabled={isPublishing}
                onClick={() => void publishLatest()}
                type="button"
              >
                {isPublishing ? "Publicando…" : `Publicar «${latest.name}»`}
              </button>
            ) : undefined
          }
          title="Aún no muestra nada"
        >
          {notPublishedYet[kind]}
        </Notice>
      ) : null}

      <div className="tp-grid">
        <div className="tp-column">
          {!isRetired ? (
            <ConnectObject
              canManage={canManage}
              qr={qr}
              touchpoint={touchpoint}
            />
          ) : null}
          {/* An NFC's backup QR sits in the first column, so on a phone (the
              columns stack) it is right under the card's fiche instead of far
              below it (round 4, Paola). A plain QR keeps «Tu QR» on the right. */}
          {qr && kind === "nfc" ? (
            <QrCodeCard
              backup
              canManage={canManage}
              qr={qr}
              touchpoint={touchpoint}
            />
          ) : null}
          {complete || isRetired ? (
            <VisitsCard chart touchpoint={touchpoint} />
          ) : null}
        </div>
        <div className="tp-column">
          <ShowsCard
            canEdit={canEdit}
            onChange={
              canPublish && !isRetired && !isSuspended
                ? () => setDialog("shows")
                : null
            }
            touchpoint={touchpoint}
          />
          {qr && kind !== "nfc" ? (
            <QrCodeCard
              backup={false}
              canManage={canManage}
              qr={qr}
              touchpoint={touchpoint}
            />
          ) : null}
          {pieceModel ? <PieceCard model={pieceModel} /> : null}
          {!complete && !isRetired ? (
            <VisitsCard chart={false} touchpoint={touchpoint} />
          ) : null}
          {others.length ? <AlsoHere experiences={others} /> : null}
        </div>
      </div>

      <RenameDialog
        onClose={() => setDialog(null)}
        open={dialog === "edit"}
        touchpoint={touchpoint}
      />
      <RetireDialog
        onClose={() => setDialog(null)}
        onPause={() => setDialog("pause")}
        open={dialog === "retire"}
        touchpoint={touchpoint}
      />
      <PauseDialog
        onClose={() => setDialog(null)}
        open={dialog === "pause"}
        touchpoint={touchpoint}
      />
      {qr ? (
        <QrDownloadDialog
          design={effectiveDesign(qrState.data)}
          onClose={() => setDialog(null)}
          onRecorded={(lastExport) =>
            qrState.setData((current) =>
              current ? { ...current, lastExport } : current,
            )
          }
          open={dialog === "download" && Boolean(qrState.data)}
          touchpoint={touchpoint}
          url={urls.qr}
        />
      ) : null}
      <ChooseShowsDialog
        onClose={() => setDialog(null)}
        open={dialog === "shows"}
        touchpoint={touchpoint}
      />
    </div>
  );
}

/** Experiences that point here and are not what it shows. */
function AlsoHere({ experiences }: { experiences: ExperienceSummary[] }) {
  return (
    <section className="panel tp-side-card" aria-labelledby="tp-also-title">
      <div className="tp-card-head">
        <h2 id="tp-also-title">También pueden mostrarse aquí</h2>
      </div>
      <ul className="tp-also">
        {experiences.map((experience) => (
          <li key={experience.id}>
            <Link to={{ name: "experience", id: experience.id }}>
              <strong>{experience.name}</strong>
              <small>{experienceTypeLabels[experience.type]}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «⋯»: pause, change format, copy, replace the card, retire. */
function TouchpointMenu({
  touchpoint,
  canManage,
  canRetire,
  onDialog,
}: {
  touchpoint: Touchpoint;
  canManage: boolean;
  canRetire: boolean;
  onDialog: (kind: DialogKind) => void;
}) {
  const { workspace, upsertTouchpoint } = useWorkspace();
  const { notify } = useToast();
  const kind = effectiveKind(touchpoint.kind);
  const urls = touchpointUrls(touchpoint.publicId);
  const isRetired = touchpoint.status === "retired";
  // Only where the API can do it (relevo 36, E4: not out of the plan).
  const canToggle =
    canManage &&
    !isRetired &&
    !touchpoint.suspended &&
    !touchpoint.planExcluded &&
    (touchpoint.status === "active" || touchpoint.status === "paused");
  const object = touchpoint.object;
  const canReplace =
    canManage && !isRetired && kind === "nfc" && object?.state === "placed";

  async function startReplace() {
    try {
      upsertTouchpoint(
        await touchpointsApi.updateObject(workspace.id, touchpoint.id, {
          action: "start_replace",
        }),
      );
      notify("Reemplazo iniciado. Sigue los pasos.");
    } catch (cause) {
      notify(errorMessage(cause), "error");
    }
  }

  // A Kardo piece's QR and chip carry their own channel; a copied address
  // is shared by hand, so it counts as a link visit.
  const address =
    kind === "nfc" ? urls.nfc : kind === "qr" ? urls.qr : urls.direct;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Más acciones de ${touchpoint.operationalName}`}
          className="button button-secondary tp-more"
          type="button"
        >
          <Icon name="more" size={18} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="kd-dropdown-content"
          sideOffset={6}
        >
          {canToggle ? (
            <DropdownMenu.Item
              className="kd-dropdown-item"
              onSelect={() => onDialog("pause")}
            >
              <Icon
                name={touchpoint.status === "active" ? "pause" : "play"}
                size={16}
              />
              {touchpoint.status === "active" ? "Pausar" : "Reanudar"}
            </DropdownMenu.Item>
          ) : null}
          {canManage && !isRetired && kind !== "kardo" ? (
            <DropdownMenu.Item
              className="kd-dropdown-item"
              onSelect={() => onDialog("edit")}
            >
              <Icon name="refresh" size={16} /> Cambiar formato
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item
            className="kd-dropdown-item"
            onSelect={() =>
              void copyText(address).then((copied) => {
                if (copied) notify("Dirección copiada.");
              })
            }
          >
            <Icon name="copy" size={16} /> Copiar dirección
          </DropdownMenu.Item>
          {canReplace ? (
            <DropdownMenu.Item
              className="kd-dropdown-item"
              onSelect={() => void startReplace()}
            >
              <Icon name="refresh" size={16} /> Reemplazar la tarjeta
            </DropdownMenu.Item>
          ) : null}
          {(kind === "qr" || kind === "nfc") && !isRetired ? (
            <DropdownMenu.Item
              className="kd-dropdown-item"
              onSelect={() => onDialog("download")}
            >
              <Icon name="download" size={16} />{" "}
              {kind === "nfc" ? "Descargar QR de respaldo" : "Descargar QR"}
            </DropdownMenu.Item>
          ) : null}
          {canRetire && !isRetired ? (
            <>
              <DropdownMenu.Separator className="kd-dropdown-separator" />
              <DropdownMenu.Item
                className="kd-dropdown-item kd-dropdown-item-danger"
                onSelect={() => onDialog("retire")}
              >
                <Icon name="trash" size={16} /> Retirar
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function PauseDialog({
  open,
  touchpoint,
  onClose,
}: {
  open: boolean;
  touchpoint: Touchpoint;
  onClose: () => void;
}) {
  const { workspace, upsertTouchpoint } = useWorkspace();
  const { notify } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const pausing = touchpoint.status === "active";

  async function change() {
    setIsBusy(true);
    try {
      const updated = await touchpointsApi.setStatus(
        workspace.id,
        touchpoint.id,
        { status: pausing ? "paused" : "active" },
      );
      upsertTouchpoint(updated);
      notify(
        updated.status === "paused"
          ? "Pausado: ya no abre su página."
          : "Reanudado: vuelve a abrir su página.",
      );
      onClose();
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ConfirmDialog
      confirmLabel={pausing ? "Pausar" : "Reanudar"}
      description={
        pausing
          ? "Quien lo use verá que no está disponible hasta que lo reanudes. No se borra nada."
          : "Vuelve a abrir lo último que publicaste."
      }
      isBusy={isBusy}
      onClose={onClose}
      onConfirm={() => void change()}
      open={open}
      title={
        pausing
          ? `¿Pausar «${touchpoint.operationalName}»?`
          : `¿Reanudar «${touchpoint.operationalName}»?`
      }
      tone={pausing ? "danger" : "primary"}
    />
  );
}

/**
 * Retire in one line, with «Mejor pausar» at hand (as Links since relevo
 * 34): nobody types the name any more.
 */
function RetireDialog({
  open,
  touchpoint,
  onClose,
  onPause,
}: {
  open: boolean;
  touchpoint: Touchpoint;
  onClose: () => void;
  onPause: () => void;
}) {
  const { workspace, upsertTouchpoint, can } = useWorkspace();
  const { notify } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isRetiring, setIsRetiring] = useState(false);
  const kind = effectiveKind(touchpoint.kind);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function retire() {
    setIsRetiring(true);
    setError(null);
    try {
      upsertTouchpoint(
        await touchpointsApi.retire(workspace.id, touchpoint.id),
      );
      notify(`«${touchpoint.operationalName}» se retiró.`);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsRetiring(false);
    }
  }

  return (
    <Dialog
      footer={
        <>
          {touchpoint.status === "active" &&
          !touchpoint.planExcluded &&
          !touchpoint.suspended &&
          can("touchpoints.manage") ? (
            <button
              className="button button-ghost"
              disabled={isRetiring}
              onClick={onPause}
              type="button"
            >
              <Icon name="pause" size={16} /> Mejor pausar
            </button>
          ) : null}
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isRetiring || undefined}
            className="button button-danger"
            disabled={isRetiring}
            onClick={() => void retire()}
            type="button"
          >
            {isRetiring ? "Retirando…" : "Retirar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={`¿Retirar «${touchpoint.operationalName}»?`}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="tp-dialog-line">
        {kind === "nfc"
          ? "La tarjeta y su QR de respaldo dejarán de abrir para siempre."
          : kind === "kardo"
            ? "Tu pieza dejará de abrir para siempre, por su QR y por su NFC."
            : kind === "qr"
              ? "El QR dejará de abrir para siempre."
              : "Su dirección dejará de abrir para siempre."}{" "}
        Si solo es por un tiempo, mejor pausa.
      </p>
    </Dialog>
  );
}

/** «Cambiar» in «Muestra»: the same tiles as Links, with the real pages. */
function ChooseShowsDialog({
  open,
  touchpoint,
  onClose,
}: {
  open: boolean;
  touchpoint: Touchpoint;
  onClose: () => void;
}) {
  const { workspace, experiences, touchpoints, refreshPublicationState } =
    useWorkspace();
  const { navigate } = useRouter();
  const { notify } = useToast();
  const all = experiences.data ?? [];
  const choices = useMemo(() => linkableExperiences(all), [all]);
  // «En /menu», «En Mesa 1 y 2 más»: where each page already shows, as in
  // the link's dialog (domain audit A9-8).
  const places = useMemo(
    () => experiencePlaces(touchpoints.data ?? []),
    [touchpoints.data],
  );
  const currentId = touchpoint.live?.experienceId ?? null;
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the dialog opens
  useEffect(() => {
    if (!open) return;
    setChosen(currentId ?? choices[0]?.id ?? null);
    setError(null);
  }, [open]);

  const picked = choices.find((item) => item.id === chosen) ?? null;

  async function confirm() {
    if (!picked) return;
    setError(null);
    setIsSaving(true);
    try {
      await showExperienceOn(workspace.id, picked, touchpoint.id);
      await refreshPublicationState();
      notify(`«${touchpoint.operationalName}» muestra «${picked.name}».`);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={!picked || picked.id === currentId || isSaving}
            onClick={() => void confirm()}
            type="button"
          >
            {isSaving ? "Publicando…" : "Mostrar esta"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title={`¿Qué muestra «${touchpoint.operationalName}»?`}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <ExperienceTiles
        current={currentId}
        experiences={choices}
        label="Tus páginas"
        places={places}
        onChange={setChosen}
        onCreateNew={() => {
          onClose();
          navigate({ name: "experience-new", touchpointId: touchpoint.id });
        }}
        value={chosen}
      />
    </Dialog>
  );
}

function RenameDialog({
  open,
  touchpoint,
  onClose,
}: {
  open: boolean;
  touchpoint: Touchpoint;
  onClose: () => void;
}) {
  const { workspace, groups, upsertTouchpoint, refreshGroups } = useWorkspace();
  const { notify } = useToast();
  const currentKind = effectiveKind(touchpoint.kind);
  // A Kardo piece never changes format (ADR 026): only its name and group.
  const isPiece = currentKind === "kardo";
  const [name, setName] = useState(touchpoint.operationalName);
  const [groupId, setGroupId] = useState(touchpoint.groupId ?? "");
  const [kind, setKind] = useState<PhysicalTouchpointKind>(currentKind);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // A format switch needs an explicit confirmation: the physical/programmed
  // object must be reprinted or reprogrammed to match, and this dialog closes
  // so that warning is not competing for attention with the rest of the form.
  const [pendingUpdate, setPendingUpdate] = useState<UpdateTouchpoint | null>(
    null,
  );
  const movingIntoGroup = groupId && groupId !== (touchpoint.groupId ?? "");
  // What it receives there: the nearest serving group of that chain.
  const groupHint = movingIntoGroup
    ? nearestServedName(groups.data ?? [], groupId)
    : null;

  // Only reset when the dialog opens; `touchpoint`/`currentKind` change on
  // every keystroke elsewhere in the app and must not clobber the draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open
  useEffect(() => {
    if (open) {
      setName(touchpoint.operationalName);
      setGroupId(touchpoint.groupId ?? "");
      setKind(currentKind);
      setError(null);
      setPendingUpdate(null);
    }
  }, [open]);

  async function applyUpdate(patch: UpdateTouchpoint) {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await touchpointsApi.update(
        workspace.id,
        touchpoint.id,
        patch,
      );
      upsertTouchpoint(updated);
      if ((touchpoint.groupId ?? "") !== (patch.groupId ?? ""))
        void refreshGroups();
      notify("QR o etiqueta actualizado.");
      setPendingUpdate(null);
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: UpdateTouchpoint = {
      operationalName: name.trim(),
      ...(isPiece || kind === "kardo" ? {} : { kind }),
      groupId: groupId || null,
    };
    // Switching NFC ↔ QR ↔ Otro needs a confirmation dialog of its own: the
    // printed or programmed object has to match the new format.
    if (!isPiece && kind !== currentKind) {
      setPendingUpdate(patch);
      return;
    }
    void applyUpdate(patch);
  }

  return (
    <>
      <Dialog
        description="El nombre es interno. La dirección no cambia."
        onClose={onClose}
        open={open && !pendingUpdate}
        title="Editar QR o etiqueta"
      >
        <form className="form-grid" onSubmit={submit}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Field
            counter={{ value: name.length, max: 120 }}
            id="rename-touchpoint"
            label="Nombre interno"
          >
            <input
              id="rename-touchpoint"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </Field>
          {isPiece ? null : (
            <fieldset className="type-picker touchpoint-kind-picker">
              <legend>Formato físico</legend>
              {formatKinds.map((option) => (
                <label
                  className={
                    kind === option
                      ? "type-card type-card-selected"
                      : "type-card"
                  }
                  key={option}
                >
                  <input
                    checked={kind === option}
                    name="rename-touchpoint-kind"
                    onChange={() => setKind(option)}
                    type="radio"
                    value={option}
                  />
                  <span className="type-card-icon" aria-hidden="true">
                    <Icon name={touchpointKindIcons[option]} size={20} />
                  </span>
                  <strong>{touchpointKindLabels[option]}</strong>
                  <small>{touchpointKindDescriptions[option]}</small>
                </label>
              ))}
            </fieldset>
          )}
          {groups.data?.length ? (
            <Field id="rename-group" label="Grupo" optional>
              <select
                id="rename-group"
                onChange={(event) => setGroupId(event.target.value)}
                value={groupId}
              >
                <option value="">Sin grupo</option>
                {flattenGroupTree(groups.data).map(({ group, depth }) => (
                  <option key={group.id} value={group.id}>
                    {indentedName(group.name, depth)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {groupHint ? (
            <Notice tone="info">Recibirá automáticamente «{groupHint}».</Notice>
          ) : null}
          <div className="form-actions">
            <button
              className="button button-primary"
              disabled={isSaving || !name.trim()}
              type="submit"
            >
              {isSaving ? "Guardando…" : "Guardar"}
            </button>
            <button
              className="button button-secondary"
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        confirmLabel="Cambiar formato y guardar"
        description={
          <>
            Pasa de <strong>{touchpointKindLabels[currentKind]}</strong> a{" "}
            <strong>{pendingUpdate ? touchpointKindLabels[kind] : ""}</strong>.
            Su dirección no cambia, pero el objeto es otro:{" "}
            {kind === "nfc"
              ? "graba una tarjeta nueva."
              : kind === "qr"
                ? "imprime el QR nuevo."
                : "pon la dirección en el objeto nuevo."}{" "}
            Los pasos de «Conecta el objeto» empiezan otra vez.
            {currentKind === "qr"
              ? " Su diseño QR se guarda por si vuelve a ser QR."
              : ""}
          </>
        }
        isBusy={isSaving}
        onClose={() => setPendingUpdate(null)}
        onConfirm={() => pendingUpdate && void applyUpdate(pendingUpdate)}
        open={pendingUpdate !== null}
        title="¿Cambiar el formato de este QR o etiqueta?"
        tone="primary"
      />
    </>
  );
}
