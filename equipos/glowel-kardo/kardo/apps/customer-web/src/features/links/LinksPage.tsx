import type { Touchpoint } from "@kardo/contracts";
import { useEffect, useMemo, useState } from "react";
import { analyticsApi } from "../../api/analytics.js";
import { linkPublicUrl } from "../../api/links.js";
import { saveBusinessAddress } from "../../api/workspace-slug.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import {
  businessAddressLabel,
  linksBaseLabel,
} from "../../lib/business-address.js";
import { copyText } from "../../lib/clipboard.js";
import { formatNumber } from "../../lib/format.js";
import { Link } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { ExperienceThumb } from "../experiences/ExperienceThumb.js";
import { experienceTypeLabels } from "../experiences/labels.js";
import { HelpButton } from "../help/index.js";
import { FinishBusinessLine } from "../onboarding/FinishBusinessLine.js";
import { useWorkspaceProfile } from "../settings/use-workspace-profile.js";
import { BusinessAddressDialog } from "./BusinessAddressDialog.js";
import {
  BusinessAddressField,
  businessAddressReady,
} from "./BusinessAddressField.js";
import {
  type LinkDialogKind,
  LinkDialogs,
  LinkMenu,
  linkTitle,
  useLinkQuickActions,
} from "./LinkActions.js";
import { experienceOnLink, linksEmptyStateCopy } from "./link-experience.js";
import { NewLinkDialog } from "./NewLinkDialog.js";
import "./links.css";

/**
 * Links (redesign, relevo 34, owner-approved prototype): the business's
 * address on top, big, to copy; then every link with its address, what it
 * shows, its visits and its state, with copy and «⋯» at hand. No
 * explanations on screen: they live in Ayuda.
 */
export function LinksPage() {
  const { workspace, touchpoints, can } = useWorkspace();
  const canManage = can("touchpoints.manage") && can("experiences.edit");
  const canSeeAnalytics = can("analytics.read");
  const profile = useWorkspaceProfile();
  const [isCreating, setIsCreating] = useState(false);
  const [dialog, setDialog] = useState<{
    kind: LinkDialogKind;
    link: Touchpoint;
  } | null>(null);
  const [visitsByLink, setVisitsByLink] = useState<Record<string, number>>({});

  const links = useMemo(
    () => (touchpoints.data ?? []).filter((item) => item.kind === "link"),
    [touchpoints.data],
  );
  // The main link first; then the newest.
  const activeLinks = useMemo(
    () =>
      links
        .filter((item) => item.status !== "retired")
        .sort((a, b) =>
          a.id === workspace.mainLinkId
            ? -1
            : b.id === workspace.mainLinkId
              ? 1
              : (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
        ),
    [links, workspace.mainLinkId],
  );
  const retiredLinks = useMemo(
    () => links.filter((item) => item.status === "retired"),
    [links],
  );
  // A stable primitive: re-fetch only when the set of Link ids truly changes.
  const linkIds = useMemo(
    () => links.map((item) => item.id).join(","),
    [links],
  );

  // Visits are a nice-to-have: silently absent when analytics isn't available.
  useEffect(() => {
    if (!canSeeAnalytics || !linkIds) return;
    const controller = new AbortController();
    void analyticsApi
      .summary(workspace.id, { days: 30 }, controller.signal)
      .then((summary) => {
        const next: Record<string, number> = {};
        for (const item of summary.touchpoints)
          next[item.touchpointId] = item.taps;
        setVisitsByLink(next);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [workspace.id, canSeeAnalytics, linkIds]);

  const hasAddress = Boolean(workspace.slug);
  const emptyCopy = linksEmptyStateCopy(hasAddress);

  return (
    <div className="page links-page">
      <PageHeader
        actions={
          <>
            <HelpButton section="links" variant="icon" />
            {canManage && hasAddress ? (
              <button
                className="button button-primary"
                onClick={() => setIsCreating(true)}
                type="button"
              >
                <Icon name="plus" size={16} /> Nuevo link
              </button>
            ) : null}
          </>
        }
        title="Links"
      />

      <FinishBusinessLine profile={profile.data} />

      {touchpoints.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void touchpoints.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          {touchpoints.error}
        </Notice>
      ) : null}

      {hasAddress ? (
        <BusinessAddressCard links={activeLinks} />
      ) : (
        <ChooseAddressCard />
      )}

      {touchpoints.isLoading && !links.length ? (
        <Skeleton lines={4} />
      ) : activeLinks.length ? (
        <section aria-label="Tus links" className="panel panel-flush link-list">
          <ul className="link-rows">
            {activeLinks.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                onDialog={(kind) => setDialog({ kind, link })}
                showVisits={canSeeAnalytics}
                visits={visitsByLink[link.id] ?? 0}
              />
            ))}
          </ul>
        </section>
      ) : !touchpoints.isLoading ? (
        <EmptyState
          action={
            canManage && emptyCopy.offersNewLink ? (
              <button
                className="button button-primary"
                onClick={() => setIsCreating(true)}
                type="button"
              >
                <Icon name="plus" size={16} /> Nuevo link
              </button>
            ) : null
          }
          icon="link"
          title="Aún no tienes links"
        >
          {emptyCopy.description}
        </EmptyState>
      ) : null}

      {retiredLinks.length ? (
        <details className="link-retired">
          <summary>
            Retirados ({retiredLinks.length}){" "}
            <Icon name="chevron-right" size={14} />
          </summary>
          <ul className="link-rows link-rows-retired">
            {retiredLinks.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                showVisits={false}
                visits={0}
              />
            ))}
          </ul>
        </details>
      ) : null}

      <p className="address-note links-touchpoints-hint">
        ¿QR o etiquetas para tu local? Están en{" "}
        <Link to={{ name: "touchpoints" }}>QR y etiquetas</Link>
      </p>

      <NewLinkDialog onClose={() => setIsCreating(false)} open={isCreating} />
      <LinkDialogs
        link={dialog?.link ?? null}
        onClose={() => setDialog(null)}
        open={dialog?.kind ?? null}
      />
    </div>
  );
}

