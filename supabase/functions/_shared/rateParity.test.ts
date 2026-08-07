/**
 * Kill-switch tests. The single rule: anything other than a proven 'unified'
 * value must serve the legacy price, so a bad read can never change a quote.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getRateResolutionMode,
  getRateResolutionModes,
  logRateParity,
  pickServedRate,
} from "./rateParity.ts";

/** Minimal fake postgrest client. */
function fakeClient(opts: {
  row?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[];
  throws?: boolean;
  insertError?: string;
  captured?: { rows?: unknown[] };
}) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (opts.throws) throw new Error("network down");
                  return { data: opts.row ?? null };
                },
              };
            },
            in: async () => {
              if (opts.throws) throw new Error("network down");
              return { data: opts.rows ?? [] };
            },
          };
        },
        insert: async (rows: unknown[]) => {
          if (opts.captured) opts.captured.rows = rows;
          return { error: opts.insertError ? { message: opts.insertError } : null };
        },
      };
    },
  };
}

Deno.test("mode: 'unified' is honoured", async () => {
  const c = fakeClient({ row: { rate_resolution_mode: "unified" } });
  assertEquals(await getRateResolutionMode(c, "p1"), "unified");
});

Deno.test("mode: missing row, unknown value and errors all fall back to legacy", async () => {
  assertEquals(await getRateResolutionMode(fakeClient({ row: null }), "p1"), "legacy");
  assertEquals(
    await getRateResolutionMode(fakeClient({ row: { rate_resolution_mode: "UNIFIED" } }), "p1"),
    "legacy",
  );
  assertEquals(
    await getRateResolutionMode(fakeClient({ row: { rate_resolution_mode: "experimental" } }), "p1"),
    "legacy",
  );
  assertEquals(await getRateResolutionMode(fakeClient({ throws: true }), "p1"), "legacy");
});

Deno.test("batch mode: unlisted properties default to legacy", async () => {
  const c = fakeClient({ rows: [{ id: "a", rate_resolution_mode: "unified" }] });
  const modes = await getRateResolutionModes(c, ["a", "b"]);
  assertEquals(modes, { a: "unified", b: "legacy" });
});

Deno.test("batch mode: a failed lookup keeps every property on legacy", async () => {
  const modes = await getRateResolutionModes(fakeClient({ throws: true }), ["a", "b"]);
  assertEquals(modes, { a: "legacy", b: "legacy" });
});

Deno.test("batch mode: empty input returns empty map", async () => {
  assertEquals(await getRateResolutionModes(fakeClient({}), []), {});
});

Deno.test("pickServedRate: legacy mode always serves the legacy value", () => {
  assertEquals(pickServedRate("legacy", 1000, 1200), 1000);
});

Deno.test("pickServedRate: unified mode serves unified but never null/NaN", () => {
  assertEquals(pickServedRate("unified", 1000, 1200), 1200);
  assertEquals(pickServedRate("unified", 1000, null as unknown as number), 1000);
  assertEquals(pickServedRate("unified", 1000, undefined as unknown as number), 1000);
  assertEquals(pickServedRate("unified", 1000, Number.NaN), 1000);
});

Deno.test("parity logging: computes deltas and never throws on insert failure", async () => {
  const captured: { rows?: unknown[] } = {};
  const ok = await logRateParity(fakeClient({ captured }), "test", [
    { property_id: "p1", stay_date: "2026-09-01", resolved_rate: 1200, legacy_rate: 1000 },
    { property_id: "p1", stay_date: "2026-09-02", resolved_rate: 1000, legacy_rate: 1000 },
    { property_id: "p1", stay_date: "2026-09-03", resolved_rate: null, legacy_rate: 1000 },
  ]);
  assertEquals(ok.logged, 3);
  assertEquals(ok.deltas, 1);
  const rows = captured.rows as Record<string, unknown>[];
  assertEquals(rows[0].delta, 200);
  assertEquals(rows[1].delta, 0);
  assertEquals(rows[2].delta, null);

  const failed = await logRateParity(fakeClient({ insertError: "denied" }), "test", [
    { property_id: "p1", stay_date: "2026-09-01", resolved_rate: 1, legacy_rate: 2 },
  ]);
  assertEquals(failed.logged, 0);
});

Deno.test("parity logging: no rows is a no-op", async () => {
  const res = await logRateParity(fakeClient({}), "test", []);
  assertEquals(res.logged, 0);
  assertEquals(res.deltas, 0);
});
