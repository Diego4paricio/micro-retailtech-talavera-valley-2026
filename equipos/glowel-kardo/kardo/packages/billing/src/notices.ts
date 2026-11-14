import { createHash } from "node:crypto";
import type { Sql } from "postgres";

// ---------------------------------------------------------------------------
// Billing notices to the customer (ADR 019/020; LFPC art. 76 Bis fr. VIII y
// IX): confirmation when a subscription starts, notice at least 7 days before
// each automatic charge, the Kardo trial (start, 7 and 3 days left, end) and a
// cancellation confirmation with a folio. Notices are queued in
// `kardo_billing.notices` inside the same transaction as the change that
// causes them (one per `dedupe_key`), then delivered by `createNoticeSender`,
// which records who got each one and when.
// ---------------------------------------------------------------------------

/** Version of the Terms the customer accepts in Checkout (Docs/legal). */
export const TERMS_VERSION = "1.1";

/**
 * Days public pages keep working after a trial or a plan ends without a
 * contract (ADR 020 §4); then they show a neutral status page.
 */
export const ACCESS_GRACE_DAYS = 7;
/** Days after that end until the organization is deleted (ADR 020 §4). */
export const DELETE_AFTER_DAYS = 90;
/**
 * Paying during the trial keeps its remaining days (first charge when it
 * ends) only with at least this many days left, so the notice of that first
 * automatic charge always arrives 5 or more days before it (LFPC art. 76 Bis
 * fr. VIII). With fewer days the charge is immediate.
 */
export const KEEP_TRIAL_MIN_DAYS = 5;

/**
 * Conversion coupon (ADR 020 §1): 20 % off the first 3 monthly charges,
 * valid for 7 days after the Kardo trial ends. Created by
 * `scripts/stripe/setup-billing.mts`; applied only in Checkout.
 */
export const CONVERSION_COUPON = {
  id: "kardo_conversion_20x3",
  percentOff: 20,
  months: 3,
  validDays: 7,
} as const;

/** Notice of the deletion, this many days before it (ADR 020 §4). */
export const DELETION_NOTICE_DAYS = 15;

export type NoticeKind =
  | "subscription_started"
  | "renewal_upcoming"
  | "trial_ending"
  | "cancellation_confirmed"
  | "trial_started"
  | "trial_reminder"
  | "trial_ended"
  | "plan_ended"
  | "pause_upcoming"
  | "pages_paused"
  | "deletion_upcoming"
  | "courtesy_ending"
  | "cfdi_issued"
  | "plan_overage_opened"
  | "plan_overage_reminder"
  | "plan_overage_applied";

export type NoticePayload = {
  workspaceName: string;
  planName: string;
  /** Cents, IVA included. */
  amount: number | null;
  currency: string;
  interval: "day" | "week" | "month" | "year" | null;
  /** ISO dates. */
  chargeAt?: string | null;
  trialEnd?: string | null;
  endsAt?: string | null;
  folio?: string;
  termsVersion?: string;
  /** Kardo trial reminders: whole days left. */
  daysLeft?: number;
  /** When public pages stop working if nothing is contracted. */
  graceEndsAt?: string | null;
  /** When the organization is deleted if nothing is contracted. */
  deleteAt?: string | null;
  /** Conversion coupon deadline, when the organization qualifies. */
  offerUntil?: string | null;
  /** What ended (`plan_ended`): a paid plan or a staff courtesy. */
  endedKind?: "subscription" | "manual";
  /** `cfdi_issued`: the payment and its SAT folio. */
  invoiceNumber?: string | null;
  paidAt?: string | null;
  satUuid?: string | null;
  fiscalEmail?: string | null;
  /** Issued with Facturapi: the PDF and the XML are in the panel. */
  cfdiInPanel?: boolean;
  /** Facturapi test mode: not stamped by the SAT, no fiscal validity. */
  cfdiTest?: boolean;
  /** Downgrade option B (ADR 023): what is over the new plan and until when
   * the customer may choose what stays active. */
  chooseBy?: string | null;
  /** ADR 024: the plan is the person's and also counts organizations. */
  organizationsOver?: number;
  organizationsLimit?: number | null;
  touchpointsOver?: number;
  linksOver?: number;
  touchpointsLimit?: number | null;
  linksLimit?: number | null;
};

type Transaction = Sql;

