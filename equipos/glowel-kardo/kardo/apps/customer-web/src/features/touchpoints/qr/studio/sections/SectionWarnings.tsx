import { Icon, type IconName } from "../../../../../components/Icon.js";
import type { QrWarning } from "../../engine/index.js";
import { type StudioSectionId, warningSections } from "../labels.js";
import { useStudio } from "../StudioContext.js";

const levelIcons: Record<QrWarning["level"], IconName> = {
  info: "info",
  warning: "alert",
  error: "octagon-alert",
};

/** The engine's advice that belongs to this section, next to its controls. */
export function SectionWarnings({ section }: { section: StudioSectionId }) {
  const { build } = useStudio();
  const warnings =
    build?.analysis.warnings.filter(
      (warning) => warningSections[warning.code] === section,
    ) ?? [];
  if (!warnings.length) return null;
  return <WarningList warnings={warnings} />;
}

export function WarningList({ warnings }: { warnings: readonly QrWarning[] }) {
  return (
    <ul className="qrs-warnings">
      {warnings.map((warning) => (
        <li
          className={`qrs-warning qrs-warning-${warning.level}`}
          key={warning.code}
        >
          <Icon name={levelIcons[warning.level]} size={16} />
          <span>{warning.message}</span>
        </li>
      ))}
    </ul>
  );
}
