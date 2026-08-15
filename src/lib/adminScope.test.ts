import { describe, expect, it } from "vitest";
import { filterToAdminScope, isItTestAdminEmail, resolveScopedPropertyIds } from "./adminScope";

describe("scoped admin", () => {
  it("recognises the RU IT tester email", () => {
    expect(isItTestAdminEmail("ru-admin@roomsonline.co.za")).toBe(true);
    expect(isItTestAdminEmail("  RU-Admin@RoomsOnline.co.za ")).toBe(true);
    expect(isItTestAdminEmail("carike@roomsonline.co.za")).toBe(false);
  });

  it("takes the scope from the database verbatim, with no hardcoded fallback", () => {
    // An empty scope must NOT fall back onto live properties.
    expect(resolveScopedPropertyIds("ru-admin@roomsonline.co.za", [])).toEqual([]);
    expect(resolveScopedPropertyIds("ru-admin@roomsonline.co.za", ["test-a", "test-b"])).toEqual([
      "test-a",
      "test-b",
    ]);
  });

  it("does not scope a normal admin", () => {
    expect(resolveScopedPropertyIds("dev@roomsonline.co.za", [])).toEqual([]);
    expect(resolveScopedPropertyIds("dev@roomsonline.co.za", ["abc"])).toEqual(["abc"]);
  });

  it("filters fetched rows to the scope and no-ops when unscoped", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(filterToAdminScope(rows, ["a", "c"]).map((r) => r.id)).toEqual(["a", "c"]);
    expect(filterToAdminScope(rows, [])).toEqual(rows);
  });
});
