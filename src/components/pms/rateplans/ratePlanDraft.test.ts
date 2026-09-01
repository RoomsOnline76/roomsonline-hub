import { describe, expect, it } from "vitest";
import {
  draftToPayload,
  ladderIssues,
  emptyDraft,
  ratePlanDraftReducer,
  readCalendarSeasons,
  seasonRateFor,
  seasonUnitRate,
  unitFor,
  type RatePlanDraft,
} from "./ratePlanDraft";

const withName = (): RatePlanDraft => ({ ...emptyDraft(), name: "Standard", base_rate: "1200" });

describe("ratePlanDraft reducer", () => {
  it("toggles a unit on and off", () => {
    let s = ratePlanDraftReducer(withName(), { type: "toggle_unit", roomTypeId: "u1" });
    expect(unitFor(s, "u1")).toEqual({ room_type_id: "u1", differential_type: "none", differential_value: "" });
    s = ratePlanDraftReducer(s, { type: "toggle_unit", roomTypeId: "u1" });
    expect(unitFor(s, "u1")).toBeUndefined();
  });

  it("patches a unit differential without touching siblings", () => {
    let s = ratePlanDraftReducer(withName(), { type: "toggle_unit", roomTypeId: "u1" });
    s = ratePlanDraftReducer(s, { type: "toggle_unit", roomTypeId: "u2" });
    s = ratePlanDraftReducer(s, {
      type: "unit_differential",
      roomTypeId: "u2",
      differential_type: "percent",
      differential_value: "10",
    });
    expect(unitFor(s, "u1")?.differential_type).toBe("none");
    expect(unitFor(s, "u2")).toMatchObject({ differential_type: "percent", differential_value: "10" });
  });

  it("creates then updates a season rate in place", () => {
    let s = ratePlanDraftReducer(withName(), {
      type: "season",
      calendarSeasonId: "s1",
      patch: { mode: "absolute", base_rate: "1500" },
    });
    expect(s.season_rates).toHaveLength(1);
    s = ratePlanDraftReducer(s, { type: "season", calendarSeasonId: "s1", patch: { base_rate: "1600" } });
    expect(s.season_rates).toHaveLength(1);
    expect(seasonRateFor(s, "s1")).toMatchObject({ mode: "absolute", base_rate: "1600" });
  });

  it("returns a default season rate for an unpriced season", () => {
    expect(seasonRateFor(withName(), "unknown")).toMatchObject({ mode: "none", base_rate: "" });
  });

  it("never mutates the previous state object", () => {
    const before = withName();
    const snapshot = JSON.stringify(before);
    ratePlanDraftReducer(before, { type: "toggle_unit", roomTypeId: "u1" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("draftToPayload", () => {
  it("emits snake_case, trims text and nulls blanks", () => {
    const draft: RatePlanDraft = {
      ...withName(),
      name: "  Standard  ",
      code: " STD ",
      description: "   ",
      max_stay: "",
    };
    const payload = draftToPayload(draft);
    expect(payload.name).toBe("Standard");
    expect(payload.code).toBe("STD");
    expect(payload.description).toBeNull();
    expect(payload.base_rate).toBe(1200);
    expect(payload.max_stay).toBeNull();
    expect(payload.min_stay).toBe(1);
  });

  it("drops unpriced seasons and shapes absolute vs differential rates", () => {
    let s = withName();
    s = ratePlanDraftReducer(s, { type: "season", calendarSeasonId: "high", patch: { mode: "absolute", base_rate: "2000" } });
    s = ratePlanDraftReducer(s, {
      type: "season",
      calendarSeasonId: "mid",
      patch: { mode: "differential", differential_type: "percent", differential_value: "15" },
    });
    s = ratePlanDraftReducer(s, { type: "season", calendarSeasonId: "low", patch: { mode: "none", base_rate: "999" } });

    const { season_rates } = draftToPayload(s);
    expect(season_rates.map((r) => r.calendar_season_id)).toEqual(["high", "mid"]);
    expect(season_rates[0]).toMatchObject({ mode: "absolute", base_rate: 2000, differential_type: "none", differential_value: null });
    expect(season_rates[1]).toMatchObject({ mode: "differential", base_rate: null, differential_type: "percent", differential_value: 15 });
  });

  it("nulls a unit differential value when the type is none", () => {
    let s = ratePlanDraftReducer(withName(), { type: "toggle_unit", roomTypeId: "u1" });
    s = ratePlanDraftReducer(s, { type: "unit_differential", roomTypeId: "u1", differential_value: "250" });
    expect(draftToPayload(s).units[0]).toMatchObject({ differential_type: "none", differential_value: null });
  });

  it("round-trips a fully configured draft without losing values", () => {
    let s: RatePlanDraft = {
      ...withName(),
      min_stay: "2",
      max_stay: "14",
      min_advance_days: "1",
      max_advance_days: "365",
      breakfast_included: true,
      breakfast_amount: "180",
      requires_deposit: true,
    };
    s = ratePlanDraftReducer(s, { type: "toggle_unit", roomTypeId: "u1" });
    s = ratePlanDraftReducer(s, { type: "unit_differential", roomTypeId: "u1", differential_type: "amount", differential_value: "200" });
    const p = draftToPayload(s);
    expect(p).toMatchObject({
      min_stay: 2,
      max_stay: 14,
      min_advance_days: 1,
      max_advance_days: 365,
      breakfast_included: true,
      breakfast_amount: 180,
      requires_deposit: true,
      is_active: true,
    });
    expect(p.units[0]).toMatchObject({ room_type_id: "u1", differential_type: "amount", differential_value: 200 });
  });
});

describe("readCalendarSeasons", () => {
  it("reads periods, sorts by first window and normalises min stay", () => {
    const seasons = readCalendarSeasons(
      {
        seasons: [
          { id: 2, title: "Low", from: "2026-05-01", to: "2026-06-30", minStay: 0 },
          { id: 1, name: "High", minStay: 3, periods: [{ from: "2026-12-11", to: "2027-01-03" }, { from: "2026-02-02", to: "2026-02-06" }] },
        ],
      } as never,
      { includeExpired: true },
    );
    expect(seasons.map((s) => s.name)).toEqual(["High", "Low"]);
    expect(seasons[0].periods[0].from).toBe("2026-02-02");
    expect(seasons[0].min_stay).toBe(3);
    expect(seasons[1].min_stay).toBeNull();
  });

  it("ignores malformed seasons and non-season blobs", () => {
    expect(readCalendarSeasons(null)).toEqual([]);
    expect(readCalendarSeasons({ seasons: "nope" } as never)).toEqual([]);
    expect(readCalendarSeasons({ seasons: [{ id: 1 }, { title: "no id", from: "a", to: "b" }] } as never)).toEqual([]);
  });
});

describe("pricing by season: promotion and live seeding", () => {
  const withUnits = () => {
    let s = { ...emptyDraft(), base_rate: "1000" };
    s = ratePlanDraftReducer(s, { type: "toggle_unit", roomTypeId: "u1" });
    s = ratePlanDraftReducer(s, { type: "toggle_unit", roomTypeId: "u2" });
    return s;
  };

  it("typing a rate into a Not priced season promotes it to a fixed rate", () => {
    let s = withUnits();
    s = ratePlanDraftReducer(s, { type: "season_unit_rate", calendarSeasonId: "s1", roomTypeId: "u1", value: "1450" });
    const column = seasonRateFor(s, "s1");
    expect(column.mode).toBe("absolute");
    expect(seasonUnitRate(column, "u1")).toBe("1450");
    expect(draftToPayload(s).season_rates[0]).toMatchObject({
      calendar_season_id: "s1",
      mode: "absolute",
      unit_values: { u1: 1450 },
    });
  });

  it("clearing a cell does not promote an unpriced season", () => {
    let s = withUnits();
    s = ratePlanDraftReducer(s, { type: "season_unit_rate", calendarSeasonId: "s1", roomTypeId: "u1", value: "" });
    expect(seasonRateFor(s, "s1").mode).toBe("none");
    expect(draftToPayload(s).season_rates).toHaveLength(0);
  });

  it("keeps a differential column in differential mode when cells are typed", () => {
    let s = withUnits();
    s = ratePlanDraftReducer(s, { type: "season", calendarSeasonId: "s1", patch: { mode: "differential" } });
    s = ratePlanDraftReducer(s, { type: "season_unit_rate", calendarSeasonId: "s1", roomTypeId: "u1", value: "150" });
    expect(seasonRateFor(s, "s1").mode).toBe("differential");
  });

  it("seeds every season from the live matrix as absolute rates", () => {
    let s = withUnits();
    const matrix = new Map([
      ["s1", new Map([["u1", 1200], ["u2", 1500]])],
      ["s2", new Map([["u1", 900]])],
    ]);
    s = ratePlanDraftReducer(s, { type: "seed_matrix", matrix });
    expect(seasonRateFor(s, "s1").mode).toBe("absolute");
    expect(seasonUnitRate(seasonRateFor(s, "s1"), "u2")).toBe("1500");
    expect(seasonUnitRate(seasonRateFor(s, "s2"), "u1")).toBe("900");
    expect(seasonUnitRate(seasonRateFor(s, "s2"), "u2")).toBe("");
  });

  it("seeds only the requested season and ignores non-positive amounts", () => {
    let s = withUnits();
    const matrix = new Map([
      ["s1", new Map([["u1", 1200], ["u2", 0]])],
      ["s2", new Map([["u1", 900]])],
    ]);
    s = ratePlanDraftReducer(s, { type: "seed_matrix", matrix, calendarSeasonId: "s1" });
    expect(seasonUnitRate(seasonRateFor(s, "s1"), "u1")).toBe("1200");
    expect(seasonUnitRate(seasonRateFor(s, "s1"), "u2")).toBe("");
    expect(seasonRateFor(s, "s2").mode).toBe("none");
  });

  it("seeding an empty matrix leaves the draft untouched", () => {
    const s = withUnits();
    expect(ratePlanDraftReducer(s, { type: "seed_matrix", matrix: new Map() })).toBe(s);
  });
});

describe("readCalendarSeasons: expired seasons", () => {
  const blob = {
    seasons: [
      { id: 1, name: "Old", from: "2020-01-01", to: "2020-02-01" },
      { id: 2, name: "Live", from: "2099-01-01", to: "2099-02-01" },
      { id: 3, name: "Mixed", periods: [{ from: "2020-05-01", to: "2020-06-01" }, { from: "2099-05-01", to: "2099-06-01" }] },
    ],
  } as never;

  it("drops seasons whose every window is in the past", () => {
    expect(readCalendarSeasons(blob).map((s) => s.name)).toEqual(["Mixed", "Live"]);
  });

  it("keeps them when explicitly asked", () => {
    expect(readCalendarSeasons(blob, { includeExpired: true })).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Stay-shape ladders (LOS / Full Stay). Daily stays the parent: with both
// switches off the payload must say so and carry no rows.
// ---------------------------------------------------------------------------

describe("stay-shape ladders", () => {
  it("starts off with no rows", () => {
    const d = emptyDraft();
    expect(d.los_enabled).toBe(false);
    expect(d.fsp_enabled).toBe(false);
    expect(d.los_rungs).toEqual([]);
    expect(d.fsp_cells).toEqual([]);
    const payload = draftToPayload(d);
    expect(payload.los_enabled).toBe(false);
    expect(payload.fsp_enabled).toBe(false);
    expect(payload.los_rungs).toEqual([]);
    expect(payload.fsp_cells).toEqual([]);
    expect(ladderIssues(d)).toEqual([]);
  });

  it("adds a LOS rung and puts it on the wire", () => {
    let s = ratePlanDraftReducer(withName(), { type: "field", key: "los_enabled", value: true });
    s = ratePlanDraftReducer(s, { type: "add_los_rung", calendarSeasonId: "s1" });
    expect(s.los_rungs).toHaveLength(1);
    expect(ladderIssues(s)).toEqual([]);
    expect(draftToPayload(s).los_rungs).toEqual([
      {
        calendar_season_id: "s1",
        room_type_id: null,
        start_date: null,
        end_date: null,
        nights: 3,
        derivation_type: "percent",
        derivation_value: -10,
        is_pinned: false,
        pinned_rate: null,
      },
    ]);
  });

  it("writes a pinned full-stay cell as a total with no derivation", () => {
    let s = ratePlanDraftReducer(withName(), { type: "field", key: "fsp_enabled", value: true });
    s = ratePlanDraftReducer(s, { type: "add_fsp_cell", calendarSeasonId: "s1" });
    s = ratePlanDraftReducer(s, {
      type: "patch_fsp_cell",
      index: 0,
      patch: { is_pinned: true, pinned_total: "11200" },
    });
    expect(draftToPayload(s).fsp_cells[0]).toMatchObject({
      nights: 7,
      nr_of_guests: 2,
      is_pinned: true,
      pinned_total: 11200,
      derivation_type: null,
      derivation_value: null,
    });
  });

  it("clears the rungs when the switch goes off", () => {
    let s = ratePlanDraftReducer(withName(), { type: "field", key: "los_enabled", value: true });
    s = ratePlanDraftReducer(s, { type: "add_los_rung", calendarSeasonId: "s1" });
    s = ratePlanDraftReducer(s, { type: "field", key: "los_enabled", value: false });
    expect(s.los_rungs).toEqual([]);
    expect(ladderIssues(s)).toEqual([]);
  });

  it("reports a duplicate threshold in the same season", () => {
    let s = ratePlanDraftReducer(withName(), { type: "field", key: "los_enabled", value: true });
    s = ratePlanDraftReducer(s, { type: "add_los_rung", calendarSeasonId: "s1" });
    s = ratePlanDraftReducer(s, { type: "add_los_rung", calendarSeasonId: "s1" });
    expect(ladderIssues(s).some((i) => i.includes("keep one"))).toBe(true);
  });

  it("reports a switch left on with nothing authored, and a -100% offset", () => {
    const on = { ...emptyDraft(), fsp_enabled: true };
    expect(ladderIssues(on)).toContain("Add at least one full-stay cell, or turn it off.");

    let s = ratePlanDraftReducer(withName(), { type: "field", key: "los_enabled", value: true });
    s = ratePlanDraftReducer(s, { type: "add_los_rung", calendarSeasonId: "s1" });
    s = ratePlanDraftReducer(s, { type: "patch_los_rung", index: 0, patch: { derivation_value: "-100" } });
    expect(ladderIssues(s).length).toBeGreaterThan(0);
    expect(draftToPayload(s).los_rungs).toEqual([]);
  });
});
