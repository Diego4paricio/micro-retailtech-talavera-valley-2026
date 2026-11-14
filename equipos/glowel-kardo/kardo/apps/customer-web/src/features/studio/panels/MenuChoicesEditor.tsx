import { MENU_ITEM_CHOICES_MAX } from "@kardo/contracts";
import { useState } from "react";
import { Icon } from "../../../components/Icon.js";
import type { ContentOf } from "../../experiences/content.js";
import { newItemId } from "../../experiences/content.js";

type MenuContent = ContentOf<"menu">;
type MenuItem = MenuContent["sections"][number]["items"][number];
type MenuChoice = NonNullable<MenuItem["choices"]>[number];

/** Drops a key set to `undefined` instead of leaving it in place, like
 * `Inspector.tsx`'s own `withPatch` (the contract forbids an explicit
 * `undefined` on an optional field). */
function withItemPatch(item: MenuItem, patch: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...item };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as MenuItem;
}

function setItem(
  content: MenuContent,
  itemId: string,
  patch: Record<string, unknown>,
): MenuContent {
  return {
    ...content,
    sections: content.sections.map((section) => ({
      ...section,
      items: section.items.map((item) =>
        item.id === itemId ? withItemPatch(item, patch) : item,
      ),
    })),
  };
}

type FlatItem = {
  itemId: string;
  label: string;
  choices: readonly MenuChoice[];
  choicesLabel: string;
};

function flatten(content: MenuContent): FlatItem[] {
  return content.sections.flatMap((section) =>
    section.items.map((item) => ({
      itemId: item.id,
      label: `${section.name.trim() || "Sección sin nombre"} · ${
        item.name.trim() || "Platillo sin nombre"
      }`,
      choices: item.choices ?? [],
      choicesLabel: item.choicesLabel ?? "",
    })),
  );
}

/**
 * "Guisados a elegir" (relevo 37, D1): a precio fijo con varias opciones,
 * como la comida corrida de Doña Rosa, que Disponibilidad agota una por
 * una. The contract (`MenuItem.choices`/`choicesLabel`) and `page-render`
 * already support this; this is where the owner picks the dish and types
 * the short names, right in the Estudio's Contenido panel, next to the rest
 * of the menú.
 */
export function MenuChoicesEditor({
  content,
  onChange,
  readOnly,
}: {
  content: MenuContent;
  onChange: (next: MenuContent) => void;
  readOnly: boolean;
}) {
  const items = flatten(content);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const current =
    items.find((entry) => entry.itemId === pickedId) ?? items[0] ?? null;
  const atMax = (current?.choices.length ?? 0) >= MENU_ITEM_CHOICES_MAX;

  function addChoice() {
    const name = draft.trim();
    if (!current || !name || atMax) return;
    const next: MenuChoice[] = [...current.choices, { id: newItemId(), name }];
    onChange(setItem(content, current.itemId, { choices: next }));
    setDraft("");
  }

  function removeChoice(choiceId: string) {
    if (!current) return;
    const next = current.choices.filter((choice) => choice.id !== choiceId);
    onChange(
      setItem(content, current.itemId, {
        choices: next.length ? next : undefined,
        ...(next.length ? {} : { choicesLabel: undefined }),
      }),
    );
  }

  function setLabel(value: string) {
    if (!current) return;
    onChange(
      setItem(content, current.itemId, {
        choicesLabel: value.trim() ? value : undefined,
      }),
    );
  }

  if (!items.length) return null;

  return (
    <section className="repeatable es-menu-choices">
      <h3>Guisados a elegir</h3>
      <p className="field-hint">
        Para un precio fijo con varias opciones, como la comida corrida: el
        cliente elige uno y Disponibilidad lo agota por su cuenta.
      </p>
      <label className="qrs-control" htmlFor="menu-choices-item">
        <span className="qrs-control-label">Platillo</span>
        <select
          disabled={readOnly}
          id="menu-choices-item"
          onChange={(event) => setPickedId(event.target.value)}
          value={current?.itemId ?? ""}
        >
          {items.map((entry) => (
            <option key={entry.itemId} value={entry.itemId}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      {current ? (
        <div className="field-settings">
          {current.choices.length ? (
            current.choices.map((choice) => (
              <div className="field-setting" key={choice.id}>
                <span>{choice.name}</span>
                {!readOnly ? (
                  <button
                    aria-label={`Quitar ${choice.name}`}
                    className="icon-button"
                    onClick={() => removeChoice(choice.id)}
                    type="button"
                  >
                    <Icon name="close" size={14} />
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="field-setting">
              <span>Sin guisados todavía</span>
            </div>
          )}
        </div>
      ) : null}
      {current && !readOnly ? (
        <>
          <div className="form-grid-item">
            <input
              aria-label="Nombre del guisado"
              className="input"
              disabled={atMax}
              maxLength={120}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addChoice();
                }
              }}
              placeholder="Ej. Mole"
              value={draft}
            />
            <button
              className="button button-secondary button-small"
              disabled={!draft.trim() || atMax}
              onClick={addChoice}
              type="button"
            >
              <Icon name="plus" size={14} /> Agregar guisado
            </button>
          </div>
          {atMax ? (
            <p className="field-hint">
              Hasta {MENU_ITEM_CHOICES_MAX} guisados por platillo.
            </p>
          ) : null}
          {current.choices.length ? (
            <label className="qrs-control" htmlFor="menu-choices-label">
              <span className="qrs-control-label">Etiqueta</span>
              <input
                className="input"
                id="menu-choices-label"
                maxLength={40}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Elige tu guisado"
                value={current.choicesLabel}
              />
            </label>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
