import { type Asset, MENU_ITEM_CHOICES_MAX } from "@kardo/contracts";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { assetsApi } from "../../../api/assets.js";
import { AssetSelect } from "../../../components/FormFields.js";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { useAssetImage } from "../../../lib/asset-images.js";
import { useResource } from "../../../lib/use-resource.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { newItemId } from "../content.js";
import {
  emptyRow,
  type FirstPageType,
  filledRows,
  type ItemRow,
  mergeSections,
  parsePastedList,
  rowPriceError,
  type SectionRows,
} from "./pasted-list.js";
import "./quick-items.css";

const CHOICES_LABEL_MAX = 40;
const CHOICE_NAME_MAX = 60;

type Mode = "rows" | "paste";

/**
 * Quick capture of a Menú's dishes or a Catálogo's products: rows of name
 * and price (Enter adds the next one, cursor on the name), sections on a
 * Menú, and a «Pegar mi lista» tab for a list already written (relevo 37
 * C5a/C5b: nobody noticed the link at the bottom; 6 owners gave up typing
 * one by one). Lives with Páginas (domain audit A2-28); used by Primeros pasos and «Editar productos y precios»
 * (`experiences/EditItemsDialog.tsx`). The rows come from and go to the
 * content with `rowsFromContent` and `contentFromRows` (`items/rows.ts`); the paste reader itself is the pure `parsePastedList`
 * (`pasted-list.ts`).
 */
