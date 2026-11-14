import { Accordion, Tabs } from "radix-ui";
import type { ReactNode } from "react";
import { Icon } from "../../../../components/Icon.js";
import {
  type StudioSectionId,
  studioSectionIds,
  studioSections,
} from "./labels.js";
import { AdvancedSection } from "./sections/AdvancedSection.js";
import { ColorsSection } from "./sections/ColorsSection.js";
import { FrameSection } from "./sections/FrameSection.js";
import { LogoSection } from "./sections/LogoSection.js";
import { EyesSection, ModulesSection } from "./sections/ShapeSections.js";
import { TemplatesSection } from "./sections/TemplatesSection.js";

export type SectionFlags = Partial<
  Record<StudioSectionId, "warning" | "error">
>;

export const sectionDomId = (id: StudioSectionId) => `qrs-section-${id}`;

function SectionBody({ id }: { id: StudioSectionId }) {
  switch (id) {
    case "templates":
      return <TemplatesSection />;
    case "modules":
      return <ModulesSection />;
    case "eyes":
      return <EyesSection />;
    case "colors":
      return <ColorsSection />;
    case "logo":
      return <LogoSection />;
    case "frame":
      return <FrameSection />;
    case "advanced":
      return <AdvancedSection />;
  }
}

function FlagDot({ flag }: { flag: "warning" | "error" | undefined }) {
  if (!flag) return null;
  return <span className="qrs-flag" data-flag={flag} />;
}

/** Desktop: the section rail (vertical tabs). Pair with `DesktopPanel`. */
export function SectionRail({ flags }: { flags: SectionFlags }) {
  return (
    <Tabs.List aria-label="Secciones del diseño" className="qrs-rail">
      {studioSectionIds.map((id) => (
        <Tabs.Trigger className="qrs-rail-item" key={id} value={id}>
          <span aria-hidden="true" className="qrs-rail-icon">
            <Icon name={studioSections[id].icon} size={20} />
            <FlagDot flag={flags[id]} />
          </span>
          <span className="qrs-rail-label">{studioSections[id].label}</span>
          {flags[id] ? (
            <span className="visually-hidden">
              {flags[id] === "error"
                ? " (hay que corregir algo)"
                : " (revisar)"}
            </span>
          ) : null}
        </Tabs.Trigger>
      ))}
    </Tabs.List>
  );
}

/** Desktop: the properties panel for the active rail section. */
export function DesktopPanel({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="qrs-panel">
      {studioSectionIds.map((id) => (
        <Tabs.Content className="qrs-panel-content" key={id} value={id}>
          <div id={sectionDomId(id)}>
            <PanelHeading id={id} />
            <SectionFieldset readOnly={readOnly}>
              <SectionBody id={id} />
            </SectionFieldset>
          </div>
        </Tabs.Content>
      ))}
    </div>
  );
}

function PanelHeading({ id }: { id: StudioSectionId }) {
  return (
    <div className="qrs-panel-head">
      <h2 tabIndex={-1}>{studioSections[id].title}</h2>
      <p>{studioSections[id].description}</p>
    </div>
  );
}

function SectionFieldset({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: ReactNode;
}) {
  // Read-only viewers can browse and export, but not change the design.
  return (
    <fieldset className="qrs-section-body" disabled={readOnly}>
      {children}
    </fieldset>
  );
}

/** Phones and tablets: the same sections as a single-open accordion. */
export function MobilePanel({
  open,
  onOpenChange,
  flags,
  readOnly,
}: {
  open: StudioSectionId | "";
  onOpenChange: (section: StudioSectionId | "") => void;
  flags: SectionFlags;
  readOnly: boolean;
}) {
  return (
    <Accordion.Root
      className="qrs-accordion"
      collapsible
      onValueChange={(value) => onOpenChange(value as StudioSectionId | "")}
      type="single"
      value={open}
    >
      {studioSectionIds.map((id) => (
        <Accordion.Item
          className="qrs-accordion-item"
          id={sectionDomId(id)}
          key={id}
          value={id}
        >
          <Accordion.Header className="qrs-accordion-header">
            <Accordion.Trigger className="qrs-accordion-trigger">
              <span aria-hidden="true" className="qrs-rail-icon">
                <Icon name={studioSections[id].icon} size={18} />
                <FlagDot flag={flags[id]} />
              </span>
              <span className="qrs-accordion-title">
                {studioSections[id].title}
              </span>
              {flags[id] ? (
                <span className="visually-hidden">
                  {flags[id] === "error"
                    ? " (hay que corregir algo)"
                    : " (revisar)"}
                </span>
              ) : null}
              <Icon
                className="qrs-accordion-chevron"
                name="chevron-down"
                size={18}
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="qrs-accordion-content">
            <p className="qrs-accordion-description">
              {studioSections[id].description}
            </p>
            <SectionFieldset readOnly={readOnly}>
              <SectionBody id={id} />
            </SectionFieldset>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
