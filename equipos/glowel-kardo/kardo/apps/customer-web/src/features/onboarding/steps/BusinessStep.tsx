import type { WorkspaceProfile } from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { saveBusinessAddress } from "../../../api/workspace-slug.js";
import { Field } from "../../../components/Field.js";
import { Notice } from "../../../components/Notice.js";
import { useToast } from "../../../components/Toast.js";
import { errorMessage } from "../../../lib/api.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { BusinessAddressField } from "../../business-profile/BusinessAddressField.js";
import { saveWorkspaceProfile } from "../../business-profile/profile-store.js";
import { CityCombobox } from "../../profile-fields/CityCombobox.js";
import { HoursPicker } from "../../profile-fields/HoursPicker.js";
import { PhoneInput } from "../../profile-fields/PhoneInput.js";
import {
  isPhoneComplete,
  phoneDigits,
  phoneForProfile,
  phoneProblem,
} from "../../profile-fields/phone.js";
import { industryChoices } from "../first-steps-model.js";
import type { FirstSteps } from "../use-first-steps.js";

/** 1. Tu negocio: giro, WhatsApp, horario and city, picked or searched
 * rather than typed (owner, 2026-10-03), and the business's address in
 * Kardo (2026-10-04). Only the labels as text (relevo 33).
 *
 * «Salir» (relevo 37 C1b, 2026-10-08): Luis, Marisol and Iván left through
 * «Lo termino después» and their profile stayed empty, so neither the
 * templates nor the AI had anything to work with. `onRegisterExit` (from
 * `FirstStepsPage`) is given a function that saves whatever is already
 * filled — even if the step is not complete — and says what is still
 * missing; `FirstStepsPage`'s «Salir» link calls it before leaving. */
export function BusinessStep({
  steps,
  onDone,
  onRegisterExit,
}: {
  steps: FirstSteps;
  onDone: () => void;
  /** Gives `FirstStepsPage` a function to call before «Salir» navigates
   * away; it is replaced on every render so it always sees the latest
   * fields, and cleared when this step is no longer on screen. */
  onRegisterExit?: (save: (() => Promise<void>) | undefined) => void;
}) {
  const { workspace, reloadWorkspaces } = useWorkspace();
  const { notify } = useToast();
  const data = steps.profile.data;
  // The organization's own giro (A2-55), never the one picked at sign-up
  // for another organization.
  const [industry, setIndustry] = useState(data?.industry ?? "");
  const country = data?.country ?? "MX";
  const [phone, setPhone] = useState(data?.phone ?? "");
  const [city, setCity] = useState(data?.city ?? "");
  const [hours, setHours] = useState(data?.hours ?? "");
  // kardo.com.mx/<negocio> (Links redesign, owner 2026-10-04): chosen
  // here with the rest of the business; Kardo recommends one already free.
  const [slug, setSlug] = useState(workspace.slug ?? "");
  const [slugReady, setSlugReady] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneValid = isPhoneComplete(phone, country);
  const phoneHint = phoneProblem(phone, country);

  // «Salir»: save whatever already reads as valid, say what is missing
  // (giro, then WhatsApp, then horario, in the order the page needs
  // them), and never block leaving on a network error.
  useEffect(() => {
    onRegisterExit?.(async () => {
      const patch: Partial<WorkspaceProfile> = {};
      if (industry)
        patch.industry = industry as NonNullable<WorkspaceProfile["industry"]>;
      if (phoneValid)
        patch.phone = phoneForProfile(phoneDigits(phone, country), country);
      if (city.trim()) patch.city = city.trim();
      if (hours.trim()) patch.hours = hours.trim();
      if (Object.keys(patch).length) {
        try {
          await saveWorkspaceProfile(workspace.id, patch);
        } catch {
          // Best-effort: «Salir» should not get stuck on a network error.
        }
      }
      if (slug && slug !== workspace.slug && slugReady) {
        try {
          await saveBusinessAddress(workspace.id, slug);
          void reloadWorkspaces();
        } catch {
          // The address is finished later, from Primeros pasos.
        }
      }
      const missing = !industry
        ? "el tipo de negocio"
        : !phoneValid
          ? "tu WhatsApp"
          : !hours.trim()
            ? "el horario"
            : null;
      if (missing)
        notify(`Te falta ${missing}. Lo terminas en Primeros pasos.`, "info");
    });
    return () => onRegisterExit?.(undefined);
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!industry || !phoneValid || !slugReady || isSaving) return;
    setIsSaving(true);
    setError(null);
    setSlugError(null);
    try {
      if (slug !== workspace.slug) {
        try {
          await saveBusinessAddress(workspace.id, slug);
        } catch (cause) {
          setSlugError(errorMessage(cause));
          return;
        }
        void reloadWorkspaces();
      }
      // Only these fields: the rest of the profile stays as stored (A2-1).
      await saveWorkspaceProfile(workspace.id, {
        industry: industry as NonNullable<WorkspaceProfile["industry"]>,
        phone: phoneForProfile(phoneDigits(phone, country), country),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(hours.trim() ? { hours: hours.trim() } : {}),
      });
      onDone();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsSaving(false);
    }
  }

  // An Editor cannot change the business's data (A2-7): said plainly, and
  // the step does not hold them up.
  if (!steps.canManageBusiness)
    return (
      <div className="fs-form fs-card fs-narrow">
        <p className="fs-note fs-center">
          Pídele a quien administra la organización que complete los datos del
          negocio.
        </p>
        <button
          className="button button-primary fs-cta"
          onClick={onDone}
          type="button"
        >
          Seguir
        </button>
      </div>
    );

  return (
    <form className="fs-form fs-card" onSubmit={save}>
      <Field id="fs-industry" label="¿Qué tipo de negocio tienes?">
        <select
          className="input"
          id="fs-industry"
          onChange={(event) => setIndustry(event.target.value)}
          required
          value={industry}
        >
          <option value="">Elige una opción</option>
          {industryChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </Field>
      <Field hint={phoneHint ?? undefined} id="fs-phone" label="Tu WhatsApp">
        <PhoneInput
          country={country}
          describedBy={phoneHint ? "fs-phone-hint" : undefined}
          id="fs-phone"
          onChange={setPhone}
          required
          value={phone}
        />
      </Field>
      <Field id="fs-hours" label="Horario" optional>
        <HoursPicker id="fs-hours" onChange={setHours} value={hours} />
      </Field>
      <Field id="fs-city" label="Ciudad" optional>
        <CityCombobox
          country={country}
          id="fs-city"
          onChange={setCity}
          value={city}
        />
      </Field>
      <BusinessAddressField
        city={city}
        error={slugError}
        industry={industry}
        name={workspace.name}
        onChange={(next) => {
          setSlug(next);
          setSlugError(null);
        }}
        onReadyChange={setSlugReady}
        savedSlug={workspace.slug}
        value={slug}
        workspaceId={workspace.id}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <button
        aria-busy={isSaving || undefined}
        className="button button-primary fs-cta"
        disabled={!industry || !phoneValid || !slugReady || isSaving}
        type="submit"
      >
        {isSaving ? "Guardando…" : "Guardar y seguir"}
      </button>
      <p className="fs-note">
        Sigue: tu página. Si sales, guardamos lo que llevas.
      </p>
    </form>
  );
}
