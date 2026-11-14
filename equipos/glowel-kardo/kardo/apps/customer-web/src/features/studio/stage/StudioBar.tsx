import { DropdownMenu, RadioGroup, Toolbar } from "radix-ui";
import { Icon, type IconName } from "../../../components/Icon.js";
import { StatusText } from "../../../components/SettingsBlocks.js";
import { Tooltip } from "../../../components/Tooltip.js";
import { Link, type Route } from "../../../lib/router.js";
import type { StudioMode } from "../html/model.js";
import type { StudioIssue } from "../model/validate.js";
import type { PublishBadge } from "./publish-status.js";
import type { Zoom } from "./Stage.js";
import {
  type DesktopWidth,
  type Device,
  desktopWidths,
  maxScale,
  minScale,
} from "./viewports.js";

const isApple =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
export const mod = isApple ? "⌘" : "Ctrl+";
const shift = isApple ? "⇧" : "Shift+";

const deviceOptions: { value: Device; label: string; icon: IconName }[] = [
  { value: "phone", label: "Celular", icon: "phone" },
  { value: "desktop", label: "Computadora", icon: "desktop" },
  { value: "both", label: "Ambos", icon: "columns" },
];

const zoomSteps: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5];

export type StudioBarLink = { label: string; icon: IconName; to: Route };

export type PublishedMode = {
  html: boolean;
  canChange: boolean;
  htmlBlank: boolean;
  onChange: (html: boolean) => void;
};

export type ViewControls = {
  device: Device;
  onDeviceChange: (device: Device) => void;
  desktopWidth: DesktopWidth;
  onDesktopWidthChange: (width: DesktopWidth) => void;
  zoom: Zoom;
  /** The scale that fits the stage, shown while `zoom` is "fit". */
  fit: number;
  onZoomChange: (zoom: Zoom) => void;
  /** Linktree-like layout (the phone docked on the right); null when the
   * Estudio is too narrow to offer it. */
  phoneRight: boolean | null;
  onPhoneRightChange: (value: boolean) => void;
};

/**
 * The Estudio's one-line header: back, what is designed, Bloques | HTML,
 * history and save state, the view (device and zoom), the Experience's
 * other views (Destinos, Historial), what the page publishes, Guardar and
 * Publicar. Labels give way to icons as the window narrows; every control
 * keeps its accessible name.
 */
