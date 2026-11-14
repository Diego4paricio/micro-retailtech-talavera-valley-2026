"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { WhatsAppIcon } from "../ui";
import {
  choosePlanHref,
  type PanelContext,
  panelPlanHref,
  readPanelContext,
} from "./panel-link";

export type PlanCard = {
  code: string;
  name: string;
  description: string;
  recommended: boolean;
  contactOnly: boolean;
  monthly: string | null;
  yearly: string | null;
  /** The yearly price divided by 12, already formatted. */
  yearlyPerMonth: string | null;
  /** What the yearly price saves against 12 months, already formatted. */
  yearlySavings: string | null;
  highlights: string[];
  monthHref: string;
  yearHref: string;
};

type Interval = "month" | "year";

/**
 * Monthly or yearly: one switch for every column, monthly first. `compact`
 * (the home page) shows the first lines of each plan; /precios/ shows all.
 */
export function PlanCards({
  plans,
  trialDays,
  annualMaxFreeMonths,
  contactHref,
  panelPlanUrl,
  compact = false,
}: {
  plans: PlanCard[];
  trialDays: number;
  /** The most whole months the yearly price saves on any plan. */
  annualMaxFreeMonths: number;
  contactHref: string;
  /** The panel's plan page, where a visitor sent from the panel hires. */
  panelPlanUrl: string;
  compact?: boolean;
}) {
  const [period, setPeriod] = useState<Interval>("month");
  // The site is static: the address is read after the first render, so the
  // HTML everyone gets first is always the usual one.
  const [fromPanel, setFromPanel] = useState<PanelContext | null>(null);
  useEffect(() => {
    setFromPanel(readPanelContext(window.location.search));
  }, []);
  const sellableCodes = plans
    .filter((plan) => !plan.contactOnly)
    .map((plan) => plan.code);
  const options: { value: Interval; label: string }[] = [
    { value: "month", label: "Mensual" },
    { value: "year", label: "Anual" },
  ];

  return (
    <div className="plans">
      {fromPanel ? (
        <p className="plans-from-panel">
          Elige el plan para tu organización. Lo confirmas en el siguiente paso.{" "}
          <a href={panelPlanHref(panelPlanUrl, fromPanel)}>Volver al panel</a>
        </p>
      ) : null}
      <fieldset className="plans-period">
        <legend className="sr-only">Periodo de pago</legend>
        <div className="plans-toggle">
          {options.map((option) => (
            <label data-checked={period === option.value} key={option.value}>
              <input
                checked={period === option.value}
                className="sr-only"
                name="periodo"
                onChange={() => setPeriod(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
        {annualMaxFreeMonths > 0 ? (
          <p>
            Con el plan anual ahorras hasta {annualMaxFreeMonths}{" "}
            {annualMaxFreeMonths === 1 ? "mes" : "meses"}.
          </p>
        ) : null}
      </fieldset>

      {/* Each column spans five subgrid rows (name, text, price, button,
          limits) so the prices and buttons line up across the plans. */}
      <ul className="plans-grid">
        {plans.map((plan) => {
          const price = period === "month" ? plan.monthly : plan.yearly;
          const highlights = compact
            ? plan.highlights.slice(0, 4)
            : plan.highlights;
          return (
            <li
              className="plan-column"
              data-recommended={plan.recommended}
              key={plan.code}
            >
              <div className="plan-name">
                <h3>{plan.name}</h3>
                {plan.recommended ? <span>Recomendado</span> : null}
              </div>
              <p className="plan-description">{plan.description}</p>

              <div className="plan-price">
                {plan.contactOnly ? (
                  <>
                    <p>A la medida</p>
                    <span>Límites y condiciones para tu operación.</span>
                  </>
                ) : price ? (
                  <>
                    <p>
                      {price}
                      <small>{period === "month" ? "al mes" : "al año"}</small>
                    </p>
                    <span>
                      {period === "year" && plan.yearlyPerMonth
                        ? `Equivale a ${plan.yearlyPerMonth} al mes${plan.yearlySavings ? `; ahorras ${plan.yearlySavings} al año` : ""}. IVA incluido.`
                        : "IVA incluido."}
                    </span>
                  </>
                ) : (
                  <span>Solo con pago mensual.</span>
                )}
              </div>

              <div className="plan-action">
                {plan.contactOnly ? (
                  <a
                    className="editorial-button editorial-button-ghost"
                    href={contactHref}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <WhatsAppIcon className="size-[18px] text-whatsapp" />
                    Escríbenos
                  </a>
                ) : (
                  <a
                    className={`editorial-button${plan.recommended ? "" : " editorial-button-ghost"}`}
                    href={
                      (fromPanel &&
                        choosePlanHref(
                          panelPlanUrl,
                          fromPanel,
                          plan.code,
                          period,
                          sellableCodes,
                        )) ||
                      (period === "month" ? plan.monthHref : plan.yearHref)
                    }
                  >
                    {fromPanel ? (
                      "Elegir este plan"
                    ) : (
                      <>
                        Empieza gratis
                        <span className="sr-only">
                          {" "}
                          con {trialDays} días del plan {plan.name}
                        </span>
                      </>
                    )}
                  </a>
                )}
              </div>

              <ul className="plan-highlights">
                {highlights.map((line) => (
                  <li key={line}>
                    <Check aria-hidden="true" className="size-4 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
