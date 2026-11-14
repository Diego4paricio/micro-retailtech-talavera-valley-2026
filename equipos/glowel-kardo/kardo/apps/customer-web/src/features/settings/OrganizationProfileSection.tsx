import {
  WORKSPACE_PROFILE_ABOUT_MAX,
  type WorkspaceProfile,
} from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { SettingsGroup, SettingsRow } from "../../components/SettingsBlocks.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  countries,
  countryLabel,
  industryLabels,
  industryOptions,
  listTimeZones,
} from "../business-profile/options.js";
import {
  profilePatchFrom,
  saveWorkspaceProfile,
} from "../business-profile/profile-store.js";
import { CityCombobox } from "../profile-fields/CityCombobox.js";
import { HoursPicker } from "../profile-fields/HoursPicker.js";
import { PhoneInput } from "../profile-fields/PhoneInput.js";
import {
  phoneDigits,
  phoneForProfile,
  phoneProblem,
} from "../profile-fields/phone.js";
import { useWorkspaceProfile } from "./use-workspace-profile.js";

type FormState = {
  legalName: string;
  industry: string;
  about: string;
  hours: string;
  website: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  country: string;
  timezone: string;
};

function toFormState(profile: WorkspaceProfile): FormState {
  return {
    legalName: profile.legalName ?? "",
    industry: profile.industry ?? "",
    about: profile.about ?? "",
    hours: profile.hours ?? "",
    website: profile.website ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    city: profile.city ?? "",
    address: profile.address ?? "",
    country: profile.country ?? "MX",
    timezone: profile.timezone ?? "America/Mexico_City",
  };
}

/**
 * Organización → General, business data. Personal workspaces have no
 * business identity, so they get a short explanation instead of the rows.
 */
export function OrganizationProfileSection() {
  const { workspace, can } = useWorkspace();
  const canManage = can("workspace.manage");
  const profile = useWorkspaceProfile();
  const [editing, setEditing] = useState(false);

  if (workspace.kind === "personal")
    return (
      <Notice tone="info">
        Este es tu espacio personal: no tiene giro, ubicación ni datos de
        contacto propios. Crea una organización para registrar el perfil de tu
        negocio y compartirlo con tu equipo.
      </Notice>
    );

  const data = profile.data;
  const unset = <span className="muted">Sin definir</span>;
  const location = data
    ? [data.city, countryLabel(data.country)].filter(Boolean).join(", ")
    : "";

  return (
    <>
      <SettingsGroup
        actions={
          canManage && data ? (
            <button
              aria-label="Editar datos del negocio"
              className="button button-secondary button-small"
              onClick={() => setEditing(true)}
              type="button"
            >
              Editar
            </button>
          ) : undefined
        }
        footer={
          canManage
            ? undefined
            : "Solo el Owner o un Admin puede editar estos datos."
        }
        id="organization-profile-heading"
        title="Datos del negocio"
      >
        {profile.isLoading && !data ? (
          <Skeleton lines={4} />
        ) : profile.error ? (
          <Notice
            action={
              <button
                className="text-action"
                onClick={() => void profile.reload()}
                type="button"
              >
                Reintentar
              </button>
            }
            tone="danger"
          >
            {profile.error}
          </Notice>
        ) : data ? (
          <>
            <SettingsRow label="Nombre legal" value={data.legalName ?? unset} />
            <SettingsRow
              label="Giro"
              value={data.industry ? industryLabels[data.industry] : unset}
            />
            <SettingsRow
              description="Qué haces y para quién. La IA de Kardo lo usa en cada página."
              label="Sobre tu negocio"
              value={data.about ?? unset}
            />
            <SettingsRow
              description="Las plantillas y la IA de Kardo lo ponen en tu página."
              label="Horario"
              value={data.hours ?? unset}
            />
            <SettingsRow label="Sitio web" value={data.website ?? unset} />
            <SettingsRow
              label="Correo de contacto"
              value={data.email ?? unset}
            />
            <SettingsRow
              description="Tu WhatsApp: los botones de las plantillas y de la IA lo usan."
              label="Teléfono"
              value={data.phone ?? unset}
            />
            <SettingsRow label="Ciudad y país" value={location || unset} />
            <SettingsRow label="Dirección" value={data.address ?? unset} />
            <SettingsRow
              description="Para las horas de tus visitas y solicitudes."
              label="Zona horaria del negocio"
              value={data.timezone ?? unset}
            />
          </>
        ) : null}
      </SettingsGroup>
      {data ? (
        <ProfileDialog
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            profile.setData(updated);
            setEditing(false);
          }}
          open={editing}
          profile={data}
          workspaceId={workspace.id}
        />
      ) : null}
    </>
  );
}

