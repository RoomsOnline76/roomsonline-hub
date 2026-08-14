/**
 * Fill the website listing wizard from the property / RU source of truth.
 * The wizard historically only looked at amenities.room_types.{max_guests,base_rate}
 * while ROL'OS stores maxPeople on the unit and rates on rate plans.
 */

export interface WizardRoom {
  id: string;
  name: string;
  units: number;
  max_guests: number;
  base_rate?: number;
  rate_unit: "per_night" | "per_stay";
  description?: string;
}

export function roomMaxGuests(room: Record<string, unknown>): number {
  const n = Number(room.max_guests ?? room.maxPeople ?? room.max_people ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function roomBaseRate(room: Record<string, unknown>): number {
  const n = Number(room.base_rate ?? room.baseRate ?? room.daily_rate ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function roomHasMaxGuests(room: Record<string, unknown>): boolean {
  return roomMaxGuests(room) > 0;
}

export function roomHasRate(room: Record<string, unknown>): boolean {
  return roomBaseRate(room) > 0;
}

export function normalizeWizardRoom(
  raw: Record<string, unknown>,
  fallbackRate?: number,
): WizardRoom {
  const id = String(raw.id ?? raw.room_type_id ?? raw.hostfully_room_id ?? cryptoRandomId());
  const max_guests = roomMaxGuests(raw);
  const fromRoom = roomBaseRate(raw);
  const base_rate = fromRoom || (fallbackRate && fallbackRate > 0 ? fallbackRate : undefined);
  const units = Number(raw.units ?? raw.numRooms ?? raw.num_rooms ?? raw.total_units ?? 1) || 1;
  const rateUnit = raw.rate_unit === "per_stay" || raw.rateType === "per-stay" ? "per_stay" : "per_night";
  return {
    id,
    name: String(raw.name ?? "").trim(),
    units,
    max_guests,
    base_rate,
    rate_unit: rateUnit,
    description: typeof raw.description === "string" ? raw.description : "",
  };
}

function cryptoRandomId(): string {
  return `wizard-room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Fill blank wizard room fields from RU / property inventory. Never overwrite a filled value. */
export function mergeWizardRooms(
  existing: Record<string, unknown>[] | null | undefined,
  inventory: WizardRoom[],
): Record<string, unknown>[] {
  const current = Array.isArray(existing) ? existing : [];
  if (current.length === 0) {
    return inventory.map((r) => ({
      ...r,
      maxPeople: r.max_guests,
      baseRate: r.base_rate,
    }));
  }

  return current.map((room) => {
    const name = String(room.name ?? "").trim().toLowerCase();
    const match =
      inventory.find((i) => i.id && i.id === room.id) ??
      inventory.find((i) => name && i.name.toLowerCase() === name);
    const next: Record<string, unknown> = { ...room };
    if (!roomHasMaxGuests(next) && match?.max_guests) {
      next.max_guests = match.max_guests;
      next.maxPeople = match.max_guests;
    }
    if (!roomHasRate(next) && match?.base_rate) {
      next.base_rate = match.base_rate;
      next.baseRate = match.base_rate;
    }
    if (!String(next.description ?? "").trim() && match?.description) {
      next.description = match.description;
    }
    return next;
  });
}

export function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function formatCancellationPolicy(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value) || value.length === 0) return "";
  return value
    .map((row) => {
      if (typeof row === "string") return row;
      if (!row || typeof row !== "object") return "";
      const r = row as Record<string, unknown>;
      const days = firstNonEmpty(r.days, r.day);
      const forfeit = firstNonEmpty(r.forfeit, r.amount, r.percent);
      const type = firstNonEmpty(r.type, r.unit);
      if (days && forfeit) return `${forfeit}${type ? ` ${type}` : ""} if cancelled within ${days} day(s)`;
      return firstNonEmpty(r.description, r.policy, r.name);
    })
    .filter(Boolean)
    .join("\n");
}

export interface WebsiteWizardPropertySeed {
  owner_name?: string | null;
  owner_email?: string | null;
  ru_location_id?: number | null;
  after_hours_contact?: string | null;
  price_per_night?: number | null;
}

export interface WebsiteWizardInventoryRoom {
  id: string;
  name?: string | null;
  is_active?: boolean | null;
  max_guests?: number | null;
  daily_rate?: number | null;
  total_units?: number | null;
  description?: string | null;
}

export interface WebsiteWizardRatePlan {
  base_rate?: number | null;
  is_primary_sell?: boolean | null;
  is_active?: boolean | null;
}

export interface WebsiteWizardContact {
  role?: string | null;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
}

/**
 * In-memory copy of the Website wizard hydrate. Does not write to the database.
 * Use this anywhere a percentage must match the open-wizard score.
 */
export function hydrateWebsiteWizardAmenitiesFromInventory(
  amenities: Record<string, unknown>,
  seed: WebsiteWizardPropertySeed = {},
  inventory: {
    rooms?: WebsiteWizardInventoryRoom[];
    ratePlans?: WebsiteWizardRatePlan[];
    contacts?: WebsiteWizardContact[];
  } = {},
): Record<string, unknown> {
  const existing = (Array.isArray(amenities.room_types) ? amenities.room_types : []) as Record<
    string,
    unknown
  >[];
  const activePlans = (inventory.ratePlans ?? []).filter((p) => p.is_active !== false);
  const planRate =
    Number(activePlans.find((p) => p.is_primary_sell)?.base_rate) ||
    Number(activePlans.find((p) => Number(p.base_rate) > 0)?.base_rate) ||
    0;
  const fallbackRate = planRate || Number(seed.price_per_night) || 0;
  const rooms: WizardRoom[] = (inventory.rooms ?? [])
    .filter((u) => u.is_active !== false)
    .map((u) =>
      normalizeWizardRoom(
        {
          id: u.id,
          name: u.name,
          max_guests: u.max_guests,
          daily_rate: u.daily_rate,
          total_units: u.total_units,
          description: u.description,
        },
        fallbackRate || undefined,
      ),
    );
  const afterHours = (inventory.contacts ?? []).find(
    (c) => c.role === "after_hours" || c.role === "emergency",
  );
  return fillWebsiteWizardAmenities(
    { ...amenities, room_types: mergeWizardRooms(existing, rooms) },
    {
      owner_name: seed.owner_name,
      owner_email: seed.owner_email,
      ru_location_id: seed.ru_location_id,
      after_hours_contact:
        seed.after_hours_contact ?? afterHours?.phone ?? afterHours?.name ?? null,
    },
  );
}

/**
 * Copy RU / property-setup values into the website wizard's expected keys.
 * Never overwrites a wizard field that already has content.
 */
export function fillWebsiteWizardAmenities(
  amenities: Record<string, unknown>,
  seed: WebsiteWizardPropertySeed = {},
): Record<string, unknown> {
  const next = { ...amenities };
  const contact =
    next.contact && typeof next.contact === "object" ? { ...(next.contact as Record<string, unknown>) } : {};
  const house =
    next.house_rules && typeof next.house_rules === "object"
      ? { ...(next.house_rules as Record<string, unknown>) }
      : {};
  const addr =
    next.address_details && typeof next.address_details === "object"
      ? (next.address_details as Record<string, unknown>)
      : {};
  const profile =
    next.ru_company_profile && typeof next.ru_company_profile === "object"
      ? (next.ru_company_profile as Record<string, unknown>)
      : {};

  const setIfEmpty = (key: string, value: unknown) => {
    const current = next[key];
    const empty =
      current === undefined ||
      current === null ||
      current === "" ||
      (Array.isArray(current) && current.length === 0);
    if (!empty) return;
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value) && value.length === 0) return;
    next[key] = value;
  };

  const setHouseIfEmpty = (key: string, value: unknown) => {
    const current = house[key];
    const empty = current === undefined || current === null || current === "";
    if (!empty) return;
    if (value === undefined || value === null || value === "") return;
    house[key] = value;
  };

  if (!firstNonEmpty(next.star_grading) && next.star_rating != null && next.star_rating !== 0) {
    next.star_grading = String(next.star_rating);
  }

  setIfEmpty("contact_email", firstNonEmpty(next.contact_email, contact.email, seed.owner_email));
  setIfEmpty("telephone", firstNonEmpty(next.telephone, contact.telephone, next.mobile_number));
  setIfEmpty(
    "main_contact_name",
    firstNonEmpty(next.main_contact_name, next.key_representative, contact.owner, seed.owner_name),
  );

  setIfEmpty("ru_location_id", next.ru_location_id ?? seed.ru_location_id ?? null);
  setIfEmpty("region", firstNonEmpty(next.region, addr.region, addr.province, addr.state, profile.region));

  if ((!Array.isArray(next.pms_systems) || next.pms_systems.length === 0) && firstNonEmpty(next.pms_system, next.pms_name)) {
    const raw = firstNonEmpty(next.pms_system, next.pms_name).toLowerCase();
    next.pms_systems = [raw.includes("rol") ? "roomsonline" : raw];
  }

  if ((!Array.isArray(next.meal_types) || next.meal_types.length === 0) && Array.isArray(next.breakfast_options)) {
    next.meal_types = next.breakfast_options;
  }

  if ((!Array.isArray(next.facilities) || next.facilities.length === 0) && Array.isArray(next.amenities)) {
    next.facilities = next.amenities;
  }

  const arrival = firstNonEmpty(
    house.check_in_instructions,
    house.key_collection_procedure,
    house.late_check_in_procedure,
  );
  setHouseIfEmpty("key_collection_procedure", arrival);
  setHouseIfEmpty("late_check_in_procedure", arrival);
  setHouseIfEmpty("after_hours_contact", firstNonEmpty(house.after_hours_contact, seed.after_hours_contact));
  setHouseIfEmpty("payment_policy", firstNonEmpty(house.payment_policy, house.deposit_allowed ? "Deposit required" : ""));
  setHouseIfEmpty("house_rules_text", firstNonEmpty(house.house_rules_text, house.fine_print));

  if (typeof next.cancellation_policies === "string" && !next.cancellation_policies.trim()) {
    delete next.cancellation_policies;
  }

  next.house_rules = house;
  return next;
}