export async function enqueueNotice(
  tx: Transaction,
  input: {
    workspaceId: string;
    kind: NoticeKind;
    dedupeKey: string;
    subscriptionId: string | null;
    payload: NoticePayload;
  },
): Promise<void> {
  await tx`
    insert into kardo_billing.notices (
      workspace_id, kind, dedupe_key, stripe_subscription_id, payload
    ) values (
      ${input.workspaceId}::uuid, ${input.kind}, ${input.dedupeKey.slice(0, 200)},
      ${input.subscriptionId}, ${tx.json(input.payload as unknown as Parameters<Sql["json"]>[0])}
    )
    on conflict (dedupe_key) do nothing
  `;
}

/** Short, deterministic cancellation folio: KC- plus 8 hex characters. */
export function cancellationFolio(subscriptionId: string, at: Date): string {
  return `KC-${createHash("sha256")
    .update(`${subscriptionId}|${at.toISOString()}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase()}`;
}

export const dayKey = (value: Date | string | null | undefined): string =>
  value ? new Date(value).toISOString().slice(0, 10) : "none";

// --- Rendering ----------------------------------------------------------------

export type NoticeLinks = {
  /** Customer panel origin, e.g. https://app.kardo.mx */
  appOrigin: string;
  /** Published Terms of Subscription, when available. */
  termsUrl: string | null;
};

export type RenderedNotice = { subject: string; text: string; html: string };

const LONG_DATE = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

function longDate(value: string | null | undefined): string {
  return value
    ? LONG_DATE.format(new Date(value))
    : "la fecha del próximo periodo";
}

function money(cents: number | null, currency: string): string {
  if (cents === null) return "el precio de tu plan";
  const amount = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
  return `${amount} ${currency.toUpperCase()}, IVA incluido`;
}

function every(interval: NoticePayload["interval"]): string {
  switch (interval) {
    case "year":
      return "cada año";
    case "week":
      return "cada semana";
    case "day":
      return "cada día";
    default:
      return "cada mes";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Paragraphs → plain text and a minimal, accessible HTML email. */
function compose(
  subject: string,
  paragraphs: string[],
  action: { label: string; url: string },
  footer: string[],
): RenderedNotice {
  const text = [...paragraphs, `${action.label}: ${action.url}`, "", ...footer]
    .join("\n\n")
    .trim();
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`)
    .join("");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f6f5f1;font-family:Helvetica,Arial,sans-serif;color:#16232e">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:20px;font-weight:700;margin:0 0 24px;color:#0a6c78">Kardo</p>
