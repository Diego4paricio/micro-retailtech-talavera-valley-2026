import type { Touchpoint } from "@kardo/contracts";
import { Toolbar } from "radix-ui";
import type { ReactNode } from "react";
import { Icon, type IconName } from "../../../../components/Icon.js";
import { StatusBadge } from "../../../../components/StatusBadge.js";
import { Tooltip } from "../../../../components/Tooltip.js";
import { Link, type Route } from "../../../../lib/router.js";
import { HelpButton } from "../../../help/HelpButton.js";
import { touchpointBadge } from "../../labels.js";
import { useMediaQuery } from "./hooks.js";

const isApple =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const mod = isApple ? "⌘" : "Ctrl+";
const shift = isApple ? "⇧" : "Shift+";

function BackLink({ to, label }: { to: Route; label: string }) {
  return (
    <Tooltip content={label}>
      <span className="qrs-back">
        <Link ariaLabel={label} className="icon-button qrs-back-link" to={to}>
          <Icon name="arrow-left" size={18} />
        </Link>
      </span>
    </Tooltip>
  );
}

/** Compact header: back to the QR's page, its name, status and group. An
 * NFC's backup QR says so (relevo 38). */
export function StudioHeader({
  touchpoint,
  groupName,
  backup = false,
}: {
  touchpoint: Touchpoint;
  groupName: string | null;
  backup?: boolean | undefined;
}) {
  const badge = touchpointBadge(touchpoint);
  return (
    <header className="qrs-header">
      <BackLink
        label={`Volver a ${touchpoint.operationalName}`}
        to={{ name: "touchpoint", id: touchpoint.id }}
      />
      <div className="qrs-header-copy">
        <p className="qrs-header-kicker">
          {backup ? "QR de respaldo del NFC" : "Diseño del QR"}
        </p>
        <div className="qrs-header-title">
          <h1>{touchpoint.operationalName}</h1>
          <p className="qrs-header-meta">
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            {groupName ? (
              <span className="qrs-header-group">
                <Icon name="group" size={14} /> {groupName}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="qrs-header-help">
        <HelpButton section="qr-studio" variant="subtle" />
      </div>
    </header>
  );
}

/** Header of a library design: back to the library, its name and usage. */
export function TemplateHeader({
  name,
  meta,
  onRename,
}: {
  name: string;
  meta: ReactNode;
  onRename: (() => void) | null;
}) {
  return (
    <header className="qrs-header">
      <BackLink label="Volver a Diseño del QR" to={{ name: "qr" }} />
      <div className="qrs-header-copy">
        <p className="qrs-header-kicker">Diseño de la biblioteca</p>
        <div className="qrs-header-title">
          <h1>{name}</h1>
          {onRename ? (
            <Tooltip content="Renombrar">
              <button
                aria-label={`Renombrar «${name}»`}
                className="icon-button qrs-rename"
                onClick={onRename}
                type="button"
              >
                <Icon name="edit" size={16} />
              </button>
            </Tooltip>
          ) : null}
          <p className="qrs-header-meta">{meta}</p>
        </div>
      </div>
      <div className="qrs-header-help">
        <HelpButton section="qr-studio" variant="subtle" />
      </div>
    </header>
  );
}

export type SaveStatus =
  | { kind: "readonly" }
  | { kind: "saving" }
  | { kind: "dirty" }
  | { kind: "saved"; label: string }
  | { kind: "never"; label?: string | undefined };

const statusCopy = (status: SaveStatus): { icon: IconName; text: string } => {
  switch (status.kind) {
    case "readonly":
      return { icon: "lock", text: "Solo lectura" };
    case "saving":
      return { icon: "loader", text: "Guardando…" };
    case "dirty":
      return { icon: "alert", text: "Cambios sin guardar" };
    case "saved":
      return { icon: "circle-check", text: status.label };
    case "never":
      return {
        icon: "info",
        text: status.label ?? "Diseño sin guardar todavía",
      };
  }
};

/**
 * One toolbar (arrow keys move between its buttons): history on the left,
 * save state in the middle, actions on the right with the export as the
 * primary one.
 */
export function StudioToolbar({
  canEdit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  status,
  secondary,
  onSave,
  isSaving,
  isDirty,
  onExport,
  exportLabel = "Descargar",
}: {
  canEdit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  status: SaveStatus;
  /** Secondary actions (see `ToolbarAction`). */
  secondary: ReactNode;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
  onExport: () => void;
  exportLabel?: string | undefined;
}) {
  const copy = statusCopy(status);
  return (
    <Toolbar.Root
      aria-label="Herramientas del diseño"
      className="qrs-toolbar"
      loop
    >
      {canEdit ? (
        <div className="qrs-toolbar-group">
          <ToolButton
            disabled={!canUndo}
            icon="undo"
            keys="Meta+Z Control+Z"
            label="Deshacer"
            onClick={onUndo}
            shortcut={`${mod}Z`}
          />
          <ToolButton
            disabled={!canRedo}
            icon="redo"
            keys="Meta+Shift+Z Control+Shift+Z Control+Y"
            label="Rehacer"
            onClick={onRedo}
            shortcut={`${shift}${mod}Z`}
          />
          <ToolButton
            icon="reset"
            label="Restablecer diseño"
            onClick={onReset}
          />
          <Toolbar.Separator className="qrs-toolbar-separator" />
        </div>
      ) : null}
      <p aria-live="polite" className="qrs-save-status" data-kind={status.kind}>
        <Icon
          className={status.kind === "saving" ? "qrs-spin" : undefined}
          name={copy.icon}
          size={15}
        />
        <span>{copy.text}</span>
      </p>
      <div className="qrs-toolbar-actions">
        {secondary}
        {canEdit ? (
          <Toolbar.Button
            aria-busy={isSaving || undefined}
            aria-keyshortcuts="Meta+S Control+S"
            className="button button-secondary qrs-action"
            data-dirty={isDirty || undefined}
            disabled={isSaving}
            onClick={onSave}
            title={`Guardar diseño (${mod}S)`}
            type="button"
          >
            {isSaving ? (
              <span aria-hidden="true" className="button-spinner" />
            ) : (
              <Icon name="save" size={16} />
            )}
            <span>Guardar</span>
            <span className="visually-hidden"> diseño</span>
          </Toolbar.Button>
        ) : null}
        <Toolbar.Button
          className="button button-primary qrs-action"
          onClick={onExport}
          type="button"
        >
          <Icon name="download" size={16} />
          <span>{exportLabel}</span>
        </Toolbar.Button>
      </div>
    </Toolbar.Root>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  shortcut,
  keys,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean | undefined;
  shortcut?: string | undefined;
  keys?: string | undefined;
}) {
  return (
    <Tooltip
      content={
        shortcut ? (
          <span className="qrs-tooltip-shortcut">
            {label} <kbd>{shortcut}</kbd>
          </span>
        ) : (
          label
        )
      }
    >
      <Toolbar.Button
        aria-keyshortcuts={keys}
        aria-label={label}
        className="qrs-tool"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <Icon name={icon} size={18} />
      </Toolbar.Button>
    </Tooltip>
  );
}

/** Below this width the secondary actions collapse to icons (qr-studio.css). */
const compactToolbarQuery = "(max-width: 82.5rem)";

/**
 * A secondary toolbar action: icon + label on wide screens, icon with a
 * tooltip when the toolbar is tight. `href` renders an external link.
 */
export function ToolbarAction({
  icon,
  label,
  onClick,
  href,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
  disabled?: boolean | undefined;
}) {
  const compact = useMediaQuery(compactToolbarQuery);
  const content = (
    <>
      <Icon name={icon} size={16} />
      <span className="qrs-action-label">{label}</span>
    </>
  );
  const control = href ? (
    <Toolbar.Link
      className="button button-ghost qrs-action"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {content}
    </Toolbar.Link>
  ) : (
    <Toolbar.Button
      className="button button-ghost qrs-action"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {content}
    </Toolbar.Button>
  );
  return compact ? <Tooltip content={label}>{control}</Tooltip> : control;
}
