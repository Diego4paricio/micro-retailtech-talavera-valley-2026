import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { copyText } from "../../lib/clipboard.js";
import "./business-address.css";

/** The link's address in full, as people read it (no «https://»), with a
 * button that copies the whole URL. Never cut: it is what gets shared.
 * `action` is an extra button at its end (C7a: «Cambiar» its last part,
 * at hand in the ficha, not only inside «⋯»). */
export function LinkAddressCopy({
  url,
  action,
}: {
  url: string;
  action?: ReactNode | undefined;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="link-address-copy">
      <span className="link-address-copy-text">
        {url.replace(/^https?:\/\//, "")}
      </span>
      <button
        aria-label="Copiar el link"
        className="button button-secondary button-small"
        onClick={() => void copyText(url).then(setCopied)}
        type="button"
      >
        <Icon name={copied ? "check" : "copy"} size={16} />
        <span aria-live="polite">{copied ? "Copiado" : "Copiar"}</span>
      </button>
      {action}
    </div>
  );
}
