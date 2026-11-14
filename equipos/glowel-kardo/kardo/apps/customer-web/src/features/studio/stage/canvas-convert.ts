import { useCallback, useRef } from "react";
import { useToast } from "../../../components/Toast.js";
import { convertToCanvas } from "../model/canvas.js";
import { convertToCanvasBlocker } from "../model/limits.js";
import { useStudio } from "../StudioContext.js";
import { measureSectionOnPhone } from "./canvas-measure.js";

/**
 * "Convertir en lienzo" for a section menu: `blocker` says why a section
 * cannot become a canvas (`null` when it can) and `convert` measures the
 * section as a phone shows it and turns it into a canvas that looks the
 * same, as one undo step, then selects it.
 */
export function useConvertToCanvas(): {
  blocker: (sectionId: string) => string | null;
  convert: (sectionId: string) => Promise<void>;
} {
  const { design, type, change, select, readOnly } = useStudio();
  const { notify } = useToast();
  // Measuring takes a moment: the check after it reads the latest design.
  const latest = useRef(design);
  latest.current = design;

  const blocker = useCallback(
    (sectionId: string) =>
      readOnly
        ? "Solo lectura"
        : convertToCanvasBlocker(design, type, sectionId),
    [design, type, readOnly],
  );

  const convert = useCallback(
    async (sectionId: string) => {
      const blocked = blocker(sectionId);
      if (blocked) {
        notify(blocked, "info");
        return;
      }
      const measured = await measureSectionOnPhone(sectionId);
      if (!measured) {
        notify("No pudimos medir la sección. Inténtalo otra vez.", "error");
        return;
      }
      const check = convertToCanvas(latest.current, type, sectionId, measured);
      if (!check.ok) {
        notify(check.reason, "info");
        return;
      }
      change((current) => {
        const result = convertToCanvas(current, type, sectionId, measured);
        return result.ok ? result.design : current;
      });
      select({ kind: "section", id: sectionId });
      notify(
        "La sección ahora es un espacio libre: arrastra cada bloque donde quieras.",
        "success",
      );
    },
    [blocker, change, notify, select, type],
  );

  return { blocker, convert };
}
