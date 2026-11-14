import {
  type AvailabilityItem,
  ITEM_QUANTITY_MAX,
  type ItemAvailabilityStatus,
} from "@kardo/contracts";
import { RadioGroup } from "radix-ui";
import {
  type KeyboardEvent,
  memo,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "../../components/Icon.js";
import { formatPrice } from "../../lib/format.js";
import { ItemThumb } from "./ItemThumb.js";
import {
  type ItemState,
  itemBadge,
  parseQuantityInput,
  publicState,
  relativeTime,
  startCounting,
  statusLabels,
  stopCounting,
  withQuantity,
  withStatus,
} from "./model.js";

const statusOptions: { value: ItemAvailabilityStatus; icon: IconName }[] = [
  { value: "available", icon: "circle-check" },
  { value: "sold_out", icon: "sold-out" },
  { value: "hidden", icon: "eye-off" },
];

const badgeIcons: Partial<Record<string, IconName>> = {
  "sold-out": "sold-out",
  hidden: "eye-off",
};

export const ItemRow = memo(function ItemRow({
  item,
  currency,
  typeIcon,
  workspaceId,
  canChange,
  failed,
  now,
  onChange,
  onEditPrice,
  choices,
  failedIds,
  showThumb = true,
}: {
  item: AvailabilityItem;
  currency: string;
  typeIcon: IconName;
  workspaceId: string;
  canChange: boolean;
  failed: boolean;
  now: number;
  onChange: (itemId: string, next: ItemState) => void;
  /** «Cambiar precio»; absent for whoever cannot edit the page. */
  onEditPrice?: ((item: AvailabilityItem) => void) | undefined;
  /** The dish's guisados (D1, relevo 37), inside its card. */
  choices?: readonly AvailabilityItem[] | undefined;
  /** Which guisados did not save. */
  failedIds?: ReadonlySet<string> | undefined;
  /** False when no item of the page has a photo: no empty box. */
  showThumb?: boolean | undefined;
}) {
  const visible = publicState(item);
  const badge = itemBadge(item);
  const badgeIcon = badge ? badgeIcons[badge.tone] : undefined;
  const change = (next: ItemState) => onChange(item.id, next);
  const counting = item.quantity !== null;
  const startRef = useRef<HTMLButtonElement>(null);
  // Where focus goes after the count swaps between its link and its stepper.
  const focusAfter = useRef<"input" | "start" | null>(null);

  return (
    <li
      className="av-item"
      data-failed={failed ? "" : undefined}
      data-state={visible}
      data-thumb={showThumb ? "" : undefined}
    >
      {showThumb ? (
        <ItemThumb
          assetId={item.imageAssetId}
          icon={typeIcon}
          workspaceId={workspaceId}
        />
      ) : null}
      <div className="av-item-main">
        <div className="av-item-title">
          <strong className="av-item-name">{item.name}</strong>
          {badge ? (
            <span className="av-badge" data-tone={badge.tone}>
              {badgeIcon ? <Icon name={badgeIcon} size={13} /> : null}
              {badge.label}
            </span>
          ) : null}
        </div>
        {item.description ? (
          <p className="av-item-desc">{item.description}</p>
        ) : null}
        {item.price !== undefined ||
        item.updatedAt ||
        failed ||
        onEditPrice ||
        (canChange && !counting) ? (
          <p className="av-item-meta">
            {onEditPrice ? (
              <button
                aria-label={
                  item.price !== undefined
                    ? `Cambiar el precio de ${item.name}`
                    : `Poner precio a ${item.name}`
                }
                className="av-item-price av-item-price-edit"
                onClick={() => onEditPrice(item)}
                type="button"
              >
                {item.price !== undefined
                  ? formatPrice(item.price, currency)
                  : "Poner precio"}
                <Icon className="av-item-price-icon" name="edit" size={13} />
              </button>
            ) : item.price !== undefined ? (
              <span className="av-item-price">
                {formatPrice(item.price, currency)}
              </span>
            ) : null}
            {canChange && !counting ? (
              // A quiet link next to the price, not a full-width box under
              // every item (simplified after round 4).
              <button
                aria-label={`Contar piezas de ${item.name}`}
                className="av-count-start"
                onClick={() => {
                  focusAfter.current = "input";
                  change(startCounting(item));
                }}
                ref={startRef}
                type="button"
              >
                <Icon name="plus" size={14} />
                <span>Contar piezas</span>
              </button>
            ) : null}
            {item.updatedAt ? (
              <span>Actualizado {relativeTime(item.updatedAt, now)}</span>
            ) : null}
            {failed ? (
              <span className="av-item-failed">
                <Icon name="circle-alert" size={14} /> No se guardó
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="av-item-controls">
        <RadioGroup.Root
          aria-label={`Estado de ${item.name}`}
          className="av-status"
          disabled={!canChange}
          loop
          onValueChange={(value) => {
            if (value)
              change(withStatus(item, value as ItemAvailabilityStatus));
          }}
          orientation="horizontal"
          value={visible}
        >
          {statusOptions.map((option) => (
            <RadioGroup.Item
              className="av-status-option"
              data-tone={option.value}
              key={option.value}
              value={option.value}
            >
              <Icon name={option.icon} size={16} />
              <span>{statusLabels[option.value]}</span>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
        <QuantityControl
          canChange={canChange}
          focusAfter={focusAfter}
          itemName={item.name}
          onChange={change}
          startRef={startRef}
          state={item}
        />
      </div>
      {choices?.length ? (
        <ChoiceList
          canChange={canChange}
          choices={choices}
          failedIds={failedIds}
          onChange={onChange}
        />
      ) : null}
    </li>
  );
});

/**
 * A dish's guisados inside its card, each with only «Hay» and «Se acabó»
 * (relevo 37, round 3, second pass: as separate cards with the dish's same
 * three buttons, Rosa tapped the dish's «Agotado» to sell out the mole,
 * and her whole comida corrida showed as sold out). No pieces to count: a
 * guisado runs out, it is not counted.
 */
function ChoiceList({
  choices,
  canChange,
  failedIds,
  onChange,
}: {
  choices: readonly AvailabilityItem[];
  canChange: boolean;
  failedIds?: ReadonlySet<string> | undefined;
  onChange: (itemId: string, next: ItemState) => void;
}) {
  return (
    <div className="av-choices">
      <p className="av-choices-head">
        Guisados: si se acaba uno, márcalo aquí. El platillo sigue a la venta.
      </p>
      <ul className="av-choice-list">
        {choices.map((choice) => {
          const visible = publicState(choice);
          return (
            <li
              className="av-choice"
              data-failed={failedIds?.has(choice.id) ? "" : undefined}
              data-state={visible}
              key={choice.id}
            >
              <span className="av-choice-name">{choice.name}</span>
              {failedIds?.has(choice.id) ? (
                <span className="av-item-failed">
                  <Icon name="circle-alert" size={14} /> No se guardó
                </span>
              ) : null}
              <RadioGroup.Root
                aria-label={`¿Hay ${choice.name}?`}
                className="av-status av-choice-status"
                disabled={!canChange}
                loop
                onValueChange={(value) => {
                  if (value)
                    onChange(
                      choice.id,
                      withStatus(choice, value as ItemAvailabilityStatus),
                    );
                }}
                orientation="horizontal"
                value={visible === "hidden" ? "" : visible}
              >
                {choiceOptions.map((option) => (
                  <RadioGroup.Item
                    className="av-status-option"
                    data-tone={option.value}
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </RadioGroup.Item>
                ))}
              </RadioGroup.Root>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const choiceOptions: { value: ItemAvailabilityStatus; label: string }[] = [
  { value: "available", label: "Hay" },
  { value: "sold_out", label: "Se acabó" },
];

/**
 * "Contar piezas": off, a link next to the price (in `ItemRow`); on, a
 * stepper (− N +) whose number can also be typed, plus a way to stop
 * counting.
 */
function QuantityControl({
  state,
  itemName,
  canChange,
  onChange,
  focusAfter,
  startRef,
}: {
  state: ItemState;
  itemName: string;
  canChange: boolean;
  onChange: (next: ItemState) => void;
  /** Set by whoever swaps the count on or off, read once it has swapped. */
  focusAfter: RefObject<"input" | "start" | null>;
  /** The «Contar piezas» link, back in view when counting stops. */
  startRef: RefObject<HTMLButtonElement | null>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // What is being typed; null shows the saved number.
  const [draft, setDraft] = useState<string | null>(null);
  const counting = state.quantity !== null;

  useEffect(() => {
    if (counting && focusAfter.current === "input") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (!counting && focusAfter.current === "start")
      startRef.current?.focus();
    focusAfter.current = null;
  }, [counting, focusAfter, startRef]);

  if (!counting) return null;

  const quantity = state.quantity ?? 0;
  const commit = (value: number) => {
    setDraft(null);
    onChange(withQuantity(state, value));
  };
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      commit(quantity + (event.key === "ArrowUp" ? 1 : -1));
    } else if (event.key === "Enter") event.currentTarget.blur();
  }

  return (
    <div className="av-count-slot">
      <div className="av-count">
        <fieldset className="av-stepper">
          <legend className="visually-hidden">Piezas de {itemName}</legend>
          <button
            aria-label="Una pieza menos"
            className="av-step"
            disabled={!canChange || quantity <= 0}
            onClick={() => commit(quantity - 1)}
            type="button"
          >
            <Icon name="minus" size={16} />
          </button>
          <input
            aria-label={`Piezas que quedan de ${itemName}`}
            autoComplete="off"
            className="av-step-input"
            disabled={!canChange}
            enterKeyHint="done"
            inputMode="numeric"
            maxLength={4}
            onBlur={() => setDraft(null)}
            onChange={(event) => {
              const typed = event.target.value.replace(/\D/g, "").slice(0, 4);
              setDraft(typed);
              const next = parseQuantityInput(typed);
              if (next !== null) onChange(withQuantity(state, next));
            }}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={onKeyDown}
            pattern="[0-9]*"
            ref={inputRef}
            type="text"
            value={draft ?? String(quantity)}
          />
          <button
            aria-label="Una pieza más"
            className="av-step"
            disabled={!canChange || quantity >= ITEM_QUANTITY_MAX}
            onClick={() => commit(quantity + 1)}
            type="button"
          >
            <Icon name="plus" size={16} />
          </button>
        </fieldset>
        {canChange ? (
          <button
            aria-label={`Dejar de contar piezas de ${itemName}`}
            className="icon-button av-count-stop"
            onClick={() => {
              focusAfter.current = "start";
              setDraft(null);
              onChange(stopCounting(state));
            }}
            title="Dejar de contar"
            type="button"
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