/** «Tu link en Kardo» (A9-20: one name everywhere): kardo.com.mx/negocio,
 * big, with Copiar and Cambiar, and
 * the link it opens. */
function BusinessAddressCard({ links }: { links: readonly Touchpoint[] }) {
  const { workspace, can } = useWorkspace();
  const { notify } = useToast();
  const [isChanging, setIsChanging] = useState(false);
  const slug = workspace.slug ?? "";
  const main = links.find((item) => item.id === workspace.mainLinkId);

  return (
    <section aria-label="Tu link en Kardo" className="panel link-address-card">
      <div className="link-address-card-text">
        <p className="link-address-card-label">Tu link en Kardo</p>
        <p className="link-address-card-url">
          <span>{linksBaseLabel}</span>
          <wbr />
          {slug}
        </p>
        <p className="link-address-card-opens">
          {main ? (
            <>
              Abre{" "}
              <Link to={{ name: "link", id: main.id }}>{linkTitle(main)}</Link>
            </>
          ) : (
            "Todavía no abre ningún link"
          )}
        </p>
      </div>
      <div className="link-address-card-actions">
        <button
          className="button button-secondary"
          onClick={() =>
            void copyText(`https://${businessAddressLabel(slug)}`).then(
              (copied) => {
                if (copied) notify("Dirección copiada.");
              },
            )
          }
          type="button"
        >
          <Icon name="copy" size={16} /> Copiar
        </button>
        {can("workspace.manage") ? (
          <button
            className="button button-secondary link-address-card-change"
            onClick={() => setIsChanging(true)}
            type="button"
          >
            <Icon name="edit" size={16} /> Cambiar tu link en Kardo
          </button>
        ) : null}
      </div>
      <BusinessAddressDialog
        onClose={() => setIsChanging(false)}
        open={isChanging}
      />
    </section>
  );
}

/** A business that skipped Primeros pasos chooses its address here, never
 * in «Nuevo link». */
