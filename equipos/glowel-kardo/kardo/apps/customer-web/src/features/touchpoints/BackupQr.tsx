import type { Touchpoint } from "@kardo/contracts";
import { Icon } from "../../components/Icon.js";
import { useRouter } from "../../lib/router.js";
import type { QrTools } from "./ConnectObject.js";
import { QrPreview } from "./QrDownload.js";

/**
 * Step 3 of an NFC: its backup QR, to print and place beside the card.
 *
 * The backup QR lives in the NFC (relevo 38, model A, owner 2026-10-08): its
 * own design from the studio («Personaliza tu QR» opens it on this NFC), the
 * same page through `?src=qr` (its visits count as QR), and it is not
 * another touchpoint for the plan. Downloading it marks «Respaldo». Beside
 * the steps, `QrCodeCard` with `backup` keeps it always at hand.
 */
export function BackupSticker({
  touchpoint,
  qr,
  canManage,
}: {
  touchpoint: Touchpoint;
  qr: QrTools | undefined;
  canManage: boolean;
}) {
  const { navigate } = useRouter();
  return (
    <div className="tp-sticker-row">
      {qr ? <QrPreview state={qr.state} touchpoint={touchpoint} /> : null}
      <div className="tp-sticker-options">
        <span className="tp-step-hint">
          De al menos 3 × 3 cm. Pégalo junto a la tarjeta.
        </span>
        <div className="tp-step-actions">
          <button
            className="button button-secondary button-small"
            disabled={!qr?.ready}
            onClick={() => qr?.onDownload()}
            type="button"
          >
            <Icon name="download" size={16} /> Descargar
          </button>
          {canManage ? (
            <button
              className="text-action"
              onClick={() => navigate({ name: "qr-studio", id: touchpoint.id })}
              type="button"
            >
              <Icon name="edit" size={16} /> Personaliza tu QR
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
