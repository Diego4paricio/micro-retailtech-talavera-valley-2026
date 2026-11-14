import { NOTIFICATION_LIMITS } from "@kardo/contracts";
import { useId } from "react";
import { Field } from "../../components/Field.js";
import type { FormErrors, NotificationForm } from "./form.js";
import { categoryLabels, categoryOrder } from "./format.js";

/**
 * Content fields shared by the create page and the edit dialog: category,
 * title, message, optional button, pin, publication and expiry.
 */
export function NotificationFields({
  form,
  errors,
  onChange,
  publish,
}: {
  form: NotificationForm;
  errors: FormErrors;
  onChange: (patch: Partial<NotificationForm>) => void;
  /** `full`: now or later; `date`: only the date (still scheduled); `none`. */
  publish: "full" | "date" | "none";
}) {
  const id = useId();
  return (
    <>
      <Field id={`${id}-category`} label="Categoría">
        <select
          id={`${id}-category`}
          onChange={(event) =>
            onChange({
              category: event.target.value as NotificationForm["category"],
            })
          }
          value={form.category}
        >
          {categoryOrder.map((category) => (
            <option key={category} value={category}>
              {categoryLabels[category]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        counter={{ value: form.title.length, max: NOTIFICATION_LIMITS.title }}
        error={errors.title}
        id={`${id}-title`}
        label="Título"
      >
        <input
          aria-describedby={errors.title ? `${id}-title-error` : undefined}
          id={`${id}-title`}
          maxLength={NOTIFICATION_LIMITS.title + 20}
          onChange={(event) => onChange({ title: event.target.value })}
          value={form.title}
        />
      </Field>

      <Field
        counter={{ value: form.body.length, max: NOTIFICATION_LIMITS.body }}
        error={errors.body}
        hint="Texto simple. Los saltos de línea se conservan y el HTML no funciona."
        id={`${id}-body`}
        label="Mensaje"
      >
        <textarea
          aria-describedby={`${id}-body-${errors.body ? "error" : "hint"}`}
          id={`${id}-body`}
          onChange={(event) => onChange({ body: event.target.value })}
          rows={7}
          value={form.body}
        />
      </Field>

      <fieldset className="ntf-group">
        <legend>Botón (opcional)</legend>
        <div className="form-grid-2">
          <Field
            counter={{
              value: form.actionLabel.length,
              max: NOTIFICATION_LIMITS.actionLabel,
            }}
            id={`${id}-action-label`}
            label="Texto del botón"
          >
            <input
              id={`${id}-action-label`}
              maxLength={NOTIFICATION_LIMITS.actionLabel + 10}
              onChange={(event) =>
                onChange({ actionLabel: event.target.value })
              }
              placeholder="Ver planes"
              value={form.actionLabel}
            />
          </Field>
          <Field
            hint="Una ruta del panel, como /billing, o una dirección https."
            id={`${id}-action-url`}
            label="Destino"
          >
            <input
              autoCapitalize="none"
              id={`${id}-action-url`}
              inputMode="url"
              onChange={(event) => onChange({ actionUrl: event.target.value })}
              placeholder="/billing"
              spellCheck={false}
              value={form.actionUrl}
            />
          </Field>
        </div>
        {errors.action ? (
          <p className="field-error" role="alert">
            {errors.action}
          </p>
        ) : null}
      </fieldset>

      <label className="checkbox-row">
        <input
          checked={form.pinned}
          onChange={(event) => onChange({ pinned: event.target.checked })}
          type="checkbox"
        />
        <span>
          Fijar arriba. Se queda al inicio de la campana mientras no caduque.
        </span>
      </label>

      {publish === "full" ? (
        <fieldset className="ntf-group">
          <legend>Cuándo se publica</legend>
          <label className="checkbox-row">
            <input
              checked={form.publishMode === "now"}
              name={`${id}-publish`}
              onChange={() => onChange({ publishMode: "now" })}
              type="radio"
            />
            <span>Ahora, al guardar</span>
          </label>
          <label className="checkbox-row">
            <input
              checked={form.publishMode === "later"}
              name={`${id}-publish`}
              onChange={() => onChange({ publishMode: "later" })}
              type="radio"
            />
            <span>Programar fecha y hora</span>
          </label>
          {form.publishMode === "later" ? (
            <Field
              error={errors.publishAt}
              id={`${id}-publish-at`}
              label="Fecha de publicación"
            >
              <input
                id={`${id}-publish-at`}
                onChange={(event) =>
                  onChange({ publishAt: event.target.value })
                }
                type="datetime-local"
                value={form.publishAt}
              />
            </Field>
          ) : null}
        </fieldset>
      ) : null}

      {publish === "date" ? (
        <Field
          error={errors.publishAt}
          id={`${id}-publish-at`}
          label="Fecha de publicación"
        >
          <input
            id={`${id}-publish-at`}
            onChange={(event) => onChange({ publishAt: event.target.value })}
            type="datetime-local"
            value={form.publishAt}
          />
        </Field>
      ) : null}

      <Field
        error={errors.expiresAt}
        hint="Si la dejas vacía, la notificación no caduca."
        id={`${id}-expires`}
        label="Caduca"
        optional
      >
        <input
          id={`${id}-expires`}
          onChange={(event) => onChange({ expiresAt: event.target.value })}
          type="datetime-local"
          value={form.expiresAt}
        />
      </Field>
    </>
  );
}
