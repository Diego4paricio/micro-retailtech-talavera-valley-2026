import type { AnalyticsSummary, Touchpoint } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { analyticsApi } from "../../api/analytics.js";
import { Dialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { formatDateTime, formatDayMonth } from "../../lib/format.js";
import { Link, useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { AreaChart } from "../analytics/charts/AreaChart.js";
import { ExperienceThumb } from "../experiences/ExperienceThumb.js";
import { experienceTypeLabels } from "../experiences/labels.js";
import type { QrTools } from "./ConnectObject.js";
import { QrDesignChooser, QrPreview } from "./QrDownload.js";

/** What the object opens: its real page, small, with «Cambiar» and «Editar la página». */
export function ShowsCard({
  touchpoint,
  canEdit,
  onChange,
}: {
  touchpoint: Touchpoint;
  canEdit: boolean;
  onChange: (() => void) | null;
}) {
  const { experiences } = useWorkspace();
  const live = touchpoint.live;
  const experience = live
    ? (experiences.data ?? []).find((item) => item.id === live.experienceId)
    : undefined;
  return (
    <section className="panel tp-side-card" aria-labelledby="tp-shows-title">
      <div className="tp-card-head">
        <h2 id="tp-shows-title">Muestra</h2>
        {onChange ? (
          <button className="text-action" onClick={onChange} type="button">
            <Icon name="refresh" size={16} /> Cambiar
          </button>
        ) : null}
      </div>
      {live ? (
        <div className="tp-shows">
          {experience ? (
            <ExperienceThumb
              className="tp-shows-thumb"
              experience={experience}
            />
          ) : (
            <span className="tp-shows-thumb" aria-hidden="true" />
          )}
          <div>
            <strong>{live.experienceName}</strong>
            <small>
              {experienceTypeLabels[
                live.experienceType as keyof typeof experienceTypeLabels
              ] ?? "Página"}
            </small>
            <span className="tp-state tp-state-placed">
              En vivo, versión {live.revision}
            </span>
            <small>Publicada {formatDateTime(live.publishedAt)}</small>
            {canEdit ? (
              <Link
                className="button button-secondary button-small"
                to={{ name: "experience", id: live.experienceId }}
              >
                <Icon name="edit" size={16} /> Editar la página
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="tp-empty">
          Todavía no muestra nada.
          {onChange ? " Elige qué abre con «Cambiar»." : ""}
        </p>
      )}
    </section>
  );
}

/**
 * A QR shows its code, always at hand to print it again (relevo 36): it
 * downloads right here with the studio's dialog, and its design changes
 * here too, picking a picture of each design. An NFC shows its backup QR
 * the same way (relevo 38, model A): its own design, «Personaliza tu QR»
 * opens the studio on it, and downloading it marks «Respaldo».
 */
export function QrCodeCard({
  touchpoint,
  qr,
  canManage,
  backup = false,
}: {
  touchpoint: Touchpoint;
  qr: QrTools;
  canManage: boolean;
  backup?: boolean;
}) {
  const { navigate } = useRouter();
  const [choosing, setChoosing] = useState(false);
  const lastExport = qr.state.data?.lastExport;
  const titleId = backup ? "tp-backup-title" : "tp-qr-title";
  return (
    <section className="panel tp-side-card" aria-labelledby={titleId}>
      <div className="tp-card-head">
        <h2 id={titleId}>{backup ? "QR de respaldo" : "Tu QR"}</h2>
        {canManage ? (
          <button
            className="text-action"
            onClick={() => setChoosing(true)}
            type="button"
          >
            <Icon name="qr" size={16} /> Cambiar diseño
          </button>
        ) : null}
      </div>
      <div className="tp-side-qr">
        <QrPreview state={qr.state} touchpoint={touchpoint} />
        <div>
          <p>
            {backup
              ? "Para quien no puede usar NFC, o si la tarjeta falla. Abre la misma página."
              : "Para imprimirlo otra vez o reemplazar uno dañado. Su dirección nunca cambia."}
            {lastExport
              ? ` Última descarga: ${formatDayMonth(lastExport.at)}.`
              : ""}
          </p>
          <div className="tp-step-actions">
            <button
              className="button button-secondary button-small"
              disabled={!qr.ready}
              onClick={qr.onDownload}
              type="button"
            >
              <Icon name="download" size={16} /> Descargar
            </button>
            {backup && canManage ? (
              <button
                className="text-action"
                onClick={() =>
                  navigate({ name: "qr-studio", id: touchpoint.id })
                }
                type="button"
              >
                <Icon name="edit" size={16} /> Personaliza tu QR
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <Dialog
        footer={
          <button
            className="button button-primary"
            onClick={() => setChoosing(false)}
            type="button"
          >
            Listo
          </button>
        }
        onClose={() => setChoosing(false)}
        open={choosing}
        size="large"
        title={backup ? "Diseño del QR de respaldo" : "Diseño de este QR"}
      >
        <QrDesignChooser
          canManage={canManage}
          state={qr.state}
          templates={qr.templates}
          touchpoint={touchpoint}
        />
      </Dialog>
    </section>
  );
}

/**
 * Visits of the last 30 days and how they arrived: by the card or by its
 * backup QR (they count apart since relevo 36).
 */
export function VisitsCard({
  touchpoint,
  chart,
}: {
  touchpoint: Touchpoint;
  chart: boolean;
}) {
  const { workspace } = useWorkspace();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void analyticsApi
      .summary(
        workspace.id,
        { days: 30, touchpointId: touchpoint.id },
        controller.signal,
      )
      .then(setSummary)
      .catch(() => undefined);
    return () => controller.abort();
  }, [workspace.id, touchpoint.id]);

  const total = summary?.totals.taps ?? 0;
  const channels = summary?.totals.channels;
  const isNfc = touchpoint.kind === "nfc";
  const nfc = channels?.nfc ?? 0;
  const qr = channels?.qr ?? 0;
  const split = isNfc && nfc + qr > 0;
  const splitView = split ? (
    <span className="tp-split">
      <span className="tp-split-bar" aria-hidden="true">
        <i style={{ width: `${Math.round((nfc / (nfc + qr)) * 100)}%` }} />
      </span>
      <span className="tp-split-legend">
        <span>
          <i className="tp-swatch tp-swatch-nfc" aria-hidden="true" />
          NFC <strong>{nfc.toLocaleString("es-MX")}</strong>
        </span>
        <span>
          <i className="tp-swatch tp-swatch-qr" aria-hidden="true" />
          QR de respaldo <strong>{qr.toLocaleString("es-MX")}</strong>
        </span>
      </span>
    </span>
  ) : null;
  // With the chart, the chart is the card (as in Links): no box in a box.
  if (chart && summary && total > 0)
    return (
      <div className="tp-visits-chart">
        <AreaChart
          description={
            <span className="tp-visits-head">
              <span className="tp-visits-total">
                <strong>{total.toLocaleString("es-MX")}</strong> en 30 días
              </span>
              {splitView}
            </span>
          }
          points={summary.daily.map((day) => ({
            date: day.date,
            value: day.taps,
          }))}
          title="Visitas"
          unit="visitas"
          xAxisTitle="Día"
          yAxisTitle="Visitas"
        />
      </div>
    );
  return (
    <section className="panel tp-side-card" aria-labelledby="tp-visits-title">
      <div className="tp-card-head">
        <h2 id="tp-visits-title">Visitas</h2>
        <span className="tp-card-meta">30 días</span>
      </div>
      {!summary ? null : total === 0 ? (
        <p className="tp-empty">
          Todavía no hay visitas. Aparecen en cuanto alguien lo use.
        </p>
      ) : (
        <>
          <p className="tp-visits-total">
            <strong>{total.toLocaleString("es-MX")}</strong> en 30 días
          </p>
          {splitView}
        </>
      )}
    </section>
  );
}
