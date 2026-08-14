import { describe, expect, it } from "vitest";
import {
  filterToItTestProperties,
  isItTestAdminEmail,
  isItTestProperty,
  resolveScopedPropertyIds,
  IT_TEST_PROPERTY_IDS,
} from "./adminScope";

describe("IT test admin pin", () => {
  it("recognises the RU IT tester email", () => {
    expect(isItTestAdminEmail("ru-admin@roomsonline.co.za")).toBe(true);
    expect(isItTestAdminEmail("  RU-Admin@RoomsOnline.co.za ")).toBe(true);
    expect(isItTestAdminEmail("carike@roomsonline.co.za")).toBe(false);
  });

  it("matches Seesig and Tidal by id or name", () => {
    expect(isItTestProperty({ id: IT_TEST_PROPERTY_IDS[0], name: "Other" })).toBe(true);
    expect(isItTestProperty({ id: "nope", name: "Seesig House" })).toBe(true);
    expect(isItTestProperty({ id: "nope", name: "Tidal Pools" })).toBe(true);
    expect(isItTestProperty({ id: "nope", name: "Ashbourne House" })).toBe(false);
  });

  it("pins the tester to Seesig + Tidal when the db scope is empty or extra", () => {
    expect(resolveScopedPropertyIds("ru-admin@roomsonline.co.za", [])).toEqual([...IT_TEST_PROPERTY_IDS]);
    expect(resolveScopedPropertyIds("ru-admin@roomsonline.co.za", ["other-id"])).toEqual([
      ...IT_TEST_PROPERTY_IDS,
    ]);
    expect(
      resolveScopedPropertyIds("ru-admin@roomsonline.co.za", [IT_TEST_PROPERTY_IDS[1], "extra"]),
    ).toEqual([IT_TEST_PROPERTY_IDS[1]]);
  });

  it("does not pin a normal admin", () => {
    expect(resolveScopedPropertyIds("dev@roomsonline.co.za", [])).toEqual([]);
    expect(resolveScopedPropertyIds("dev@roomsonline.co.za", ["abc"])).toEqual(["abc"]);
  });

  it("drops every other property from a list", () => {
    const rows = [
      { id: IT_TEST_PROPERTY_IDS[0], name: "Seesig" },
      { id: "x", name: "Ashbourne House" },
      { id: "y", name: "Tidal Villa" },
    ];
    expect(filterToItTestProperties(rows).map((r) => r.name)).toEqual(["Seesig", "Tidal Villa"]);
  });
});
