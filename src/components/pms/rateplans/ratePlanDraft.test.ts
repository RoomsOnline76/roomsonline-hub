import { describe, expect, it } from "vitest";
import {
  draftToPayload,
  emptyDraft,
  ratePlanDraftReducer,
  readCalendarSeasons,
  seasonRateFor,
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
    const seasons = readCalendarSeasons({
      seasons: [
        { id: 2, title: "Low", from: "2026-05-01", to: "2026-06-30", minStay: 0 },
        { id: 1, name: "High", minStay: 3, periods: [{ from: "2026-12-11", to: "2027-01-03" }, { from: "2026-02-02", to: "2026-02-06" }] },
      ],
    } as never);
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
