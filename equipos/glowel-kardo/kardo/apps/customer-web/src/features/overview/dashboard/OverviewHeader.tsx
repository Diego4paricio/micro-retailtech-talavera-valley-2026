import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "../../../components/Icon.js";
import {
  greetingName,
  useAccountProfile,
} from "../../../lib/account-profile.js";
import { greetingFor, type PeriodLabels, supportLine } from "./header-model.js";

/**
 * The name for the greeting: the preferred one (Configuración → Perfil),
 * else the whole name. Never holds the page up: the greeting shows without
 * a name until the profile answers (or if it fails).
 */
function useDisplayName(userId: string): string | null {
  return greetingName(useAccountProfile(userId).profile);
}

/** The local hour, updated when the next one starts. */
function useHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(now.getHours() + 1, 0, 1, 0);
      timer = window.setTimeout(() => {
        setHour(new Date().getHours());
        schedule();
      }, next.getTime() - now.getTime());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);
  return hour;
}

/**
 * The top of Resumen: a greeting for the time of day, the title, a line
 * about the organization and the period on screen, with the page actions.
 */
export function OverviewHeader({
  userId,
  workspace,
  period,
  actions,
}: {
  userId: string;
  workspace: { name: string; kind: "personal" | "organization" };
  period: PeriodLabels;
  actions: ReactNode;
}) {
  const hour = useHour();
  const name = useDisplayName(userId);

  return (
    <header className="ov-header">
      <div className="ov-header-copy">
        <p className="ov-greeting">
          {greetingFor(hour)}
          {name ? (
            <span className="ov-greeting-name">
              , <span translate="no">{name}</span>
            </span>
          ) : null}
        </p>
        <h1 className="ov-title">Resumen</h1>
        <p className="ov-lede">{supportLine(workspace)}</p>
        <p className="ov-range">
          <Icon className="ov-range-icon" name="calendar-range" size={16} />
          <span aria-hidden="true" className="ov-range-current">
            {period.current}
          </span>
          <span aria-hidden="true" className="ov-range-previous">
            {period.previous}
          </span>
          <span className="visually-hidden">{period.spoken}</span>
        </p>
      </div>
      {actions ? <div className="ov-header-actions">{actions}</div> : null}
    </header>
  );
}