function ChooseAddressCard() {
  const { workspace, can, reloadWorkspaces } = useWorkspace();
  const profile = useWorkspaceProfile();
  const { notify } = useToast();
  const [slug, setSlug] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!can("workspace.manage"))
    return (
      <Notice tone="info">
        Tu organización todavía no tiene su link en Kardo. Lo elige un Owner o
        un Admin.
      </Notice>
    );

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await saveBusinessAddress(workspace.id, slug);
      await reloadWorkspaces();
      notify(`Tu link en Kardo es ${businessAddressLabel(saved)}.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="choose-address-title"
      className="panel link-address-card link-address-choose"
    >
      <div>
        <h2 className="link-address-choose-title" id="choose-address-title">
          Elige tu link en Kardo
        </h2>
        <p className="address-note">
          La dirección web de tu negocio en Kardo. No es tu domicilio.
        </p>
      </div>
      <form
        className="link-address-choose-row"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <BusinessAddressField
          city={profile.data?.city}
          error={error}
          industry={profile.data?.industry}
          label="Tu link en Kardo"
          name={workspace.name}
          onChange={(next) => {
            setError(null);
            setSlug(next);
          }}
          onReadyChange={setReady}
          value={slug}
          workspaceId={workspace.id}
        />
        <button
          aria-busy={isSaving || undefined}
          className="button button-primary"
          disabled={!ready || !businessAddressReady(slug) || isSaving}
          type="submit"
        >
          {isSaving ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </section>
  );
}

/** One link: its address first, what it shows, visits, state, and actions
 * at hand. */
function LinkRow({
  link,
  showVisits,
  visits,
  onDialog,
}: {
  link: Touchpoint;
  showVisits: boolean;
  visits: number;
  onDialog?: ((kind: LinkDialogKind) => void) | undefined;
}) {
  const { workspace, experiences, can } = useWorkspace();
  const actions = useLinkQuickActions();
  const { experience, live, publishing } = experienceOnLink(
    link,
    experiences.data ?? [],
  );
  const isMain = workspace.mainLinkId === link.id;
  const isRetired = link.status === "retired";
  const canChangeAddress = can("touchpoints.manage");
  const state =
    link.status === "paused"
      ? "Pausado"
      : publishing
        ? "Publicando…"
        : experience && !live && !isRetired
          ? "Sin publicar"
          : null;

  return (
    <li className={isRetired ? "link-row is-retired" : "link-row"}>
      <Link className="link-row-main" to={{ name: "link", id: link.id }}>
        {experience ? (
          <ExperienceThumb className="link-row-thumb" experience={experience} />
        ) : (
          <span
            aria-hidden="true"
            className="link-thumb link-row-thumb link-thumb-empty"
          >
            <Icon name="link" size={16} />
          </span>
        )}
        <span className="link-row-text">
          <span className="link-row-address">
            {linkTitle(link)}
            {isMain && !isRetired ? (
              <span className="link-main-mark">
                <Icon name="star" size={12} /> Principal
              </span>
            ) : null}
            {state ? <span className="link-state">{state}</span> : null}
          </span>
          <span className="link-row-shows">
            {experience ? (
              <>
                {experience.name}
                <span className="link-row-type">
                  {" · "}
                  {experienceTypeLabels[experience.type]}
                </span>
              </>
            ) : (
              "No muestra nada todavía"
            )}
          </span>
        </span>
      </Link>
      {showVisits ? (
        <span className="link-row-visits">
          <strong>{formatNumber(visits)}</strong>
          <small>
            visitas<span className="link-row-days"> · 30 días</span>
          </small>
        </span>
      ) : null}
      {!isRetired && onDialog ? (
        <span className="link-row-actions">
          {canChangeAddress ? (
            <button
              aria-label={`Cambiar la dirección de ${linkTitle(link)}`}
              className="icon-button link-row-change"
              onClick={() => onDialog("address")}
              type="button"
            >
              <Icon name="edit" size={17} />
            </button>
          ) : null}
          <button
            aria-label={`Copiar ${linkPublicUrl(link, workspace.slug)}`}
            className="icon-button link-row-copy"
            onClick={() => actions.copy(link)}
            type="button"
          >
            <Icon name="copy" size={17} />
          </button>
          <LinkMenu inList link={link} onDialog={onDialog} />
        </span>
      ) : null}
    </li>
  );
}
