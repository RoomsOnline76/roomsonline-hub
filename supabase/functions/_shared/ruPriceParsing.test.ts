import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseRuPricePoints, parseRuPriceSeasons } from "./ruPriceParsing.ts";

Deno.test("parses RU child-element season prices", () => {
  const xml = `<Season DateFrom="2026-08-01" DateTo="2026-08-31"><Price>1250</Price><Extra>200</Extra></Season>`;
  assertEquals(parseRuPriceSeasons(xml), [{
    date_from: "2026-08-01",
    date_to: "2026-08-31",
    price: 1250,
    extra_guest_price: 200,
  }]);
  assertEquals(parseRuPricePoints(xml), [1250]);
});

Deno.test("parses RU attribute price variants", () => {
  const xml = `<FSPSeason Date="2026-08-01" DefaultPrice="940"><Price NrOfNights="2">1880</Price></FSPSeason>`;
  assertEquals(parseRuPricePoints(xml), [940, 1880]);
});