import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyChannelWindowEvidence } from "./ruReadiness.ts";

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