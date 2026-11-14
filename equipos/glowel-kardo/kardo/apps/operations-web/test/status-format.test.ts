import { describe, expect, it } from "vitest";
import {
  checkedAgoText,
  closesIncident,
  emptyIncidentForm,
  nextUpdateKind,
  probeLabel,
  toAddUpdate,
  toCreateIncident,
  validateIncidentForm,
} from "../src/features/status/format.js";

describe("checkedAgoText", () => {
  const now = new Date("2026-10-03T12:00:00Z").getTime();
  it("words the age of the last check", () => {
    expect(checkedAgoText(null, now)).toBe("Aún no se ha revisado");
    expect(checkedAgoText("2026-10-03T11:59:40Z", now)).toBe(
      "Revisado hace menos de 1 min",
    );
    expect(checkedAgoText("2026-10-03T11:57:00Z", now)).toBe(
      "Revisado hace 3 min",
    );
    expect(checkedAgoText("2026-10-03T09:00:00Z", now)).toBe(
      "Revisado hace 3 h",
    );
  });
});

describe("incident form", () => {
  it("requires title, areas and message", () => {
    const errors = validateIncidentForm(emptyIncidentForm("incident"));
    expect(Object.keys(errors).sort()).toEqual([
      "components",
      "message",
      "title",
    ]);
  });

  it("requires a window for maintenance", () => {
    const form = {
      ...emptyIncidentForm("maintenance"),
      title: "Mantenimiento",
      components: ["panel" as const],
      message: "Aviso",
    };
    expect(validateIncidentForm(form)).toMatchObject({
      startsAt: expect.any(String),
      endsAt: expect.any(String),
    });
    expect(
      validateIncidentForm({
        ...form,
        startsAt: "2026-10-05T10:00",
        endsAt: "2026-10-05T09:00",
      }).endsAt,
    ).toMatch(/después del inicio/);
    const ok = {
      ...form,
      startsAt: "2026-10-05T10:00",
      endsAt: "2026-10-05T11:00",
    };
    expect(validateIncidentForm(ok)).toEqual({});
    expect(toCreateIncident(ok)).toMatchObject({
      kind: "maintenance",
      impact: "maintenance",
      startsAt: new Date("2026-10-05T10:00").toISOString(),
      endsAt: new Date("2026-10-05T11:00").toISOString(),
    });
  });

  it("builds an incident without a window", () => {
    const body = toCreateIncident({
      ...emptyIncidentForm("incident"),
      title: " Lento ",
      impact: "partial_outage",
      components: ["files"],
      message: " Revisando ",
    });
    expect(body).toEqual({
      kind: "incident",
      title: "Lento",
      impact: "partial_outage",
      components: ["files"],
      message: "Revisando",
    });
  });
});

describe("updates", () => {
  it("preselects the next step and detects the closing one", () => {
    expect(nextUpdateKind("incident", undefined)).toBe("investigating");
    expect(nextUpdateKind("incident", "identified")).toBe("monitoring");
    expect(nextUpdateKind("incident", "resolved")).toBe("resolved");
    expect(nextUpdateKind("maintenance", "scheduled")).toBe("in_progress");
    expect(closesIncident("incident", "resolved")).toBe(true);
    expect(closesIncident("maintenance", "completed")).toBe(true);
    expect(closesIncident("maintenance", "in_progress")).toBe(false);
  });

  it("sends the impact only for incidents", () => {
    expect(toAddUpdate("incident", "monitoring", " Ok ", "degraded")).toEqual({
      status: "monitoring",
      message: "Ok",
      impact: "degraded",
    });
    expect(toAddUpdate("incident", "monitoring", "Ok", "")).toEqual({
      status: "monitoring",
      message: "Ok",
    });
    expect(toAddUpdate("maintenance", "completed", "Ok", "degraded")).toEqual({
      status: "completed",
      message: "Ok",
    });
  });

  it("names the probes", () => {
    expect(probeLabel("panel-app")).toBe("Panel (Pages)");
    expect(probeLabel("otra")).toBe("otra");
  });
});
