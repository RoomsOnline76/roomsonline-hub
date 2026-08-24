import { describe, expect, it } from "vitest";
import {
  buildBookingCurve,
  forecastWithPickup,
  provisionalRealisationRate,
  stlyCutoff,
  summariseOtb,
  wasOnBooksAt,
  type PulseBookingLike,
} from "./pulseOnTheBooks";

const booking = (over: Partial<PulseBookingLike>): PulseBookingLike => ({
  check_in_date: "2026-09-01",
  check_out_date: "2026-09-03",
  created_at: "2026-08-01",
  total_price: 1000,
  status: "confirmed",
  payment_status: "unpaid",
  amount_paid: 0,
  balance_due: 1000,
  ...over,
});

describe("summariseOtb", () => {
  it("splits firm from provisional and ignores cancellations", () => {
    const split = summariseOtb([
      booking({}),
      booking({ status: "pending", total_price: 500, balance_due: 500 }),
      booking({ status: "cancelled", total_price: 9999 }),
    ]);
    expect(split.bookings).toBe(2);
    expect(split.firmBookings).toBe(1);
    expect(split.provisionalBookings).toBe(1);
    expect(split.revenue).toBe(1500);
    expect(split.firmRevenue).toBe(1000);
    expect(split.provisionalRevenue).toBe(500);
  });

  it("counts a deposit as received cash but keeps the balance outstanding", () => {
    const split = summariseOtb([
      booking({ amount_paid: 300, balance_due: 700, payment_status: "partial" }),
    ]);
    expect(split.paid).toBe(300);
    expect(split.deposit).toBe(300);
    expect(split.outstanding).toBe(700);
  });

  it("treats a fully paid booking as banked, not a deposit", () => {
    const split = summariseOtb([
      booking({ amount_paid: 1000, balance_due: 0, payment_status: "paid" }),
    ]);
    expect(split.paid).toBe(1000);
    expect(split.deposit).toBe(0);
    expect(split.outstanding).toBe(0);
  });

  it("falls back to booking value when payment_status says paid but no amount is stored", () => {
    const split = summariseOtb([
      booking({ amount_paid: null, balance_due: 0, payment_status: "paid" }),
    ]);
    expect(split.paid).toBe(1000);
  });

  it("counts nights per stay", () => {
    expect(summariseOtb([booking({})]).nights).toBe(2);
  });
});

describe("provisionalRealisationRate", () => {
  it("defaults optimistically without enough decided history", () => {
    expect(provisionalRealisationRate([booking({})])).toBe(0.75);
  });

  it("derives the rate from decided history", () => {
    const history = [
      ...Array.from({ length: 8 }, () => booking({ status: "confirmed" })),
      ...Array.from({ length: 2 }, () => booking({ status: "cancelled" })),
    ];
    expect(provisionalRealisationRate(history)).toBeCloseTo(0.8, 5);
  });
});

describe("buildBookingCurve", () => {
  it("reports a full book on the day of arrival", () => {
    const curve = buildBookingCurve([]);
    expect(curve.onBooksShare(0)).toBe(1);
  });

  it("shows a smaller share on the books the further out we look", () => {
    // 20 bookings with lead times of 10 days, 20 with 100 days.
    const history = [
      ...Array.from({ length: 20 }, () => booking({ created_at: "2026-08-22", check_in_date: "2026-09-01" })),
      ...Array.from({ length: 20 }, () => booking({ created_at: "2026-05-24", check_in_date: "2026-09-01" })),
    ];
    const curve = buildBookingCurve(history);
    expect(curve.sample).toBe(40);
    expect(curve.onBooksShare(5)).toBeCloseTo(1, 5);
    expect(curve.onBooksShare(50)).toBeCloseTo(0.5, 5);
    expect(curve.onBooksShare(120)).toBeCloseTo(0.05, 5); // floored
  });
});

describe("forecastWithPickup", () => {
  const curve = { sample: 100, onBooksShare: (d: number) => (d <= 0 ? 1 : d >= 60 ? 0.5 : 0.8) };

  it("never forecasts below firm business already on the books", () => {
    const result = forecastWithPickup({ otb: 10_000, firm: 10_000, daysOut: 0, curve, realisation: 0.8 });
    expect(result.forecast).toBe(10_000);
    expect(result.floor).toBe(10_000);
  });

  it("adds pickup for periods still open to sell", () => {
    const result = forecastWithPickup({ otb: 10_000, firm: 10_000, daysOut: 90, curve, realisation: 0.8 });
    expect(result.expectedOtb).toBe(10_000);
    expect(result.pickup).toBe(10_000); // 1/0.5 - 1 = 1x
    expect(result.forecast).toBe(20_000);
  });

  it("haircuts provisional business", () => {
    const result = forecastWithPickup({ otb: 10_000, firm: 6_000, daysOut: 0, curve, realisation: 0.5 });
    expect(result.expectedOtb).toBe(8_000);
  });

  it("uses the trend when nothing is held yet", () => {
    const result = forecastWithPickup({ otb: 0, firm: 0, daysOut: 90, curve, realisation: 0.8, trend: 4_000 });
    expect(result.forecast).toBe(2_000);
  });
});

describe("stly", () => {
  it("excludes prior-year business sold after the equivalent moment", () => {
    const cutoff = stlyCutoff(new Date("2026-08-24T12:00:00Z"));
    expect(wasOnBooksAt(booking({ created_at: "2025-06-01" }), cutoff)).toBe(true);
    expect(wasOnBooksAt(booking({ created_at: "2025-10-01" }), cutoff)).toBe(false);
  });

  it("keeps rows without a capture date", () => {
    expect(wasOnBooksAt(booking({ created_at: null }), stlyCutoff())).toBe(true);
  });
});
