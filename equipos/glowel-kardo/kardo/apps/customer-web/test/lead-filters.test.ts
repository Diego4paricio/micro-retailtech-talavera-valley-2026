import { describe, expect, it } from "vitest";
import {
  leadFilterChipLabel,
  leadFilterLabels,
  leadFilterOrder,
  leadsEmptyState,
} from "../src/features/leads/lead-filters.js";

describe("lead filters (C3d: se ven como filtros, no como el estado)", () => {
  it("orders «Por atender» first, «Todas» last", () => {
    expect(leadFilterOrder).toEqual(["new", "contacted", "closed", "all"]);
  });

  it("uses its own words, distintas de las del estado (Nueva/Atendida/Cerrada)", () => {
    expect(leadFilterLabels).toEqual({
      new: "Por atender",
      contacted: "Atendidas",
      closed: "Cerradas",
      all: "Todas",
    });
  });

  it("adds the count only to «Por atender», when known", () => {
    expect(leadFilterChipLabel("new", "3")).toBe("Por atender · 3");
    expect(leadFilterChipLabel("new", null)).toBe("Por atender");
    expect(leadFilterChipLabel("contacted", "3")).toBe("Atendidas");
    expect(leadFilterChipLabel("all", "3")).toBe("Todas");
  });
});

describe("leadsEmptyState (C3d: cada filtro con su vacío)", () => {
  it("says «Aún no hay solicitudes» only for «Todas» without a QR filter", () => {
    const empty = leadsEmptyState("all", false);
    expect(empty.title).toBe("Aún no hay solicitudes");
  });

  it("never says «Aún no hay solicitudes» for a status filter", () => {
    for (const filter of ["new", "contacted", "closed"] as const) {
      expect(leadsEmptyState(filter, false).title).not.toBe(
        "Aún no hay solicitudes",
      );
    }
  });

  it("describes each status filter's own empty state", () => {
    expect(leadsEmptyState("new", false).title).toBe(
      "No hay solicitudes por atender",
    );
    expect(leadsEmptyState("contacted", false).title).toBe(
      "No hay solicitudes atendidas",
    );
    expect(leadsEmptyState("closed", false).title).toBe(
      "No hay solicitudes cerradas",
    );
  });

  it("mentions the QR or etiqueta filter, not «Aún no hay solicitudes»", () => {
    const empty = leadsEmptyState("all", true);
    expect(empty.title).not.toBe("Aún no hay solicitudes");
    expect(empty.title).toContain("QR o etiqueta");
  });

  it("combines a status filter with a QR filter in its own empty state", () => {
    const empty = leadsEmptyState("closed", true);
    expect(empty.title).toBe(
      "No hay solicitudes cerradas de este QR o etiqueta",
    );
  });
});