<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px">${escapeHtml(subject)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#0a6c78;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(action.label)}</a></p>
${footer.map((line) => `<p style="font-size:12px;color:#5b6770;margin:0 0 8px">${escapeHtml(line)}</p>`).join("")}
</div></body></html>`;
  return { subject, text, html };
}

export function renderNotice(
  kind: NoticeKind,
  payload: NoticePayload,
  links: NoticeLinks,
): RenderedNotice {
  const planUrl = `${links.appOrigin.replace(/\/+$/, "")}/settings/plan`;
  const org = payload.workspaceName;
  const plan = payload.planName;
  const price = money(payload.amount, payload.currency);
  const footer = [
    `Organización: ${org}.`,
    links.termsUrl
      ? `Términos y Condiciones de Suscripción, versión ${payload.termsVersion ?? TERMS_VERSION}: ${links.termsUrl}`
      : `Términos y Condiciones de Suscripción, versión ${payload.termsVersion ?? TERMS_VERSION}.`,
    "Recibes este correo porque administras la facturación de esta organización en Kardo.",
  ];

  const afterEnd = `Si no contratas, no se cobra nada: tu panel queda limitado (puedes elegir un plan, ver tu contenido y descargar tu información) y tus páginas siguen abiertas ${ACCESS_GRACE_DAYS} días más; después muestran que no están disponibles hasta que contrates. Si en ${DELETE_AFTER_DAYS} días no contratas, borramos la organización y te avisamos antes.`;
  const keepDays =
    "Si contratas con 5 días o más de anticipación, el primer cargo es el día que termina tu prueba, así no pierdes ningún día.";

  switch (kind) {
    case "subscription_started": {
      const trial = payload.trialEnd;
      return compose(
        `Tu plan ${plan} está activo`,
        trial
          ? [
              `Contrataste el plan ${plan}. Tu prueba sigue hasta el ${longDate(trial)}: ese día se hará el primer cargo de ${price} y el plan se renovará ${every(payload.interval)} hasta que lo canceles.`,
              "Te avisaremos por correo al menos 7 días antes de cada cargo. Puedes cancelar sin costo antes del primer cargo desde Configuración, Plan.",
            ]
          : [
              `Contrataste el plan ${plan} por ${price}, con renovación automática ${every(payload.interval)} hasta que lo canceles.`,
              `El próximo cargo será el ${longDate(payload.chargeAt)}. Te avisaremos por correo al menos 7 días antes de cada cargo.`,
              "Puedes cancelar en cualquier momento desde Configuración, Plan. La cancelación surte efecto al final del periodo pagado y no habrá más cargos.",
            ],
        { label: "Ver mi plan", url: planUrl },
        footer,
      );
    }
    case "renewal_upcoming":
      return compose(
        `Tu plan ${plan} se renueva el ${longDate(payload.chargeAt)}`,
        [
          `El ${longDate(payload.chargeAt)} haremos el cargo automático de ${price} por la renovación del plan ${plan}, que se renueva ${every(payload.interval)}.`,
          "Si no quieres renovarlo, cancélalo antes de esa fecha desde Configuración, Plan. Conservarás el plan hasta el final del periodo ya pagado y no habrá más cargos.",
        ],
        { label: "Revisar o cancelar mi plan", url: planUrl },
        footer,
      );
    case "trial_ending":
      return compose(
        `Tu prueba del plan ${plan} termina el ${longDate(payload.trialEnd)}`,
        [
          `Tu prueba del plan ${plan} termina el ${longDate(payload.trialEnd)}. No tienes una tarjeta registrada, así que no haremos ningún cargo.`,
          `Si quieres seguir con el plan ${plan} (${price}, ${every(payload.interval)}), agrega una tarjeta antes de esa fecha.`,
          afterEnd,
        ],
        { label: "Continuar con mi plan", url: planUrl },
        footer,
      );
    case "cancellation_confirmed":
      return compose(
        `Cancelaste el plan ${plan} (folio ${payload.folio ?? ""})`,
        [
          `Recibimos la cancelación del plan ${plan}. Tu folio es ${payload.folio ?? ""}.`,
          payload.endsAt
            ? `El plan sigue activo hasta el ${longDate(payload.endsAt)} y no habrá más cargos.`
            : "La cancelación ya surtió efecto y no habrá más cargos.",
          `Al terminar, tu panel queda limitado (puedes volver a contratar, ver tu contenido y descargar tu información) y tus páginas siguen abiertas ${ACCESS_GRACE_DAYS} días más. Si en ${DELETE_AFTER_DAYS} días no contratas, borramos la organización y te avisamos antes.`,
        ],
        { label: "Ver mi plan", url: planUrl },
        footer,
      );
    case "trial_started":
      return compose(
        `Tu prueba del plan ${plan} ya empezó`,
        [
          `Tienes el plan ${plan} completo hasta el ${longDate(payload.trialEnd)}, sin tarjeta y sin cargos.`,
          payload.amount !== null
            ? `Cuando quieras seguir, elige un plan desde Configuración, Plan. ${plan} cuesta ${price} ${every(payload.interval)}. ${keepDays}`
            : `Cuando quieras seguir, elige un plan desde Configuración, Plan. ${keepDays}`,
          afterEnd,
        ],
        { label: "Elegir mi plan", url: planUrl },
        footer,
      );
    case "trial_reminder": {
      const days = payload.daysLeft ?? 0;
      return compose(
        days === 1
          ? `Mañana termina tu prueba del plan ${plan}`
          : `Te quedan ${days} días de prueba del plan ${plan}`,
        [
          `Tu prueba del plan ${plan} termina el ${longDate(payload.trialEnd)}. No tienes nada que pagar hasta que decidas contratar.`,
          payload.amount !== null
            ? `${plan} cuesta ${price} ${every(payload.interval)}. ${keepDays}`
            : keepDays,
          afterEnd,
        ],
        { label: "Elegir mi plan", url: planUrl },
        footer,
      );
    }
    case "trial_ended":
      return compose(
        `Terminó tu prueba del plan ${plan}`,
        [
          "Tu prueba terminó y no se hizo ningún cargo.",
          "Tu panel quedó limitado: puedes elegir un plan, ver tu contenido y descargar tu información.",
          pagesOpenUntil(payload.graceEndsAt),
          ...(payload.offerUntil
            ? [
                `Si contratas un plan mensual antes del ${longDate(payload.offerUntil)}, tienes ${CONVERSION_COUPON.percentOff} % de descuento en tus ${CONVERSION_COUPON.months} primeros meses. Se aplica solo al pagar.`,
              ]
            : []),
          `Si en ${DELETE_AFTER_DAYS} días no contratas, borramos la organización; te avisaremos antes.`,
        ],
        { label: "Elegir mi plan", url: planUrl },
        footer,
      );
    case "plan_ended": {
      const courtesy = payload.endedKind === "manual";
      return compose(
        courtesy
          ? `Terminó tu plan ${plan} de cortesía`
          : `Terminó tu plan ${plan}`,
        [
          courtesy
            ? `El plan ${plan} que Kardo te dio sin costo terminó. No se hizo ningún cargo.`
            : `Tu plan ${plan} terminó y no habrá más cargos.`,
          "Tu panel quedó limitado: puedes elegir un plan, ver tu contenido y descargar tu información.",
          pagesOpenUntil(payload.graceEndsAt),
          `Si en ${DELETE_AFTER_DAYS} días no contratas, borramos la organización; te avisaremos antes.`,
        ],
        { label: "Elegir mi plan", url: planUrl },
        footer,
      );
    }
    case "pause_upcoming":
      return compose(
        `Tus páginas se pausan el ${longDate(payload.graceEndsAt)}`,
        [
          `El ${longDate(payload.graceEndsAt)} tus páginas (QR, NFC y links) dejarán de mostrar tu contenido: quien las visite verá "Esta página no está disponible por ahora", sin ninguna mención a pagos.`,
          "Si eliges un plan antes, siguen funcionando sin interrupción. Si contratas después, vuelven al instante, también tus QR impresos.",
          "Mientras tanto puedes ver tu contenido y descargar tu información desde el panel.",
        ],
        { label: "Elegir mi plan", url: planUrl },
        footer,
      );
    case "pages_paused":
      return compose(
        "Tus páginas están en pausa",
        [
          'Desde hoy tus páginas (QR, NFC y links) muestran "Esta página no está disponible por ahora". No dicen nada de pagos, no registran visitas y no reciben formularios.',
          "Elige un plan y vuelven al instante, también tus QR impresos. Tu contenido sigue guardado.",
          payload.deleteAt
            ? `Si no contratas antes del ${longDate(payload.deleteAt)}, borramos la organización; te avisaremos antes. Puedes descargar tu información desde el panel.`
            : "Puedes descargar tu información desde el panel.",
        ],
        { label: "Elegir mi plan", url: planUrl },
        footer,
      );
    case "deletion_upcoming":
      return compose(
        `Borraremos ${org} el ${longDate(payload.deleteAt)}`,
        [
          `La organización ${org} no tiene un plan activo. El ${longDate(payload.deleteAt)} la borraremos con sus Touchpoints, páginas, archivos y leads. Tu cuenta de usuario se conserva.`,
          "Antes de esa fecha puedes descargar tu información desde el panel, o elegir un plan para conservar todo: al contratar, tus páginas vuelven al instante.",
        ],
        { label: "Descargar o elegir un plan", url: planUrl },
        footer,
      );
    case "cfdi_issued":
      return cfdiIssued(payload, planUrl, footer);
    case "courtesy_ending": {
      const days = payload.daysLeft ?? 0;
      return compose(
        days <= 1
          ? `Mañana termina tu plan ${plan} de cortesía`
          : `Tu plan ${plan} de cortesía termina el ${longDate(payload.endsAt)}`,
        [
          `Kardo te dio el plan ${plan} sin costo hasta el ${longDate(payload.endsAt)}. No se hará ningún cargo automático.`,
          "Para seguir sin interrupción, elige un plan desde Configuración, Plan antes de esa fecha.",
          afterEnd,
        ],
        { label: "Elegir mi plan", url: planUrl },
        footer,
      );
    }
    case "plan_overage_opened":
    case "plan_overage_reminder":
    case "plan_overage_applied":
      return planOverage(kind, payload, planUrl, footer);
  }
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** «1 organización, 12 QR y etiquetas y 1 link» from what is over the plan. */
function overText(payload: NoticePayload): string {
  const parts: string[] = [];
  const organizations = payload.organizationsOver ?? 0;
  const touchpoints = payload.touchpointsOver ?? 0;
  const links = payload.linksOver ?? 0;
  if (organizations > 0)
    parts.push(plural(organizations, "organización", "organizaciones"));
  if (touchpoints > 0)
    parts.push(plural(touchpoints, "QR o etiqueta", "QR y etiquetas"));
  if (links > 0) parts.push(plural(links, "link", "links"));
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`
    : (parts[0] ?? "");
}

