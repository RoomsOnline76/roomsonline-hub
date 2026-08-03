/**
 * Rentals United amenity resolution.
 *
 * ROLOS stores room/unit amenities as a string array. Two token shapes exist:
 *   - `ru:<id>`  — canonical selection made with the RU amenity picker
 *   - free text  — legacy hand-written labels ("Free WiFi", "Towels", …)
 *
 * `resolveRuAmenityIds` turns either shape into RU AmenityIDs so the push payload
 * always carries real, RU-recognised amenities instead of padded defaults.
 */

/** Legacy label → RU AmenityID. Keys are normalised (lowercase, non-alnum stripped). */
const LEGACY_LABEL_IDS: Record<string, number> = {
  wifi: 174, freewifi: 174, wifiavailable: 174, internet: 174, internetconnection: 174,
  aircon: 180, airconditioning: 180, ac: 180,
  heating: 187, centralheating: 9, radiators: 58,
  tv: 74, television: 74, cabletv: 19, satellitetv: 167, bigscreentv: 445,
  dvd: 23, cdplayer: 24, stereo: 22, radio: 198,
  kitchen: 101, fullyequippedkitchen: 135, kitchenette: 157, modernkitchen: 102,
  oven: 115, cooker: 119, cookinghob: 114, microwave: 124, toaster: 125,
  kettle: 17, electrickettle: 123, coffeemaker: 140, coffeemakerinroom: 667,
  fridge: 131, refrigerator: 131, freezer: 152, fridgefreezer: 130,
  dishwasher: 13, crockerycutlery: 3, cookwarekitchenutensils: 2, dishrack: 142,
  washingmachine: 11, dryer: 137, dryingrack: 5, iron: 4, ironingboard: 4,
  ironingboardiron: 4, vacuumcleaner: 143, laundry: 234, drycleaning: 233,
  maidservice: 225, hairdryer: 6, toiletries: 8, towels: 7, linen: 589,
  bedlinen: 589, bedlinentowels: 7, bathrobe: 780, bathroom: 81, toilet: 37,
  shower: 239, bathwithshower: 52, bidet: 29, washbasin: 245,
  balcony: 89, smallbalcony: 96, terrace: 100, smallterrace: 91, garden: 100,
  bbq: 408, braai: 408, bbqgrill: 408, bbqgas: 1867, bbqcharcoal: 1868,
  pool: 227, swimmingpool: 227, communalpool: 815, childrenspool: 739,
  jacuzzi: 35, hottub: 35,
  extrabed: 209, mattress: 210, babybed: 833, babycot: 833, cot: 833,
  crib: 674, cribsavailable: 674, highchair: 838, highchairs: 208,
  babychair: 838, bunkbed: 444, sofabed: 237, doublesofabed: 200,
  desk: 73, computer: 593, computerinroom: 668, businesscentre: 461,
  alarmclock: 21, wakeupcall: 21, safe: 67, smokedetector: 943,
  carbonmonoxidedetector: 943, helpdesk: 205, concierge: 598,
  breakfast: 235, bottledwater: 880, minibar: 620, lounge: 99,
  livingroom: 249, sofa: 182, armchairs: 161, coffeetable: 163,
  diningtable: 250, wardrobe: 201, cupboard: 32, chestofdrawers: 78,
  readinglamp: 72, readinglamps: 72, nighttable: 70, bedroom: 257,
  airportpickupservice: 215, bicyclerentals: 645, storagespace: 248,
};

const normalise = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function parseRuAmenityToken(token: unknown): number | null {
  if (typeof token === 'number') return Number.isFinite(token) && token > 0 ? token : null;
  if (typeof token !== 'string') return null;
  // `ru:<id>` and `ru:<id>:<count>` (count used for internet, parking, cots, pools…)
  const ruMatch = token.match(/^ru:(\d+)(?::\d+)?$/i);
  if (ruMatch) {
    const id = parseInt(ruMatch[1], 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  return LEGACY_LABEL_IDS[normalise(token)] ?? null;
}

/** Quantity carried on a `ru:<id>:<count>` token (1 when absent). */
export function parseRuAmenityCount(token: unknown): number {
  if (typeof token !== 'string') return 1;
  const m = token.match(/^ru:\d+:(\d+)$/i);
  const n = m ? parseInt(m[1], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}


/**
 * Resolve an amenity container (array, or object with list/amenities/features/facilities)
 * into unique RU AmenityIDs plus their quantities. Unmappable entries are reported so the
 * readiness scorecard can nudge the owner to re-pick them from the RU catalogue.
 *
 * `facilities` is the key property-level selections are stored under in ROLOS
 * (`properties.amenities.facilities`), so property pushes resolve too.
 */
export function resolveRuAmenityIds(
  amenitiesData: unknown,
): { ids: number[]; counts: Record<number, number>; unmapped: string[] } {
  const obj = amenitiesData as Record<string, unknown> | null;
  const container = Array.isArray(amenitiesData)
    ? amenitiesData
    : ([] as unknown[]).concat(
        (Array.isArray(obj?.list) ? obj!.list : []) as unknown[],
        (Array.isArray(obj?.amenities) ? obj!.amenities : []) as unknown[],
        (Array.isArray(obj?.features) ? obj!.features : []) as unknown[],
        (Array.isArray(obj?.facilities) ? obj!.facilities : []) as unknown[],
      );
  const ids: number[] = [];
  const counts: Record<number, number> = {};
  const unmapped: string[] = [];
  const seen = new Set<number>();
  if (!Array.isArray(container)) return { ids, counts, unmapped };
  for (const item of container) {
    const raw = typeof item === 'string' || typeof item === 'number'
      ? item
      : ((item as Record<string, unknown>)?.key ?? (item as Record<string, unknown>)?.name ?? '');
    const id = parseRuAmenityToken(raw);
    if (id == null) {
      const label = String(raw ?? '').trim();
      if (label) unmapped.push(label);
      continue;
    }
    const count = parseRuAmenityCount(raw);
    if (seen.has(id)) {
      counts[id] = Math.max(counts[id] || 1, count);
      continue;
    }
    seen.add(id);
    ids.push(id);
    counts[id] = count;
  }
  return { ids, counts, unmapped };

}
