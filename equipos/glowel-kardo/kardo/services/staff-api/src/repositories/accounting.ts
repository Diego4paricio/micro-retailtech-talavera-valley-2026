import type { BalanceMovement } from "@kardo/billing";
import type {
  AccountingPath,
  AccountingWarningKind,
  StaffAccountingMonth,
} from "@kardo/contracts";

// ---------------------------------------------------------------------------
// The month for the accountant (Docs/fiscal/2026-10-separacion-cfdi.md).
// Every paid payment of the month (Mexico City) falls in exactly one path:
//   - individual: its CFDI was issued (with its folio fiscal);
//   - individual_pending: a CFDI was asked for and is still pending;
//   - global: nobody asked (or the request was rejected or canceled), so it
//     goes in the month's global invoice to público en general;
//   - internal: a payment of an internal account, which Operations leaves
//     out of the global: an anomaly to review, never silently dropped.
// IVA is broken out of what was actually charged (16 %, included). Refunds
// and the Stripe reconciliation (charges, refunds and fees with their IVA)
// come alongside. Pure: the repository reads the rows, this decides.
// ---------------------------------------------------------------------------

export type AccountingRequest = {
  status: "pending" | "issued" | "rejected" | "canceled";
  satUuid: string | null;
  provider: "manual" | "facturapi" | null;
  providerLivemode: boolean | null;
  requestedAt: Date;
};

export type AccountingPaymentRow = {
  invoiceId: string;
  number: string | null;
  workspaceName: string;
  customerId: string;
  paidAt: Date;
  /** What was charged (cents, IVA included). */
  amountPaid: number;
  /** The invoice total; differs when a credit balance paid part of it. */
  total: number;
  /** Stripe's tax on the invoice total. */
  tax: number | null;
  refunded: number;
  internal: boolean;
  requests: AccountingRequest[];
};

export type AccountingRefundRow = {
  refundId: string;
  invoiceId: string | null;
  number: string | null;
  workspaceName: string;
  createdAt: Date;
  status: string;
  amount: number;
  invoicePaidAt: Date | null;
  internal: boolean;
  requests: AccountingRequest[];
};

/** A CFDI canceled this month whose payment belongs to an earlier month. */
export type AccountingLateCancel = {
  invoiceId: string;
  number: string | null;
  paidAt: Date;
};

export type AccountingInput = {
  month: string;
  livemode: boolean;
  currency: string;
  now: Date;
  payments: AccountingPaymentRow[];
  refunds: AccountingRefundRow[];
  canceledEarlier: AccountingLateCancel[];
  /** Null when Stripe is not configured or did not answer. */
  stripe: BalanceMovement[] | null;
  truncated: boolean;
};

const MAX_WARNINGS = 500;
/** How far a Stripe charge may be from the payment it pays (clock skew,
 * retries): generous, since customer and amount must also match. */
const MATCH_WINDOW_MS = 2 * 86_400_000;
const CHARGE_ID = /^(ch|py)_[A-Za-z0-9]{6,64}$/;

/** Base and IVA of an amount with 16 % IVA included, in cents. */
export function splitIva(cents: number): { base: number; iva: number } {
  const base = Math.round(cents / 1.16);
  return { base, iva: cents - base };
}

/** "YYYY-MM" of an instant in Mexico City. */
export function mexicoMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "America/Mexico_City",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

/** Which path a payment takes, and the CFDI that covers it if any. */
export function accountingPath(
  requests: AccountingRequest[],
  internal: boolean,
): { path: AccountingPath; issued: AccountingRequest | null } {
  const issued = requests.find((request) => request.status === "issued");
  if (issued) return { path: "individual", issued };
  if (requests.some((request) => request.status === "pending"))
    return { path: "individual_pending", issued: null };
  return { path: internal ? "internal" : "global", issued: null };
}

const emptyAmounts = () => ({ count: 0, total: 0, base: 0, iva: 0 });

