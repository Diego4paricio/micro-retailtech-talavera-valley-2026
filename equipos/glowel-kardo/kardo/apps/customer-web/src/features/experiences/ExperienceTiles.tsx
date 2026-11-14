import type { ExperienceSummary, ExperienceType } from "@kardo/contracts";
import { useId, useMemo, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { PageTypeIcon } from "../onboarding/first-steps-icons.js";
import { ExperienceThumb } from "./ExperienceThumb.js";
import { experienceTypeShortLabels } from "./labels.js";
import "./experience-tiles.css";

/** From this many on, the tiles get a search box and type filters. */
const manyFrom = 9;

/** Short type names for the tiles and the filters (kept here for the
 * Estudio's start screen; the dictionary lives in `labels.ts`). */
export const shortTypeLabels = experienceTypeShortLabels;

/** What a link can show: every live Experience but a redirect, newest
 * first. */
export function linkableExperiences(
  experiences: readonly ExperienceSummary[],
): ExperienceSummary[] {
  return experiences
    .filter((item) => !item.archivedAt && item.type !== "redirect")
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * «¿Qué muestra?» (Links redesign, relevo 34): every Experience as a tile
 * with the top of its real page, its type and its name. «Crear una nueva»
 * is one more tile. With many, search and filter by type.
 */
export function ExperienceTiles({
  experiences,
  value,
  onChange,
  current,
  places,
  onCreateNew,
  label = "¿Qué muestra?",
}: {
  experiences: readonly ExperienceSummary[];
  value: string | null;
  onChange: (experienceId: string) => void;
  /** The one the link shows now: marked «Ahora». */
  current?: string | null | undefined;
  /** Experience id → where it already shows («/menu», «Mesa 1 y 2 más»),
   * from `experiencePlaces` (domain audit A9-8). */
  places?: ReadonlyMap<string, string> | undefined;
  onCreateNew?: (() => void) | undefined;
  label?: string | undefined;
}) {
  const name = useId();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ExperienceType | "all">("all");
  const many = experiences.length >= manyFrom;
  const types = useMemo(
    () => [...new Set(experiences.map((item) => item.type))],
    [experiences],
  );
  const shown = useMemo(() => {
    if (!many) return experiences;
    const words = plain(query.trim());
    return experiences.filter(
      (item) =>
        (type === "all" || item.type === type) &&
        (!words || plain(item.name).includes(words)),
    );
  }, [experiences, many, query, type]);

  return (
    <div className="xp-pick">
      <div className="xp-pick-head">
        <h3 className="xp-pick-title">{label}</h3>
        {many ? (
          <>
            <label className="xp-search">
              <Icon name="search" size={16} />
              <span className="visually-hidden">Buscar</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar"
                type="search"
                value={query}
              />
            </label>
            <fieldset className="xp-chips">
              <legend className="visually-hidden">Filtrar por tipo</legend>
              {(["all", ...types] as const).map((item) => (
                <button
                  aria-pressed={type === item}
                  className="xp-chip"
                  key={item}
                  onClick={() => setType(item)}
                  type="button"
                >
                  {item === "all" ? "Todas" : shortTypeLabels[item]}
                </button>
              ))}
            </fieldset>
          </>
        ) : null}
      </div>
      <fieldset className="xp-tiles-group">
        <legend className="visually-hidden">{label}</legend>
        <ul className="xp-tiles">
          {onCreateNew ? (
            <li>
              <button
                className="xp-tile xp-tile-new"
                onClick={onCreateNew}
                type="button"
              >
                <span aria-hidden="true" className="xp-tile-plus">
                  <Icon name="plus" size={18} />
                </span>
                Crear una nueva
              </button>
            </li>
          ) : null}
          {shown.map((item) => {
            const elsewhere = item.id !== current ? places?.get(item.id) : null;
            return (
              <li key={item.id}>
                <label
                  className={
                    item.id === value ? "xp-tile is-checked" : "xp-tile"
                  }
                >
                  <input
                    checked={item.id === value}
                    className="visually-hidden"
                    name={name}
                    onChange={() => onChange(item.id)}
                    type="radio"
                    value={item.id}
                  />
                  <ExperienceThumb
                    className="xp-tile-thumb"
                    experience={item}
                  />
                  {item.id === current ? (
                    <span className="xp-tile-now">Ahora</span>
                  ) : null}
                  <span aria-hidden="true" className="xp-tile-check">
                    <Icon name="check" size={14} />
                  </span>
                  <span className="xp-tile-meta">
                    <span aria-hidden="true" className="xp-tile-icon">
                      <PageTypeIcon type={item.type} />
                    </span>
                    <span className="xp-tile-text">
                      <strong>{item.name}</strong>
                      <small>
                        {elsewhere
                          ? `En ${elsewhere}`
                          : shortTypeLabels[item.type]}
                      </small>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {many && !shown.length ? (
        <p className="xp-none">Nada coincide con «{query}».</p>
      ) : null}
    </div>
  );
}
