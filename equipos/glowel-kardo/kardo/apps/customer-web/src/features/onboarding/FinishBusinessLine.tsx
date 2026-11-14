import type { WorkspaceProfile } from "@kardo/contracts";
import { useRouter } from "../../lib/router.js";
import "./finish-business-line.css";

/**
 * «Termina Tu negocio» (relevo 37 C1e): one line, shown only when the
 * profile is still missing WhatsApp, horario or giro — the three things
 * «Tu negocio» (Primeros pasos, paso 1) asks for, and the rest of Kardo
 * reads later (Links' dirección, the AI's contact and hours, publishing).
 * A business can reach later steps with the giro and WhatsApp saved but
 * no horario (it is optional there), so this keeps nudging until all
 * three are in. Links straight to that step.
 *
 *   <FinishBusinessLine profile={steps.profile.data} />
 *
 * `profile` is `null` while it is still loading: nothing shows until it
 * is known. Used today inside Primeros pasos (`FirstStepsPage.tsx`); Links,
 * the AI and publicar get their own copy of it later.
 */
export function FinishBusinessLine({
  profile,
}: {
  profile: Pick<WorkspaceProfile, "industry" | "phone" | "hours"> | null;
}) {
  const { navigate } = useRouter();
  if (!profile) return null;
  const missing =
    !profile.industry || !profile.phone || !(profile.hours ?? "").trim();
  if (!missing) return null;
  return (
    <p className="fs-finish-business fs-center">
      <button
        className="link-button"
        onClick={() => navigate({ name: "first-steps", step: "business" })}
        type="button"
      >
        Termina Tu negocio
      </button>
    </p>
  );
}