export function StudioBar({
  kicker,
  title,
  back,
  links,
  status,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onPublish,
  isSaving,
  isPublishing,
  isDirty,
  canSave,
  canPublish,
  issues,
  onIssue,
  studioMode,
  onModeChange,
  htmlActive,
  published,
  publishBadge,
  htmlMode = true,
  view,
}: {
  kicker: string;
  title: string;
  back: { to: Route; label: string };
  links: readonly StudioBarLink[];
  status: { icon: IconName; text: string; kind: string };
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onPublish: () => void;
  isSaving: boolean;
  isPublishing: boolean;
  isDirty: boolean;
  canSave: boolean;
  canPublish: boolean;
  issues: readonly StudioIssue[];
  onIssue: (issue: StudioIssue) => void;
  studioMode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  /** The page shows its HTML (a dot on the HTML switch). */
  htmlActive: boolean;
  /** "Se publica": what the page shows. Null when the page is read-only. */
  published: PublishedMode | null;
  /** "¿Publicada o solo guardada?" (E6/B3d): the dot + word next to
   * Publicar. Null hides it (nothing to compare the draft against yet, or
   * a publish already in flight — `status` or a notice already says so). */
  publishBadge: PublishBadge | null;
  /** The type has a full-page modo HTML (links, profile, linkpage). The
   * others only use `html` blocks: no Bloques | HTML switch, nothing to
   * choose under "Se publica". */
  htmlMode?: boolean;
  /** Device and zoom; null in the modo HTML (it has its own). */
  view: ViewControls | null;
}) {
  const firstIssue = issues[0];
  return (
    <header className="es-bar">
      <Tooltip content={`Volver a ${back.label}`}>
        <span className="qrs-back">
          <Link
            ariaLabel={`Volver a ${back.label}`}
            className="icon-button qrs-back-link"
            to={back.to}
          >
            <Icon name="arrow-left" size={18} />
          </Link>
        </span>
      </Tooltip>
      <div className="es-bar-title">
        <p className="qrs-header-kicker">{kicker}</p>
        <h1 title={title}>{title}</h1>
      </div>
      {htmlMode ? (
        <RadioGroup.Root
          aria-label="Forma de diseñar"
          className="qrs-segmented es-mode-switch"
          loop
          onValueChange={(next) => {
            if (next) onModeChange(next as StudioMode);
          }}
          orientation="horizontal"
          value={studioMode}
        >
          <RadioGroup.Item
            aria-label="Bloques"
            className="qrs-segment"
            value="blocks"
          >
            <Icon name="section" size={15} />
            <span className="es-bar-label">Bloques</span>
          </RadioGroup.Item>
          <RadioGroup.Item
            aria-label={htmlActive ? "HTML (activo en la página)" : "HTML"}
            className="qrs-segment"
            title={htmlActive ? "Tu página muestra este HTML" : undefined}
            value="html"
          >
            <Icon name="code" size={15} />
            <span className="es-bar-label">HTML</span>
            {htmlActive ? (
              <span aria-hidden="true" className="es-mode-live">
                <span />
              </span>
            ) : null}
          </RadioGroup.Item>
        </RadioGroup.Root>
      ) : null}
      <Toolbar.Root
        aria-label="Herramientas del diseño"
        className="es-bar-tools"
        loop
      >
        {canSave ? (
          <div className="qrs-toolbar-group es-history">
            <BarTool
              disabled={!canUndo}
              icon="undo"
              keys="Meta+Z Control+Z"
              label="Deshacer"
              onClick={onUndo}
              shortcut={`${mod}Z`}
            />
            <BarTool
              disabled={!canRedo}
              icon="redo"
              keys="Meta+Shift+Z Control+Shift+Z Control+Y"
              label="Rehacer"
              onClick={onRedo}
              shortcut={`${shift}${mod}Z`}
            />
          </div>
        ) : null}
        <Tooltip content={status.text}>
          <p
            aria-live="polite"
            className="qrs-save-status es-save-status"
            data-kind={status.kind}
          >
            <Icon
              className={status.kind === "saving" ? "qrs-spin" : undefined}
              name={status.icon}
              size={15}
            />
            <span className="es-bar-status-text">{status.text}</span>
          </p>
        </Tooltip>
        {canSave && firstIssue ? (
          <Toolbar.Button
            className="es-issues"
            onClick={() => onIssue(firstIssue)}
            title="Ir al primer pendiente"
            type="button"
          >
            <Icon name="circle-alert" size={14} />
            <span>
              {issues.length === 1
                ? "1 pendiente"
                : `${issues.length} pendientes`}
            </span>
          </Toolbar.Button>
        ) : null}

        {view ? <ViewTools {...view} /> : <span className="es-bar-spacer" />}

        <div className="qrs-toolbar-actions">
          {links.map((link) => (
            <Tooltip content={link.label} key={link.label}>
              <span className="es-bar-link-wrap">
                <Link
                  ariaLabel={link.label}
                  className="es-bar-link"
                  to={link.to}
                >
                  <Icon name={link.icon} size={16} />
                  <span className="es-bar-label">{link.label}</span>
                </Link>
              </span>
            </Tooltip>
          ))}
          {published && htmlMode ? <PublishedMenu {...published} /> : null}
          {publishBadge ? (
            <StatusText tone={publishBadge.tone}>
              {publishBadge.label}
            </StatusText>
          ) : null}
          {canSave ? (
            <Toolbar.Button
              aria-busy={isSaving || undefined}
              aria-keyshortcuts="Meta+S Control+S"
              aria-label="Guardar"
              className="button button-secondary qrs-action es-save"
              data-dirty={isDirty || undefined}
              disabled={isSaving}
              onClick={onSave}
              title={`Guardar (${mod}S)`}
              type="button"
            >
              {isSaving ? (
                <span aria-hidden="true" className="button-spinner" />
              ) : (
                <Icon name="save" size={16} />
              )}
              <span className="es-bar-label">Guardar</span>
            </Toolbar.Button>
          ) : null}
          {canPublish ? (
            <Toolbar.Button
              aria-busy={isPublishing || undefined}
              className="button button-primary qrs-action es-publish"
              disabled={isPublishing || isSaving}
              onClick={onPublish}
              title={isDirty ? "Guarda y publica" : "Publicar"}
              type="button"
            >
              {isPublishing ? (
                <span aria-hidden="true" className="button-spinner" />
              ) : (
                <Icon name="send" size={16} />
              )}
              <span>{isPublishing ? "Publicando…" : "Publicar"}</span>
            </Toolbar.Button>
          ) : null}
        </div>
      </Toolbar.Root>
    </header>
  );
}

