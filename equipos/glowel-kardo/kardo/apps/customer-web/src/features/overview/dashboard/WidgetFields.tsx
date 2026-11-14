import { Switch } from "radix-ui";
import { useId } from "react";
import { Icon } from "../../../components/Icon.js";
import { type KpiMetric, kpiDefinitions } from "./catalog.js";
import type {
  ConfigField,
  WidgetConfig,
  WidgetDefinition,
  WidgetType,
} from "./types.js";

/** What a field's current choice means, when it needs saying (the KPI's
 * indicator: its definition). */
function fieldHints(
  type: WidgetType,
  config: WidgetConfig,
): Partial<Record<string, string>> {
  if (type !== "kpi") return {};
  const metric = String(config.metric ?? "");
  return metric in kpiDefinitions
    ? { metric: kpiDefinitions[metric as KpiMetric] }
    : {};
}

/**
 * A widget's options from the catalog (selects and switches), shared by the
 * gallery's setup step and the editor of a widget on the board.
 */
export function WidgetFields({
  definition,
  config,
  onChange,
}: {
  definition: WidgetDefinition;
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
}) {
  const hints = fieldHints(definition.type, config);
  return (
    <div className="db-fields">
      {definition.fields.map((field) => (
        <FieldControl
          field={field}
          hint={hints[field.key]}
          key={field.key}
          onChange={(value) => onChange({ ...config, [field.key]: value })}
          value={config[field.key]}
        />
      ))}
    </div>
  );
}

function FieldControl({
  field,
  value,
  hint,
  onChange,
}: {
  field: ConfigField;
  value: WidgetConfig[string] | undefined;
  hint: string | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const id = useId();
  const hintId = useId();
  if (field.kind === "toggle") {
    const toggleHint = hint ?? field.hint;
    return (
      <div className="db-field db-field-toggle">
        <label htmlFor={id}>
          <strong>{field.label}</strong>
          {toggleHint ? <small id={hintId}>{toggleHint}</small> : null}
        </label>
        <Switch.Root
          aria-describedby={toggleHint ? hintId : undefined}
          checked={value === true}
          className="kd-switch"
          id={id}
          onCheckedChange={(checked) => onChange(checked === true)}
        >
          <Switch.Thumb className="kd-switch-thumb" />
        </Switch.Root>
      </div>
    );
  }
  return (
    <div className="db-field">
      <label htmlFor={id}>{field.label}</label>
      <span className="db-select">
        <select
          aria-describedby={hint ? hintId : undefined}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          value={String(value ?? field.options[0]?.value ?? "")}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon className="db-select-caret" name="chevron-down" size={15} />
      </span>
      {hint ? (
        <small className="db-field-hint" id={hintId}>
          {hint}
        </small>
      ) : null}
    </div>
  );
}
