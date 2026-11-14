import type { CustomerWorkspace } from "@kardo/contracts";
import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { Icon } from "../components/Icon.js";
import { prefersReducedMotion } from "../components/motion.js";
import { loadMyBillingAccount } from "../features/billing/my-account.js";
import { useHelp } from "../features/help/help-context.js";
import { helpSectionForRoute } from "../features/help/sections.js";
import { CreateOrganizationDialog } from "../features/organization/CreateOrganizationDialog.js";
import { roleLabels } from "../features/organization/role-labels.js";
import { useAccountProfile } from "../lib/account-profile.js";
import { Link, useRouter } from "../lib/router.js";
import { useResource } from "../lib/use-resource.js";
import { supabase } from "../supabase.js";
import { type NavItem, navGroups } from "./navigation.js";

/** What the sign up declared (personal or business), else the kind. */
export function spaceLabel(workspace: CustomerWorkspace): string {
  if (workspace.accountType === "personal") return "Personal";
  if (workspace.accountType === "business") return "Negocio";
  return workspace.kind === "personal" ? "Personal" : "Organización";
}

import { useWorkspace } from "./WorkspaceContext.js";
import { WorkspaceMark } from "./WorkspaceMark.js";

/** Desktop navigation: a sticky ink column. On small screens see MobileNav. */
export function Sidebar() {
  return (
    <aside aria-label="Navegación principal" className="sidebar">
      <SidebarContent />
    </aside>
  );
}

/**
 * The navigation itself, shared by the desktop column and the mobile drawer.
 * `onClose` adds a close button (mobile drawer only).
 */
