import type { StatusTone } from "../lib/format.js";

export function StatusBadge({
  tone,
  children,
}: {
  tone: StatusTone;
  children: string;
}) {
  return (
    <span className={`status-badge status-badge-${tone}`}>
      <span aria-hidden="true" className="status-badge-dot" />
      {children}
    </span>
  );
}
