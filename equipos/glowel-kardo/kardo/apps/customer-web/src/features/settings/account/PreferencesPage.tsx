import type { CustomerProfile, HourCycle } from "@kardo/contracts";
import { RadioGroup, Switch } from "radix-ui";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { profileApi } from "../../../api/workspaces.js";
import { Dialog } from "../../../components/Dialog.js";
import { Field } from "../../../components/Field.js";
import { Notice } from "../../../components/Notice.js";
import {
  SettingsGroup,
  SettingsIntro,
  SettingsRow,
} from "../../../components/SettingsBlocks.js";
import { Skeleton } from "../../../components/Skeleton.js";
import { useToast } from "../../../components/Toast.js";
import {
  setAccountProfile,
  useAccountProfile,
} from "../../../lib/account-profile.js";
import { errorMessage } from "../../../lib/api.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { listTimeZones } from "../../business-profile/options.js";
import { ChangeButton } from "./ProfilePage.js";

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** «America/Mexico City (GMT-06:00)». */
export function timeZoneLabel(timeZone: string): string {
  let offset = "";
  try {
    offset =
      new Intl.DateTimeFormat("es-MX", {
        timeZone,
        timeZoneName: "longOffset",
      })
        .formatToParts(new Date())
        .find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    // An unknown zone shows without its offset.
  }
  const name = timeZone.replace(/_/g, " ");
  return offset ? `${name} (${offset})` : name;
}

/** «3:30 p. m.» or «15:30», shown with a real time of day. */
function sampleTime(hourCycle: HourCycle | undefined): string {
  const sample = new Date(2026, 0, 1, 15, 30);
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    ...(hourCycle ? { hourCycle } : {}),
  }).format(sample);
}

/** Tu cuenta → Preferencias (ADR 023), saved on the server. */
export function PreferencesPage() {
  const { session } = useWorkspace();
  const { profile, error, reload } = useAccountProfile(session.user.id);
  const { notify } = useToast();
  const [editingZone, setEditingZone] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function save(
    key: string,
    change: Parameters<typeof profileApi.update>[0],
    message: string,
  ) {
    setSaving(key);
    try {
      setAccountProfile(await profileApi.update(change));
      notify(message);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setSaving(null);
    }
  }

  if (error)
    return (
      <>
        <SettingsIntro title="Preferencias" />
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          {error}
        </Notice>
      </>
    );

  return (
    <>
      <SettingsIntro
        description="Se guardan en tu cuenta: las ves igual en cualquier dispositivo."
        title="Preferencias"
      />
      {!profile ? (
        <Skeleton lines={4} />
      ) : (
        <>
          <SettingsGroup id="preferences-region" title="Idioma y región">
            <SettingsRow
              description="Por ahora Kardo solo está en español."
              label="Idioma"
              value="Español (México)"
            />
            <SettingsRow
              action={
                <ChangeButton
                  label="Cambiar zona horaria"
                  onClick={() => setEditingZone(true)}
                />
              }
              description="Para las fechas y horas del panel."
              label="Zona horaria"
              value={
                profile.timeZone ? (
                  timeZoneLabel(profile.timeZone)
                ) : (
                  <>
                    <span className="muted">La de este dispositivo: </span>
                    {timeZoneLabel(deviceTimeZone())}
                  </>
                )
              }
            />
            <SettingsRow
              description="Cómo ves las horas en el panel."
              label="Formato de hora"
              value={
                <HourCycleChoice
                  disabled={saving === "hourCycle"}
                  onChange={(next) =>
                    void save(
                      "hourCycle",
                      { hourCycle: next ?? null },
                      "Formato de hora guardado.",
                    )
                  }
                  value={profile.hourCycle ?? undefined}
                />
              }
            />
          </SettingsGroup>

          <SettingsGroup
            description="Los avisos de seguridad, de cobro y de tu equipo te llegan siempre."
            id="preferences-email"
            title="Correos de Kardo"
          >
            <SettingsRow
              action={
                <Switch.Root
                  aria-label="Recibir novedades de Kardo por correo"
                  checked={profile.marketingEmails === true}
                  className="settings-switch"
                  disabled={saving === "marketingEmails"}
                  onCheckedChange={(checked) =>
                    void save(
                      "marketingEmails",
                      { marketingEmails: checked },
                      checked
                        ? "Te avisaremos de las novedades."
                        : "Ya no te mandaremos novedades.",
                    )
                  }
                >
                  <Switch.Thumb className="settings-switch-thumb" />
                </Switch.Root>
              }
              description="Funciones nuevas y consejos para sacarle provecho a Kardo. Puedes quitarlo cuando quieras."
              label="Novedades de Kardo"
              value={profile.marketingEmails ? "Sí, quiero recibirlas" : "No"}
            />
          </SettingsGroup>

          <TimeZoneDialog
            onClose={() => setEditingZone(false)}
            open={editingZone}
            profile={profile}
          />
        </>
      )}
    </>
  );
}

function HourCycleChoice({
  value,
  disabled,
  onChange,
}: {
  value: HourCycle | undefined;
  disabled: boolean;
  onChange: (next: HourCycle | undefined) => void;
}) {
  const options: { value: string; label: string }[] = [
    { value: "auto", label: `Automático (${sampleTime(undefined)})` },
    { value: "h12", label: sampleTime("h12") },
    { value: "h23", label: sampleTime("h23") },
  ];
  return (
    <RadioGroup.Root
      aria-label="Formato de hora"
      className="settings-segmented"
      disabled={disabled}
      onValueChange={(next) =>
        onChange(next === "auto" ? undefined : (next as HourCycle))
      }
      orientation="horizontal"
      value={value ?? "auto"}
    >
      {options.map((option) => (
        <RadioGroup.Item
          className="settings-segmented-item"
          key={option.value}
          value={option.value}
        >
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

function TimeZoneDialog({
  open,
  profile,
  onClose,
}: {
  open: boolean;
  profile: CustomerProfile;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const device = deviceTimeZone();
  const [choice, setChoice] = useState<string>("device");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Grouped by region so ~400 zones stay findable in a native select.
  const groups = useMemo(() => {
    if (!open) return [];
    const byRegion = new Map<string, { zone: string; label: string }[]>();
    for (const zone of listTimeZones()) {
      const region = zone.includes("/")
        ? (zone.split("/")[0] ?? "Otros")
        : "Otros";
      const entries = byRegion.get(region) ?? [];
      entries.push({ zone, label: timeZoneLabel(zone) });
      byRegion.set(region, entries);
    }
    return [...byRegion.entries()];
  }, [open]);

  useEffect(() => {
    if (open) {
      setChoice(profile.timeZone ?? "device");
      setError(null);
    }
  }, [open, profile.timeZone]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      setAccountProfile(
        await profileApi.update({
          timeZone: choice === "device" ? null : choice,
        }),
      );
      notify("Zona horaria guardada.");
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      description="Kardo muestra las fechas y horas del panel en esta zona."
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
            disabled={isSaving}
            form="time-zone-form"
            type="submit"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Cambiar zona horaria"
    >
      <form className="dialog-form" id="time-zone-form" onSubmit={submit}>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field id="time-zone-select" label="Zona horaria">
          <select
            id="time-zone-select"
            onChange={(event) => setChoice(event.target.value)}
            value={choice}
          >
            <option value="device">
              La de este dispositivo: {timeZoneLabel(device)}
            </option>
            {groups.map(([region, zones]) => (
              <optgroup key={region} label={region}>
                {zones.map(({ zone, label }) => (
                  <option key={zone} value={zone}>
                    {label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      </form>
    </Dialog>
  );
}
