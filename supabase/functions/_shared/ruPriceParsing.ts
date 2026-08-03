export interface RuPriceSeason {
  date_from: string | null;
  date_to: string | null;
  price: number | null;
  extra_guest_price: number | null;
}

function attribute(source: string, name: string): string | null {
  return new RegExp(`${name}="([^"]*)"`, "i").exec(source)?.[1] ?? null;
}

function numeric(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseRuPriceSeasons(xml: string): RuPriceSeason[] {
  const seasons: RuPriceSeason[] = [];
  const regex = /<Season\b([^>]*)>([\s\S]*?)<\/Season>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const attrs = match[1];
    const inner = match[2];
    const childPrice = inner.match(/<Price(?:\s[^>]*)?>([\s\S]*?)<\/Price>/i)?.[1];
    const extra = inner.match(/<(?:ExtraGuestPrice|Extra)>([\s\S]*?)<\/(?:ExtraGuestPrice|Extra)>/i)?.[1];
    seasons.push({
      date_from: attribute(attrs, "DateFrom") ?? inner.match(/<DateFrom>([\s\S]*?)<\/DateFrom>/i)?.[1]?.trim() ?? null,
      date_to: attribute(attrs, "DateTo") ?? inner.match(/<DateTo>([\s\S]*?)<\/DateTo>/i)?.[1]?.trim() ?? null,
      price: numeric(childPrice ?? attribute(attrs, "Price")),
      extra_guest_price: numeric(extra),
    });
  }
  return seasons;
}

export function parseRuPricePoints(xml: string): number[] {
  const seasonPoints = parseRuPriceSeasons(xml).flatMap((season) => season.price == null ? [] : [season.price]);
  if (seasonPoints.length > 0) return seasonPoints;

  const points: number[] = [];
  for (const match of xml.matchAll(/\b(?:Price|DefaultPrice)="([\d.]+)"/gi)) {
    const value = numeric(match[1]);
    if (value != null) points.push(value);
  }
  for (const match of xml.matchAll(/<Price(?:\s[^>]*)?>([\s\S]*?)<\/Price>/gi)) {
    const value = numeric(match[1]);
    if (value != null) points.push(value);
  }
  return points;
}