/** The business data form, in its own dialog and saved on its own. */
function ProfileDialog({
  open,
  profile,
  workspaceId,
  onClose,
  onSaved,
}: {
  open: boolean;
  profile: WorkspaceProfile;
  workspaceId: string;
  onClose: () => void;
  onSaved: (updated: WorkspaceProfile) => void;
}) {
  const { notify } = useToast();
  const [form, setForm] = useState<FormState>(() => toFormState(profile));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const timeZones = listTimeZones();
  const phoneIssue = phoneProblem(form.phone, form.country);

  useEffect(() => {
    if (open) {
      setForm(toFormState(profile));
      setError(null);
    }
  }, [open, profile]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phoneIssue) return;
    setError(null);
    setIsSaving(true);
    try {
      const payload = profilePatchFrom({
        legalName: form.legalName.trim() || undefined,
        industry: (form.industry || undefined) as WorkspaceProfile["industry"],
        about: form.about.trim() || undefined,
        hours: form.hours.trim() || undefined,
        website: form.website.trim() || undefined,
        email: form.email.trim() || undefined,
        phone:
          phoneForProfile(
            phoneDigits(form.phone, form.country),
            form.country,
          ) || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        country: form.country || undefined,
        timezone: form.timezone || undefined,
      });
      const updated = await saveWorkspaceProfile(workspaceId, payload);
      notify("Perfil del negocio actualizado.");
      onSaved(updated);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={isSaving || Boolean(phoneIssue)}
            form="organization-profile-form"
            type="submit"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title="Editar datos del negocio"
    >
      <form
        className="form-grid form-grid-2 settings-profile-form"
        id="organization-profile-form"
        onSubmit={submit}
      >
        {error ? (
          <div className="settings-field-wide">
            <Notice tone="danger">{error}</Notice>
          </div>
        ) : null}
        <Field id="org-legal-name" label="Nombre legal" optional>
          <input
            id="org-legal-name"
            maxLength={160}
            onChange={(event) =>
              setForm({ ...form, legalName: event.target.value })
            }
            value={form.legalName}
          />
        </Field>
        <Field id="org-industry" label="Giro">
          <select
            id="org-industry"
            onChange={(event) =>
              setForm({ ...form, industry: event.target.value })
            }
            value={form.industry}
          >
            <option value="">Selecciona un giro</option>
            {industryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="settings-field-wide">
          <Field
            counter={{
              value: form.about.length,
              max: WORKSPACE_PROFILE_ABOUT_MAX,
            }}
            hint="Qué haces y para quién, en una o dos frases. La IA de Kardo lo usa en cada página para que no tengas que escribirlo otra vez."
            id="org-about"
            label="Sobre tu negocio"
            optional
          >
            <textarea
              id="org-about"
              maxLength={WORKSPACE_PROFILE_ABOUT_MAX}
              onChange={(event) =>
                setForm({ ...form, about: event.target.value })
              }
              placeholder="Ej.: Arreglos florales para regalar y para eventos, con entrega a domicilio en Puebla."
              rows={2}
              value={form.about}
            />
          </Field>
        </div>
        <div className="settings-field-wide">
          <Field
            hint="Las plantillas y la IA de Kardo lo ponen en tu página; si no eliges días, no ponen ninguno."
            id="org-hours"
            label="Horario"
            optional
          >
            <HoursPicker
              id="org-hours"
              onChange={(hours) =>
                setForm((current) => ({ ...current, hours }))
              }
              value={form.hours}
            />
          </Field>
        </div>
        <Field
          hint="Debe empezar con https://"
          id="org-website"
          label="Sitio web"
          optional
        >
          <input
            id="org-website"
            onChange={(event) =>
              setForm({ ...form, website: event.target.value })
            }
            placeholder="https://tunegocio.com"
            type="url"
            value={form.website}
          />
        </Field>
        <Field id="org-email" label="Correo de contacto" optional>
          <input
            id="org-email"
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
            type="email"
            value={form.email}
          />
        </Field>
        <Field
          error={phoneIssue}
          hint="Tu WhatsApp. Con él armamos los botones de las plantillas y de la IA."
          id="org-phone"
          label="Teléfono"
          optional
        >
          <PhoneInput
            country={form.country}
            describedBy={phoneIssue ? "org-phone-error" : "org-phone-hint"}
            id="org-phone"
            onChange={(phone) => setForm((current) => ({ ...current, phone }))}
            value={form.phone}
          />
        </Field>
        <Field id="org-city" label="Ciudad" optional>
          <CityCombobox
            country={form.country}
            id="org-city"
            onChange={(city) => setForm((current) => ({ ...current, city }))}
            value={form.city}
          />
        </Field>
        <Field
          hint="Calle, número y colonia."
          id="org-address"
          label="Dirección"
          optional
        >
          <input
            autoComplete="street-address"
            id="org-address"
            maxLength={200}
            onChange={(event) =>
              setForm({ ...form, address: event.target.value })
            }
            value={form.address}
          />
        </Field>
        <Field id="org-country" label="País">
          <select
            id="org-country"
            onChange={(event) =>
              setForm({ ...form, country: event.target.value })
            }
            value={form.country}
          >
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          hint="Para las horas de tus visitas y solicitudes."
          id="org-timezone"
          label="Zona horaria del negocio"
        >
          <select
            id="org-timezone"
            onChange={(event) =>
              setForm({ ...form, timezone: event.target.value })
            }
            value={form.timezone}
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Dialog>
  );
}
