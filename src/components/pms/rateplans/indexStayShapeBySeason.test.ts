import { describe, it, expect } from "vitest";
import {
  indexStayShapeBySeason,
  type StayShapeFspRow,
  type StayShapeLosRow,
  type StayShapePlanRow,
} from "../indexStayShapeBySeason";

const plan = (over: Partial<StayShapePlanRow> = {}): StayShapePlanRow => ({
  id: "p1",
  name: "BAR",
  is_active: true,
  los_enabled: true,
  fsp_enabled: false,
  ...over,
});

const rung = (over: Partial<StayShapeLosRow> = {}): StayShapeLosRow => ({
  rate_plan_id: "p1",
  calendar_season_id: "high",
  nights: 3,
  derivation_type: "percent",
  derivation_value: -10,
  is_pinned: false,
  pinned_rate: null,
  ...over,
});

const cell = (over: Partial<StayShapeFspRow> = {}): StayShapeFspRow => ({
  rate_plan_id: "p1",
  calendar_season_id: "high",
  nights: 7,
  nr_of_guests: 2,
  derivation_type: "percent",
  derivation_value: -20,
  is_pinned: false,
  pinned_total: null,
  ...over,
});

describe("indexStayShapeBySeason", () => {
  it("returns {} with no plans", () => {
    expect(indexStayShapeBySeason([], [rung()], [cell()])).toEqual({});
  });

  it("ignores leftover rows on a flags-off plan", () => {
    const res = indexStayShapeBySeason(
      [plan({ los_enabled: false, fsp_enabled: false })],
      [rung()],
      [cell()],
    );
    expect(res).toEqual({});
  });

  it("ignores inactive plans", () => {
    expect(indexStayShapeBySeason([plan({ is_active: false })], [rung()], [])).toEqual({});
  });

  it("indexes a LOS rung under its season", () => {
    const res = indexStayShapeBySeason([plan()], [rung()], []);
    expect(Object.keys(res)).toEqual(["high"]);
    expect(res.high.plans[0]).toMatchObject({ rate_plan_id: "p1", name: "BAR" });
    expect(res.high.plans[0].los[0].label).toBe("from 3n −10%");
  });

  it("labels pinned rungs and cells", () => {
    const res = indexStayShapeBySeason(
      [plan({ fsp_enabled: true })],
      [rung({ is_pinned: true, pinned_rate: 1980, derivation_type: null, derivation_value: null })],
      [cell({ is_pinned: true, pinned_total: 12600, derivation_type: null, derivation_value: null })],
    );
    expect(res.high.plans[0].los[0].label).toBe("from 3n pinned R1,980/n");
    expect(res.high.plans[0].fsp[0].label).toBe("7n × 2 pinned R12,600");
  });

  it("lists two plans on the same season", () => {
    const res = indexStayShapeBySeason(
      [plan(), plan({ id: "p2", name: "Tour Operator" })],
      [rung(), rung({ rate_plan_id: "p2", nights: 5 })],
      [],
    );
    expect(res.high.plans.map((p) => p.name)).toEqual(["BAR", "Tour Operator"]);
  });

  it("drops rows with a null calendar_season_id", () => {
    expect(indexStayShapeBySeason([plan()], [rung({ calendar_season_id: null })], [])).toEqual({});
  });

  it("drops cells when fsp_enabled is false", () => {
    const res = indexStayShapeBySeason([plan({ fsp_enabled: false })], [], [cell()]);
    expect(res).toEqual({});
  });

  it("keeps cells when only fsp is enabled and drops the rungs", () => {
    const res = indexStayShapeBySeason(
      [plan({ los_enabled: false, fsp_enabled: true })],
      [rung()],
      [cell()],
    );
    expect(res.high.plans[0].los).toEqual([]);
    expect(res.high.plans[0].fsp[0].label).toBe("7n × 2 −20%");
  });
});
