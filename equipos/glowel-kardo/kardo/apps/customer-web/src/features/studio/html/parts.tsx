import { useId, useState } from "react";
import { Icon } from "../../../components/Icon.js";
import { type PastedCode, splitPastedCode } from "./paste.js";
import {
  describeItem,
  reasonCopy,
  reportGroups,
  reportSummary,
  type StudioReport,
} from "./report.js";

/** "Pega aquí lo que te dio la IA": a document, a fragment or markdown. */
export function PasteBox({
  onUse,
  disabled,
  compact,
}: {
  onUse: (code: PastedCode) => void;
  disabled: boolean;
  compact?: boolean | undefined;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [empty, setEmpty] = useState(false);
  return (
    <div className="esh-paste" data-compact={compact || undefined}>
      <label className="visually-hidden" htmlFor={id}>
        Código que te dio tu IA
      </label>
      <textarea
        className="esh-paste-area"
        disabled={disabled}
        id={id}
        onChange={(event) => {
          setText(event.target.value);
          setEmpty(false);
        }}
        placeholder="Pega aquí todo lo que te respondió: el documento completo, solo el HTML o el HTML y el CSS por separado. Nosotros lo acomodamos."
        rows={compact ? 8 : 5}
        spellCheck={false}
        value={text}
      />
      <div className="esh-paste-actions">
        {empty ? (
          <p className="field-error">
            <Icon name="circle-alert" size={14} />
            <span>No encontramos código en lo que pegaste.</span>
          </p>
        ) : (
          <p className="esh-paste-hint">
            Separamos el CSS y quitamos lo que sobra (explicaciones,
            &lt;html&gt;, &lt;head&gt;).
          </p>
        )}
        <button
          className="button button-primary button-small"
          disabled={disabled || !text.trim()}
          onClick={() => {
            const code = splitPastedCode(text);
            if (!code.html.trim() && !code.css.trim()) {
              setEmpty(true);
              return;
            }
            // Kept until the code is in the editor (a replace may be
            // cancelled); the dialog around it closes when it is.
            onUse(code);
          }}
          type="button"
        >
          <Icon name="paste" size={15} /> Usar este código
        </button>
      </div>
    </div>
  );
}

/**
 * What the sanitizer removed, calmly: one sentence, and on demand the why
 * of each group (no JavaScript, only library images, only safe links…).
 */
export function ReportCard({
  report,
  onConnectImages,
}: {
  report: StudioReport;
  /** Shown when images were removed and some can be connected. */
  onConnectImages?: (() => void) | undefined;
}) {
  const summary = reportSummary(report);
  const [open, setOpen] = useState(false);
  if (!summary)
    return (
      <div className="esh-report" data-clean="">
        <Icon name="shield-check" size={16} />
        <p>
          <strong>Todo tu código se puede publicar.</strong>{" "}
          <span className="esh-report-detail">
            Sin scripts, con imágenes de tu biblioteca y enlaces seguros.
          </span>
        </p>
      </div>
    );
  const groups = reportGroups(report);
  const imagesRemoved = groups.some((group) => group.reason === "images");
  return (
    <div className="esh-report" data-open={open || undefined}>
      <Icon name="shield-check" size={16} />
      <div className="esh-report-body">
        <p>{summary}</p>
        {open ? (
          <ul className="esh-report-groups">
            {groups.map((group) => (
              <li key={group.reason}>
                <strong className="esh-report-reason">
                  {reasonCopy[group.reason].title}
                </strong>
                <span className="esh-report-items">
                  {group.items.map(describeItem).join(" · ")}
                </span>
                <small className="esh-report-why">
                  {reasonCopy[group.reason].why}
                </small>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <span className="esh-report-actions">
        {imagesRemoved && onConnectImages ? (
          <button
            className="button button-secondary button-small"
            onClick={onConnectImages}
            type="button"
          >
            <Icon name="link-on" size={14} />
            Conectar imágenes
          </button>
        ) : null}
        <button
          aria-expanded={open}
          className="link-button esh-report-toggle"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Ocultar" : "Por qué"}
        </button>
      </span>
    </div>
  );
}