export function buildAccountingMonth(
  input: AccountingInput,
): StaffAccountingMonth {
  const warnings: StaffAccountingMonth["warnings"] = [];
  let droppedWarnings = 0;
  const warn = (
    kind: AccountingWarningKind,
    reference: string | null,
    message: string,
  ) => {
    if (warnings.length >= MAX_WARNINGS - 1) {
      droppedWarnings += 1;
      return;
    }
    warnings.push({ kind, reference, message: message.slice(0, 400) });
  };

  const charges = (input.stripe ?? []).filter(
    (movement) => movement.type === "charge" || movement.type === "payment",
  );
  const usedCharges = new Set<string>();

  const totals = {
    individual: emptyAmounts(),
    individual_pending: emptyAmounts(),
    global: emptyAmounts(),
    internal: emptyAmounts(),
    all: emptyAmounts(),
    refunds: emptyAmounts(),
  };
  const add = (
    bucket: ReturnType<typeof emptyAmounts>,
    total: number,
    split: { base: number; iva: number },
  ) => {
    bucket.count += 1;
    bucket.total += total;
    bucket.base += split.base;
    bucket.iva += split.iva;
  };

  const payments = input.payments.map((row) => {
    const label = row.number ?? row.invoiceId;
    const { path, issued } = accountingPath(row.requests, row.internal);
    const split = splitIva(row.amountPaid);
    add(totals[path], row.amountPaid, split);
    add(totals.all, row.amountPaid, split);
    const cfdiTest =
      issued?.provider === "facturapi" && issued.providerLivemode === false;

    if (path === "individual_pending") {
      warn(
        "cfdi_pending",
        label,
        `${label}: la solicitud de CFDI sigue pendiente. Emítela o recházala antes de emitir la factura global.`,
      );
    }
    const paidMonth = mexicoMonth(row.paidAt);
    if (
      row.requests.some(
        (request) => mexicoMonth(request.requestedAt) > paidMonth,
      )
    ) {
      warn(
        "cfdi_requested_late",
        label,
        `${label}: el CFDI se pidió después del cierre de ${paidMonth}. Revisa que ese pago no esté también en la factura global ya emitida.`,
      );
    }
    if (
      path !== "individual" &&
      row.requests.some((request) => request.status === "canceled")
    ) {
      warn(
        "cfdi_canceled",
        label,
        `${label}: su CFDI individual se canceló, así que el pago vuelve a la factura global de ${paidMonth}. Si esa global ya se emitió, hay que corregirla (confirmar con el contador).`,
      );
    }
    if (cfdiTest && input.livemode) {
      warn(
        "cfdi_test",
        label,
        `${label}: su CFDI es de prueba de Facturapi y no tiene validez fiscal.`,
      );
    }
    if (path === "internal") {
      warn(
        "internal_payment",
        label,
        `${label}: es un cobro real de una cuenta interna. La factura global de Operations lo deja fuera; debe facturarse o reembolsarse.`,
      );
    }
    if (row.amountPaid !== row.total) {
      warn(
        "balance_applied",
        label,
        `${label}: se cobró menos que el total de la factura (saldo a favor aplicado). El reporte desglosa el IVA de lo cobrado.`,
      );
    } else if (row.tax !== null && Math.abs(row.tax - split.iva) > 1) {
      warn(
        "tax_mismatch",
        label,
        `${label}: el IVA de Stripe (${row.tax} centavos) no coincide con el 16 % incluido (${split.iva} centavos).`,
      );
    }

    // Its Stripe charge: same customer and amount, closest in time.
    let charge: BalanceMovement | null = null;
    for (const candidate of charges) {
      if (usedCharges.has(candidate.id)) continue;
      if (candidate.customerId !== row.customerId) continue;
      if (candidate.amount !== row.amountPaid) continue;
      const distance = Math.abs(
        candidate.created.getTime() - row.paidAt.getTime(),
      );
      if (distance > MATCH_WINDOW_MS) continue;
      if (
        !charge ||
        distance < Math.abs(charge.created.getTime() - row.paidAt.getTime())
      )
        charge = candidate;
    }
    if (charge) usedCharges.add(charge.id);
    else if (input.stripe) {
      warn(
        "kardo_unmatched_payment",
        label,
        `${label}: Kardo lo tiene pagado, pero Stripe no tiene un cobro de ese cliente y monto en el mes.`,
      );
    }

    return {
      invoiceId: row.invoiceId,
      number: row.number,
      workspaceName: row.workspaceName,
      paidAt: row.paidAt.toISOString(),
      total: row.amountPaid,
      base: split.base,
      iva: split.iva,
      refunded: row.refunded,
      path,
      satUuid: issued?.satUuid ?? null,
      cfdiTest,
      stripeChargeId:
        charge?.sourceId && CHARGE_ID.test(charge.sourceId)
          ? charge.sourceId
          : null,
      stripeFee: charge ? charge.fee : null,
      stripeFeeIva: charge ? charge.feeTax : null,
    };
  });

  const refunds = input.refunds.map((row) => {
    const split = splitIva(row.amount);
    const original =
      row.invoiceId === null
        ? null
        : accountingPath(row.requests, row.internal);
    if (row.status === "succeeded") add(totals.refunds, row.amount, split);
    const label = row.number ?? row.invoiceId ?? row.refundId;
    const message =
      original === null
        ? `Reembolso ${row.refundId}: su pago no está en el espejo de Kardo; revísalo en Stripe.`
        : original.path === "individual"
          ? `Reembolso de ${label}, que tiene CFDI individual (${original.issued?.satUuid}): emite un CFDI de egreso relacionado (confirmar con el contador).`
          : `Reembolso de ${label}, que no tiene CFDI individual (factura global): confirmar con el contador cómo se refleja.`;
    warn("refund", row.refundId, message);
    return {
      refundId: row.refundId,
      invoiceId: row.invoiceId,
      number: row.number,
      workspaceName: row.workspaceName,
      createdAt: row.createdAt.toISOString(),
      status: row.status,
      amount: row.amount,
      base: split.base,
      iva: split.iva,
      originalPath: original?.path ?? null,
      originalSatUuid: original?.issued?.satUuid ?? null,
      originalMonth: row.invoicePaidAt ? mexicoMonth(row.invoicePaidAt) : null,
    };
  });

  for (const late of input.canceledEarlier) {
    const label = late.number ?? late.invoiceId;
    warn(
      "cfdi_canceled",
      label,
      `${label}: su CFDI individual se canceló este mes, pero el pago es de ${mexicoMonth(late.paidAt)}: vuelve a la global de ese mes (confirmar con el contador cómo corregirla).`,
    );
  }

  let stripe: StaffAccountingMonth["stripe"] = null;
  if (input.stripe) {
    const refundMovements = input.stripe.filter(
      (movement) =>
        movement.type === "refund" || movement.type === "payment_refund",
    );
    const knownRefunds = new Set(input.refunds.map((row) => row.refundId));
    for (const charge of charges) {
      if (usedCharges.has(charge.id)) continue;
      warn(
        "stripe_unmatched",
        charge.sourceId ?? charge.id,
        `Stripe cobró ${charge.amount} centavos (${charge.sourceId ?? charge.id}) sin un pago de Kardo que le corresponda en el mes.`,
      );
    }
    for (const refund of refundMovements) {
      if (refund.sourceId && knownRefunds.has(refund.sourceId)) continue;
      warn(
        "stripe_unmatched",
        refund.sourceId ?? refund.id,
        `Stripe registró un reembolso (${refund.sourceId ?? refund.id}) que Kardo no tiene en el mes.`,
      );
    }
    // Fees: the processing fee of each movement (and its IVA), plus fees
    // Stripe charges on their own (Billing and others, type `stripe_fee`).
    const otherFees = input.stripe
      .filter((movement) => movement.type === "stripe_fee")
      .reduce((sum, movement) => sum - movement.amount, 0);
    const feeAmount =
      input.stripe.reduce((sum, movement) => sum + movement.fee, 0) + otherFees;
    const feeIva = input.stripe.reduce(
      (sum, movement) => sum + movement.feeTax,
      0,
    );
    const chargesAmount = charges.reduce(
      (sum, movement) => sum + movement.amount,
      0,
    );
    const refundsAmount = refundMovements.reduce(
      (sum, movement) => sum - movement.amount,
      0,
    );
    stripe = {
      charges: { count: charges.length, amount: chargesAmount },
      refunds: { count: refundMovements.length, amount: refundsAmount },
      fees: {
        amount: Math.max(0, feeAmount),
        iva: Math.max(0, feeIva),
        total: Math.max(0, feeAmount + feeIva),
      },
      net: chargesAmount - refundsAmount - (feeAmount + feeIva),
      matchedCharges: usedCharges.size,
    };
  } else {
    warn(
      "stripe_unavailable",
      null,
      "Sin conciliación con Stripe: no está configurado o no respondió. Los montos son los del espejo de Kardo.",
    );
  }

  if (input.truncated) {
    warn(
      "truncated",
      null,
      "El mes tiene más movimientos de los que caben en el reporte: los totales están incompletos.",
    );
  }
  if (droppedWarnings > 0) {
    warnings.push({
      kind: "truncated",
      reference: null,
      message: `Hay ${droppedWarnings} avisos más que no se muestran.`,
    });
  }

  return {
    month: input.month,
    currency: input.currency,
    livemode: input.livemode,
    generatedAt: input.now.toISOString(),
    payments,
    refunds,
    totals,
    stripe,
    warnings,
  };
}
