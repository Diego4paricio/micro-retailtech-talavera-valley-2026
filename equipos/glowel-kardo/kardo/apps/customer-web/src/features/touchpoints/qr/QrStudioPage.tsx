import { EmptyState } from "../../../components/EmptyState.js";
import { Skeleton } from "../../../components/Skeleton.js";
import { Link } from "../../../lib/router.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { effectiveKind, touchpointKindLabels } from "../kind.js";
import { TouchpointStudio } from "./studio/TouchpointStudio.js";

/**
 * Diseño del QR (`/touchpoints/:id/qr`): the dedicated design page of a QR,
 * or of an NFC's backup QR (relevo 38, model A: the backup lives in the NFC,
 * opens the same page through `?src=qr` and is not another touchpoint). The
 * editor lives in `./studio/`: toolbar with history and save state, section
 * rail, live stage with mockups and legibility, and a properties panel
 * (stacked as an accordion on small screens). `download` opens it in its
 * download dialog (from «Corregir» in a download elsewhere).
 */
export function QrStudioPage({
  touchpointId,
  download = false,
}: {
  touchpointId: string;
  download?: boolean;
}) {
  const { touchpoints, groups } = useWorkspace();
  const touchpoint = touchpoints.data?.find((item) => item.id === touchpointId);

  if (!touchpoint) {
    if (touchpoints.isLoading) return <Skeleton lines={6} />;
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
          icon="qr"
          title="No encontramos este QR"
        >
          Puede que se haya movido a otro espacio o que no tengas acceso.
        </EmptyState>
      </div>
    );
  }

  const kind = effectiveKind(touchpoint.kind);
  if (kind !== "qr" && kind !== "nfc") {
    return (
      <div className="page">
        <EmptyState
          action={
            <Link
              className="button button-primary"
              to={{ name: "touchpoint", id: touchpoint.id }}
            >
              Volver
            </Link>
          }
          icon="qr"
          title="Este formato no lleva QR"
        >
          El formato de {touchpoint.operationalName} es «
          {touchpointKindLabels[kind]}». Cámbialo a QR o NFC para diseñar su
          código.
        </EmptyState>
      </div>
    );
  }

  const groupName = touchpoint.groupId
    ? (groups.data?.find((group) => group.id === touchpoint.groupId)?.name ??
      null)
    : null;

  return (
    <TouchpointStudio
      backup={kind === "nfc"}
      download={download}
      groupName={groupName}
      touchpoint={touchpoint}
    />
  );
}
