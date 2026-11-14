import type { HelpSection } from "@kardo/contracts";
import { Icon } from "../../components/Icon.js";
import { helpGuides } from "./guides.js";
import { useHelp } from "./help-context.js";

/**
 * Opens the section guide + "Pregúntale a Kardo" drawer.
 *
 *   <HelpButton section="touchpoints" />
 *   <HelpButton section="links" label="¿Qué es un Link?" />
 *
 * Renders nothing outside the workspace shell (no HelpProvider).
 */
export function HelpButton({
  section,
  label,
  variant = "default",
}: {
  section: HelpSection;
  label?: string | undefined;
  /** `default` secondary button · `subtle` chip next to a title · `icon` only. */
  variant?: "default" | "subtle" | "icon" | undefined;
}) {
  const help = useHelp();
  if (!help) return null;
  const guideTitle = helpGuides[section].title;
  const text = label ?? (variant === "subtle" ? "¿Cómo funciona?" : "Ayuda");
  const className =
    variant === "icon"
      ? "icon-button help-button-icon"
      : variant === "subtle"
        ? "help-chip"
        : "button button-secondary button-small help-button";

  return (
    <button
      aria-expanded={help.isOpen && help.section === section}
      aria-haspopup="dialog"
      aria-label={variant === "icon" ? `Ayuda: ${guideTitle}` : undefined}
      className={className}
      onClick={() => help.openHelp(section)}
      title={variant === "icon" ? `Ayuda: ${guideTitle}` : undefined}
      type="button"
    >
      <Icon name="help" size={variant === "subtle" ? 14 : 16} />
      {variant === "icon" ? null : <span>{text}</span>}
    </button>
  );
}
