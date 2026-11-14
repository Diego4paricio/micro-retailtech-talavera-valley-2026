import { Switch } from "radix-ui";
import { type FormEvent, useEffect, useState } from "react";
import { leadDeliveryApi } from "../../api/lead-delivery.js";
import { membersApi } from "../../api/members.js";
import { CopyField } from "../../components/CopyField.js";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  currentTeamRecipients,
  maxLeadRecipients,
  recipientChoices,
  toggleRecipient,
} from "./delivery-recipients.js";
import { webhookUrlProblem } from "./webhook-url.js";

export function LeadDeliverySection() {
  const { workspace } = useWorkspace();
  const { notify } = useToast();
  const settings = useResource(`lead-delivery:${workspace.id}`, (signal) =>
    leadDeliveryApi.get(workspace.id, signal),
  );

  const members = useResource(
    `lead-delivery-members:${workspace.id}`,
    (signal) => membersApi.list(workspace.id, signal),
  );

  const [initialized, setInitialized] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  // Only people of the team (the API accepts no other address).
  const [recipients, setRecipients] = useState<string[]>([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    delivered: boolean;
    status: number | null;
  } | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data && members.data && !initialized) {
      setNotifyEmail(settings.data.notifyEmail);
      // Someone who left the team is not shown (nor saved again).
      setRecipients(
        currentTeamRecipients(settings.data.notifyRecipients, members.data),
      );
      setWebhookUrl(settings.data.webhookUrl ?? "");
      setInitialized(true);
    }
  }, [settings.data, members.data, initialized]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const emails = notifyEmail ? recipients : [];
    const trimmedUrl = webhookUrl.trim();
    const urlProblem = webhookUrlProblem(trimmedUrl);
    if (urlProblem) {
      setFormError(urlProblem);
      return;
    }
    setIsSaving(true);
    try {
      const result = await leadDeliveryApi.update(workspace.id, {
        notifyEmail,
        notifyRecipients: emails,
        webhookUrl: trimmedUrl || null,
      });
      settings.setData(result.settings);
      // A new address gets its first secret here, shown only this once.
      if (result.webhookSecret) setRevealedSecret(result.webhookSecret);
      notify("Configuración de entrega actualizada.");
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function rotateSecret() {
    setIsRotating(true);
    try {
      // Only the secret changes: whatever is typed in the form stays unsaved.
      const result = await leadDeliveryApi.rotateWebhookSecret(workspace.id);
      settings.setData(result.settings);
      if (result.webhookSecret) setRevealedSecret(result.webhookSecret);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsRotating(false);
    }
  }

  async function sendTest() {
    setIsTesting(true);
    setTestResult(null);
    try {
      setTestResult(await leadDeliveryApi.test(workspace.id));
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsTesting(false);
    }
  }

  if (
    (settings.isLoading && !settings.data) ||
    (members.isLoading && !members.data)
  )
    return <Skeleton lines={5} />;
  if (settings.error || members.error)
    return (
      <Notice
        action={
          <button
            className="text-action"
            onClick={() => {
              void settings.reload();
              void members.reload();
            }}
            type="button"
          >
            Reintentar
          </button>
        }
        tone="danger"
      >
        {settings.error ?? members.error}
      </Notice>
    );

  const emailAvailable = settings.data?.emailAvailable ?? false;
  const teamChoices = recipientChoices(members.data ?? []);
  // The secret belongs to the saved address: a typed one is not saved yet.
  const hasSavedWebhook = settings.data?.webhookConfigured ?? false;

  return (
    <section
      aria-labelledby="lead-delivery-heading"
      className="panel kd-delivery"
    >
      <SectionHeading
        description="Kardo siempre guarda cada solicitud en este panel, sin costo adicional. Estas opciones solo añaden una copia."
        id="lead-delivery-heading"
        title="Dónde recibir las solicitudes"
      />
      {formError ? <Notice tone="danger">{formError}</Notice> : null}

      <form className="form-grid" onSubmit={submit}>
        <div className="kd-switch-row">
          <Switch.Root
            checked={notifyEmail}
            className="kd-switch"
            disabled={!emailAvailable}
            id="notify-email"
            onCheckedChange={(checked) => setNotifyEmail(checked === true)}
          >
            <Switch.Thumb className="kd-switch-thumb" />
          </Switch.Root>
          <label htmlFor="notify-email">
            <strong>Avisar por correo</strong>
            <small>
              {emailAvailable
                ? "Hasta 5 destinatarios reciben un correo por cada solicitud nueva."
                : "El envío de correos aún no está activado en este entorno."}
            </small>
          </label>
        </div>

        {notifyEmail ? (
          <fieldset className="kd-recipient-list">
            <legend>Quién recibe el aviso (hasta {maxLeadRecipients})</legend>
            {teamChoices.length ? (
              teamChoices.map((choice) => {
                const checked = recipients.some(
                  (email) => email.toLowerCase() === choice.email.toLowerCase(),
                );
                return (
                  <label className="kd-recipient-row" key={choice.email}>
                    <input
                      checked={checked}
                      disabled={
                        !checked && recipients.length >= maxLeadRecipients
                      }
                      onChange={() =>
                        setRecipients((current) =>
                          toggleRecipient(current, choice.email),
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>{choice.label}</strong>
                      {choice.label !== choice.email ? (
                        <small> {choice.email}</small>
                      ) : null}
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="field-hint">
                Aún no hay personas con correo en tu equipo.
              </p>
            )}
            <p className="field-hint">
              Solo se puede avisar a personas de tu equipo. Para avisarle a
              alguien más, invítalo en Equipo.
            </p>
          </fieldset>
        ) : null}

        <Field
          hint={
            <>
              Para mandar cada solicitud a otro sistema, como tu CRM. Si no
              sabes qué es, no lo necesitas.
              <br />
              Solo se acepta https://. Kardo enviará un POST firmado por cada
              solicitud nueva.
            </>
          }
          id="webhook-url"
          label="Webhook (CRM, Zapier, Make, Google Apps Script…)"
          optional
        >
          <input
            id="webhook-url"
            onChange={(event) => setWebhookUrl(event.target.value)}
            placeholder="https://hooks.miempresa.com/kardo"
            type="url"
            value={webhookUrl}
          />
        </Field>

        <div className="form-actions">
          <button
            className="button button-primary"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>

      <div className="kd-webhook-tools">
        <div>
          <button
            className="button button-secondary"
            disabled={!hasSavedWebhook || isRotating}
            onClick={() => void rotateSecret()}
            type="button"
          >
            <Icon name="webhook" size={16} /> Rotar secreto
          </button>
          {!hasSavedWebhook ? (
            <p className="field-hint">
              Guarda la dirección del webhook y Kardo te mostrará su secreto.
            </p>
          ) : null}
        </div>
        <div>
          <button
            className="button button-secondary"
            disabled={!hasSavedWebhook || isTesting}
            onClick={() => void sendTest()}
            type="button"
          >
            {isTesting ? "Enviando…" : "Enviar prueba"}
          </button>
        </div>
      </div>

      {testResult ? (
        <Notice tone={testResult.delivered ? "success" : "danger"}>
          {testResult.delivered
            ? `Entregado correctamente (HTTP ${testResult.status}).`
            : "No se pudo entregar el evento de prueba. Revisa la URL y que tu servidor responda 2xx."}
        </Notice>
      ) : null}

      <details className="kd-webhook-help">
        <summary>Formato del webhook</summary>
        <p>
          Kardo envía un <code>POST</code> con este cuerpo JSON:
        </p>
        <pre className="kd-code-block">
          <code>{`{
  "event": "lead.created",
  "id": "…",
  "createdAt": "2026-09-24T19:45:00.000Z",
  "workspace": { "id": "…", "name": "Café Nube" },
  "touchpoint": { "id": "…", "name": "Tarjeta de bienvenida" },
  "lead": { "name": "Ana Ruiz", "email": "ana@example.com", "phone": "+52…", "message": "…" }
}`}</code>
        </pre>
        <p>
          Cada solicitud incluye la cabecera <code>x-kardo-signature</code> con
          el formato{" "}
          <code>
            t=&lt;unix&gt;,v1=&lt;hex HMAC-SHA256(secreto,
            "&lt;t&gt;.&lt;body&gt;")&gt;
          </code>
          . Verifícala así (Node.js):
        </p>
        <pre className="kd-code-block">
          <code>{`const [, ts, sig] = header.match(/t=(\\d+),v1=([a-f0-9]+)/);
const expected = crypto
  .createHmac("sha256", secret)
  .update(\`\${ts}.\${body}\`)
  .digest("hex");
if (sig !== expected) throw new Error("Firma inválida");`}</code>
        </pre>
      </details>

      <Dialog
        description="Cópialo ahora: no se volverá a mostrar. Guárdalo en tu integración (CRM, Zapier, Make…)."
        footer={
          <button
            className="button button-primary"
            onClick={() => setRevealedSecret(null)}
            type="button"
          >
            Ya lo copié
          </button>
        }
        onClose={() => setRevealedSecret(null)}
        open={Boolean(revealedSecret)}
        title="Secreto del webhook"
      >
        <CopyField label="Secreto" value={revealedSecret ?? ""} />
      </Dialog>
    </section>
  );
}
