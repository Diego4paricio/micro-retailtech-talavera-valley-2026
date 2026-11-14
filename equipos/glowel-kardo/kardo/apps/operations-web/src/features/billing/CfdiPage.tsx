import {
  type CfdiDocumentFormat,
  type CfdiRequestStatus,
  cfdiRequestStatuses,
  type StaffAccountingMonth,
  type StaffCfdiRequest,
  type StaffGlobalInvoice,
} from "@kardo/contracts";
import { type FormEvent, useId, useState } from "react";
import { type CfdiResolution, cfdiApi } from "../../api/billing.js";
import { Dialog } from "../../components/Dialog.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Field } from "../../components/Field.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader, SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { copyText } from "../../lib/clipboard.js";
import { formatDateTimeMx } from "../../lib/format.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useStaff } from "../../shell/StaffContext.js";
import { ActionDialog } from "./ActionDialog.js";
import {
  accountingCsv,
  accountingFilename,
  accountingNote,
  accountingPathLabels,
  cfdiStatusLabels,
  cfdiStatusTones,
  cfdiUseLabel,
  globalInvoiceCsv,
  globalInvoiceFilename,
  globalInvoiceNote,
  isOverdue,
  issueEmailNote,
  isValidSatUuid,
  moneyOrDash,
  monthLabel,
  monthOptions,
  previousMonth,
  requestedAgoLabel,
  satFillingNote,
  taxRegimeLabel,
} from "./cfdi.js";
import { formatMoney } from "./format.js";

type Resolving = {
  kind: "issue" | "facturapi" | "reject" | "cancel";
  request: StaffCfdiRequest;
} | null;

