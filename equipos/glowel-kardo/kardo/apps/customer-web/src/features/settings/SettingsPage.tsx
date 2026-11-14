import type { HelpSection } from "@kardo/contracts";
import { PageHeader } from "../../components/PageHeader.js";
import type { Route, SettingsSection } from "../../lib/router.js";
import { Link } from "../../lib/router.js";
import { DataPage } from "./account/DataPage.js";
import { PreferencesPage } from "./account/PreferencesPage.js";
import { ProfilePage } from "./account/ProfilePage.js";
import { SecurityPage } from "./account/SecurityPage.js";
import { BrandSection } from "./BrandSection.js";
import { OrganizationProfileSection } from "./OrganizationProfileSection.js";
import { PlanSection } from "./PlanSection.js";
import "./settings.css";
import { TeamPanels } from "./TeamPanels.js";
import { WorkspaceSection } from "./WorkspaceSection.js";

type NavItem = {
  section: SettingsSection;
  label: string;
  /** Equipo keeps its own address (/organization), so the sidebar's
   * «Equipo» entry stays highlighted there. */
  route: Route;
};
type NavGroup = { label: string; items: NavItem[] };

const item = (section: SettingsSection, label: string): NavItem => ({
  section,
  label,
  route: { name: "settings", section },
});

const navGroups: NavGroup[] = [
  {
    label: "Tu cuenta",
    items: [
      item("cuenta", "Perfil"),
      item("preferencias", "Preferencias"),
      item("seguridad", "Seguridad"),
      item("datos", "Tus datos"),
    ],
  },
  {
    label: "Organización",
    items: [
      item("organizacion", "General"),
      item("marca", "Marca"),
      { section: "equipo", label: "Equipo", route: { name: "organization" } },
      item("plan", "Plan y facturación"),
    ],
  },
];

const sectionHelp: Record<SettingsSection, HelpSection> = {
  cuenta: "account",
  preferencias: "account",
  seguridad: "security",
  datos: "account",
  organizacion: "settings",
  marca: "brand",
  equipo: "team",
  plan: "plan",
};

/**
 * Configuración (ADR 023 §2): a sub-navigation by level — your account,
 * then the organization — and one page per section. Pages are groups of
 * rows; each change opens its own dialog.
 */
export function SettingsPage({ section }: { section: SettingsSection }) {
  return (
    <div className="page" data-section={section}>
      <PageHeader help={sectionHelp[section]} title="Configuración" />
      <div className="settings-layout">
        <nav aria-label="Secciones de configuración" className="settings-nav">
          {navGroups.map((group) => (
            <div className="settings-nav-group" key={group.label}>
              <p className="settings-nav-label">{group.label}</p>
              <ul>
                {group.items.map((entry) => {
                  const current = entry.section === section;
                  return (
                    <li key={entry.section}>
                      <Link
                        ariaCurrent={current ? "page" : undefined}
                        className={
                          current
                            ? "settings-nav-item settings-nav-item-current"
                            : "settings-nav-item"
                        }
                        to={entry.route}
                      >
                        {entry.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="settings-content">
          {section === "cuenta" ? <ProfilePage /> : null}
          {section === "preferencias" ? <PreferencesPage /> : null}
          {section === "seguridad" ? <SecurityPage /> : null}
          {section === "datos" ? <DataPage /> : null}
          {section === "organizacion" ? (
            <>
              <WorkspaceSection />
              <OrganizationProfileSection />
            </>
          ) : null}
          {section === "marca" ? <BrandSection /> : null}
          {section === "equipo" ? <TeamPanels /> : null}
          {section === "plan" ? <PlanSection /> : null}
        </div>
      </div>
    </div>
  );
}
