import type { ReactNode } from "react";
import "../styles/settings-blocks.css";

/**
 * Configuración, Equipo and Ayuda without boxes (ADR 023 §2): a page is a
 * title, then groups of rows separated by hairlines. A row shows what is
 * set now and one action («Cambiar») that opens its own dialog; nothing is
 * edited inline with a shared «Guardar».
 */
export function SettingsIntro({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <header className="settings-intro">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="settings-intro-actions">{actions}</div> : null}
    </header>
  );
}

export function SettingsGroup({
  id,
  title,
  description,
  actions,
  children,
  footer,
}: {
  id: string;
  title: string;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  /** A quiet line under the rows (a note, or a secondary action). */
  footer?: ReactNode | undefined;
}) {
  return (
    <section aria-labelledby={id} className="settings-group">
      <div className="settings-group-head">
        <div>
          <h3 id={id}>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? (
          <div className="settings-group-actions">{actions}</div>
        ) : null}
      </div>
      <div className="settings-rows">{children}</div>
      {footer ? <div className="settings-group-footer">{footer}</div> : null}
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  value,
  action,
  tone,
}: {
  label: ReactNode;
  description?: ReactNode | undefined;
  /** What is set now. Omit it when the label says everything. */
  value?: ReactNode | undefined;
  action?: ReactNode | undefined;
  tone?: "danger" | undefined;
}) {
  return (
    <div
      className={
        tone === "danger" ? "settings-row settings-row-danger" : "settings-row"
      }
    >
      <div className="settings-row-label">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      <div className="settings-row-value">{value}</div>
      <div className="settings-row-action">{action}</div>
    </div>
  );
}

/** A state in words with a plain colored dot: no box, halo or glow. */
export function StatusText({
  tone,
  children,
}: {
  tone: "on" | "off" | "warning";
  children: ReactNode;
}) {
  return (
    <span className={`status-text status-text-${tone}`}>
      <span aria-hidden="true" className="status-text-dot" />
      {children}
    </span>
  );
}
