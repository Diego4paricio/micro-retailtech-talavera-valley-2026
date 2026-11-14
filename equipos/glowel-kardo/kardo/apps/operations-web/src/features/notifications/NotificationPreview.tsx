import type { NotificationCategory } from "@kardo/contracts";
import { categoryLabels, previewSnippet } from "./format.js";

/** Approximation of how the customer's bell shows the notification. */
export function NotificationPreview({
  category,
  title,
  body,
  actionLabel,
  pinned,
}: {
  category: NotificationCategory;
  title: string;
  body: string;
  actionLabel: string;
  pinned: boolean;
}) {
  const snippet = previewSnippet(body);
  return (
    <aside aria-label="Vista previa" className="ntf-preview">
      <p className="eyebrow">Así lo verá el cliente</p>
      <div className="ntf-preview-card">
        <div className="ntf-preview-head">
          <span className="ntf-category">{categoryLabels[category]}</span>
          {pinned ? <span className="ntf-flag">Fijada</span> : null}
        </div>
        <strong className="ntf-preview-title">
          {title.trim() || "Aquí va el título"}
        </strong>
        <p className="ntf-preview-body">
          {snippet || "Aquí va el mensaje. Se muestran las primeras líneas."}
        </p>
        {actionLabel.trim() ? (
          <span className="ntf-preview-action">{actionLabel.trim()}</span>
        ) : null}
      </div>
    </aside>
  );
}
