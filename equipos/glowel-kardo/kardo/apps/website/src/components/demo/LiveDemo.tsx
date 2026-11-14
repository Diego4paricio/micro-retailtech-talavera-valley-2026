"use client";

import { type KeyboardEvent, useId, useRef, useState } from "react";
import { demo } from "@/content/demo";
import {
  type DemoBusinessId,
  defaultDemoBusiness,
  demoBusinesses,
  setDemoBusiness,
  useDemoBusiness,
} from "@/lib/demo-business";
import { shops } from "./demo-data";
import { ShopDemo } from "./ShopDemo";
import { StudioDemo } from "./StudioDemo";

/*
  The live demo: three businesses, each with its panel next to a
  customer's phone. The chosen business is shared with the Resumen replica
  (lib/demo-business.ts). A business mounts the first time it is chosen and
  keeps its state after that, so switching back finds it as it was left.
*/

function BusinessDemo({ id }: { id: DemoBusinessId }) {
  if (id === "estudio") return <StudioDemo />;
  return <ShopDemo business={shops[id]} />;
}

export function LiveDemo() {
  const active = useDemoBusiness();
  const [opened, setOpened] = useState<ReadonlySet<DemoBusinessId>>(
    () => new Set([defaultDemoBusiness]),
  );
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  function choose(next: DemoBusinessId) {
    setOpened((current) =>
      current.has(next) ? current : new Set([...current, next]),
    );
    setDemoBusiness(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = demoBusinesses.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    const target = next === undefined ? undefined : demoBusinesses[next];
    if (next === undefined || !target) return;
    event.preventDefault();
    choose(target.id);
    tabs.current[next]?.focus();
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <p className="text-[14px] font-semibold text-muted" id={`${id}-label`}>
          {demo.chooser}
        </p>
        <div
          aria-labelledby={`${id}-label`}
          className="grid grid-cols-3 gap-1 rounded-[1.15rem] bg-paper p-1.5 shadow-[0_1px_2px_rgba(22,35,46,0.05)] ring-1 ring-[#e2ded4] sm:w-[34rem]"
          role="tablist"
        >
          {demoBusinesses.map((business, index) => {
            const selected = business.id === active;
            return (
              <button
                aria-controls={`${id}-panel-${business.id}`}
                aria-selected={selected}
                className={`flex min-h-14 flex-col items-center justify-center rounded-[0.85rem] px-2 py-2 text-center transition-colors ${selected ? "bg-ink text-white" : "text-ink hover:bg-cream"}`}
                id={`${id}-tab-${business.id}`}
                key={business.id}
                onClick={() => choose(business.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                ref={(element) => {
                  tabs.current[index] = element;
                }}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                <span className="font-display text-[15px] leading-tight font-semibold tracking-[-0.01em] sm:text-[16px]">
                  {business.name}
                </span>
                <span
                  className={`mt-0.5 text-[12.5px] leading-tight ${selected ? "text-white/70" : "text-soft"}`}
                >
                  {business.kind}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {demoBusinesses.map((business) => (
        <div
          aria-labelledby={`${id}-tab-${business.id}`}
          className="mt-8 lg:mt-10"
          hidden={business.id !== active}
          id={`${id}-panel-${business.id}`}
          key={business.id}
          role="tabpanel"
        >
          {opened.has(business.id) || business.id === active ? (
            <BusinessDemo id={business.id} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