export function SidebarContent({
  onClose,
}: {
  onClose?: (() => void) | undefined;
}) {
  const { route } = useRouter();
  const { workspace, workspaces, pendingSetup, selectWorkspace, can, session } =
    useWorkspace();
  const help = useHelp();
  const switcherId = useId();
  const labelPrefix = useId();
  const email = session.user.email ?? "";
  // The person's own name (owner, 2026-10-04: «lo llamas como el nombre del
  // negocio»), not the default one an account starts with; else the email.
  const { profile } = useAccountProfile(session.user.id);
  const ownName = profile?.displayName?.endsWith(" · Personal")
    ? ""
    : (profile?.displayName?.replace(/\s+/g, " ").trim() ?? "");
  const initials =
    (ownName
      ? ownName
          .split(" ")
          .slice(0, 2)
          .map((word) => word[0] ?? "")
          .join("")
      : email.slice(0, 2)
    ).toUpperCase() || "KA";

  const navRef = useRef<HTMLElement>(null);
  const { canScrollDown, isScrolled } = useScrollHint(navRef);
  const [creating, setCreating] = useState(false);
  // Someone who joined by invitation creates their own business from the
  // link below instead (relevo 20, T3).
  // At the cap it stays: the dialog says why (relevo 36, E7).
  const canCreate = !pendingSetup;
  // The account's organization usage, so the switcher can say «usas 3 de 3»
  // before someone tries to create the 4th (round 4, Diego). One shared
  // copy for the whole panel (the account is the person's, not the
  // workspace's; domain audit A2-12).
  const account = useResource(canCreate ? "sidebar-account" : null, () =>
    loadMyBillingAccount(),
  );
  const isCurrent = (item: NavItem) => item.matches.includes(route.name);
  const visible = (item: NavItem) => !item.permission || can(item.permission);

  return (
    <div className="sidebar-inner">
      <div className="sidebar-top">
        <Link
          ariaLabel="Kardo, ir al resumen"
          className="brand"
          to={{ name: "overview" }}
        >
          <img alt="Kardo" src="/kardo-logo-oscuro.svg" />
        </Link>
        {onClose ? (
          <button
            aria-label="Cerrar menú"
            className="icon-button sidebar-close"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        ) : null}
      </div>

      <WorkspaceSwitcher
        id={switcherId}
        onCreate={canCreate ? () => setCreating(true) : undefined}
        onSelect={selectWorkspace}
        organizationsLimit={account.data?.organizationsLimit ?? null}
        organizationsUsed={account.data?.organizationsUsed}
        workspace={workspace}
        workspaces={workspaces}
      />
      <CreateOrganizationDialog
        onClose={() => setCreating(false)}
        open={creating}
      />
      {pendingSetup && workspace.id !== pendingSetup.id ? (
        <Link
          className="sidebar-create-business"
          to={{ name: "create-business" }}
        >
          <Icon name="plus" size={16} />
          Crear mi propio negocio
        </Link>
      ) : null}

      {/* Only the sections scroll: the brand, the workspace switcher, help
          and the account stay in place. */}
      <div
        className="sidebar-scroll-area"
        data-more={canScrollDown ? "" : undefined}
        data-scrolled={isScrolled ? "" : undefined}
      >
        <nav aria-label="Secciones" className="sidebar-nav" ref={navRef}>
          {navGroups.map((group) => {
            const items = group.items.filter(visible);
            if (!items.length) return null;
            const labelId = `${labelPrefix}-${group.id}`;
            return (
              <div className="nav-group" key={group.id}>
                {group.label ? (
                  <p className="nav-group-label" id={labelId}>
                    {group.label}
                  </p>
                ) : null}
                <ul
                  aria-label={group.label ? undefined : "Inicio"}
                  aria-labelledby={group.label ? labelId : undefined}
                  className="nav-list"
                >
                  {items.map((item) => (
                    <li key={item.label}>
                      <Link
                        ariaCurrent={isCurrent(item) ? "page" : undefined}
                        ariaDescription={item.description}
                        className={
                          isCurrent(item)
                            ? "nav-item nav-item-current"
                            : "nav-item"
                        }
                        title={item.description}
                        to={item.route}
                      >
                        <Icon name={item.icon} />
                        {item.note ? (
                          <span className="nav-item-text">
                            <span>{item.label}</span>
                            <small className="nav-item-note">{item.note}</small>
                          </span>
                        ) : (
                          <span>{item.label}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        {canScrollDown ? (
          <button
            aria-label="Ver más secciones"
            className="sidebar-scroll-hint"
            onClick={() =>
              navRef.current?.scrollBy({
                top: Math.round(navRef.current.clientHeight * 0.7),
                behavior: prefersReducedMotion() ? "auto" : "smooth",
              })
            }
            tabIndex={-1}
            type="button"
          >
            <Icon name="chevron-down" size={16} />
          </button>
        ) : null}
      </div>

      <div className="sidebar-bottom">
        {help ? (
          <button
            aria-haspopup="dialog"
            className="nav-item nav-help"
            onClick={() => help.openHelp(helpSectionForRoute(route))}
            type="button"
          >
            <Icon name="help" />
            <span>Ayuda y guía</span>
          </button>
        ) : null}
        <div className="account-card">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="account-copy">
            <strong title={email}>{ownName || email || "Tu cuenta"}</strong>
            <small>{roleLabels[workspace.role]}</small>
          </span>
          <button
            aria-label="Cerrar sesión"
            className="icon-button account-signout"
            onClick={() => void supabase?.auth.signOut()}
            title="Cerrar sesión"
            type="button"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tracks whether the section list has more content below (to show the
 * down-arrow hint) or has been scrolled (to fade its top edge).
 */
function useScrollHint(ref: RefObject<HTMLElement | null>) {
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      setCanScrollDown(
        element.scrollTop + element.clientHeight < element.scrollHeight - 4,
      );
      setIsScrolled(element.scrollTop > 4);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [ref]);
  return { canScrollDown, isScrolled };
}

/** The `<select>` value of «Crear organización…», never a workspace id. */
const CREATE_ORGANIZATION = "crear-organizacion";

/**
 * The active organization, and the place to change it or create another:
 * «Crear organización…» is offered here even with a single organization,
 * where people look for it first (2026-10-03 study, finding 11).
 */
function WorkspaceSwitcher({
  id,
  workspace,
  workspaces,
  onSelect,
  onCreate,
  organizationsUsed,
  organizationsLimit,
}: {
  id: string;
  workspace: CustomerWorkspace;
  workspaces: readonly CustomerWorkspace[];
  onSelect: (workspaceId: string) => void;
  /** Absent when this person cannot own another organization. */
  onCreate?: (() => void) | undefined;
  /** The account's organization usage, to show «usas N de L» before the cap. */
  organizationsUsed?: number | undefined;
  organizationsLimit?: number | null | undefined;
}) {
  // «Crear organización… (usas 3 de 3)»: the count shows right in the
  // selector, so the limit is clear before opening the dialog (round 4).
  const usageSuffix =
    typeof organizationsUsed === "number" &&
    typeof organizationsLimit === "number"
      ? ` (usas ${organizationsUsed} de ${organizationsLimit})`
      : "";
  const canSwitch = workspaces.length > 1 || onCreate !== undefined;
  return (
    <label
      className={
        canSwitch
          ? "workspace-switcher workspace-switcher-interactive"
          : "workspace-switcher"
      }
      htmlFor={id}
    >
      <WorkspaceMark workspace={workspace} />
      <span className="workspace-copy">
        <strong>{workspace.name}</strong>
        <small>
          {spaceLabel(workspace)} · {roleLabels[workspace.role]}
        </small>
      </span>
      {canSwitch ? (
        <Icon
          className="workspace-switcher-chevron"
          name="chevrons-up-down"
          size={16}
        />
      ) : (
        <span />
      )}
      <select
        aria-label="Cambiar de organización o crear otra"
        disabled={!canSwitch}
        id={id}
        onChange={(event) => {
          if (event.target.value === CREATE_ORGANIZATION) onCreate?.();
          else onSelect(event.target.value);
        }}
        value={workspace.id}
      >
        {workspaces.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
        {onCreate ? (
          <option value={CREATE_ORGANIZATION}>
            Crear organización…{usageSuffix}
          </option>
        ) : null}
      </select>
    </label>
  );
}
