import { describe, expect, it } from "vitest";
import {
  describeExtrasReport,
  readExtrasReport,
} from "../../../supabase/functions/_shared/nbExtrasReport";

const extrasGrid = [
  ["Extras Report for 01/08/2026 to 31/08/2026"],
  ["Date", "Booking ID", "Room Unit", "Description", "Quantity", "Price", "Total", "Account ID"],
  ["2026-08-01", 7734, "Room 1", "Meals, Dinner", 2, 495, 990, 7020],
  ["2026-08-01", 7734, "Room 1", "Drinks, Wine, Red", 1, 750, 750, 7020],
  ["2026-08-02", 7725, "Room 6", "Harvest Box", 1, 640, 640, 7011],
  ["2026-09-01", 7801, "Room 2", "Meals, Breakfast", 2, 200, 400, 7100],
];

const ledgerGrid = [
  ["Bookings for 01/08/2026 to 31/08/2026"],
  ["Booking ID", "Arrival Date", "Last Night", "Guest Name", "Nights", "Revenue", "Total"],
  [7734, "2026-08-01", "2026-08-03", "Isabel", 2, 5000, 5000],
];

describe("readExtrasReport", () => {
  it("recognises a NightsBridge extras export and totals it by month", () => {
    const summary = readExtrasReport([{ name: "report", grid: extrasGrid }]);
    expect(summary).not.toBeNull();
    expect(summary!.rowCount).toBe(4);
    expect(summary!.grandTotal).toBe(2780);
    expect(summary!.totalsByMonth).toEqual({ "2026-08": 2380, "2026-09": 400 });
    expect(summary!.foodByMonth).toEqual({ "2026-08": 1630, "2026-09": 400 });
    expect(summary!.categories[0]!.category).toBe("Meals");
    expect(summary!.periodLabel).toContain("Extras Report");
  });

  it("leaves a bookings ledger to the ledger reader", () => {
    expect(readExtrasReport([{ name: "report", grid: ledgerGrid }])).toBeNull();
  });

  it("describes what the file holds without claiming rooms revenue", () => {
    const note = describeExtrasReport(readExtrasReport([{ name: "report", grid: extrasGrid }])!);
    expect(note).toContain("Extras and F&B charge list");
    expect(note).toContain("2026-08");
    expect(note).toMatch(/bookings export/i);
  });
});
