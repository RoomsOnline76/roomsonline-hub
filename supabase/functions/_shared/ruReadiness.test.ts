import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyChannelWindowEvidence, localBookableWindowChecks } from "./ruReadiness.ts";

Deno.test("open but wholly unpriced channel data is incomplete", () => {
  assertEquals(classifyChannelWindowEvidence(
    { open_days: 366, unpriced_open_days: 366 },
    { availability_responded: true, prices_responded: true },
  ), "incomplete");
});

Deno.test("a priced channel failure remains complete evidence", () => {
  assertEquals(classifyChannelWindowEvidence(
    { open_days: 2, unpriced_open_days: 0 },
    { availability_responded: true, prices_responded: true },
  ), "complete");
});

Deno.test("an answered channel calendar with zero open days is a real failure", () => {
  assertEquals(classifyChannelWindowEvidence(
    { open_days: 0, unpriced_open_days: 0 },
    { availability_responded: true, prices_responded: false },
  ), "complete");
});

Deno.test("a transport failure is never trusted", () => {
  assertEquals(classifyChannelWindowEvidence(
    { open_days: 0, unpriced_open_days: 0 },
    { availability_responded: false, prices_responded: false },
  ), "incomplete");
});

Deno.test("a genuine local window failure remains blocking", () => {
  const checks = localBookableWindowChecks({
    ok: false,
    start: null,
    longest_run: 0,
    min_stay_set: true,
    open_days: 366,
    unpriced_open_days: 366,
  });
  assertEquals(checks.find((check) => check.key === "bookable_window")?.passed, false);
});

Deno.test("mixed multi-unit evidence falls back only for the incomplete unit", () => {
  const evidence = [
    classifyChannelWindowEvidence(
      { open_days: 366, unpriced_open_days: 0 },
      { availability_responded: true, prices_responded: true },
    ),
    classifyChannelWindowEvidence(
      { open_days: 366, unpriced_open_days: 366 },
      { availability_responded: true, prices_responded: true },
    ),
  ];
  assertEquals(evidence, ["complete", "incomplete"]);
});