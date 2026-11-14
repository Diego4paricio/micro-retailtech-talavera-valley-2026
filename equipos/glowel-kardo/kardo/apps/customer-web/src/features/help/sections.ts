import { type HelpSection, helpSections } from "@kardo/contracts";
import type { Route, SettingsSection } from "../../lib/router.js";
import { helpGuides } from "./guides.js";

/** Configuración is split in sub-sections; each has its own guide. */
const settingsHelp: Record<SettingsSection, HelpSection> = {
  cuenta: "account",
  preferencias: "account",
  seguridad: "security",
  datos: "account",
  organizacion: "settings",
  marca: "brand",
  equipo: "team",
  plan: "plan",
};

/** The help section that explains a given screen. */
export function helpSectionForRoute(route: Route): HelpSection {
  switch (route.name) {
    case "overview":
      return "overview";
    case "touchpoints":
    case "touchpoint":
      return "touchpoints";
    case "qr-studio":
    case "qr":
    case "qr-design":
      return "qr-studio";
    case "links":
    case "link":
      return "links";
    case "experiences":
    case "experience":
    case "experience-new":
    case "experience-studio":
      return "experiences";
    case "availability":
      return "availability";
    case "assets":
      return "assets";
    case "analytics":
      return "analytics";
    case "leads":
      return "leads";
    case "organization":
    case "invitation":
      return "team";
    case "create-business":
      return "settings";
    case "settings":
      return settingsHelp[route.section ?? "cuenta"];
    default:
      return "general";
  }
}

/** Every section with its title, in navigation order, for the topic picker. */
export const helpTopics: { section: HelpSection; title: string }[] =
  helpSections.map((section) => ({
    section,
    title: helpGuides[section].title,
  }));
