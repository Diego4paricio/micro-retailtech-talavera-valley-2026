import { describe, expect, it } from "vitest";
import {
  choosePlanHref,
  panelPlanHref,
  readPanelContext,
} from "@/components/pricing/panel-link";

const plan = "https://app.kardo.mx/settings/plan";
const id = "0b6f6f5e-3c1d-4d0e-9a55-2f7d4b1c8e90";
const codes = ["esencial", "profesional", "negocio"];

describe("prices page opened from the panel", () => {
  it("does nothing without desde=panel", () => {
    expect(readPanelContext("")).toBeNull();
    expect(readPanelContext(`?organizacion=${id}`)).toBeNull();
    expect(readPanelContext(`?desde=otro&organizacion=${id}`)).toBeNull();
  });

  it("keeps only a valid organization uuid", () => {
    expect(readPanelContext(`?desde=panel&organizacion=${id}`)).toEqual({
      workspace: id,
    });
    for (const bad of ["", "abc", `${id}x`, `${id}&x=1`, "<script>", "1234"]) {
      const search = `?desde=panel&organizacion=${encodeURIComponent(bad)}`;
      expect(readPanelContext(search)).toEqual({ workspace: null });
    }
    expect(readPanelContext("?desde=panel")).toEqual({ workspace: null });
  });

  it("builds the choose link for the monthly and yearly period", () => {
    const context = { workspace: id };
    expect(choosePlanHref(plan, context, "negocio", "month", codes)).toBe(
      `${plan}?workspace=${id}&elegir=negocio&periodo=mensual`,
    );
    expect(choosePlanHref(plan, context, "esencial", "year", codes)).toBe(
      `${plan}?workspace=${id}&elegir=esencial&periodo=anual`,
    );
  });

  it("omits workspace when there is no valid organization", () => {
    expect(
      choosePlanHref(plan, { workspace: null }, "profesional", "year", codes),
    ).toBe(`${plan}?elegir=profesional&periodo=anual`);
  });

  it("never links a code that is not on sale", () => {
    const context = { workspace: id };
    expect(
      choosePlanHref(plan, context, "corporativo", "month", codes),
    ).toBeNull();
    expect(choosePlanHref(plan, context, "x&y=1", "month", codes)).toBeNull();
  });

  it("links back to the panel plan page", () => {
    expect(panelPlanHref(plan, { workspace: id })).toBe(
      `${plan}?workspace=${id}`,
    );
    expect(panelPlanHref(plan, { workspace: null })).toBe(plan);
  });
});
