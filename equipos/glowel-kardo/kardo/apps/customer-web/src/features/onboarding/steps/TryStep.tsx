import type { Touchpoint } from "@kardo/contracts";
import { useState } from "react";
import { linkPublicUrl } from "../../../api/links.js";
import { qrDesignsApi, qrTemplatesApi } from "../../../api/qr-designs.js";
import { CopyField } from "../../../components/CopyField.js";
import { Dialog } from "../../../components/Dialog.js";
import { Icon } from "../../../components/Icon.js";
import { Link } from "../../../lib/router.js";
import { touchpointUrls } from "../../../lib/touchpoint-urls.js";
import { useResource } from "../../../lib/use-resource.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { LinkAddressCopy } from "../../links/LinkAddressCopy.js";
import {
  effectiveDesign,
  QrDesignChooser,
  QrDownloadDialog,
  QrPicture,
} from "../../touchpoints/QrDownload.js";
import {
  nextStepsFor,
  pickTryTouchpoint,
  tryMissingMessage,
} from "../try-model.js";
import type { FirstSteps } from "../use-first-steps.js";
import { shareKindOf } from "./ShareStep.js";

/** 5. Pruébalo: the QR to scan (with Kardo's frame), the NFC tag to write
 * or the link to open, as a customer would. */
export function TryStep({
  steps,
  onFinish,
}: {
  steps: FirstSteps;
  onFinish: () => void;
}) {
  const touchpoint = usePublishedTouchpoint(steps);
  const { touchpoints } = useWorkspace();
  if (!touchpoint)
    return (
      <p className="fs-note fs-center">
        {tryMissingMessage(
          touchpoints.data ?? [],
          steps.state.experience?.id ?? null,
        )}
      </p>
    );
  return (
    <div className="fs-form fs-card fs-narrow">
      <ShareCard touchpoint={touchpoint} />
      <button
        className="button button-primary fs-cta"
        onClick={onFinish}
        type="button"
      >
        Ya lo vi, se ve bien
      </button>
    </div>
  );
}

/** Where step 4 published; if this browser forgot, one that shows this
 * page (never just any live one: it may be another page's, A2-57). */
export function usePublishedTouchpoint(steps: FirstSteps): Touchpoint | null {
  const { touchpoints } = useWorkspace();
  return pickTryTouchpoint(
    touchpoints.data ?? [],
    steps.touchpointId,
    steps.state.experience?.id ?? null,
  );
}

export function ShareCard({ touchpoint }: { touchpoint: Touchpoint }) {
  const kind = shareKindOf(touchpoint);
  if (kind === "nfc") return <NfcCard touchpoint={touchpoint} />;
  if (kind === "link") return <LinkCard touchpoint={touchpoint} />;
  return <QrCard touchpoint={touchpoint} />;
}

/** This QR's design, as its page and the studio see it (relevo 38). */
function useQrDesignState(touchpoint: Touchpoint) {
  const { workspace } = useWorkspace();
  return useResource(`qr-design:${workspace.id}:${touchpoint.id}`, (signal) =>
    qrDesignsApi.get(workspace.id, touchpoint.id, signal),
  );
}

/** The QR as it prints: its real design (Kardo's, its group's or its own). */
function QrImage({ touchpoint }: { touchpoint: Touchpoint }) {
  const state = useQrDesignState(touchpoint);
  return (
    <span
      aria-label={`Código QR de «${touchpoint.operationalName}»`}
      role="img"
    >
      <QrPicture
        className="fs-qr-image"
        state={state}
        touchpoint={touchpoint}
      />
    </span>
  );
}

/**
 * The same download as the QR's page (relevo 38): its real design, the
 * legibility check, and a recorded download, so «Descargar» is marked in
 * «Conecta el objeto». The design changes here too, in the same gallery.
 */
