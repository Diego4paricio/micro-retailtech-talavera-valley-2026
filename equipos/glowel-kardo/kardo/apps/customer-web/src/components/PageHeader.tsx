import type { HelpSection } from "@kardo/contracts";
import type { ReactNode } from "react";
import { HelpButton } from "../features/help/HelpButton.js";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
  help,
}: {
  eyebrow?: string | undefined;
  title: string;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  back?: ReactNode | undefined;
  /** Shows a "¿Cómo funciona?" button that opens this section's guide. */
  help?: HelpSection | undefined;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {back ? <div className="page-back">{back}</div> : null}
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <div className="page-header-title-row">
          <h1>{title}</h1>
          {help ? <HelpButton section={help} variant="subtle" /> : null}
        </div>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  id,
}: {
  eyebrow?: string | undefined;
  title: string;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  id?: string | undefined;
}) {
  return (
    <div className="section-title">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="section-title-actions">{actions}</div> : null}
    </div>
  );
}