/** Downgrade option B (ADR 023; Términos 10.5). */
function planOverage(
  kind:
    | "plan_overage_opened"
    | "plan_overage_reminder"
    | "plan_overage_applied",
  payload: NoticePayload,
  planUrl: string,
  footer: string[],
): RenderedNotice {
  const plan = payload.planName;
  const included = [
    payload.organizationsLimit != null && (payload.organizationsOver ?? 0) > 0
      ? plural(payload.organizationsLimit, "organización", "organizaciones")
      : null,
    payload.touchpointsLimit != null
      ? `${payload.touchpointsLimit} QR y etiquetas`
      : null,
    payload.linksLimit != null
      ? plural(payload.linksLimit, "link", "links")
      : null,
  ].filter((part): part is string => Boolean(part));
  const limits =
    included.length > 1
      ? `${included.slice(0, -1).join(", ")} y ${included.at(-1)}`
      : (included[0] ?? "");
  const keep =
    "Nada se borra: el contenido, las solicitudes y la analítica se conservan. Si vuelves a un plan que los incluya, o liberas espacio, se reactivan al instante.";
  if (kind === "plan_overage_applied")
    return compose(
      "Aplicamos la regla de tu plan",
      [
        `No elegiste a tiempo cuáles seguían activos, así que dejamos activos los que tuvieron más visitas en los últimos 30 días, dentro de lo que incluye el plan ${plan}${limits ? ` (${limits})` : ""}.`,
        "Los demás muestran la página «Esta página no está disponible por ahora», sin hablar de pagos, y no reciben visitas ni formularios. Puedes cambiar cuáles quedan activos cuando quieras desde Configuración, Plan y facturación.",
        keep,
      ],
      { label: "Elegir cuáles siguen activos", url: planUrl },
      footer,
    );
  const over = overText(payload);
  return compose(
    kind === "plan_overage_reminder"
      ? `Quedan pocos días para elegir qué sigue activo con ${plan}`
      : `Elige qué sigue activo con el plan ${plan}`,
    [
      `El plan ${plan} incluye ${limits || "menos elementos de los que tienes"}. Hoy tienes ${over || "algunos elementos"} de más.`,
      `Elige antes del ${longDate(payload.chooseBy)} cuáles siguen activos. Si no eliges, dejaremos activos los que tuvieron más visitas en los últimos 30 días.`,
      "Los que queden fuera mostrarán la página «Esta página no está disponible por ahora», sin hablar de pagos, y no recibirán visitas ni formularios.",
      keep,
    ],
    { label: "Elegir cuáles siguen activos", url: planUrl },
    footer,
  );
}

