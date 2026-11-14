// When the panel sends someone to /precios/ (?desde=panel&organizacion=<uuid>)
// the plan buttons go back to the panel to hire, not to sign up (ADR 020).
// Nothing from the address reaches a link without being validated here.

export type PanelContext = {
  /** The organization the panel sent, only when it is a valid UUID. */
  workspace: string | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The panel context of a query string, or null when it did not come from the panel. */
export function readPanelContext(search: string): PanelContext | null {
  const params = new URLSearchParams(search);
  if (params.get("desde") !== "panel") return null;
  const organization = params.get("organizacion");
  return {
    workspace:
      organization !== null && uuid.test(organization) ? organization : null,
  };
}

/** The panel's plan page, with the organization when there is one. */
export function panelPlanHref(
  planUrl: string,
  context: PanelContext,
  extra: Record<string, string> = {},
): string {
  const url = new URL(planUrl);
  if (context.workspace) url.searchParams.set("workspace", context.workspace);
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Where "Elegir este plan" goes: the panel, to confirm that plan. Null for a code that is not on sale. */
export function choosePlanHref(
  planUrl: string,
  context: PanelContext,
  code: string,
  interval: "month" | "year",
  sellableCodes: readonly string[],
): string | null {
  if (!sellableCodes.includes(code)) return null;
  return panelPlanHref(planUrl, context, {
    elegir: code,
    periodo: interval === "month" ? "mensual" : "anual",
  });
}
