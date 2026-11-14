import { Toolbar } from "radix-ui";
import { Icon, type IconName } from "../../../components/Icon.js";
import { railSections } from "../labels.js";
import {
  type RailSection,
  railSectionIds,
  useStudio,
} from "../StudioContext.js";

export type RailInfo = {
  label: string;
  title: string;
  description: string;
  icon: IconName;
};

/** Used until `labels.ts` names a rail section (it is shared with the
 * inspector and panels). */
const fallback: Partial<Record<RailSection, RailInfo>> = {
  content: {
    label: "Contenido",
    title: "Contenido",
    description:
      "Lo que dice tu página. También puedes escribir directo sobre la vista previa.",
    icon: "edit",
  },
  ai: {
    label: "IA",
    title: "Diseña con IA",
    description: "Describe tu página y la IA de Kardo arma los bloques.",
    icon: "sparkles",
  },
};

export function railInfo(section: RailSection): RailInfo {
  const known = (railSections as Partial<Record<RailSection, RailInfo>>)[
    section
  ];
  return (
    known ??
    fallback[section] ?? {
      label: section,
      title: section,
      description: "",
      icon: "section",
    }
  );
}

/**
 * The Estudio's rail: Contenido first (what the page says), then the
 * design tools. The active item shows its panel; pressing it again folds
 * the panel away so the page gets the room.
 */
export function StudioRail({
  value,
  open,
  orientation,
  onSelect,
}: {
  value: RailSection;
  open: boolean;
  orientation: "vertical" | "horizontal";
  onSelect: (section: RailSection) => void;
}) {
  const { issues, contentErrors, aiWaiting } = useStudio();
  const pageIssue = issues.some((issue) => issue.area === "page");
  const blockIssue = issues.some((issue) => issue.area !== "page");
  const contentIssue = Object.keys(contentErrors).length > 0;
  return (
    <Toolbar.Root
      aria-label="Herramientas del Estudio"
      className="es-rail"
      loop
      orientation={orientation}
    >
      {railSectionIds.map((id) => {
        const info = railInfo(id);
        const active = open && value === id;
        const flag =
          (id === "content" && contentIssue) ||
          (id === "layers" && blockIssue) ||
          ((id === "style" || id === "background") && pageIssue) ||
          // The AI is working, or left ideas or a design for the owner.
          (id === "ai" && aiWaiting !== null);
        return (
          <Toolbar.Button
            aria-controls={active ? "es-rail-panel" : undefined}
            aria-label={flag ? `${info.label} (con pendientes)` : info.label}
            aria-pressed={active}
            className="es-rail-item"
            data-active={active || undefined}
            key={id}
            onClick={() => onSelect(id)}
            title={info.title}
            type="button"
          >
            <span aria-hidden="true" className="qrs-rail-icon">
              <Icon name={info.icon} size={20} />
              {flag ? <span className="qrs-flag" /> : null}
            </span>
            <span aria-hidden="true" className="es-rail-label">
              {info.label}
            </span>
          </Toolbar.Button>
        );
      })}
    </Toolbar.Root>
  );
}