function cfdiIssued(
  payload: NoticePayload,
  planUrl: string,
  footer: string[],
): RenderedNotice {
  const paid = money(payload.amount, payload.currency);
  return compose(
    `Emitimos tu factura del pago del ${longDate(payload.paidAt)}`,
    [
      `Emitimos el CFDI de tu pago de ${paid}${payload.invoiceNumber ? ` (recibo ${payload.invoiceNumber})` : ""}.`,
      `Folio fiscal (UUID): ${payload.satUuid ?? ""}.`,
      ...(payload.cfdiTest
        ? [
            "Es un CFDI de prueba: no se timbró ante el SAT y no tiene validez fiscal.",
          ]
        : []),
      payload.cfdiInPanel
        ? "Descarga el XML y el PDF en Configuración, Plan, en la lista de facturas."
        : payload.fiscalEmail
          ? `Enviamos el XML y el PDF a ${payload.fiscalEmail}. Si no te llegan, responde a este correo.`
          : "Si no te llegan el XML y el PDF, responde a este correo.",
      "Puedes revisar tus datos de facturación en Configuración, Plan.",
    ],
    { label: "Ver mis facturas", url: planUrl },
    footer,
  );
}

function pagesOpenUntil(graceEndsAt: string | null | undefined): string {
  return graceEndsAt
    ? `Tus páginas (QR, NFC y links) siguen abiertas hasta el ${longDate(graceEndsAt)}; después mostrarán que no están disponibles hasta que contrates. Al contratar, todo vuelve al instante, también tus QR impresos.`
    : `Tus páginas (QR, NFC y links) siguen abiertas ${ACCESS_GRACE_DAYS} días más; después mostrarán que no están disponibles hasta que contrates. Al contratar, todo vuelve al instante, también tus QR impresos.`;
}

