import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: string | undefined;
  title: ReactNode;
  description?: ReactNode | undefined;
  actions?: ReactNode | undefined;
  back?: ReactNode | undefined;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {back ? <div className="page-back">{back}</div> : null}
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
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
