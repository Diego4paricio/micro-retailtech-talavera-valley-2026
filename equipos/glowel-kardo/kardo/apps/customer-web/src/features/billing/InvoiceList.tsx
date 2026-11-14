import type { BillingInvoice } from "@kardo/contracts";
import {
  SettingsGroup,
  SettingsRow,
  StatusText,
} from "../../components/SettingsBlocks.js";
import { invoiceFiscalView } from "./fiscal-model.js";
import {
  formatMoneyWithCode,
  formatShortDate,
  invoiceStatusView,
} from "./format.js";
import { dotTone } from "./PlanSummary.js";
import type { FiscalController } from "./use-fiscal.js";

/** Invoice history with the Stripe-hosted page and PDF for each one. */
export function InvoiceList({
  invoices,
  fiscal = null,
}: {
  invoices: BillingInvoice[];
  /** Owner and Admin only: adds the CFDI request and its status. */
  fiscal?: FiscalController | null;
}) {
  return (
    <SettingsGroup
      description="Tus últimas facturas de Kardo. Se abren en la página segura de Stripe."
      id="billing-invoices-heading"
      title="Facturas"
    >
      {invoices.length === 0 ? (
        <SettingsRow
          label="Sin facturas"
          value={
            <span className="billing-row-note">
              Todavía no tienes facturas.
            </span>
          }
        />
      ) : (
        invoices.map((invoice) => {
          const status = invoiceStatusView(invoice);
          const label = invoice.number ?? "sin número";
          return (
            <SettingsRow
              action={
                <span className="billing-doc-links">
                  {invoice.hostedInvoiceUrl ? (
                    <a
                      aria-label={`Ver factura ${label}`}
                      href={invoice.hostedInvoiceUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Ver
                    </a>
                  ) : null}
                  {invoice.invoicePdf ? (
                    <a
                      aria-label={`Descargar PDF de la factura ${label}`}
                      href={invoice.invoicePdf}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      PDF
                    </a>
                  ) : null}
                  {!invoice.hostedInvoiceUrl && !invoice.invoicePdf ? (
                    <span className="billing-muted">No disponible</span>
                  ) : null}
                </span>
              }
              description={formatShortDate(invoice.paidAt ?? invoice.createdAt)}
              key={invoice.id}
              label={invoice.number ?? "Sin número"}
              value={
                <>
                  <span className="billing-invoice-line">
                    <strong className="billing-num">
                      {formatMoneyWithCode(invoice.total, invoice.currency)}
                    </strong>
                    <StatusText tone={dotTone(status.tone)}>
                      {status.label}
                    </StatusText>
                  </span>
                  {fiscal ? (
                    <CfdiCell controller={fiscal} invoice={invoice} />
                  ) : null}
                </>
              }
            />
          );
        })
      )}
    </SettingsGroup>
  );
}

/** CFDI request state of one payment (ADR 020 §6). */
export function CfdiCell({
  controller,
  invoice,
}: {
  controller: FiscalController;
  invoice: BillingInvoice;
}) {
  const view = invoiceFiscalView(invoice, controller.fiscal);
  if (!view) return null;
  if (view.kind === "request") {
    const { request } = view;
    return (
      <div className="billing-cfdi">
        <p className="billing-cfdi" data-tone={view.status.tone}>
          {view.status.text}
        </p>
        {request.document ? (
          <p className="billing-cfdi-files">
            {request.document.test ? (
              <span className="billing-muted">
                CFDI de prueba, sin validez fiscal.{" "}
              </span>
            ) : null}
            {(["pdf", "xml"] as const).map((format) => (
              <button
                aria-busy={
                  controller.busy === `${request.id}:${format}` || undefined
                }
                className="text-action"
                disabled={controller.busy !== null}
                key={format}
                onClick={() => void controller.downloadCfdi(request.id, format)}
                type="button"
              >
                Descargar {format.toUpperCase()}
              </button>
            ))}
          </p>
        ) : null}
      </div>
    );
  }
  if (view.kind === "global")
    return (
      <p className="billing-cfdi billing-muted">
        Incluido en la factura global del mes
      </p>
    );
  const busy = controller.busy === invoice.id;
  return (
    <div className="billing-cfdi">
      {view.hasProfile ? null : (
        <p className="billing-muted">
          Agrega tus datos fiscales para pedir tu factura
        </p>
      )}
      <button
        aria-busy={busy || undefined}
        className="button button-secondary button-small"
        disabled={controller.busy !== null}
        onClick={() =>
          view.hasProfile
            ? void controller.requestCfdi(invoice.id)
            : controller.openForm()
        }
        type="button"
      >
        Pedir factura
      </button>
    </div>
  );
}
