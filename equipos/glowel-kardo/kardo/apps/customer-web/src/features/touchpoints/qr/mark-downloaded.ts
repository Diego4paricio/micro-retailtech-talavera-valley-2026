import type { Touchpoint } from "@kardo/contracts";
import { useCallback } from "react";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { effectiveKind } from "../kind.js";

/**
 * After a recorded download, the touchpoints in the panel's list learn it
 * too, wherever it happened (the touchpoint page, the Diseño del QR, a
 * sheet, Primeros pasos): a QR's «Descargar» step reads `downloadedAt`, and
 * an NFC's backup QR marks «Respaldo» (relevo 38), as the API does.
 */
export function markDownloaded(touchpoint: Touchpoint, at: string): Touchpoint {
  const object = touchpoint.object;
  if (!object) return touchpoint;
  const backup =
    effectiveKind(touchpoint.kind) === "nfc" &&
    object.replacingAt === null &&
    object.backupAt === null;
  return {
    ...touchpoint,
    object: {
      ...object,
      downloadedAt: at,
      ...(backup ? { backupAt: at } : {}),
    },
  };
}

export function useMarkQrDownloaded(): (ids: readonly string[]) => void {
  const { touchpoints, upsertTouchpoint } = useWorkspace();
  const items = touchpoints.data;
  return useCallback(
    (ids: readonly string[]) => {
      const at = new Date().toISOString();
      for (const id of ids) {
        const touchpoint = items?.find((item) => item.id === id);
        if (touchpoint) upsertTouchpoint(markDownloaded(touchpoint, at));
      }
    },
    [items, upsertTouchpoint],
  );
}
