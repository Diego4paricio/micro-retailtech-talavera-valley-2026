import type { AnalyticsSummary, Touchpoint } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { analyticsApi } from "../../api/analytics.js";
import { linkPublicUrl } from "../../api/links.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { Skeleton } from "../../components/Skeleton.js";
import { businessAddressLabel } from "../../lib/business-address.js";
import { formatNumber, formatRelative } from "../../lib/format.js";
import { Link, useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { AreaChart } from "../analytics/charts/AreaChart.js";
import { formatDelta, percentChange } from "../analytics/charts/chart-utils.js";
import { ExperienceThumb } from "../experiences/ExperienceThumb.js";
import { experienceTypeLabels } from "../experiences/labels.js";
import { PagePreview } from "../experiences/PagePreview.js";
import { HelpButton } from "../help/index.js";
import { isDesignableType } from "../studio/model/content.js";
import {
  type LinkDialogKind,
  LinkDialogs,
  LinkMenu,
  linkTitle,
  useLinkQuickActions,
  whatsappHref,
} from "./LinkActions.js";
import { LinkAddressCopy } from "./LinkAddressCopy.js";
import { experienceOnLink } from "./link-experience.js";
import "./links.css";

/**
 * One link (Links redesign, relevo 34): its address as the title; what it
 * shows, its visits of the last 30 days, how it looks and how to share it.
 * Changing what it shows, its address, the main link, pausing and retiring
 * live in «⋯».
 */
export function LinkDetailPage({ linkId }: { linkId: string }) {
  const { touchpoints, experiences } = useWorkspace();
  const link = touchpoints.data?.find(
    (item) => item.id === linkId && item.kind === "link",
  );

  if (!link) {
    if (touchpoints.isLoading) return <Skeleton lines={6} />;
    return (
      <div className="page">
        <EmptyState
          action={
            <Link className="button button-primary" to={{ name: "links" }}>
              Ver Links
            </Link>
          }
          icon="link"
          title="No encontramos este link"
        />
      </div>
    );
  }
  if (experiences.isLoading && !experiences.data) return <Skeleton lines={6} />;
  return <LinkDetail link={link} />;
}

function LinkDetail({ link }: { link: Touchpoint }) {
  const { workspace, experiences, can } = useWorkspace();
  const { navigate } = useRouter();
  const actions = useLinkQuickActions();
  const [dialog, setDialog] = useState<LinkDialogKind | null>(null);
  const { experience, live, publishing } = experienceOnLink(
    link,
    experiences.data ?? [],
  );
  const url = linkPublicUrl(link, workspace.slug);
  const isMain = workspace.mainLinkId === link.id;
  const isRetired = link.status === "retired";
  const isPaused = link.status === "paused";
  const canShow = can("experiences.publish") && can("experiences.edit");

  return (
    <div className="page link-page">
      <header className="page-header link-page-header">
        <div className="page-header-copy">
          <div className="page-back">
            <Link className="text-action" to={{ name: "links" }}>
              <Icon name="arrow-left" size={16} /> Links
            </Link>
          </div>
          <div className="page-header-title-row">
            <h1>{linkTitle(link)}</h1>
            {isMain && !isRetired ? (
              <span className="link-main-mark">
                <Icon name="star" size={13} /> Principal
              </span>
            ) : null}
          </div>
          <LinkAddressCopy
            action={
              !isRetired && can("touchpoints.manage") ? (
                <button
                  className="button button-secondary button-small"
                  onClick={() => setDialog("address")}
                  type="button"
                >
                  <Icon name="edit" size={16} /> Cambiar
                </button>
              ) : undefined
            }
            url={url}
          />
          {isMain && workspace.slug && !isRetired ? (
            <p className="link-also">
              También abre en {businessAddressLabel(workspace.slug)}
            </p>
          ) : null}
        </div>
        <div className="page-actions">
          <HelpButton section="links" variant="icon" />
          {!isRetired ? <LinkMenu link={link} onDialog={setDialog} /> : null}
        </div>
      </header>

      {isRetired ? (
        <Notice title="Retirado">Esta dirección ya no abre nada.</Notice>
      ) : isPaused ? (
        <div className="link-paused">
          <span>
            <span aria-hidden="true" className="link-paused-dot" /> Pausado
          </span>
          {can("touchpoints.manage") ? (
            <button
              className="button button-secondary button-small"
              onClick={() => void actions.setPaused(link, false)}
              type="button"
            >
              <Icon name="play" size={16} /> Reanudar
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="link-detail">
        <section
          aria-labelledby="link-shows-title"
          className="panel link-shows"
        >
          <h2 className="link-section-title" id="link-shows-title">
            Muestra
          </h2>
          {experience ? (
            <div className="link-shows-row">
              <ExperienceThumb
                className="link-shows-thumb"
                experience={experience}
              />
              <div className="link-shows-text">
                <strong>{experience.name}</strong>
                <small>
                  {publishing
                    ? "Publicando…"
                    : !live
                      ? "Sin publicar"
                      : experienceTypeLabels[experience.type]}
                  {experience.updatedAt && live && !publishing
                    ? ` · Editada ${formatRelative(experience.updatedAt)}`
                    : null}
                </small>
              </div>
              {!isRetired ? (
                <div className="link-shows-actions">
                  {canShow ? (
                    <button
                      className={
                        live
                          ? "button button-secondary"
                          : "button button-primary"
                      }
                      onClick={() => setDialog("show")}
                      type="button"
                    >
                      <Icon name="experience" size={16} />
                      {live ? "Cambiar" : "Publicar aquí"}
                    </button>
                  ) : null}
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      navigate(
                        isDesignableType(experience.type)
                          ? { name: "experience-studio", id: experience.id }
                          : { name: "experience", id: experience.id },
                      )
                    }
                    type="button"
                  >
                    <Icon name="edit" size={16} /> Editar
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="link-shows-row">
              <p className="address-note">No muestra nada todavía.</p>
              {canShow && !isRetired ? (
                <div className="link-shows-actions">
                  <button
                    className="button button-primary"
                    onClick={() => setDialog("show")}
                    type="button"
                  >
                    <Icon name="experience" size={16} /> Elegir qué muestra
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {experience ? (
          <aside aria-label="Cómo se ve" className="link-detail-preview">
            <LinkPreview experience={experience} />
          </aside>
        ) : null}

        {can("analytics.read") ? <LinkVisits link={link} /> : null}

        {!isRetired ? (
          <section
            aria-labelledby="link-share-title"
            className="panel link-share"
          >
            <h2 className="link-section-title" id="link-share-title">
              Compartir
            </h2>
            <div className="link-share-row">
              <div className="link-share-actions">
                <a
                  className="button button-secondary button-small"
                  href={whatsappHref(url)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Icon name="send" size={16} /> Mandar por WhatsApp
                </a>
                <a
                  className="button button-secondary button-small"
                  href={url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Icon name="external" size={16} /> Abrir
                </a>
              </div>
              {can("touchpoints.manage") && can("experiences.publish") ? (
                <p className="link-share-print">
                  ¿Lo vas a imprimir? Un QR va en QR y etiquetas y su dirección
                  nunca cambia.{" "}
                  <button
                    className="link-button"
                    onClick={() => void actions.createPrintableQr(link)}
                    type="button"
                  >
                    Crear un QR con esta página
                  </button>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <LinkDialogs link={link} onClose={() => setDialog(null)} open={dialog} />
    </div>
  );
}

/** How the page looks on a phone: the one page preview (HTML, design or
 * theme, the same as Diseño and Historial). */
function LinkPreview({
  experience,
}: {
  experience: NonNullable<ReturnType<typeof experienceOnLink>["experience"]>;
}) {
  return <PagePreview content={experience.content} type={experience.type} />;
}

/** Visits of this link, day by day, the last 30 days. */
function LinkVisits({ link }: { link: Touchpoint }) {
  const { workspace } = useWorkspace();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void analyticsApi
      .summary(
        workspace.id,
        { days: 30, touchpointId: link.id },
        controller.signal,
      )
      .then(setSummary)
      .catch(() => undefined);
    return () => controller.abort();
  }, [workspace.id, link.id]);

  if (!summary) return null;
  const total = summary.totals.taps;
  const previous = summary.previous?.taps;
  const change = percentChange(total, previous);

  return (
    <div className="link-visits">
      <AreaChart
        description={
          <span className="link-visits-kpi">
            <strong>{formatNumber(total)}</strong> en 30 días
            {change !== null ? (
              <>
                {" "}
                <span
                  className={
                    change >= 0
                      ? "link-delta link-delta-up"
                      : "link-delta link-delta-down"
                  }
                >
                  {formatDelta(change)}
                </span>{" "}
                contra los 30 anteriores
              </>
            ) : null}
          </span>
        }
        emptyState={
          <p className="address-note">Todavía sin visitas en 30 días.</p>
        }
        points={summary.daily.map((day) => ({
          date: day.date,
          value: day.taps,
        }))}
        previousAverage={
          typeof previous === "number" ? previous / summary.days : null
        }
        title="Visitas"
        unit="visitas"
        xAxisTitle="Día"
        yAxisTitle="Visitas"
      />
    </div>
  );
}
