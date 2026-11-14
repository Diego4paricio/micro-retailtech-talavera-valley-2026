import {
  closingStatusUpdate,
  STATUS_LIMITS,
  type StaffStatusIncident,
  type StatusComponentId,
  type StatusIncidentImpact,
  type StatusIncidentKind,
  type StatusUpdateKind,
  statusComponentIds,
  statusComponentLabels,
  statusUpdateKindsFor,
} from "@kardo/contracts";
import { type FormEvent, useEffect, useId, useState } from "react";
import { statusApi } from "../../api/status.js";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { errorMessage } from "../../lib/api.js";
import {
  closesIncident,
  emptyIncidentForm,
  type IncidentForm,
  type IncidentFormErrors,
  impactLabels,
  incidentImpacts,
  nextUpdateKind,
  toAddUpdate,
  toCreateIncident,
  updateLabels,
  validateIncidentForm,
} from "./format.js";

/** «Reportar incidente» and «Programar mantenimiento». */
export function CreateIncidentDialog({
  open,
  kind,
  onClose,
  onCreated,
}: {
  open: boolean;
  kind: StatusIncidentKind;
  onClose: () => void;
  onCreated: (incident: StaffStatusIncident) => void;
}) {
  const id = useId();
  const formId = `${id}-form`;
  const [form, setForm] = useState<IncidentForm>(() => emptyIncidentForm(kind));
  const [errors, setErrors] = useState<IncidentFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isMaintenance = kind === "maintenance";

  useEffect(() => {
    if (!open) return;
    setForm(emptyIncidentForm(kind));
    setErrors({});
    setError(null);
  }, [open, kind]);

  function toggleComponent(component: StatusComponentId) {
    setForm((current) => ({
      ...current,
      components: current.components.includes(component)
        ? current.components.filter((item) => item !== component)
        : [...current.components, component],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateIncidentForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setIsSaving(true);
    setError(null);
    try {
      onCreated(await statusApi.createIncident(toCreateIncident(form)));
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      description={
        isMaintenance
          ? "Los clientes verán el aviso con la ventana de tiempo y las áreas afectadas."
          : "Los clientes verán el título, las áreas y los mensajes. Nunca el detalle técnico."
      }
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
            className="button button-primary"
            disabled={isSaving}
            form={formId}
            type="submit"
          >
            {isSaving
              ? "Publicando…"
              : isMaintenance
                ? "Programar mantenimiento"
                : "Reportar incidente"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title={isMaintenance ? "Programar mantenimiento" : "Reportar incidente"}
    >
      <form className="form-grid" id={formId} noValidate onSubmit={submit}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field
          counter={{ value: form.title.length, max: STATUS_LIMITS.title }}
          error={errors.title}
          id={`${id}-title`}
          label="Título"
        >
          <input
            id={`${id}-title`}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
            value={form.title}
          />
        </Field>

        {isMaintenance ? null : (
          <fieldset className="ntf-group">
            <legend>Impacto</legend>
            {incidentImpacts.map((impact) => (
              <label className="checkbox-row" key={impact}>
                <input
                  checked={form.impact === impact}
                  name={`${id}-impact`}
                  onChange={() => setForm({ ...form, impact })}
                  type="radio"
                />
                <span>{impactLabels[impact]}</span>
              </label>
            ))}
          </fieldset>
        )}

        <fieldset className="ntf-group">
          <legend>Áreas afectadas</legend>
          <div className="ntf-checks">
            {statusComponentIds.map((component) => (
              <label className="checkbox-row" key={component}>
                <input
                  checked={form.components.includes(component)}
                  onChange={() => toggleComponent(component)}
                  type="checkbox"
                />
                <span>{statusComponentLabels[component]}</span>
              </label>
            ))}
          </div>
          {errors.components ? (
            <p className="field-error" role="alert">
              {errors.components}
            </p>
          ) : null}
        </fieldset>

        {isMaintenance ? (
          <div className="form-grid-2">
            <Field error={errors.startsAt} id={`${id}-start`} label="Empieza">
              <input
                id={`${id}-start`}
                onChange={(event) =>
                  setForm({ ...form, startsAt: event.target.value })
                }
                type="datetime-local"
                value={form.startsAt}
              />
            </Field>
            <Field error={errors.endsAt} id={`${id}-end`} label="Termina">
              <input
                id={`${id}-end`}
                onChange={(event) =>
                  setForm({ ...form, endsAt: event.target.value })
                }
                type="datetime-local"
                value={form.endsAt}
              />
            </Field>
          </div>
        ) : null}

        <Field
          counter={{ value: form.message.length, max: STATUS_LIMITS.message }}
          error={errors.message}
          hint="Lo que van a leer los clientes, en palabras simples."
          id={`${id}-message`}
          label={isMaintenance ? "Mensaje" : "Primer mensaje"}
        >
          <textarea
            id={`${id}-message`}
            onChange={(event) =>
              setForm({ ...form, message: event.target.value })
            }
            rows={4}
            value={form.message}
          />
        </Field>
      </form>
    </Dialog>
  );
}

/** «Agregar actualización» on an open incident or maintenance. */
export function AddUpdateDialog({
  incident,
  onClose,
  onUpdated,
}: {
  /** null keeps the dialog closed. */
  incident: StaffStatusIncident | null;
  onClose: () => void;
  onUpdated: (incident: StaffStatusIncident) => void;
}) {
  const id = useId();
  const formId = `${id}-form`;
  const [status, setStatus] = useState<StatusUpdateKind>("investigating");
  const [message, setMessage] = useState("");
  const [impact, setImpact] = useState<StatusIncidentImpact | "">("");
  const [error, setError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!incident) return;
    const latest = incident.updates[incident.updates.length - 1]?.status;
    setStatus(nextUpdateKind(incident.kind, latest));
    setMessage("");
    setImpact("");
    setError(null);
    setMessageError(null);
  }, [incident]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!incident) return;
    if (
      message.trim() === "" ||
      message.trim().length > STATUS_LIMITS.message
    ) {
      setMessageError(
        message.trim() === ""
          ? "Escribe el mensaje."
          : `El mensaje admite hasta ${STATUS_LIMITS.message} caracteres.`,
      );
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      onUpdated(
        await statusApi.addUpdate(
          incident.id,
          toAddUpdate(incident.kind, status, message, impact),
        ),
      );
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  const kind = incident?.kind ?? "incident";
  const closing = incident ? closesIncident(kind, status) : false;

  return (
    <Dialog
      description={incident?.title}
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
            className="button button-primary"
            disabled={isSaving}
            form={formId}
            type="submit"
          >
            {isSaving
              ? "Publicando…"
              : closing
                ? "Publicar y cerrar"
                : "Publicar"}
          </button>
        </>
      }
      onClose={onClose}
      open={incident !== null}
      title="Agregar actualización"
    >
      <form className="form-grid" id={formId} noValidate onSubmit={submit}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field id={`${id}-status`} label="Estado">
          <select
            id={`${id}-status`}
            onChange={(event) =>
              setStatus(event.target.value as StatusUpdateKind)
            }
            value={status}
          >
            {statusUpdateKindsFor(kind).map((option) => (
              <option key={option} value={option}>
                {updateLabels[option]}
              </option>
            ))}
          </select>
        </Field>
        {closing ? (
          <Notice tone="info">
            Con «{updateLabels[closingStatusUpdate(kind)]}» se cierra y deja de
            verse como abierto.
          </Notice>
        ) : null}
        {kind === "incident" ? (
          <Field
            hint="Déjalo en «Sin cambio» si el impacto sigue igual."
            id={`${id}-impact`}
            label="Cambiar el impacto"
            optional
          >
            <select
              id={`${id}-impact`}
              onChange={(event) =>
                setImpact(event.target.value as StatusIncidentImpact | "")
              }
              value={impact}
            >
              <option value="">Sin cambio</option>
              {incidentImpacts.map((option) => (
                <option key={option} value={option}>
                  {impactLabels[option]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field
          counter={{ value: message.length, max: STATUS_LIMITS.message }}
          error={messageError}
          id={`${id}-message`}
          label="Mensaje"
        >
          <textarea
            id={`${id}-message`}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            value={message}
          />
        </Field>
      </form>
    </Dialog>
  );
}