// --- Delivery ------------------------------------------------------------------

export type Emailer = {
  send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    idempotencyKey: string;
  }): Promise<{ id: string | null }>;
};

/** Resend over plain fetch (same provider as workspace invitations). */
export function createResendEmailer(options: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): Emailer {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async send(message) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Resend answered ${response.status}.`);
      }
      const body = (await response.json().catch(() => ({}))) as { id?: string };
      return { id: typeof body.id === "string" ? body.id.slice(0, 200) : null };
    },
  };
}

export type NoticeSender = {
  /** Sends pending (and retryable failed) notices; never throws. */
  deliverPending(limit?: number): Promise<{ sent: number; failed: number }>;
};

type PendingRow = {
  id: string;
  workspace_id: string;
  kind: NoticeKind;
  payload: NoticePayload;
  attempts: number;
  email: string | null;
};

const MAX_ATTEMPTS = 5;

export function createNoticeSender(options: {
  sql: Sql;
  emailer: Emailer;
  links: NoticeLinks;
}): NoticeSender {
  const { sql, emailer, links } = options;
  return {
    async deliverPending(limit = 10) {
      let sent = 0;
      let failed = 0;
      for (let index = 0; index < limit; index += 1) {
        const done = await sql
          .begin(async (tx) => {
            await tx`select set_config('role', 'kardo_billing_sync', true)`;
            const [row] = await tx<PendingRow[]>`
              select n.id, n.workspace_id, n.kind, n.payload, n.attempts,
                coalesce(c.email, p.email, owner.email) as email
              from kardo_billing.notices n
              left join kardo_billing.customers c on c.workspace_id = n.workspace_id
              -- A trial without a Stripe Customer: whoever started it.
              left join kardo_billing.trials t on t.workspace_id = n.workspace_id
              left join kardo_core.profiles p on p.id = t.profile_id
              -- A courtesy or an organization without a trial: its Owner.
              left join lateral (
                select op.email from kardo_core.workspace_memberships m
                join kardo_core.profiles op on op.id = m.profile_id
                where m.workspace_id = n.workspace_id and m.role = 'owner'
                order by m.created_at
                limit 1
              ) owner on true
              where n.status in ('pending', 'failed') and n.attempts < ${MAX_ATTEMPTS}
              order by n.created_at
              limit 1
              for update of n skip locked
            `;
            if (!row) return "empty" as const;
            if (!row.email) {
              await tx`
                update kardo_billing.notices
                set status = 'skipped', last_error = 'no billing email', attempts = attempts + 1
                where id = ${row.id}::uuid
              `;
              return "failed" as const;
            }
            const rendered = renderNotice(row.kind, row.payload, links);
            try {
              const result = await emailer.send({
                to: row.email,
                ...rendered,
                idempotencyKey: `kardo-notice-${row.id}`,
              });
              await tx`
                update kardo_billing.notices set
                  status = 'sent', attempts = attempts + 1, sent_at = now(),
                  sent_to = ${row.email}, provider_message_id = ${result.id},
                  last_error = null
                where id = ${row.id}::uuid
              `;
              await tx`
                insert into kardo_audit.events (
                  workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
                ) values (
                  ${row.workspace_id}::uuid, null, 'service', 'billing.notice_sent', 'notice',
                  ${row.id}::uuid, 'succeeded', ${tx.json({ kind: row.kind })}
                )
              `;
              return "sent" as const;
            } catch (error) {
              const message = (
                error instanceof Error ? error.message : String(error)
              )
                .replace(/re_[A-Za-z0-9_]+/g, "[redacted]")
                .slice(0, 500);
              await tx`
                update kardo_billing.notices
                set status = 'failed', attempts = attempts + 1, last_error = ${message}
                where id = ${row.id}::uuid
              `;
              return "failed" as const;
            }
          })
          .catch(() => "failed" as const);
        if (done === "empty") break;
        if (done === "sent") sent += 1;
        else failed += 1;
      }
      return { sent, failed };
    },
  };
}
