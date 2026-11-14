import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.js";

/**
 * Alert tiers (research §4):
 * - `info`    neutral news or states — `role="status"`.
 * - `success` saved / published — prefer a toast for transient confirmations.
 * - `warning` something to configure, unsaved changes — `role="alert"`.
 * - `danger`  blocking errors, failed publications, destructive consequences.
 */
export type NoticeTone = "info" | "success" | "warning" | "danger";

const toneIcons: Record<NoticeTone, IconName> = {
  info: "info",
  success: "circle-check",
  warning: "alert",
  danger: "octagon-alert",
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
  icon,
  onDismiss,
  variant = "inline",
}: {
  tone?: NoticeTone | undefined;
  title?: string | undefined;
  children: ReactNode;
  action?: ReactNode | undefined;
  /** Override the tone icon, or `false` to hide it. */
  icon?: IconName | false | undefined;
  /** Renders a close button when provided. */
  onDismiss?: (() => void) | undefined;
  /** `banner` is a roomier variant for page-level messages. */
  variant?: "inline" | "banner" | undefined;
}) {
  const isUrgent = tone === "danger" || tone === "warning";
  const iconName = icon === false ? null : (icon ?? toneIcons[tone]);
  return (
    <div
      className={
        variant === "banner"
          ? `notice notice-${tone} notice-banner`
          : `notice notice-${tone}`
      }
      role={isUrgent ? "alert" : "status"}
    >
      {iconName ? (
        <Icon className="notice-icon" name={iconName} size={18} />
      ) : null}
      <div className="notice-body">
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {action || onDismiss ? (
        <div className="notice-action">
          {action}
          {onDismiss ? (
            <button
              aria-label="Cerrar aviso"
              className="icon-button notice-dismiss"
              onClick={onDismiss}
              type="button"
            >
              <Icon name="close" size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
