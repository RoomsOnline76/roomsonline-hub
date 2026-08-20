import { describe, expect, it } from "vitest";
import {
  resolveRuCleaningFee,
  resolveRuSecurityDeposit,
  type RuChargeRow,
} from "../../../supabase/functions/_shared/ruDeposits";

const breakage: RuChargeRow = {
  id: "c1",
  name: "Breakage Deposit",
  category: "deposit",
  calculation_method: "flat_per_stay",
  amount: 500,
  is_active: true,
  applies_to_all_rooms: true,
  room_type_ids: [],
};

describe("RU deposit resolution from charges", () => {
  it("maps the only deposit charge to the listing deposit", () => {
    expect(resolveRuSecurityDeposit([breakage], "unit-1")).toBe(500);
  });

  it("carries no deposit when the property charges none", () => {
    expect(resolveRuSecurityDeposit([], "unit-1")).toBe(0);
    expect(resolveRuSecurityDeposit([{ ...breakage, is_active: false }], "unit-1")).toBe(0);
  });

  it("ignores non-deposit charges", () => {
    const cleaning: RuChargeRow = { ...breakage, id: "c2", name: "Cleaning", category: "fee", amount: 250 };
    expect(resolveRuSecurityDeposit([cleaning], "unit-1")).toBe(0);
    expect(resolveRuCleaningFee([cleaning], "unit-1")).toBe(250);
  });

  it("respects unit scoping", () => {
    const scoped: RuChargeRow = { ...breakage, applies_to_all_rooms: false, room_type_ids: ["unit-2"] };
    expect(resolveRuSecurityDeposit([scoped], "unit-1")).toBe(0);
    expect(resolveRuSecurityDeposit([scoped], "unit-2")).toBe(500);
  });

  it("skips percentage deposits RU cannot express", () => {
    const pct: RuChargeRow = { ...breakage, calculation_method: "percentage_of_accommodation", amount: 10 };
    expect(resolveRuSecurityDeposit([pct], "unit-1")).toBe(0);
  });
});
