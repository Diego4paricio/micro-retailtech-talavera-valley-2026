import { useEffect, useState } from "react";
import { copyText } from "../lib/clipboard.js";
import { Icon, type IconName } from "./Icon.js";

export function CopyField({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon?: IconName | undefined;
  hint?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="copy-field">
      <span className="copy-field-label">
        {icon ? <Icon name={icon} size={16} /> : null}
        {label}
      </span>
      <code title={value}>{value}</code>
      <button
        aria-label={`Copiar ${label}`}
        className="copy-field-button"
        data-copied={copied}
        onClick={() => void copyText(value).then(setCopied)}
        type="button"
      >
        <Icon name={copied ? "check" : "copy"} size={16} />
        <span aria-live="polite">{copied ? "Copiada" : "Copiar"}</span>
      </button>
      {hint ? <p className="copy-field-hint">{hint}</p> : null}
    </div>
  );
}
