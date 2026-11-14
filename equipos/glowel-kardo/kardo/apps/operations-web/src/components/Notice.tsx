import type { ReactNode } from "react";
import { Icon } from "./Icon.js";

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "error" | "success" | "warning";
  title?: string | undefined;
  children: ReactNode;
  action?: ReactNode | undefined;
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" || tone === "warning" ? (
        <Icon className="notice-icon" name="alert" />
      ) : null}
      <div className="notice-body">
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {action ? <div className="notice-action">{action}</div> : null}
    </div>
  );
}
