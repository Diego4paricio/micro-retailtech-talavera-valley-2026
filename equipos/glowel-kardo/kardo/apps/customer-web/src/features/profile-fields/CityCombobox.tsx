import { useId, useState } from "react";
import { searchCities } from "./mx-cities.js";

/**
 * The city, searched (owner, 2026-10-03): typing two or three letters
 * offers Mexican cities with their state, without minding accents. What
 * the owner typed stays if their town is not on the list. Outside Mexico
 * it is a plain text field.
 *
 *   <CityCombobox id="fs-city" value={city} onChange={setCity} />
 */
export function CityCombobox({
  id,
  value,
  onChange,
  country = "MX",
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  country?: string | undefined;
  describedBy?: string | undefined;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const results = country === "MX" && open ? searchCities(value) : [];
  // Nothing to offer once the text is exactly the one city it found.
  const shown =
    results.length === 1 && results[0]?.value === value ? [] : results;
  const expanded = shown.length > 0;

  function choose(index: number) {
    const city = shown[index];
    if (!city) return;
    onChange(city.value);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="city-combobox">
      <input
        aria-activedescendant={
          expanded && active >= 0 ? `${listId}-${active}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={listId}
        aria-describedby={describedBy}
        aria-expanded={expanded}
        autoComplete="off"
        className="input"
        id={id}
        maxLength={120}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(event) => {
          setOpen(true);
          // On a phone the keyboard would cover the list: bring the field up.
          if (window.matchMedia("(max-width: 40rem)").matches)
            event.target.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        onKeyDown={(event) => {
          if (!expanded) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => (current + 1) % shown.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) =>
              current <= 0 ? shown.length - 1 : current - 1,
            );
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            choose(active);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={country === "MX" ? "Busca tu ciudad, ej. Puebla" : ""}
        role="combobox"
        value={value}
      />
      {expanded ? (
        <div className="city-combobox-list" id={listId} role="listbox">
          {shown.map((city, index) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the field moves through the options with the arrow keys (aria-activedescendant)
            <div
              aria-selected={index === active}
              className="city-combobox-option"
              id={`${listId}-${index}`}
              key={city.value}
              // Keeps the focus in the field, so the list does not close
              // before the choice lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              role="option"
              tabIndex={-1}
            >
              <strong>{city.name}</strong>
              <span className="city-combobox-state">{city.state}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
