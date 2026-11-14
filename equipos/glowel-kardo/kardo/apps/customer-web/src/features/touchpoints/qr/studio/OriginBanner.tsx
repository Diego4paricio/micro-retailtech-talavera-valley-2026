import type { TouchpointQrDesign } from "@kardo/contracts";
import type { ReactNode } from "react";
import { Icon, type IconName } from "../../../../components/Icon.js";
import { formatDayMonth } from "../../../../lib/format.js";
import { Link } from "../../../../lib/router.js";
import {
  type PrintState,
  qrExportFormatLabels,
  usageTotal,
  usedByText,
} from "../library/model.js";

type Usage = { touchpoints: number; groups: number };

/**
 * Where this Touchpoint's design comes from (its own, a library design, its
 * group's or Kardo's) with the actions that change it, plus the golden rule:
 * no design change ever breaks a printed code.
 */
export function OriginBanner({
  state,
  usage,
  readOnly,
  busy,
  print,
  onSaveToLibrary,
  onPickLibrary,
  onInherit,
  onPersonalize,
}: {
  state: TouchpointQrDesign;
  /** Usage of the library design in effect, when known. */
  usage: Usage | null;
  readOnly: boolean;
  busy: boolean;
  print: ReactNode;
  onSaveToLibrary: () => void;
  onPickLibrary: () => void;
  onInherit: () => void;
  onPersonalize: () => void;
}) {
  const group = state.group;
  const template = state.template;
  const groupTemplate = group?.template ?? null;
  const inheritLabel = groupTemplate
    ? `Usar el del grupo «${groupTemplate.name}»`
    : "Volver al diseño Kardo";

  let icon: IconName;
  let title: string;
  let description: ReactNode;
  const actions: ReactNode[] = [];
  const action = (
    key: string,
    label: string,
    onClick: () => void,
    iconName: IconName,
  ) => (
    <button
      className="button button-secondary button-small"
      disabled={busy}
      key={key}
      onClick={onClick}
      type="button"
    >
      <Icon name={iconName} size={14} /> {label}
    </button>
  );
  const editLink = template ? (
    <Link
      className="button button-secondary button-small"
      key="edit"
      to={{ name: "qr-design", id: template.id }}
    >
      <Icon name="edit" size={14} /> Editar en la biblioteca
    </Link>
  ) : null;

  switch (state.source) {
    case "custom":
      icon = "edit";
      title = "Diseño propio de este QR";
      description =
        "Solo lo usa este QR. Guárdalo en la biblioteca para reutilizarlo en otros.";
      if (!readOnly) {
        actions.push(
          action(
            "library",
            "Guardar en la biblioteca",
            onSaveToLibrary,
            "bookmark-plus",
          ),
        );
        if (groupTemplate)
          actions.push(action("group", inheritLabel, onInherit, "group"));
        actions.push(
          action("pick", "Elegir de la biblioteca", onPickLibrary, "template"),
        );
      }
      break;
    case "library":
      icon = "template";
      title = `Usa «${template?.name ?? "diseño de la biblioteca"}»`;
      description =
        usage && usageTotal(usage) > 1
          ? `Diseño compartido: ${usedByText(usage)}. Si lo editas aquí, eliges si cambia para todos o solo para este.`
          : "Diseño de la biblioteca. Si lo editas aquí, eliges si cambia la biblioteca o solo este QR.";
      if (editLink) actions.push(editLink);
      if (!readOnly) {
        actions.push(
          action(
            "personalize",
            "Personalizar solo este QR",
            onPersonalize,
            "sliders",
          ),
        );
        actions.push(
          action(
            "inherit",
            inheritLabel,
            onInherit,
            groupTemplate ? "group" : "reset",
          ),
        );
      }
      break;
    case "group":
      icon = "group";
      title = `Hereda el diseño del grupo «${group?.name ?? "grupo"}»`;
      description = `Usa «${template?.name ?? "diseño de la biblioteca"}». Los QR nuevos del grupo también lo heredan.`;
      if (editLink) actions.push(editLink);
      if (!readOnly) {
        actions.push(
          action(
            "personalize",
            "Personalizar solo este QR",
            onPersonalize,
            "sliders",
          ),
        );
        actions.push(
          action("pick", "Elegir de la biblioteca", onPickLibrary, "template"),
        );
      }
      break;
    default:
      icon = "qr";
      title = "Diseño Kardo por defecto";
      description = group
        ? `El grupo «${group.name}» no tiene diseño asignado. Personalízalo aquí y guárdalo, o elige uno de la biblioteca.`
        : "Aún no tiene diseño asignado. Personalízalo aquí y guárdalo, o elige uno de la biblioteca.";
      if (!readOnly)
        actions.push(
          action("pick", "Elegir de la biblioteca", onPickLibrary, "template"),
        );
  }

  return (
    <section aria-label="Origen del diseño" className="qrs-origin">
      <span aria-hidden="true" className="qrs-origin-icon">
        <Icon name={icon} size={18} />
      </span>
      <div className="qrs-origin-copy">
        <p className="qrs-origin-title">{title}</p>
        <p className="qrs-origin-text">{description}</p>
        {print}
      </div>
      {actions.length ? (
        <div className="qrs-origin-actions">{actions}</div>
      ) : null}
    </section>
  );
}

/** Last print of this code compared with the design a new print would use. */
export function PrintStatus({
  state,
  lastExport,
}: {
  state: PrintState;
  lastExport: TouchpointQrDesign["lastExport"];
}) {
  if (!lastExport)
    return (
      <p className="qrs-print" data-state="never">
        <Icon name="printer" size={14} /> Aún no has exportado este QR. Cambiar
        el diseño nunca rompe los QR ya impresos.
      </p>
    );
  const when = `${formatDayMonth(lastExport.at)} (${qrExportFormatLabels[lastExport.format]})`;
  if (state === "changed")
    return (
      <p className="qrs-print" data-state="changed">
        <Icon name="info" size={14} /> El diseño cambió desde la última
        impresión, el {when}. Los QR ya impresos siguen funcionando; vuelve a
        imprimir solo si quieres que se vean iguales.
      </p>
    );
  return (
    <p className="qrs-print" data-state="current">
      <Icon name="circle-check" size={14} /> Impreso el {when} con este diseño.
      Cambiarlo nunca rompe los QR ya impresos.
    </p>
  );
}
