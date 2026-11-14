import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.js";

export function EmptyState({
  icon,
  title,
  children,
  action,
  secondaryAction,
  compact,
  headingLevel = 3,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode | undefined;
  action?: ReactNode | undefined;
  /** A quieter companion to `action` (e.g. "Ver guía"). */
  secondaryAction?: ReactNode | undefined;
  /** Less padding, for empty states inside a panel or chart. */
  compact?: boolean | undefined;
  headingLevel?: 2 | 3 | 4 | undefined;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div
      className={compact ? "empty-state empty-state-compact" : "empty-state"}
    >
      <span className="empty-state-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <Heading>{title}</Heading>
      {children ? <p>{children}</p> : null}
      {action || secondaryAction ? (
        <div className="empty-state-action">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
