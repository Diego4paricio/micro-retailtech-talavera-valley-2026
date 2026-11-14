import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.js";

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
