import type { WorkspaceBilling } from "@kardo/contracts";
import { Icon } from "../../components/Icon.js";
import { SettingsGroup, SettingsRow } from "../../components/SettingsBlocks.js";
import { meterNote } from "./extras-model.js";
import {
  featureRows,
  formatQuantity,
  meterWarningRatio,
  staticLimitRows,
  usageRows,
  usageText,
} from "./format.js";

const stateHint = {
  ok: "",
  warning: `Estás cerca del límite (más de ${Math.round(meterWarningRatio * 100)} %).`,
  danger: "Llegaste al límite.",
} as const;

/** Usage against the plan's limits, plus included / not included features. */
export function UsageMeters({ billing }: { billing: WorkspaceBilling }) {
  const account = billing.account ?? null;
  // Organizations are counted per person (ADR 024): without an account the
  // API does not report them, so the meter would only be noise.
  const rows = usageRows(billing.entitlements, billing.usage).filter(
    (row) =>
      row.key !== "organizations.max" ||
      account ||
      "organizations.max" in billing.usage,
  );
  const others = staticLimitRows(billing.entitlements);
  const features = featureRows(billing.entitlements);
  return (
    <>
      <SettingsGroup
        description={
          account && !account.isHolder
            ? `Solo ${account.holderName ?? "esa persona"} puede cambiar el plan.`
            : "Lo que usas hoy frente a lo que incluye tu plan."
        }
        id="billing-usage-heading"
        title="Consumo y límites"
      >
        <ul className="billing-meters">
          {rows.map((row) => (
            <li
              className="billing-meter"
              data-state={row.meter.state}
              key={row.key}
            >
              <div className="billing-meter-head">
                <span id={`meter-${row.key}`}>{row.label}</span>
                <strong className="billing-meter-value">
                  {row.meter.limit === null
                    ? `${formatQuantity(row.meter.usage, row.key)} en uso`
                    : usageText(row.meter, row.key)}
                </strong>
              </div>
              {row.meter.limit === null ? (
                // No limit to measure against: a light, open bar.
                <div
                  aria-hidden="true"
                  className="billing-meter-track billing-meter-track-open"
                />
              ) : (
                <>
                  <meter
                    aria-labelledby={`meter-${row.key}`}
                    aria-valuetext={usageText(row.meter, row.key)}
                    className="visually-hidden"
                    max={row.meter.limit}
                    min={0}
                    value={row.meter.usage}
                  />
                  <div aria-hidden="true" className="billing-meter-track">
                    <span
                      className="billing-meter-fill"
                      style={{
                        width: `${Math.round(row.meter.ratio * 100)}%`,
                      }}
                    />
                  </div>
                </>
              )}
              {row.meter.limit === null ? (
                <p className="billing-meter-hint">Sin límite en tu plan</p>
              ) : stateHint[row.meter.state] ? (
                <p className="billing-meter-hint">
                  {stateHint[row.meter.state]}
                </p>
              ) : null}
              {meterNote(row.key, account) ? (
                <p className="billing-meter-hint">
                  {meterNote(row.key, account)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {others.map((row) => (
          <SettingsRow key={row.key} label={row.label} value={row.value} />
        ))}
      </SettingsGroup>

      <SettingsGroup id="billing-features-heading" title="Funciones">
        {features.map((feature) => (
          <SettingsRow
            key={feature.key}
            label={feature.label}
            value={
              <span
                className="billing-feature"
                data-included={feature.included}
              >
                <Icon name={feature.included ? "check" : "close"} size={15} />
                {feature.included ? "Incluida" : "No incluida"}
              </span>
            }
          />
        ))}
      </SettingsGroup>
    </>
  );
}
