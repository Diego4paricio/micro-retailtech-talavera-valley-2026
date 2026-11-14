"use client";

import {
  Check,
  FileDown,
  History,
  Inbox,
  Nfc,
  Palette,
  SquarePen,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { KardoPage } from "../kardo-page/KardoPage";
import { isDarkBackground, presetThemes } from "../kardo-page/theme";
import { arrivalCaption, channelNames, type Version } from "./demo-data";
import { NailPolish } from "./drawings";
import { usePhone, usePublisher, useReducedMotion, type Via } from "./hooks";
import {
  emptyFormValues,
  type FormValues,
  LiveFormPage,
  NoticePage,
} from "./LiveForm";
import { Phone } from "./Phone";
import {
  channelDots,
  type EditorTab,
  EditorTabs,
  PanelCard,
  PanelFooter,
  PanelHeader,
  type StatItem,
  StatusPill,
  Switch,
  TextField,
  ThemePicker,
  VersionList,
} from "./panel";
import {
  buildStudioPage,
  describeStudioChanges,
  type FieldSetting,
  type FormSettings,
  type Lead,
  leadStatusLabels,
  leadsCsv,
  limits,
  type StudioLink,
  type StudioState,
  studio,
  studioErrors,
} from "./studio-data";

/*
  Estudio Noa: one plate at the reception, with NFC and QR, and an ad that
  is its own "Otro" Touchpoint. The panel switches what both open (Página
  de enlaces or Formulario de contacto) and publishes. A form sent from the
  phone shows up in Leads, with the visitor's consent and the point it came
  from, and the list exports to CSV like the panel's.
*/

type Tab = "contenido" | "diseno" | "leads" | "versiones";

type FormField = "name" | "phone" | "message";

const fieldLabels: Record<FormField, string> = {
  name: "Nombre",
  phone: "Teléfono",
  message: "Mensaje",
};

const settingLabels: Record<FieldSetting, string> = {
  required: "Obligatorio",
  optional: "Opcional",
  hidden: "Oculto",
};

const cloneState = (state: StudioState): StudioState => ({
  ...state,
  links: state.links.map((link) => ({ ...link })),
  form: { ...state.form },
});

function withField(
  form: FormSettings,
  field: FormField,
  setting: FieldSetting,
): FormSettings {
  const next = { ...form };
  next[field] = setting;
  return next;
}

export function StudioDemo() {
  const first = studio.versions[0] as Version<StudioState>;
  const [versions, setVersions] = useState(studio.versions);
  const [liveNumber, setLiveNumber] = useState(first.number);
  const live =
    versions.find((version) => version.number === liveNumber)?.state ??
    first.state;
  const [draft, setDraft] = useState<StudioState>(() =>
    cloneState(first.state),
  );
  const [tab, setTab] = useState<Tab>("contenido");
  const [leads, setLeads] = useState<Lead[]>(studio.leads);
  const [freshLead, setFreshLead] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>(emptyFormValues);
  const [counts, setCounts] = useState(studio.visits);
  const [bump, setBump] = useState<{ via: Via; key: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reduced = useReducedMotion();
  const phone = usePhone(reduced);
  // The plate and the ad.
  const publisher = usePublisher(2, reduced);
  const publishing = publisher.progress;
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const errors = studioErrors(draft);
  const dirty = describeStudioChanges(live, draft).length > 0;
  const canPublish =
    dirty && Object.keys(errors).length === 0 && publishing === null;

  function visit(via: Via) {
    if (via === "handle") return;
    phone.visit(via, () => {
      setCounts((current) => ({ ...current, [via]: current[via] + 1 }));
      setValues(emptyFormValues);
      setBump((current) => ({ via, key: (current?.key ?? 0) + 1 }));
      setAnnouncement(
        via === "link"
          ? "El celular abrió la página desde el anuncio. Se sumó una visita por URL directa al anuncio."
          : `El celular abrió la página por ${channelNames[via]}. Se sumó un acceso.`,
      );
    });
  }

  function sendForm() {
    if (phone.screen.kind !== "page") return;
    const form = live.form;
    const take = (setting: FieldSetting, value: string) =>
      setting === "hidden" ? null : value.trim() || null;
    const lead: Lead = {
      id: `lead-${Date.now()}`,
      touchpoint:
        phone.screen.via === "link" ? studio.ad.name : studio.touchpoint.name,
      name: take(form.name, values.name),
      email: values.email.trim(),
      phone: take(form.phone, values.phone),
      message: take(form.message, values.message),
      when: "Ahora",
      hoursAgo: 0,
      status: "new",
    };
    setLeads((current) => [lead, ...current]);
    setFreshLead(lead.id);
    setTab("leads");
    phone.setScreen({ kind: "sent", via: phone.screen.via });
    setAnnouncement(
      `Llegó una solicitud de ${lead.name ?? lead.email}, con su consentimiento. Ya está en Solicitudes, en el panel.`,
    );
  }

  function exportCsv() {
    const csv = leadsCsv(leads, new Date());
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "kardo-leads-ejemplo.csv";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement(
      `Se descargó el CSV con ${leads.length} solicitudes de ejemplo.`,
    );
  }

  function publish() {
    if (!canPublish) return;
    const target = cloneState(draft);
    const changes = describeStudioChanges(live, target);
    const number = Math.max(...versions.map((version) => version.number)) + 1;
    const label =
      changes.length === 1
        ? (changes[0] ?? "Cambios")
        : `${changes.length} cambios`;
    publisher.run(() => {
      setVersions((current) => [
        { number, label, when: "Ahora", state: target },
        ...current,
      ]);
      setLiveNumber(number);
      setAnnouncement(
        `Publicado en la placa de recepción y el anuncio: versión ${number}. El celular ya muestra el cambio.`,
      );
    });
  }

  function rollback(version: Version<StudioState>) {
    if (publishing !== null || version.number === liveNumber) return;
    publisher.run(() => {
      setLiveNumber(version.number);
      setDraft(cloneState(version.state));
      setAnnouncement(
        `La placa de recepción y el anuncio regresaron a la versión ${version.number}.`,
      );
    });
  }

  function editLink(linkId: string, patch: Partial<StudioLink>) {
    setDraft((current) => ({
      ...current,
      links: current.links.map((link) =>
        link.id === linkId ? { ...link, ...patch } : link,
      ),
    }));
  }

  function editForm(form: FormSettings) {
    setDraft((current) => ({ ...current, form }));
  }

  const screen = phone.screen;
  const theme = presetThemes[live.themeName];
  const page =
    screen.kind === "sent" ? (
      <NoticePage insetTop={50} message={live.form.successMessage} />
    ) : live.opens === "links" ? (
      <KardoPage content={buildStudioPage(live)} insetTop={50} theme={theme} />
    ) : (
      <LiveFormPage
        form={live.form}
        insetTop={50}
        onChange={setValues}
        onSubmit={sendForm}
        theme={theme}
        values={values}
      />
    );
  const caption =
    screen.kind === "sent"
      ? "Mandaste el formulario. La solicitud ya está en el panel, en Solicitudes."
      : screen.kind === "page" && screen.via !== "handle"
        ? arrivalCaption(studio.phone, screen.via)
        : studio.phone.idle;

  const bumpOf = (via: Via) => (bump?.via === via ? bump.key : undefined);
  const stats: StatItem[] = [
    {
      id: "total",
      label: "Accesos hoy",
      value: counts.nfc + counts.qr + counts.link,
    },
    {
      id: "nfc",
      label: "NFC",
      value: counts.nfc,
      dot: channelDots.nfc,
      bumpKey: bumpOf("nfc"),
    },
    {
      id: "qr",
      label: "QR",
      value: counts.qr,
      dot: channelDots.qr,
      bumpKey: bumpOf("qr"),
    },
    {
      id: "link",
      label: "URL directa del anuncio",
      value: counts.link,
      dot: channelDots.link,
      bumpKey: bumpOf("link"),
    },
  ];
  const tabs: EditorTab<Tab>[] = [
    {
      id: "contenido",
      label: "Contenido",
      icon: <SquarePen aria-hidden="true" className="size-4" />,
    },
    {
      id: "diseno",
      label: "Diseño",
      icon: <Palette aria-hidden="true" className="size-4" />,
    },
    {
      id: "leads",
      label: "Solicitudes",
      icon: <Inbox aria-hidden="true" className="size-4" />,
      count: leads.length,
    },
    {
      id: "versiones",
      label: "Versiones",
      icon: <History aria-hidden="true" className="size-4" />,
    },
  ];

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-14">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Phone
        adImage={<NailPolish />}
        caption={caption}
        copy={studio.phone}
        name={studio.name}
        onVisit={visit}
        page={page}
        pageTone={
          screen.kind !== "sent" && isDarkBackground(theme) ? "light" : "dark"
        }
        screen={screen}
      >
        {screen.kind === "page" && live.opens === "form" ? (
          <p className="mx-auto mt-2 max-w-[322px] text-center">
            <button
              className="min-h-10 text-[13.5px] font-semibold text-teal underline decoration-teal/30 underline-offset-4 transition-colors hover:decoration-teal"
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  ...studio.sampleVisitor,
                }))
              }
              type="button"
            >
              Llenar con datos de ejemplo
            </button>
          </p>
        ) : screen.kind === "sent" ? (
          <p className="mx-auto mt-2 max-w-[322px] text-center lg:hidden">
            <button
              className="min-h-10 text-[13.5px] font-semibold text-teal underline decoration-teal/30 underline-offset-4 transition-colors hover:decoration-teal"
              onClick={() => {
                panelRef.current?.scrollIntoView({
                  behavior: reduced ? "auto" : "smooth",
                  block: "start",
                });
                document
                  .getElementById(`${id}-tab-leads`)
                  ?.focus({ preventScroll: true });
              }}
              type="button"
            >
              Ver la solicitud en el panel
            </button>
          </p>
        ) : null}
      </Phone>

      <div className="min-w-0 scroll-mt-24 lg:order-1" ref={panelRef}>
        <PanelCard>
          <PanelHeader
            icon={<Nfc aria-hidden="true" className="size-[18px]" />}
            status={
              <StatusPill
                dirty={dirty}
                liveNumber={liveNumber}
                publishing={publishing}
              />
            }
            other={studio.ad}
            subtitle={studio.touchpoint.summary}
            title={studio.touchpoint.name}
          />

          <Switch
            legend="Qué abren la placa y el anuncio"
            name={`${id}-opens`}
            onChange={(opens) => setDraft((current) => ({ ...current, opens }))}
            options={[
              ["links", "Página de enlaces", "Enlaces"],
              ["form", "Formulario de contacto", "Formulario"],
            ]}
            value={draft.opens}
          />

          <EditorTabs current={tab} id={id} onChange={setTab} tabs={tabs}>
            {tab === "contenido" ? (
              draft.opens === "links" ? (
                <LinksEditor
                  errors={errors}
                  id={id}
                  links={draft.links}
                  onChange={editLink}
                />
              ) : (
                <FormEditor
                  errors={errors}
                  form={draft.form}
                  id={id}
                  onChange={editForm}
                />
              )
            ) : tab === "diseno" ? (
              <ThemePicker
                choices={studio.themeChoices}
                id={id}
                onChange={(themeName) =>
                  setDraft((current) => ({ ...current, themeName }))
                }
                value={draft.themeName}
              />
            ) : tab === "leads" ? (
              <LeadsList fresh={freshLead} leads={leads} onExport={exportCsv} />
            ) : (
              <VersionList
                busy={publishing !== null}
                liveBadge="Publicada"
                liveNumber={liveNumber}
                onRollback={rollback}
                versions={versions}
              />
            )}
          </EditorTabs>

          <PanelFooter
            canPublish={canPublish}
            dirty={dirty}
            onDiscard={() => setDraft(cloneState(live))}
            onPublish={publish}
            progressLabel={`${publishing ?? 0} de 2 puntos`}
            publishLabel="Publicar en recepción y 1 anuncio"
            publishing={publishing}
            stats={stats}
          />
        </PanelCard>
      </div>
    </div>
  );
}

