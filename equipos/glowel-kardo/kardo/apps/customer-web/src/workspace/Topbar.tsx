import { Icon } from "../components/Icon.js";
import { HelpButton } from "../features/help/HelpButton.js";
import { helpSectionForRoute } from "../features/help/sections.js";
import { NotificationBell } from "../features/notifications/NotificationBell.js";
import { StatusIndicator } from "../features/status/StatusIndicator.js";
import { Link, useRouter } from "../lib/router.js";
import { detailLabel, findNavLocation } from "./navigation.js";
import { useWorkspace } from "./WorkspaceContext.js";
import { WorkspaceMark } from "./WorkspaceMark.js";

/**
 * Top bar: where you are (workspace › group › section), the service status,
 * the notification bell (ADR 022) and contextual help. On small screens it
 * also carries the menu button and the brand.
 */
export function Topbar({
  isNavOpen,
  onOpenNav,
}: {
  isNavOpen: boolean;
  onOpenNav: () => void;
}) {
  const { route } = useRouter();
  const { workspace } = useWorkspace();
  const location = findNavLocation(route.name);
  const detail = detailLabel(route);

  return (
    <header className="topbar">
      <div className="topbar-start">
        <button
          aria-expanded={isNavOpen}
          aria-haspopup="dialog"
          aria-label="Abrir menú"
          className="icon-button topbar-menu"
          onClick={onOpenNav}
          type="button"
        >
          <Icon name="menu" size={20} />
        </button>
        <Link
          ariaLabel="Kardo, ir al resumen"
          className="topbar-brand"
          to={{ name: "overview" }}
        >
          <img alt="Kardo" src="/kardo-logo.svg" />
        </Link>
        <nav aria-label="Ubicación" className="topbar-breadcrumb">
          <ol>
            <li className="topbar-crumb-workspace">
              <WorkspaceMark
                className="topbar-crumb-mark"
                workspace={workspace}
              />
              <span className="topbar-crumb-text">{workspace.name}</span>
            </li>
            {location ? (
              <>
                {location.group.label ? (
                  <li className="topbar-crumb-group">
                    <Icon name="chevron-right" size={14} />
                    <span>{location.group.label}</span>
                  </li>
                ) : null}
                <li>
                  <Icon name="chevron-right" size={14} />
                  {detail ? (
                    <Link
                      className="topbar-crumb-link"
                      to={location.item.route}
                    >
                      {location.item.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="topbar-crumb-current">
                      {location.item.label}
                    </span>
                  )}
                </li>
                {detail ? (
                  <li>
                    <Icon name="chevron-right" size={14} />
                    <span aria-current="page" className="topbar-crumb-current">
                      {detail}
                    </span>
                  </li>
                ) : null}
              </>
            ) : route.name === "notifications" ||
              route.name === "invitation" ? (
              <li>
                <Icon name="chevron-right" size={14} />
                <span aria-current="page" className="topbar-crumb-current">
                  {route.name === "notifications"
                    ? "Notificaciones"
                    : "Invitación"}
                </span>
              </li>
            ) : null}
          </ol>
        </nav>
      </div>
      <div className="topbar-actions">
        <StatusIndicator />
        <NotificationBell />
        <span aria-hidden="true" className="topbar-divider" />
        <HelpButton section={helpSectionForRoute(route)} />
      </div>
    </header>
  );
}
