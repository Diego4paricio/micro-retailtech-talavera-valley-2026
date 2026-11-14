import type { AvailabilityExperience } from "@kardo/contracts";
import { DropdownMenu } from "radix-ui";
import { Icon, type IconName } from "../../components/Icon.js";
import { experienceTypeLabels } from "../experiences/labels.js";
import { countItems, countsSummary } from "./model.js";
import type { QueueSnapshot } from "./save-queue.js";

export function typeIcon(type: AvailabilityExperience["type"]): IconName {
  return type === "menu" ? "utensils" : "cart";
}

function pickerSummary(entry: QueueSnapshot): {
  text: string;
  alert: boolean;
} {
  if (entry.phase === "error")
    return { text: "Cambios sin guardar", alert: true };
  const counts = countItems(entry.experience);
  return { text: countsSummary(counts), alert: counts.sold_out > 0 };
}

/** Wide layouts: every Menu and Catalog in a column next to the items. */
export function ExperienceRail({
  entries,
  selectedId,
  onSelect,
}: {
  entries: readonly QueueSnapshot[];
  selectedId: string;
  onSelect: (experienceId: string) => void;
}) {
  return (
    <nav aria-labelledby="av-rail-heading" className="av-rail">
      <p className="av-rail-heading" id="av-rail-heading">
        Menús y Catálogos
      </p>
      <ul className="av-rail-list">
        {entries.map((entry) => {
          const { experience } = entry;
          const current = experience.experienceId === selectedId;
          const summary = pickerSummary(entry);
          return (
            <li key={experience.experienceId}>
              <button
                aria-current={current ? "true" : undefined}
                className="av-rail-item"
                onClick={() => onSelect(experience.experienceId)}
                type="button"
              >
                <span aria-hidden="true" className="av-picker-icon">
                  <Icon name={typeIcon(experience.type)} size={18} />
                </span>
                <span className="av-picker-copy">
                  <span className="av-picker-name">
                    <span className="visually-hidden">
                      {experienceTypeLabels[experience.type]}:{" "}
                    </span>
                    {experience.name}
                  </span>
                  <span
                    className="av-picker-sub"
                    data-alert={summary.alert ? "" : undefined}
                  >
                    {summary.text}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Narrow layouts: the title itself opens the list of Menus and Catalogs
 * (a menu with radio items: arrow keys, Enter, Escape).
 */
export function ExperienceSwitcher({
  entries,
  selected,
  onSelect,
}: {
  entries: readonly QueueSnapshot[];
  selected: AvailabilityExperience;
  onSelect: (experienceId: string) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`${selected.name}. Cambiar de Menú o Catálogo`}
          className="av-title-switch"
          type="button"
        >
          <span className="av-title-switch-name">{selected.name}</span>
          <Icon name="chevrons-up-down" size={18} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="kd-dropdown-content av-switch-menu"
          collisionPadding={16}
          sideOffset={8}
        >
          <DropdownMenu.Label className="av-switch-heading">
            Menús y Catálogos
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            onValueChange={onSelect}
            value={selected.experienceId}
          >
            {entries.map((entry) => {
              const { experience } = entry;
              const summary = pickerSummary(entry);
              return (
                <DropdownMenu.RadioItem
                  className="kd-dropdown-item av-switch-item"
                  key={experience.experienceId}
                  value={experience.experienceId}
                >
                  <span aria-hidden="true" className="av-picker-icon">
                    <Icon name={typeIcon(experience.type)} size={17} />
                  </span>
                  <span className="av-picker-copy">
                    <span className="av-picker-name">
                      <span className="visually-hidden">
                        {experienceTypeLabels[experience.type]}:{" "}
                      </span>
                      {experience.name}
                    </span>
                    <span
                      className="av-picker-sub"
                      data-alert={summary.alert ? "" : undefined}
                    >
                      {summary.text}
                    </span>
                  </span>
                  <DropdownMenu.ItemIndicator className="av-switch-check">
                    <Icon name="check" size={16} />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