function LinksEditor({
  id,
  links,
  errors,
  onChange,
}: {
  id: string;
  links: StudioLink[];
  errors: Record<string, string>;
  onChange: (linkId: string, patch: Partial<StudioLink>) => void;
}) {
  return (
    <div>
      <p className="text-[13px] text-soft">
        Editando{" "}
        <strong className="font-semibold text-ink">Página de enlaces</strong>.
        Cada botón lleva a una dirección https.
      </p>
      <ul className="mt-2 divide-y divide-[#e2ded4]">
        {links.map((link, index) => (
          <li className="grid gap-3 py-4 sm:grid-cols-2" key={link.id}>
            <TextField
              error={errors[`label-${link.id}`]}
              id={`${id}-label-${link.id}`}
              label={
                <>
                  Texto del botón
                  <span className="sr-only"> {index + 1}</span>
                </>
              }
              maxLength={limits.label}
              onChange={(label) => onChange(link.id, { label })}
              value={link.label}
            />
            <TextField
              error={errors[`url-${link.id}`]}
              id={`${id}-url-${link.id}`}
              label={
                <>
                  URL<span className="sr-only"> del botón {index + 1}</span>
                </>
              }
              maxLength={limits.url}
              onChange={(url) => onChange(link.id, { url })}
              type="url"
              value={link.url}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormEditor({
  id,
  form,
  errors,
  onChange,
}: {
  id: string;
  form: FormSettings;
  errors: Record<string, string>;
  onChange: (form: FormSettings) => void;
}) {
  return (
    <div className="grid gap-5">
      <p className="text-[13px] text-soft">
        Editando{" "}
        <strong className="font-semibold text-ink">
          Formulario de contacto
        </strong>
        . El correo siempre se pide y el consentimiento siempre es obligatorio.
      </p>
      <fieldset>
        <legend className="text-[13px] font-semibold text-muted">Campos</legend>
        <ul className="mt-1 divide-y divide-[#e2ded4]">
          <li className="flex min-h-12 items-center justify-between gap-3 py-2">
            <span className="text-[15px] font-semibold text-ink">
              Correo electrónico
            </span>
            <span className="px-2.5 text-[14px] font-semibold text-soft">
              Obligatorio
            </span>
          </li>
          {(Object.keys(fieldLabels) as FormField[]).map((field) => (
            <li
              className="flex min-h-12 items-center justify-between gap-3 py-2"
              key={field}
            >
              <label
                className="text-[15px] font-semibold text-ink"
                htmlFor={`${id}-field-${field}`}
              >
                {fieldLabels[field]}
              </label>
              <select
                className="h-10 rounded-lg border border-[#b8c6c3] bg-white px-2.5 text-[14px] font-semibold text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                id={`${id}-field-${field}`}
                onChange={(event) =>
                  onChange(
                    withField(form, field, event.target.value as FieldSetting),
                  )
                }
                value={form[field]}
              >
                {(Object.keys(settingLabels) as FieldSetting[]).map(
                  (setting) => (
                    <option key={setting} value={setting}>
                      {settingLabels[setting]}
                    </option>
                  ),
                )}
              </select>
            </li>
          ))}
        </ul>
      </fieldset>
      <TextField
        error={errors.submitLabel}
        id={`${id}-submit`}
        label="Texto del botón"
        maxLength={limits.submitLabel}
        onChange={(submitLabel) => onChange({ ...form, submitLabel })}
        value={form.submitLabel}
      />
      <TextField
        error={errors.successMessage}
        id={`${id}-success`}
        label="Mensaje de confirmación"
        maxLength={limits.successMessage}
        onChange={(successMessage) => onChange({ ...form, successMessage })}
        value={form.successMessage}
      />
      <TextField
        error={errors.consentText}
        hint="Aparece junto a la casilla que la persona debe marcar para enviar."
        id={`${id}-consent`}
        label="Texto de consentimiento"
        maxLength={limits.consentText}
        multiline
        onChange={(consentText) => onChange({ ...form, consentText })}
        value={form.consentText}
      />
    </div>
  );
}

function LeadsList({
  leads,
  fresh,
  onExport,
}: {
  leads: Lead[];
  fresh: string | null;
  onExport: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-sm text-[13px] text-soft">
          Cada solicitud llega con el consentimiento de la persona: sin marcar
          la casilla, el formulario no se envía.
        </p>
        <button
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#b8c6c3] px-3.5 text-[13px] font-semibold text-ink transition-colors hover:border-teal hover:text-teal"
          onClick={onExport}
          type="button"
        >
          <FileDown aria-hidden="true" className="size-4" />
          Exportar CSV
        </button>
      </div>
      <ul className="mt-3 divide-y divide-[#e2ded4]">
        {leads.map((lead) => (
          <li
            className={`py-3.5 ${lead.id === fresh ? "banner-in" : ""}`}
            key={lead.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">
                  {lead.name ?? "Sin nombre"}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted">
                  <span className="[overflow-wrap:anywhere]">{lead.email}</span>
                  {lead.phone ? <span>{lead.phone}</span> : null}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${lead.status === "new" ? "bg-tint text-teal" : "bg-cream text-muted ring-1 ring-[#d9ded8] ring-inset"}`}
              >
                {leadStatusLabels[lead.status]}
              </span>
            </div>
            {lead.message ? (
              <p className="mt-1.5 text-[14px] leading-snug text-ink [overflow-wrap:anywhere]">
                {lead.message}
              </p>
            ) : null}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-soft">
              <span>{lead.touchpoint}</span>
              <span>{lead.when}</span>
              <span className="inline-flex items-center gap-1 font-semibold text-[#1e6b50]">
                <Check aria-hidden="true" className="size-3.5" />
                Con consentimiento
              </span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