function ViewTools({
  device,
  onDeviceChange,
  desktopWidth,
  onDesktopWidthChange,
  zoom,
  fit,
  onZoomChange,
  phoneRight,
  onPhoneRightChange,
}: ViewControls) {
  const both = device === "both";
  const shown = zoom === "fit" ? fit : zoom;
  const percent = `${Math.round(shown * 100)} %`;
  return (
    <div className="es-view">
      <RadioGroup.Root
        aria-label="Dispositivo"
        className="qrs-segmented es-devices"
        loop
        onValueChange={(next) => {
          if (next) onDeviceChange(next as Device);
        }}
        orientation="horizontal"
        value={device}
      >
        {deviceOptions.map((item) => (
          <Tooltip content={item.label} key={item.value}>
            <RadioGroup.Item
              aria-label={item.label}
              className="qrs-segment"
              value={item.value}
            >
              <Icon name={item.icon} size={15} />
            </RadioGroup.Item>
          </Tooltip>
        ))}
      </RadioGroup.Root>
      <div className="es-zoom">
        <Tooltip content="Alejar">
          <button
            aria-label="Alejar"
            className="qrs-tool"
            disabled={both || shown <= minScale + 0.01}
            onClick={() =>
              onZoomChange(
                [...zoomSteps].reverse().find((step) => step < shown - 0.01) ??
                  Math.max(minScale, shown - 0.25),
              )
            }
            type="button"
          >
            <Icon name="zoom-out" size={16} />
          </button>
        </Tooltip>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              aria-label={`Zoom: ${both ? "ajustado" : percent}. Cambiar vista`}
              className="es-zoom-value"
              type="button"
            >
              <span>{both ? "Ajustado" : percent}</span>
              <Icon name="chevron-down" size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="center"
              className="es-tb-dropdown es-view-menu"
              collisionPadding={12}
              sideOffset={6}
            >
              <DropdownMenu.Label className="es-tb-dropdown-title">
                Zoom
              </DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                onValueChange={(value) =>
                  onZoomChange(value === "fit" ? "fit" : Number(value))
                }
                value={zoom === "fit" ? "fit" : String(zoom)}
              >
                <DropdownMenu.RadioItem
                  className="es-tb-dropdown-item"
                  value="fit"
                >
                  <span aria-hidden="true" className="es-menu-check" />
                  Ajustar a la pantalla
                </DropdownMenu.RadioItem>
                {zoomSteps.map((step) => (
                  <DropdownMenu.RadioItem
                    className="es-tb-dropdown-item"
                    disabled={both}
                    key={step}
                    value={String(step)}
                  >
                    <span aria-hidden="true" className="es-menu-check" />
                    {Math.round(step * 100)} %
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              {device !== "phone" ? (
                <>
                  <DropdownMenu.Separator className="es-tb-dropdown-sep" />
                  <DropdownMenu.Label className="es-tb-dropdown-title">
                    Ancho de la computadora
                  </DropdownMenu.Label>
                  <DropdownMenu.RadioGroup
                    onValueChange={(value) =>
                      onDesktopWidthChange(Number(value) as DesktopWidth)
                    }
                    value={String(desktopWidth)}
                  >
                    {desktopWidths.map((width) => (
                      <DropdownMenu.RadioItem
                        className="es-tb-dropdown-item"
                        key={width}
                        value={String(width)}
                      >
                        <span aria-hidden="true" className="es-menu-check" />
                        {width} px
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </>
              ) : phoneRight !== null ? (
                <>
                  <DropdownMenu.Separator className="es-tb-dropdown-sep" />
                  <DropdownMenu.CheckboxItem
                    checked={phoneRight}
                    className="es-tb-dropdown-item"
                    onCheckedChange={(checked) =>
                      onPhoneRightChange(checked === true)
                    }
                  >
                    <span aria-hidden="true" className="es-menu-check" />
                    Teléfono a la derecha
                  </DropdownMenu.CheckboxItem>
                </>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Tooltip content="Acercar">
          <button
            aria-label="Acercar"
            className="qrs-tool"
            disabled={both || shown >= maxScale - 0.01}
            onClick={() =>
              onZoomChange(
                zoomSteps.find((step) => step > shown + 0.01) ?? maxScale,
              )
            }
            type="button"
          >
            <Icon name="zoom-in" size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

/** "Se publica: Bloques | HTML", next to Publicar and visible in both
 * modes: the Bloques | HTML switch only chooses what you edit. */
function PublishedMenu({
  html,
  canChange,
  htmlBlank,
  onChange,
}: PublishedMode) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Toolbar.Button
          aria-label={`Se publica: ${html ? "tu HTML" : "el diseño de bloques"}. Cambiar`}
          className="es-published"
          data-html={html || undefined}
          title="Lo que muestra tu página al publicar"
          type="button"
        >
          <span aria-hidden="true" className="es-published-dot" />
          <span className="es-published-kicker">Se publica:</span>
          <strong>{html ? "HTML" : "Bloques"}</strong>
          <Icon name="chevron-down" size={14} />
        </Toolbar.Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="es-published-menu"
          collisionPadding={12}
          sideOffset={6}
        >
          <DropdownMenu.Label className="es-published-title">
            ¿Qué muestra tu página?
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            onValueChange={(value) => {
              const next = value === "html";
              if (next !== html) onChange(next);
            }}
            value={html ? "html" : "blocks"}
          >
            <DropdownMenu.RadioItem
              className="es-published-item"
              disabled={!canChange}
              value="blocks"
            >
              <span aria-hidden="true" className="es-published-radio" />
              <span className="es-published-text">
                <strong>Diseño de bloques</strong>
                <small>Lo que armas en Bloques.</small>
              </span>
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem
              className="es-published-item"
              disabled={!canChange || htmlBlank}
              value="html"
            >
              <span aria-hidden="true" className="es-published-radio" />
              <span className="es-published-text">
                <strong>Tu HTML</strong>
                <small>
                  {htmlBlank
                    ? "Primero escribe o pega tu código en HTML."
                    : "Tu código, limpio y sin scripts. Tus bloques no se pierden."}
                </small>
              </span>
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
          <p className="es-published-note">
            {canChange
              ? "Se aplica al publicar. Puedes cambiarlo cuando quieras."
              : "Solo Owners y Admins pueden cambiar qué se publica."}
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function BarTool({
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
  shortcut: string;
  keys: string;
}) {
  return (
    <Tooltip
      content={
        <span className="qrs-tooltip-shortcut">
          {label} <kbd>{shortcut}</kbd>
        </span>
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
