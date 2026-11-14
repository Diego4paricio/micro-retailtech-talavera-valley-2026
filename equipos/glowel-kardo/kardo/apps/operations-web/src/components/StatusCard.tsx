import type { ReactNode } from "react";

export function StatusCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode | undefined;
  accent?: "nfc" | "qr" | "link";
}) {
  return (
    <article
      className={accent ? `status-card status-card-${accent}` : "status-card"}
    >
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}