export function QuickItemsEditor({
  type,
  noun,
  sections,
  onChange,
  defaultSection,
}: {
  type: FirstPageType;
  /** "platillo" / "platillos", "servicio" / "servicios"… */
  noun: { one: string; many: string };
  sections: SectionRows[];
  onChange: Dispatch<SetStateAction<SectionRows[]>>;
  /** The name a Menú section gets when the owner leaves it empty. */
  defaultSection: string;
}) {
  const [mode, setMode] = useState<Mode>("rows");
  const [pasted, setPasted] = useState("");
  const focusRow = useRef<string | null>(null);
  const priceErrors = sections
    .flatMap((section) => filledRows(section.rows))
    .some(rowPriceError);
  const tabsId = useId();
  const rowsTabId = `${tabsId}-rows-tab`;
  const pasteTabId = `${tabsId}-paste-tab`;

  // D3: a photo per dish or product, from Archivos or just uploaded.
  const { workspace } = useWorkspace();
  const assetsResource = useResource(`qie-assets:${workspace.id}`, (signal) =>
    assetsApi.list(workspace.id, signal),
  );
  const assets = assetsResource.data ?? [];
  const onAssetUploaded = (asset: Asset) =>
    assetsResource.setData((current) => [asset, ...(current ?? [])]);

  // D1: «Menú del día» — guisados a elegir, a Menú dish only.
  const [openChoices, setOpenChoices] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [choiceDrafts, setChoiceDrafts] = useState<Record<string, string>>({});
  const choicesOpen = (row: ItemRow) =>
    openChoices.has(row.id) || Boolean(row.choices?.length);

  // The row just added gets the cursor (after it renders).
  useEffect(() => {
    if (!focusRow.current) return;
    document.getElementById(`qie-row-${focusRow.current}`)?.focus();
    focusRow.current = null;
  });

  function updateSection(
    sectionId: string,
    recipe: (section: SectionRows) => SectionRows,
  ) {
    onChange((current) =>
      current.map((section) =>
        section.id === sectionId ? recipe(section) : section,
      ),
    );
  }
  function updateRow(
    sectionId: string,
    rowId: string,
    recipe: (row: ItemRow) => ItemRow,
  ) {
    updateSection(sectionId, (section) => ({
      ...section,
      rows: section.rows.map((row) => (row.id === rowId ? recipe(row) : row)),
    }));
  }
  function setImageAssetId(
    sectionId: string,
    rowId: string,
    imageAssetId: string,
  ) {
    updateRow(sectionId, rowId, (row) => {
      if (imageAssetId) return { ...row, imageAssetId };
      const { imageAssetId: _gone, ...rest } = row;
      return rest;
    });
  }
  function addChoice(sectionId: string, row: ItemRow) {
    const name = (choiceDrafts[row.id] ?? "").trim().slice(0, CHOICE_NAME_MAX);
    if (!name || (row.choices?.length ?? 0) >= MENU_ITEM_CHOICES_MAX) return;
    updateRow(sectionId, row.id, (current) => ({
      ...current,
      choices: [...(current.choices ?? []), { id: newItemId(), name }],
    }));
    setChoiceDrafts((current) => ({ ...current, [row.id]: "" }));
  }
  function removeChoice(sectionId: string, rowId: string, choiceId: string) {
    updateRow(sectionId, rowId, (row) => {
      const remaining = (row.choices ?? []).filter(
        (choice) => choice.id !== choiceId,
      );
      if (remaining.length) return { ...row, choices: remaining };
      const { choices: _gone, ...rest } = row;
      return rest;
    });
  }
  function setChoicesLabel(sectionId: string, rowId: string, label: string) {
    updateRow(sectionId, rowId, (row) => {
      const next = label.slice(0, CHOICES_LABEL_MAX);
      if (next.trim()) return { ...row, choicesLabel: next };
      const { choicesLabel: _gone, ...rest } = row;
      return rest;
    });
  }
  function clearChoices(sectionId: string, rowId: string) {
    updateRow(sectionId, rowId, (row) => {
      const { choices: _c, choicesLabel: _l, ...rest } = row;
      return rest;
    });
    setOpenChoices((current) => {
      if (!current.has(rowId)) return current;
      const next = new Set(current);
      next.delete(rowId);
      return next;
    });
  }
  function addRow(sectionId: string) {
    const row = emptyRow();
    focusRow.current = row.id;
    updateSection(sectionId, (section) => ({
      ...section,
      rows: [...section.rows, row],
    }));
  }
  function addSection() {
    const row = emptyRow();
    focusRow.current = row.id;
    onChange((current) => [
      ...current,
      {
        id: crypto.randomUUID().replaceAll("-", "").slice(0, 12),
        name: "",
        rows: [row],
      },
    ]);
  }
  function applyPasted() {
    const parsed = parsePastedList(pasted, type, defaultSection);
    if (!parsed.length) return;
    onChange((current) => mergeSections(current, parsed));
    setPasted("");
    setMode("rows");
  }
  const one = capitalize(noun.one);
  const example = exampleFor(type, noun.one);

  return (
    <div className="qie">
      <div className="qie-tabs" role="tablist">
        <button
          aria-controls={`${tabsId}-rows-panel`}
          aria-selected={mode === "rows"}
          className="qie-tab"
          id={rowsTabId}
          onClick={() => setMode("rows")}
          role="tab"
          type="button"
        >
          Escribir uno por uno
        </button>
        <button
          aria-controls={`${tabsId}-paste-panel`}
          aria-selected={mode === "paste"}
          className="qie-tab"
          id={pasteTabId}
          onClick={() => setMode("paste")}
          role="tab"
          type="button"
        >
          Pegar mi lista
        </button>
      </div>

      {mode === "paste" ? (
        <div
          aria-labelledby={pasteTabId}
          className="fs-paste"
          id={`${tabsId}-paste-panel`}
          role="tabpanel"
        >
          <label htmlFor="qie-paste">
            Pega tu lista: un {noun.one} por renglón, con su precio al final
          </label>
          <textarea
            className="input"
            id="qie-paste"
            onChange={(event) => setPasted(event.target.value)}
            placeholder={
              type === "menu"
                ? "Desayunos:\nChilaquiles verdes $75\nMolletes $55"
                : `${example} $450`
            }
            rows={5}
            value={pasted}
          />
          <div className="fs-paste-actions">
            <button
              className="button button-primary"
              disabled={!pasted.trim()}
              onClick={applyPasted}
              type="button"
            >
              Acomodar mi lista
            </button>
          </div>
        </div>
      ) : (
        <div
          aria-labelledby={rowsTabId}
          id={`${tabsId}-rows-panel`}
          role="tabpanel"
        >
          {sections.map((section) => (
            <fieldset className="fs-section" key={section.id}>
              {type === "menu" ? (
                <label className="fs-section-name">
                  <span className="visually-hidden">Nombre de la sección</span>
                  <input
                    className="input"
                    onChange={(event) =>
                      updateSection(section.id, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Sección, por ejemplo Desayunos"
                    value={section.name}
                  />
                </label>
              ) : null}
              <div aria-hidden="true" className="fs-row fs-row-head">
                <span>{one}</span>
                <span>Precio</span>
              </div>
              {section.rows.map((row, index) => (
                <div className="qie-item" key={row.id}>
                  <div className="fs-row">
                    <input
                      aria-label={`${one} ${index + 1}`}
                      className="input"
                      id={`qie-row-${row.id}`}
                      maxLength={120}
                      onChange={(event) =>
                        updateSection(section.id, (current) => ({
                          ...current,
                          rows: current.rows.map((item) =>
                            item.id === row.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        }))
                      }
                      placeholder={index === 0 ? example : `Otro ${noun.one}`}
                      value={row.name}
                    />
                    <label
                      className={
                        rowPriceError(row)
                          ? "fs-price fs-price-invalid"
                          : "fs-price"
                      }
                    >
                      <span aria-hidden="true">$</span>
                      <input
                        aria-invalid={rowPriceError(row) || undefined}
                        aria-label={`Precio de ${row.name.trim() || `${noun.one} ${index + 1}`}`}
                        className="input"
                        inputMode="decimal"
                        onChange={(event) =>
                          updateSection(section.id, (current) => ({
                            ...current,
                            rows: current.rows.map((item) =>
                              item.id === row.id
                                ? { ...item, price: event.target.value }
                                : item,
                            ),
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addRow(section.id);
                          }
                        }}
                        value={row.price}
                      />
                    </label>
                    <button
                      aria-label={`Quitar ${row.name.trim() || `renglón ${index + 1}`}`}
                      className="icon-button"
                      disabled={section.rows.length === 1 && !row.name}
                      onClick={() =>
                        updateSection(section.id, (current) => ({
                          ...current,
                          rows:
                            current.rows.length > 1
                              ? current.rows.filter(
                                  (item) => item.id !== row.id,
                                )
                              : [emptyRow()],
                        }))
                      }
                      type="button"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="qie-item-tools">
                    <details className="item-photo qie-item-photo">
                      <summary className="item-photo-summary">
                        {row.imageAssetId ? (
                          <QiePhotoThumb
                            assetId={row.imageAssetId}
                            workspaceId={workspace.id}
                          />
                        ) : (
                          <Icon name="asset" size={14} />
                        )}
                        Foto
                        <Icon
                          className="item-photo-chevron"
                          name="chevron-down"
                          size={14}
                        />
                      </summary>
                      <div className="item-photo-body">
                        <AssetSelect
                          assets={assets}
                          id={`qie-photo-${row.id}`}
                          kind="image"
                          label="Foto"
                          onAssetUploaded={onAssetUploaded}
                          onChange={(imageAssetId) =>
                            setImageAssetId(section.id, row.id, imageAssetId)
                          }
                          optional
                          readOnly={false}
                          value={row.imageAssetId}
                        />
                      </div>
                    </details>
                    {type === "menu" && !choicesOpen(row) ? (
                      <button
                        className="link-button"
                        onClick={() =>
                          setOpenChoices((current) =>
                            new Set(current).add(row.id),
                          )
                        }
                        type="button"
                      >
                        Tiene guisados a elegir
                      </button>
                    ) : null}
                  </div>
                  {type === "menu" && choicesOpen(row) ? (
                    <div className="qie-choices">
                      <p className="qie-choices-title">Guisados a elegir</p>
                      <label className="qie-choices-label">
                        <span className="visually-hidden">
                          Etiqueta de las opciones
                        </span>
                        <input
                          className="input"
                          maxLength={CHOICES_LABEL_MAX}
                          onChange={(event) =>
                            setChoicesLabel(
                              section.id,
                              row.id,
                              event.target.value,
                            )
                          }
                          placeholder="Elige tu guisado"
                          value={row.choicesLabel ?? ""}
                        />
                      </label>
                      {row.choices?.length ? (
                        <ul className="qie-choice-list">
                          {row.choices.map((choice) => (
                            <li className="qie-choice-chip" key={choice.id}>
                              <span>{choice.name}</span>
                              <button
                                aria-label={`Quitar ${choice.name}`}
                                className="icon-button"
                                onClick={() =>
                                  removeChoice(section.id, row.id, choice.id)
                                }
                                type="button"
                              >
                                <Icon name="close" size={13} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="qie-choice-add">
                        <input
                          aria-label={`Agregar guisado a ${row.name.trim() || `${one} ${index + 1}`}`}
                          className="input"
                          disabled={
                            (row.choices?.length ?? 0) >= MENU_ITEM_CHOICES_MAX
                          }
                          maxLength={CHOICE_NAME_MAX}
                          onChange={(event) =>
                            setChoiceDrafts((current) => ({
                              ...current,
                              [row.id]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addChoice(section.id, row);
                            }
                          }}
                          placeholder={
                            (row.choices?.length ?? 0) >= MENU_ITEM_CHOICES_MAX
                              ? "Máximo 12 guisados"
                              : "Agregar guisado, por ejemplo Mole"
                          }
                          value={choiceDrafts[row.id] ?? ""}
                        />
                      </div>
                      <button
                        className="link-button qie-choices-remove"
                        onClick={() => clearChoices(section.id, row.id)}
                        type="button"
                      >
                        Quitar guisados a elegir
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              <button
                className="button button-secondary qie-add-row"
                onClick={() => addRow(section.id)}
                type="button"
              >
                <Icon name="plus" size={17} /> Otro {noun.one}
              </button>
            </fieldset>
          ))}
          {type === "menu" ? (
            <button
              className="button button-secondary"
              onClick={addSection}
              type="button"
            >
              <Icon name="plus" size={15} /> Otra sección
            </button>
          ) : null}
        </div>
      )}

      {priceErrors ? (
        <Notice tone="warning">
          Revisa los precios marcados: escribe solo el número, por ejemplo 75.
        </Notice>
      ) : null}
    </div>
  );
}

/** Rows that will be saved and whether a price does not read as one. */
export function quickItemsSummary(sections: readonly SectionRows[]): {
  filled: number;
  priceErrors: boolean;
} {
  const filled = sections.flatMap((section) => filledRows(section.rows));
  return { filled: filled.length, priceErrors: filled.some(rowPriceError) };
}

function exampleFor(type: FirstPageType, one: string): string {
  if (type === "menu") return "Ej. Chilaquiles verdes";
  if (one === "servicio") return "Ej. Uñas acrílicas";
  return `Ej. Tu primer ${one}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The row's small photo (D3): a thumbnail, or the asset icon while it
 * loads. Kept tiny so the row never grows on a phone. */
function QiePhotoThumb({
  workspaceId,
  assetId,
}: {
  workspaceId: string;
  assetId: string;
}) {
  const { url } = useAssetImage(workspaceId, assetId, "thumb");
  return (
    <span aria-hidden="true" className="qie-photo-thumb">
      {url ? (
        <img alt="" decoding="async" src={url} />
      ) : (
        <Icon name="asset" size={14} />
      )}
    </span>
  );
}