/** Downloads a CFDI file through the Staff API (fetched from Facturapi). */
async function downloadCfdi(
  request: StaffCfdiRequest,
  format: CfdiDocumentFormat,
) {
  const file = await cfdiApi.document(request.id, format);
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cfdi-${request.invoiceNumber ?? request.id.slice(0, 8)}.${format}`;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function CfdiPage() {
  return (
    <div className="page">
      <PageHeader
        actions={
          <Link className="button button-secondary" to={{ name: "billing" }}>
            Suscripciones
          </Link>
        }
        back={
          <Link
            ariaLabel="Volver a suscripciones"
            className="text-action"
            to={{ name: "billing" }}
          >
            <Icon name="arrow-left" size={16} /> Suscripciones
          </Link>
        }
        description="Cada cobro debe quedar amparado por un CFDI. Si la organización pidió factura, emítela dentro de las 24 horas siguientes al cobro; si no, el pago entra a la factura global del mes."
        eyebrow="Kardo Operations"
        title="Facturas por emitir"
      />
      <Notice tone="info">{satFillingNote}</Notice>
      <CfdiQueue />
      <GlobalInvoice />
      <AccountingMonth />
    </div>
  );
}

function CfdiQueue() {
  const { can } = useStaff();
  const { notify } = useToast();
  const canWrite = can(staffPermissions.billingWrite);
  const [status, setStatus] = useState<CfdiRequestStatus>("pending");
  const [resolving, setResolving] = useState<Resolving>(null);
  const list = useResource(`cfdi:${status}`, (signal) =>
    cfdiApi.list(status, signal),
  );
  const now = new Date();

  async function resolve(request: StaffCfdiRequest, body: CfdiResolution) {
    await cfdiApi.resolve(request.id, body);
    notify(
      body.status === "issued"
        ? "Factura marcada como emitida."
        : body.status === "rejected"
          ? "Solicitud rechazada."
          : "Factura marcada como cancelada.",
    );
    await list.reload();
  }

  return (
    <section aria-labelledby="cfdi-heading" className="panel">
      <SectionHeading id="cfdi-heading" title="Solicitudes de factura" />
      <div className="toolbar">
        <div className="segmented">
          {cfdiRequestStatuses.map((value) => (
            <button
              aria-pressed={status === value}
              className={
                status === value ? "segment segment-current" : "segment"
              }
              key={value}
              onClick={() => setStatus(value)}
              type="button"
            >
              {cfdiStatusLabels[value]}
            </button>
          ))}
        </div>
      </div>
      {list.error ? (
        <Notice tone="error">{list.error}</Notice>
      ) : list.isLoading && !list.data ? (
        <Skeleton lines={5} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState icon="check" title="Sin solicitudes">
          No hay solicitudes en este estado.
        </EmptyState>
      ) : (
        <div className="cfdi-list">
          {(list.data ?? []).map((request) => (
            <CfdiCard
              canWrite={canWrite}
              key={request.id}
              now={now}
              onDownload={(format) =>
                void downloadCfdi(request, format).catch((failure) =>
                  notify(errorMessage(failure), "error"),
                )
              }
              onResolve={(kind) => setResolving({ kind, request })}
              request={request}
            />
          ))}
        </div>
      )}

      {resolving?.kind === "facturapi" ? (
        <FacturapiDialog
          onClose={() => setResolving(null)}
          onSubmit={async (paymentForm) => {
            await cfdiApi.issueWithFacturapi(resolving.request.id, paymentForm);
            notify("CFDI emitido con Facturapi. El cliente recibe el aviso.");
            await list.reload();
          }}
          request={resolving.request}
        />
      ) : null}
      {resolving?.kind === "issue" ? (
        <IssueDialog
          onClose={() => setResolving(null)}
          onSubmit={(satUuid) =>
            resolve(resolving.request, { status: "issued", satUuid })
          }
          request={resolving.request}
        />
      ) : null}
      {resolving &&
      (resolving.kind === "reject" || resolving.kind === "cancel") ? (
        <ActionDialog
          confirmLabel={
            resolving.kind === "reject" ? "Rechazar" : "Marcar cancelada"
          }
          description={`${resolving.request.workspaceName}, pago ${resolving.request.invoiceNumber ?? resolving.request.invoiceId}.`}
          onClose={() => setResolving(null)}
          onSubmit={(notes) =>
            resolve(resolving.request, {
              status: resolving.kind === "reject" ? "rejected" : "canceled",
              notes,
            })
          }
          open
          reasonHint="Se guarda con la solicitud (3 a 500 caracteres)."
          title={
            resolving.kind === "reject"
              ? "Rechazar solicitud"
              : "Marcar factura cancelada"
          }
          tone="danger"
        />
      ) : null}
    </section>
  );
}

export function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={`Copiar ${label}`}
      className="text-action cfdi-copy"
      onClick={() =>
        void copyText(value).then((ok) => {
          setCopied(ok);
          if (ok) window.setTimeout(() => setCopied(false), 1_800);
        })
      }
      type="button"
    >
      <Icon name={copied ? "check" : "copy"} size={14} />
      <span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
    </button>
  );
}

export function CfdiCard({
  request,
  now,
  canWrite,
  onResolve,
  onDownload,
}: {
  request: StaffCfdiRequest;
  now: Date;
  canWrite: boolean;
  onResolve: (kind: "issue" | "facturapi" | "reject" | "cancel") => void;
  onDownload?: (format: CfdiDocumentFormat) => void;
}) {
  const overdue =
    request.status === "pending" && isOverdue(request.requestedAt, now);
  const fiscalRows: [string, string][] = [
    ["RFC", request.fiscal.rfc],
    ["Razón social", request.fiscal.legalName],
    ["Régimen fiscal", taxRegimeLabel(request.fiscal.taxRegime)],
    ["Código postal", request.fiscal.postalCode],
    ["Uso del CFDI", cfdiUseLabel(request.fiscal.cfdiUse)],
    ["Correo", request.fiscal.email],
  ];
  // The copy button carries the bare code for regime and use, not the label.
  const copyValue: Record<string, string> = {
    "Régimen fiscal": request.fiscal.taxRegime,
    "Uso del CFDI": request.fiscal.cfdiUse,
  };
  return (
    <article className={overdue ? "cfdi-card cfdi-card-overdue" : "cfdi-card"}>
      <header className="cfdi-card-head">
        <div>
          <Link to={{ name: "billing-workspace", id: request.workspaceId }}>
            <strong>{request.workspaceName}</strong>
          </Link>
          <div className="row-meta">
            Pago {request.invoiceNumber ?? request.invoiceId}:{" "}
            {formatMoney(request.amountPaid, request.currency)} con IVA
            incluido, IVA {moneyOrDash(request.tax, request.currency)}
          </div>
          <div className="row-meta">
            Pagado el {formatDateTimeMx(request.paidAt)} (hora de México)
          </div>
        </div>
        <div className="cfdi-card-state">
          <StatusBadge tone={cfdiStatusTones[request.status]}>
            {cfdiStatusLabels[request.status].replace(/s$/, "")}
          </StatusBadge>
          {request.automatic ? (
            <div className="row-meta">Factura de cada pago (automática)</div>
          ) : null}
          {request.status === "pending" ? (
            <div className={overdue ? "row-meta billing-flag" : "row-meta"}>
              {requestedAgoLabel(request.requestedAt, now)}
              {overdue ? ": pasaron más de 24 horas" : ""}
            </div>
          ) : (
            <div className="row-meta">
              Atendida el {formatDateTimeMx(request.handledAt)}
            </div>
          )}
        </div>
      </header>

      <dl className="cfdi-fiscal">
        {fiscalRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <span>{value}</span>
              <CopyButton label={label} value={copyValue[label] ?? value} />
            </dd>
          </div>
        ))}
        {request.satUuid ? (
          <div>
            <dt>Folio fiscal (UUID)</dt>
            <dd>
              <code>{request.satUuid}</code>
              <CopyButton label="folio fiscal" value={request.satUuid} />
            </dd>
          </div>
        ) : null}
        {request.notes ? (
          <div>
            <dt>{request.status === "issued" ? "Notas" : "Motivo"}</dt>
            <dd>{request.notes}</dd>
          </div>
        ) : null}
        {request.document ? (
          <div>
            <dt>CFDI</dt>
            <dd>
              {request.document.test ? (
                <StatusBadge tone="warning">
                  De prueba, sin validez fiscal
                </StatusBadge>
              ) : null}
              {(["pdf", "xml"] as const).map((format) => (
                <button
                  className="text-action"
                  key={format}
                  onClick={() => onDownload?.(format)}
                  type="button"
                >
                  Descargar {format.toUpperCase()}
                </button>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      <footer className="cfdi-card-actions">
        {request.stripeInvoiceUrl ? (
          <a
            className="text-action"
            href={request.stripeInvoiceUrl}
            rel="noreferrer"
            target="_blank"
          >
            Ver pago en Stripe
          </a>
        ) : null}
        <span className="row-meta">
          Forma de pago: 04 si la tarjeta fue de crédito, 28 si fue de débito.
        </span>
        {canWrite && request.status === "pending" ? (
          <>
            {request.facturapi ? (
              <button
                className="button button-primary button-small"
                onClick={() => onResolve("facturapi")}
                type="button"
              >
                {request.facturapi === "test"
                  ? "Emitir con Facturapi (prueba)"
                  : "Emitir con Facturapi"}
              </button>
            ) : null}
            <button
              className={
                request.facturapi
                  ? "button button-secondary button-small"
                  : "button button-primary button-small"
              }
              onClick={() => onResolve("issue")}
              type="button"
            >
              {request.facturapi ? "Marcar emitida a mano" : "Marcar emitida"}
            </button>
            <button
              className="button button-secondary button-small"
              onClick={() => onResolve("reject")}
              type="button"
            >
              Rechazar
            </button>
          </>
        ) : null}
        {canWrite && request.status === "issued" ? (
          <button
            className="button button-secondary button-small"
            onClick={() => onResolve("cancel")}
            type="button"
          >
            Marcar cancelada
          </button>
        ) : null}
      </footer>
    </article>
  );
}

/** ADR 020 §6, phase 2: Facturapi issues the CFDI with the request's data. */
function FacturapiDialog({
  request,
  onSubmit,
  onClose,
}: {
  request: StaffCfdiRequest;
  onSubmit: (paymentForm: "04" | "28") => Promise<void>;
  onClose: () => void;
}) {
  const formId = useId();
  const [paymentForm, setPaymentForm] = useState<"04" | "28">("04");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await onSubmit(paymentForm);
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Dialog
      description={`${request.workspaceName}, pago ${request.invoiceNumber ?? request.invoiceId}: ${formatMoney(request.amountPaid, request.currency)} con IVA incluido, a ${request.fiscal.rfc}.`}
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
            disabled={isBusy}
            form={formId}
            type="submit"
          >
            {isBusy ? "Emitiendo…" : "Emitir CFDI"}
          </button>
        </>
      }
      onClose={onClose}
      open
      title={
        request.facturapi === "test"
          ? "Emitir con Facturapi (modo prueba)"
          : "Emitir con Facturapi"
      }
    >
      <form className="form-grid" id={formId} onSubmit={submit}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <p>
          {request.facturapi === "test"
            ? "Modo prueba: Facturapi genera el XML y el PDF, pero no los timbra ante el SAT; no tienen validez fiscal."
            : "Facturapi timbra el CFDI ante el SAT con los datos de esta solicitud."}{" "}
          Al emitirlo, la solicitud queda emitida con su folio fiscal y el
          cliente recibe el aviso para descargar el PDF y el XML desde su panel.
        </p>
        <Field id={`${formId}-form`} label="Forma de pago">
          <select
            id={`${formId}-form`}
            onChange={(event) =>
              setPaymentForm(event.target.value === "28" ? "28" : "04")
            }
            value={paymentForm}
          >
            <option value="04">04, tarjeta de crédito</option>
            <option value="28">28, tarjeta de débito</option>
          </select>
        </Field>
      </form>
    </Dialog>
  );
}

function IssueDialog({
  request,
  onSubmit,
  onClose,
}: {
  request: StaffCfdiRequest;
  onSubmit: (satUuid: string) => Promise<void>;
  onClose: () => void;
}) {
  const formId = useId();
  const [uuid, setUuid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const valid = isValidSatUuid(uuid);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await onSubmit(uuid.trim());
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Dialog
      description={`${request.workspaceName}, pago ${request.invoiceNumber ?? request.invoiceId}. Captura el folio fiscal que te dio el SAT al emitir.`}
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
            disabled={isBusy || !valid}
            form={formId}
            type="submit"
          >
            {isBusy ? "Procesando…" : "Marcar emitida"}
          </button>
        </>
      }
      onClose={onClose}
      open
      title="Marcar factura emitida"
    >
      <form className="form-grid" id={formId} onSubmit={submit}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <p>{issueEmailNote(request.fiscal.email)}</p>
        <Field
          error={
            uuid && !valid
              ? "El folio debe tener el formato 8-4-4-4-12 en hexadecimal."
              : null
          }
          id={`${formId}-uuid`}
          label="Folio fiscal (UUID)"
        >
          <input
            autoComplete="off"
            id={`${formId}-uuid`}
            onChange={(event) => setUuid(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            required
            spellCheck={false}
            value={uuid}
          />
        </Field>
      </form>
    </Dialog>
  );
}

function GlobalInvoice() {
  const months = monthOptions(new Date());
  const [month, setMonth] = useState(previousMonth(new Date()));
  const invoice = useResource(`global-invoice:${month}`, (signal) =>
    cfdiApi.globalInvoice(month, signal),
  );

  return (
    <section aria-labelledby="global-heading" className="panel">
      <SectionHeading id="global-heading" title="Factura global del mes" />
      <Notice tone="info">{globalInvoiceNote}</Notice>
      <div className="toolbar">
        <label>
          <span className="visually-hidden">Mes de la factura global</span>
          <select
            onChange={(event) => setMonth(event.target.value)}
            value={month}
          >
            {months.map((value) => (
              <option key={value} value={value}>
                {monthLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-secondary"
          disabled={!invoice.data || invoice.data.items.length === 0}
          onClick={() => invoice.data && downloadCsv(invoice.data)}
          type="button"
        >
          Descargar CSV
        </button>
      </div>
      {invoice.error ? (
        <Notice tone="error">{invoice.error}</Notice>
      ) : invoice.isLoading && !invoice.data ? (
        <Skeleton lines={4} />
      ) : !invoice.data || invoice.data.items.length === 0 ? (
        <EmptyState icon="check" title="Sin pagos en la global">
          No hay pagos sin factura en {monthLabel(month)}.
        </EmptyState>
      ) : (
        <GlobalTable invoice={invoice.data} />
      )}
    </section>
  );
}

export function GlobalTable({ invoice }: { invoice: StaffGlobalInvoice }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Folio Stripe</th>
            <th scope="col">Organización</th>
            <th scope="col">Fecha de pago</th>
            <th className="numeric" scope="col">
              Total
            </th>
            <th className="numeric" scope="col">
              IVA
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.invoiceId}>
              <td>{item.number ?? item.invoiceId}</td>
              <td>{item.workspaceName}</td>
              <td>{formatDateTimeMx(item.paidAt)}</td>
              <td className="numeric">
                {formatMoney(item.total, invoice.currency)}
              </td>
              <td className="numeric">
                {moneyOrDash(item.tax, invoice.currency)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={3} scope="row">
              Totales ({invoice.items.length} pagos)
            </th>
            <td className="numeric">
              <strong>{formatMoney(invoice.total, invoice.currency)}</strong>
            </td>
            <td className="numeric">
              <strong>{formatMoney(invoice.tax, invoice.currency)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function downloadCsv(invoice: StaffGlobalInvoice) {
  saveCsv(globalInvoiceCsv(invoice), globalInvoiceFilename(invoice.month));
}

function saveCsv(csv: string, filename: string) {
  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The month for the accountant: every payment in one path, IVA broken
 * out, refunds and the Stripe reconciliation, with a CSV. */
function AccountingMonth() {
  const months = monthOptions(new Date());
  const [month, setMonth] = useState(previousMonth(new Date()));
  const report = useResource(`accounting:${month}`, (signal) =>
    cfdiApi.accounting(month, signal),
  );

  return (
    <section aria-labelledby="accounting-heading" className="panel">
      <SectionHeading
        id="accounting-heading"
        title="Reporte para el contador"
      />
      <Notice tone="info">{accountingNote}</Notice>
      <div className="toolbar">
        <label>
          <span className="visually-hidden">Mes del reporte</span>
          <select
            onChange={(event) => setMonth(event.target.value)}
            value={month}
          >
            {months.map((value) => (
              <option key={value} value={value}>
                {monthLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-secondary"
          disabled={!report.data}
          onClick={() =>
            report.data &&
            saveCsv(
              accountingCsv(report.data),
              accountingFilename(report.data.month),
            )
          }
          type="button"
        >
          Descargar CSV
        </button>
      </div>
      {report.error ? (
        <Notice tone="error">{report.error}</Notice>
      ) : report.isLoading && !report.data ? (
        <Skeleton lines={5} />
      ) : report.data ? (
        <AccountingSummary report={report.data} />
      ) : null}
    </section>
  );
}

export function AccountingSummary({
  report,
}: {
  report: StaffAccountingMonth;
}) {
  const money = (cents: number) => formatMoney(cents, report.currency);
  const rows = [
    ["individual", report.totals.individual],
    ["individual_pending", report.totals.individual_pending],
    ["global", report.totals.global],
    ["internal", report.totals.internal],
  ] as const;
  return (
    <>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Camino</th>
              <th className="numeric" scope="col">
                Pagos
              </th>
              <th className="numeric" scope="col">
                Total
              </th>
              <th className="numeric" scope="col">
                Sin IVA
              </th>
              <th className="numeric" scope="col">
                IVA
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([path, amounts]) => (
              <tr key={path}>
                <td>{accountingPathLabels[path]}</td>
                <td className="numeric">{amounts.count}</td>
                <td className="numeric">{money(amounts.total)}</td>
                <td className="numeric">{money(amounts.base)}</td>
                <td className="numeric">{money(amounts.iva)}</td>
              </tr>
            ))}
            <tr>
              <td>Reembolsos del mes</td>
              <td className="numeric">{report.totals.refunds.count}</td>
              <td className="numeric">−{money(report.totals.refunds.total)}</td>
              <td className="numeric">−{money(report.totals.refunds.base)}</td>
              <td className="numeric">−{money(report.totals.refunds.iva)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total cobrado del mes</th>
              <td className="numeric">
                <strong>{report.totals.all.count}</strong>
              </td>
              <td className="numeric">
                <strong>{money(report.totals.all.total)}</strong>
              </td>
              <td className="numeric">
                <strong>{money(report.totals.all.base)}</strong>
              </td>
              <td className="numeric">
                <strong>{money(report.totals.all.iva)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {report.stripe ? (
        <dl className="billing-facts">
          <div>
            <dt>Cobros en Stripe</dt>
            <dd>
              {report.stripe.charges.count} ·{" "}
              {money(report.stripe.charges.amount)} (
              {report.stripe.matchedCharges} conciliados con Kardo)
            </dd>
          </div>
          <div>
            <dt>Reembolsos en Stripe</dt>
            <dd>
              {report.stripe.refunds.count} ·{" "}
              {money(report.stripe.refunds.amount)}
            </dd>
          </div>
          <div>
            <dt>Comisiones de Stripe (gasto)</dt>
            <dd>
              {money(report.stripe.fees.amount)} más IVA{" "}
              {money(report.stripe.fees.iva)}
            </dd>
          </div>
          <div>
            <dt>Neto de Stripe</dt>
            <dd>{money(report.stripe.net)}</dd>
          </div>
        </dl>
      ) : null}
      {report.warnings.length > 0 ? (
        <Notice
          title={`${report.warnings.length} ${report.warnings.length === 1 ? "punto por revisar" : "puntos por revisar"}`}
          tone="warning"
        >
          <ul className="accounting-warnings">
            {report.warnings.map((warning) => (
              <li key={`${warning.kind}-${warning.message}`}>
                {warning.message}
              </li>
            ))}
          </ul>
        </Notice>
      ) : (
        <Notice tone="success">
          Cada cobro del mes está en un solo camino y cuadra con Stripe.
        </Notice>
      )}
    </>
  );
}
