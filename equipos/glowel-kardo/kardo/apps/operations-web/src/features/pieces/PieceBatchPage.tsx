import type { StaffPieceBatch } from "@kardo/contracts";
import { useState } from "react";
import { piecesApi } from "../../api/pieces.js";
import { CopyField } from "../../components/CopyField.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader, SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { useToast } from "../../components/Toast.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import {
  downloadBlob,
  downloadCsv,
  pieceCaption,
  pieceLabel,
  pieceNumbers,
  slugify,
  workshopCsv,
} from "./workshop-file.js";

type Download = "qr" | "card" | null;

async function qrPrint() {
  return import("@kardo/customer-web/qr-print");
}

export function PieceBatchPage({ batchId }: { batchId: string }) {
  const batch = useResource(`batch:${batchId}`, (signal) =>
    piecesApi.getBatch(batchId, signal),
  );
  return (
    <>
      <PageHeader
        back={
          <Link to={{ name: "pieces" }}>
            <Icon name="arrow-left" size={16} /> Piezas
          </Link>
        }
        description={batch.data?.batch.kitName ?? "Piezas sueltas"}
        title={batch.data?.batch.reference ?? "Lote de piezas"}
      />
      {batch.error ? (
        <Notice tone="error">{batch.error}</Notice>
      ) : !batch.data ? (
        <Skeleton lines={6} />
      ) : (
        <BatchBody data={batch.data} />
      )}
    </>
  );
}

function BatchBody({ data }: { data: StaffPieceBatch }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState<Download>(null);
  const { batch, code, activationUrl, pieces } = data;
  const numbers = pieceNumbers(pieces);
  const slug = slugify(batch.reference);
  const kitName = batch.kitName ?? "Piezas sueltas";

  async function downloadQr() {
    setBusy("qr");
    try {
      const { buildQr, scenesToSheetPdf, workshopQrDesign } = await qrPrint();
      const items = pieces.map((item, index) => ({
        scene: buildQr({
          url: item.urls.qr,
          design: workshopQrDesign(),
          logo: null,
        }).scene,
        caption: pieceCaption(item, numbers[index] ?? 1),
      }));
      const title = `${batch.reference}, QR para el taller`;
      const blob = await scenesToSheetPdf(items, {
        paper: "letter",
        widthMm: 35,
        cropMarks: true,
        title,
      });
      downloadBlob(blob, `${slug}-qr-taller.pdf`);
    } catch {
      notify("No pudimos armar el PDF. Intenta de nuevo.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function downloadCard() {
    if (!code || !activationUrl) return;
    setBusy("card");
    try {
      const { buildQr, scenesToSheetPdf, activationCardDesign } =
        await qrPrint();
      const { scene } = buildQr({
        url: activationUrl,
        design: activationCardDesign(code),
        logo: null,
      });
      const blob = await scenesToSheetPdf(
        [{ scene, caption: `${kitName}, ${batch.reference}` }],
        {
          paper: "letter",
          widthMm: 50,
          cropMarks: true,
          title: `${batch.reference}, tarjeta de activación`,
        },
      );
      downloadBlob(blob, `${slug}-tarjeta-activacion.pdf`);
    } catch {
      notify("No pudimos armar el PDF. Intenta de nuevo.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="piece-batch">
      <section aria-label="Código del kit" className="piece-code-block">
        {code ? (
          <>
            <p className="eyebrow">Código del kit</p>
            <p className="piece-code">{code}</p>
            <CopyField label="Código del kit" value={code} />
            {!activationUrl ? (
              <Notice tone="warning">
                Falta WEBSITE_URL en el Staff API: la tarjeta de activación
                saldría sin QR.
              </Notice>
            ) : null}
          </>
        ) : (
          <Notice tone="info">
            Ya se activaron todas las piezas de este lote.
          </Notice>
        )}
      </section>

      <section aria-label="Archivos para el taller">
        <SectionHeading
          description="El chip se graba con la URL NFC y el QR impreso abre la URL QR: es la misma dirección, solo cambia el canal."
          title="Archivos para el taller"
        />
        <div className="form-actions piece-downloads">
          <button
            className="button button-primary"
            disabled={busy !== null}
            onClick={() => void downloadQr()}
            type="button"
          >
            <Icon name="download" size={16} />
            {busy === "qr" ? "Armando PDF…" : "QR para el taller (PDF)"}
          </button>
          {code && activationUrl ? (
            <button
              className="button button-secondary"
              disabled={busy !== null}
              onClick={() => void downloadCard()}
              type="button"
            >
              <Icon name="download" size={16} />
              {busy === "card" ? "Armando PDF…" : "Tarjeta de activación (PDF)"}
            </button>
          ) : null}
          <button
            className="button button-secondary"
            onClick={() =>
              downloadCsv(
                workshopCsv(pieces, code, activationUrl),
                `${slug}-nfc.csv`,
              )
            }
            type="button"
          >
            <Icon name="download" size={16} />
            CSV para grabar el NFC
          </button>
        </div>
      </section>

      <section aria-label="Piezas del lote">
        <SectionHeading
          description={`${batch.claimed} de ${batch.pieces} activadas.`}
          title="Piezas"
        />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Pieza</th>
                <th scope="col">Código</th>
                <th scope="col">Estado</th>
                <th scope="col">URL NFC</th>
              </tr>
            </thead>
            <tbody>
              {pieces.map((item, index) => (
                <tr key={item.touchpointId}>
                  <td>
                    <strong>
                      {pieceLabel(item.model, numbers[index] ?? 1)}
                    </strong>
                    <div className="row-meta">{item.publicId}</div>
                  </td>
                  <td>
                    {item.code ? (
                      <code className="piece-mono">{item.code}</code>
                    ) : (
                      "Usado"
                    )}
                  </td>
                  <td>
                    {item.status === "available" ? (
                      <StatusBadge tone="neutral">Sin activar</StatusBadge>
                    ) : (
                      <>
                        <StatusBadge tone="success">Activada</StatusBadge>
                        <div className="row-meta">
                          {item.workspaceName ?? ""}
                          {item.operationalName
                            ? ` «${item.operationalName}»`
                            : ""}
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    <CopyField
                      label={`URL NFC de ${pieceLabel(item.model, numbers[index] ?? 1)}`}
                      value={item.urls.nfc}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