function QrCard({ touchpoint }: { touchpoint: Touchpoint }) {
  const { workspace, can } = useWorkspace();
  const urls = touchpointUrls(touchpoint.publicId);
  const state = useQrDesignState(touchpoint);
  const templates = useResource(`qr-templates:${workspace.id}`, (signal) =>
    qrTemplatesApi.list(workspace.id, signal),
  );
  const [dialog, setDialog] = useState<"download" | "design" | null>(null);
  const canManage = can("touchpoints.manage");
  return (
    <div className="fs-qr">
      <QrPicture
        className="fs-qr-image"
        state={state}
        touchpoint={touchpoint}
      />
      <p className="fs-note fs-center">Escanéalo con tu celular.</p>
      <button
        className="button button-secondary"
        disabled={!state.data}
        onClick={() => setDialog("download")}
        type="button"
      >
        <Icon name="download" size={16} /> Descargar para imprimir
      </button>
      {canManage ? (
        <p className="fs-hint fs-center">
          El diseño de tu QR lo cambias cuando quieras.{" "}
          <button
            className="text-action"
            onClick={() => setDialog("design")}
            type="button"
          >
            Cambiar diseño
          </button>
        </p>
      ) : null}
      {state.data ? (
        <QrDownloadDialog
          design={effectiveDesign(state.data)}
          onClose={() => setDialog(null)}
          onRecorded={(lastExport) =>
            state.setData((current) =>
              current ? { ...current, lastExport } : current,
            )
          }
          open={dialog === "download"}
          touchpoint={touchpoint}
          url={urls.qr}
        />
      ) : null}
      <Dialog
        footer={
          <button
            className="button button-primary"
            onClick={() => setDialog(null)}
            type="button"
          >
            Listo
          </button>
        }
        onClose={() => setDialog(null)}
        open={dialog === "design"}
        size="large"
        title="Diseño de tu QR"
      >
        <QrDesignChooser
          canManage={canManage}
          state={state}
          templates={templates}
          touchpoint={touchpoint}
        />
      </Dialog>
    </div>
  );
}

function NfcCard({ touchpoint }: { touchpoint: Touchpoint }) {
  const urls = touchpointUrls(touchpoint.publicId);
  return (
    <div className="fs-share-card">
      <ol className="fs-share-steps">
        <li>
          Instala <strong>NFC Tools</strong> o <strong>NFC TagWriter</strong>.
        </li>
        <li>Elige «Escribir», «URL» y pega esta dirección:</li>
      </ol>
      <CopyField
        icon="nfc"
        label="Dirección para tu etiqueta"
        value={urls.nfc}
      />
      <ol className="fs-share-steps" start={3}>
        <li>Acerca la etiqueta a tu celular.</li>
      </ol>
      <a
        className="fs-hint fs-center"
        href={urls.direct}
        rel="noreferrer"
        target="_blank"
      >
        ¿Sin etiqueta todavía? Abre tu página
      </a>
    </div>
  );
}

function LinkCard({ touchpoint }: { touchpoint: Touchpoint }) {
  const { workspace } = useWorkspace();
  const url = linkPublicUrl(touchpoint, workspace.slug);
  return (
    <div className="fs-share-card">
      <LinkAddressCopy url={url} />
      <div className="fs-share-actions">
        <a
          className="button button-primary"
          href={`https://wa.me/?text=${encodeURIComponent(url)}`}
          rel="noreferrer"
          target="_blank"
        >
          <Icon name="send" size={16} /> Compartir por WhatsApp
        </a>
        <a
          className="button button-secondary"
          href={url}
          rel="noreferrer"
          target="_blank"
        >
          <Icon name="external" size={16} /> Abrir mi página
        </a>
      </div>
    </div>
  );
}

/** «¡Listo!»: where it was published, the panel, and what comes next. */
export function Finished({ steps }: { steps: FirstSteps }) {
  const touchpoint = usePublishedTouchpoint(steps);
  const { workspace } = useWorkspace();
  const kind = touchpoint ? shareKindOf(touchpoint) : null;
  const experienceType = steps.state.experience?.type;
  return (
    <section
      aria-label="Lo que sigue"
      className="fs-finished fs-card fs-narrow"
    >
      {touchpoint ? (
        <div className="fs-finished-row">
          {kind === "qr" ? <QrImage touchpoint={touchpoint} /> : null}
          <div className="fs-finished-where">
            <strong>{touchpoint.operationalName}</strong>
            <small>
              {kind === "link"
                ? linkPublicUrl(touchpoint, workspace.slug).replace(
                    /^https?:\/\//,
                    "",
                  )
                : kind === "nfc"
                  ? "Etiqueta NFC"
                  : "Código QR"}
            </small>
          </div>
        </div>
      ) : null}
      <Link className="button button-primary fs-cta" to={{ name: "overview" }}>
        Ir a mi panel
      </Link>
      {experienceType === "form" ? (
        <p className="fs-note fs-center">
          Lo que te dejen en el formulario llega a Solicitudes. Ahí también
          activas el aviso por correo.
        </p>
      ) : null}
      <ul className="fs-next">
        {nextStepsFor(experienceType).map((item) => (
          <li key={item.label}>
            <Link to={item.route}>
              <Icon name={item.icon} size={20} />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
