import { supabase } from "@/integrations/supabase/client";
import { queueChannelContentSync } from "@/lib/channelContentSync";

import type { Json } from "@/integrations/supabase/types";

/**
 * Portfolio commons — central store for data that is identical across every
 * property in a portfolio.
 *
 * Owners of multi-property portfolios were re-typing the same legal entity,
 * banking, contact, house-rule and locale data on each property, and each
 * property's readiness score complained separately. This module defines WHICH
 * readiness-relevant data is portfolio-common and provides two safe operations:
 *
 *   - `shareCommonsToSiblings`  push this property's completed values onto siblings
 *   - `backfillCommonsFromPortfolio` fill this property's blanks from siblings
 *
 * Both are blank-safe: a blank value never overwrites a populated one, and by
 * default an already-populated target field is left alone (`overwrite: false`).
 */

export type CommonsTier = "mandatory" | "recommended";

export interface CommonsGroup {
  key: string;
  label: string;
  description: string;
  tier: CommonsTier;
  /** Readiness requirement keys this group can satisfy. */
  requirementKeys: string[];
}

export const PORTFOLIO_COMMONS_GROUPS: CommonsGroup[] = [
  {
    key: "company_identity",
    label: "Legal entity & company profile",
    description: "Registered name, registration/VAT number, postal address, key representative, Channel Manager company profile.",
    tier: "recommended",
    requirementKeys: ["vat_registration"],
  },
  {
    key: "banking",
    label: "Banking & payout details",
    description: "Bank, account, branch code, account holder, confirmation letter and payout currency.",
    tier: "recommended",
    requirementKeys: ["banking"],
  },
  {
    key: "contacts",
    label: "Reservations, after-hours & emergency contacts",
    description: "Contact rows (reservations, after-hours, emergency) used in checkout, guest email footers and channel pushes.",
    tier: "mandatory",
    requirementKeys: ["contact_email", "contact_phone", "emergency_contact"],
  },
  {
    key: "house_rules",
    label: "House rules & check-in / check-out times",
    description: "Arrival and departure windows, smoking/pet/child rules and quiet hours.",
    tier: "recommended",
    requirementKeys: ["check_times"],
  },
  {
    key: "locale",
    label: "Country, timezone & currency",
    description: "Locale settings channels require to resolve rates and arrival times.",
    tier: "mandatory",
    requirementKeys: ["country", "ru_currency"],
  },
  {
    key: "distribution",
    label: "Channel Manager location & distribution defaults",
    description: "Channel Manager location ID and accepted payment methods shared by the whole portfolio.",
    tier: "recommended",
    requirementKeys: [],
  },
  {
    key: "policies",
    label: "Cancellation & reservation policy terms",
    description:
      "The authored cancellation ladder plus the reservation policy rules used in checkout and channel pushes.",
    tier: "recommended",
    requirementKeys: ["cancellation_policy"],
  },
  {
    key: "arrival_changeover",
    label: "Arrival, departure & changeover rules",
    description:
      "Arrival instructions, the master changeover rule and per-day changeover overrides the channel push reads.",
    tier: "recommended",
    requirementKeys: ["changeover_rules", "arrival_policy"],
  },
  {
    key: "classification",
    label: "Star rating, accommodation label & property class",
    description: "Property type, star rating, accommodation label and the self-catering flag units inherit.",
    tier: "recommended",
    requirementKeys: ["property_type", "star_rating"],
  },
  {
    key: "narrative",
    label: "Brand voice & area narrative defaults",
    description:
      "Brand voice and AI tone, area/neighbourhood facts (transport, airport, restaurants) and additional source URLs used by TOBI writers.",
    tier: "recommended",
    requirementKeys: [],
  },
  {
    key: "meals",
    label: "Meal plans & breakfast options",
    description: "Meal types and breakfast options offered across the portfolio (merged, never removed).",
    tier: "recommended",
    requirementKeys: [],
  },
  {
    key: "facilities",
    label: "Facilities & safety baseline",
    description: "Portfolio-wide facility and safety selections, merged additively so nothing is ever removed.",
    tier: "recommended",
    requirementKeys: ["facilities"],
  },
  {
    key: "payments",
    label: "Payment & invoicing mode",
    description: "Payment mode (paid vs reservation-only), payment providers and custom-provider permission.",
    tier: "recommended",
    requirementKeys: [],
  },
  {
    key: "channel_content",
    label: "Channel push defaults & accepted payment methods",
    description:
      "Whether the Channel Manager push is enabled and the guest payment methods published to channels.",
    tier: "mandatory",
    requirementKeys: ["ru_payment_methods"],
  },
];


/* ------------------------------------------------------------------ */
/* Field registry                                                      */
/* ------------------------------------------------------------------ */

type Location = "column" | "amenities";

interface FieldSpec {
  group: string;
  /** Dotted path inside `amenities`, or a `properties` column name. */
  path: string;
  location: Location;
  /** Merge object values key-by-key instead of replacing wholesale. */
  deep?: boolean;
  /**
   * Array values: union the source and target entries instead of replacing.
   * Nothing a property already offers is ever removed by a share.
   */
  union?: boolean;
}

const FIELDS: FieldSpec[] = [
  // company_identity
  { group: "company_identity", path: "registered_business_name", location: "amenities" },
  { group: "company_identity", path: "registration_number", location: "amenities" },
  { group: "company_identity", path: "property_registration", location: "amenities" },
  { group: "company_identity", path: "vat_number", location: "amenities" },
  { group: "company_identity", path: "has_vat", location: "amenities" },
  { group: "company_identity", path: "postal_address", location: "amenities" },
  { group: "company_identity", path: "key_representative", location: "amenities" },
  { group: "company_identity", path: "mobile_number", location: "amenities" },
  { group: "company_identity", path: "ru_company_profile", location: "amenities", deep: true },

  // banking
  { group: "banking", path: "banking", location: "amenities", deep: true },
  { group: "banking", path: "bank_name", location: "amenities" },
  { group: "banking", path: "bank_account_number", location: "amenities" },
  { group: "banking", path: "bank_branch_code", location: "amenities" },
  { group: "banking", path: "bank_account_holder", location: "amenities" },
  { group: "banking", path: "bank_confirmation_letter_url", location: "amenities" },

  // house_rules
  { group: "house_rules", path: "house_rules", location: "amenities", deep: true },

  // locale
  { group: "locale", path: "country", location: "column" },
  { group: "locale", path: "timezone", location: "column" },
  { group: "locale", path: "currency", location: "amenities" },

  // distribution
  { group: "distribution", path: "ru_location_id", location: "column" },
  { group: "distribution", path: "ru_payment_methods", location: "amenities", deep: true },

  // policies — cancellation ladder (rule rows handled separately)
  { group: "policies", path: "cancellation_policies", location: "amenities", deep: true },

  // arrival_changeover
  { group: "arrival_changeover", path: "changeover", location: "amenities" },
  { group: "arrival_changeover", path: "changeover_rules", location: "amenities", deep: true },
  { group: "arrival_changeover", path: "house_rules.check_in_instructions", location: "amenities" },

  // classification
  { group: "classification", path: "property_type", location: "column" },
  { group: "classification", path: "star_rating", location: "amenities" },
  { group: "classification", path: "accommodation_label", location: "amenities" },
  { group: "classification", path: "self_catering", location: "amenities" },

  // narrative (brand kit handled separately)
  { group: "narrative", path: "property_info", location: "amenities", deep: true },
  { group: "narrative", path: "additional_source_urls", location: "amenities", union: true },

  // meals
  { group: "meals", path: "meal_types", location: "amenities", union: true },
  { group: "meals", path: "breakfast_options", location: "amenities", union: true },

  // facilities
  { group: "facilities", path: "facilities", location: "amenities", union: true },

  // payments
  { group: "payments", path: "payment_mode", location: "column" },
  { group: "payments", path: "payment_provider", location: "column" },
  { group: "payments", path: "payment_providers", location: "column", union: true },
  { group: "payments", path: "allow_custom_payment_provider", location: "column" },

  // channel_content
  { group: "channel_content", path: "ru_push_enabled", location: "column" },
  { group: "channel_content", path: "payment_methods", location: "amenities", union: true },
];


/** Contact roles treated as portfolio-common. */
const COMMON_CONTACT_ROLES = ["reservations", "after_hours", "emergency", "other"] as const;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const isBlank = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return Number.isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isBlank);
  return false;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};

/**
 * Additive union of two lists. Facilities, meal plans and payment methods are
 * offerings — a share may add what the portfolio has in common but must never
 * remove something a property already offers.
 */
const unionValues = (source: unknown, target: unknown): unknown[] => {
  const toList = (value: unknown): unknown[] => (Array.isArray(value) ? value : isBlank(value) ? [] : [value]);
  const out = [...toList(target)];
  const seen = new Set(out.map((entry) => JSON.stringify(entry)));
  for (const entry of toList(source)) {
    const key = JSON.stringify(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
};


const getPath = (root: unknown, path: string): unknown => {
  let cursor: unknown = root;
  for (const part of path.split(".")) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

const setPath = (root: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split(".");
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = asRecord(cursor[part]);
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
};

/** Deep merge: only non-blank source values are written; existing target values kept unless overwrite. */
function mergeValues(source: unknown, target: unknown, overwrite: boolean): unknown {
  if (isBlank(source)) return target;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const out = asRecord(target);
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      out[key] = mergeValues(value, out[key], overwrite);
    }
    return out;
  }
  if (!overwrite && !isBlank(target)) return target;
  return source;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface CommonsProperty {
  id: string;
  name: string;
  slug: string | null;
}

interface PropertySnapshot extends CommonsProperty {
  row: Record<string, unknown>;
  amenities: Record<string, unknown>;
  contacts: ContactRow[];
  /** Reservation / cancellation rule rows (row-based, keyed on policy_type). */
  policies: PolicyRow[];
  /** Brand kit experience config (brand voice + AI tone). */
  brandKit: BrandKitRow | null;
}

interface PolicyRow {
  id?: string;
  property_id?: string;
  policy_type: string;
  rule: unknown;
}

interface BrandKitRow {
  id?: string;
  property_id?: string;
  config: Record<string, unknown>;
}


interface ContactRow {
  id?: string;
  property_id?: string;
  role: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  hours: string | null;
  is_public: boolean | null;
  sort_order: number | null;
}

export interface GroupCoverage {
  group: CommonsGroup;
  /** This property has usable values for the group. */
  hasHere: boolean;
  /** Siblings that already have values (candidate sources for a backfill). */
  sourceSiblings: CommonsProperty[];
  /** Siblings missing values (targets for a share). */
  missingSiblings: CommonsProperty[];
}

export interface CommonsState {
  siblings: CommonsProperty[];
  coverage: GroupCoverage[];
  autoShare: boolean;
  portfolioIds: string[];
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

const PROPERTY_COLUMNS =
  "id, name, slug, amenities, country, timezone, ru_location_id, property_type, ru_push_enabled, payment_mode, payment_provider, payment_providers, allow_custom_payment_provider";

async function fetchSnapshots(ids: string[]): Promise<PropertySnapshot[]> {
  if (ids.length === 0) return [];
  const [
    { data: rows, error },
    { data: contacts, error: contactError },
    { data: policies, error: policyError },
    { data: brandKits, error: brandKitError },
  ] = await Promise.all([
    supabase.from("properties").select(PROPERTY_COLUMNS).in("id", ids),
    supabase
      .from("property_contact_details")
      .select("id, property_id, role, name, email, phone, hours, is_public, sort_order")
      .in("property_id", ids),
    supabase.from("rolos_policies").select("id, property_id, policy_type, rule").in("property_id", ids),
    supabase
      .from("rolos_experience_configs")
      .select("id, property_id, config")
      .eq("experience_type", "brand_kit")
      .in("property_id", ids),
  ]);
  if (error) throw error;
  if (contactError) throw contactError;
  if (policyError) throw policyError;
  if (brandKitError) throw brandKitError;

  return (rows ?? []).map((row) => {
    const record = row as unknown as Record<string, unknown>;
    const id = String(record.id);
    const kit = ((brandKits ?? []) as unknown as BrandKitRow[]).find((k) => k.property_id === id);
    return {
      id,
      name: (record.name as string) ?? "Unnamed property",
      slug: (record.slug as string) ?? null,
      row: record,
      amenities: asRecord(record.amenities),
      contacts: ((contacts ?? []) as unknown as ContactRow[]).filter((c) => c.property_id === id),
      policies: ((policies ?? []) as unknown as PolicyRow[]).filter((p) => p.property_id === id),
      brandKit: kit ? { id: kit.id, property_id: kit.property_id, config: asRecord(kit.config) } : null,
    };
  });
}


function readGroupValues(snapshot: PropertySnapshot, groupKey: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of FIELDS.filter((f) => f.group === groupKey)) {
    const value =
      field.location === "column" ? snapshot.row[field.path] : getPath(snapshot.amenities, field.path);
    if (!isBlank(value)) out[`${field.location}:${field.path}`] = value;
  }
  return out;
}

function commonContacts(snapshot: PropertySnapshot): ContactRow[] {
  return snapshot.contacts.filter(
    (c) =>
      (COMMON_CONTACT_ROLES as readonly string[]).includes(String(c.role)) &&
      (!isBlank(c.email) || !isBlank(c.phone)),
  );
}

/** Policy rows treated as portfolio-common (cancellation ladder + reservation rules). */
function commonPolicies(snapshot: PropertySnapshot): PolicyRow[] {
  return snapshot.policies.filter((p) => !isBlank(p.policy_type) && !isBlank(p.rule));
}

/** Brand voice / AI tone keys shared across a portfolio. */
const BRAND_KIT_KEYS = ["brand_voice", "ai_email_tone"] as const;

function commonBrandKit(snapshot: PropertySnapshot): Record<string, unknown> {
  const config = snapshot.brandKit?.config ?? {};
  const out: Record<string, unknown> = {};
  for (const key of BRAND_KIT_KEYS) {
    if (!isBlank(config[key])) out[key] = config[key];
  }
  return out;
}

function groupHasData(snapshot: PropertySnapshot, groupKey: string): boolean {
  if (groupKey === "contacts") return commonContacts(snapshot).length > 0;
  if (groupKey === "policies")
    return commonPolicies(snapshot).length > 0 || Object.keys(readGroupValues(snapshot, groupKey)).length > 0;
  if (groupKey === "narrative")
    return Object.keys(commonBrandKit(snapshot)).length > 0 || Object.keys(readGroupValues(snapshot, groupKey)).length > 0;
  return Object.keys(readGroupValues(snapshot, groupKey)).length > 0;
}


/** Portfolio ids this property belongs to. */
async function fetchPortfolioIds(propertyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId);
  if (error) throw error;
  return [...new Set((data ?? []).map((m) => m.portfolio_id))];
}

async function fetchSiblingIds(propertyId: string, portfolioIds: string[]): Promise<string[]> {
  if (portfolioIds.length === 0) return [];
  const { data, error } = await supabase
    .from("property_portfolio_members")
    .select("property_id")
    .in("portfolio_id", portfolioIds)
    .neq("property_id", propertyId);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((m) => m.property_id))];
  if (ids.length === 0) return [];
  const { data: active, error: activeError } = await supabase
    .from("properties")
    .select("id")
    .in("id", ids)
    .eq("is_active", true);
  if (activeError) throw activeError;
  return (active ?? []).map((p) => String(p.id));
}

async function fetchAutoShare(portfolioIds: string[]): Promise<boolean> {
  if (portfolioIds.length === 0) return false;
  const { data, error } = await supabase
    .from("property_portfolios")
    .select("metadata")
    .in("id", portfolioIds);
  if (error) throw error;
  return (data ?? []).some((row) => {
    const commons = asRecord(asRecord(row.metadata).commons);
    return commons.auto_share === true;
  });
}

/** Coverage of every commons group across the portfolio. */
export async function fetchCommonsState(propertyId: string): Promise<CommonsState> {
  const portfolioIds = await fetchPortfolioIds(propertyId);
  const siblingIds = await fetchSiblingIds(propertyId, portfolioIds);
  const snapshots = await fetchSnapshots([propertyId, ...siblingIds]);
  const self = snapshots.find((s) => s.id === propertyId);
  const siblingSnapshots = snapshots.filter((s) => s.id !== propertyId);
  const autoShare = await fetchAutoShare(portfolioIds);

  const coverage: GroupCoverage[] = PORTFOLIO_COMMONS_GROUPS.map((group) => ({
    group,
    hasHere: self ? groupHasData(self, group.key) : false,
    sourceSiblings: siblingSnapshots
      .filter((s) => groupHasData(s, group.key))
      .map(({ id, name, slug }) => ({ id, name, slug })),
    missingSiblings: siblingSnapshots
      .filter((s) => !groupHasData(s, group.key))
      .map(({ id, name, slug }) => ({ id, name, slug })),
  }));

  return {
    siblings: siblingSnapshots.map(({ id, name, slug }) => ({ id, name, slug })),
    coverage,
    autoShare,
    portfolioIds,
  };
}

/** Postgrest / fetch failures are often plain objects, not `Error` instances. */
export function describeUnknownError(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof record.message === "string" ? record.message.trim() : "";
    if (message) {
      return typeof record.code === "string" && record.code ? `${message} (${record.code})` : message;
    }
    if (typeof record.details === "string" && record.details.trim()) return record.details;
    if (typeof record.hint === "string" && record.hint.trim()) return record.hint;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export async function setPortfolioAutoShare(portfolioIds: string[], enabled: boolean): Promise<void> {
  if (portfolioIds.length === 0) {
    throw new Error("This property is not in a portfolio.");
  }
  for (const portfolioId of portfolioIds) {
    const { data, error } = await supabase
      .from("property_portfolios")
      .select("metadata")
      .eq("id", portfolioId)
      .maybeSingle();
    if (error) throw new Error(describeUnknownError(error, "Could not load the portfolio."));
    if (!data) {
      throw new Error("You can see this portfolio, but it could not be loaded for update.");
    }
    const metadata = asRecord(data.metadata);
    metadata.commons = { ...asRecord(metadata.commons), auto_share: enabled };
    const { data: updated, error: updateError } = await supabase
      .from("property_portfolios")
      .update({ metadata: metadata as Json })
      .eq("id", portfolioId)
      .select("id");
    if (updateError) {
      throw new Error(describeUnknownError(updateError, "Could not save auto-share."));
    }
    if (!updated?.length) {
      throw new Error(
        "You do not have permission to change auto-share on this portfolio. The toggle was not saved.",
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface CommonsWriteResult {
  updatedProperties: number;
  updatedGroups: string[];
  contactsWritten: number;
  /** Rows written per row-based group (contacts, policies, brand kit). */
  rowsWritten: number;
}

interface ApplyOptions {
  /** Replace values that already exist on the target. Default false (fill blanks only). */
  overwrite?: boolean;
}

/** Apply the source snapshot's group values onto the target snapshots. */
async function applyGroups(
  source: PropertySnapshot,
  targets: PropertySnapshot[],
  groupKeys: string[],
  { overwrite = false }: ApplyOptions,
): Promise<CommonsWriteResult> {
  const touchedGroups = new Set<string>();
  let updatedProperties = 0;
  let contactsWritten = 0;
  let rowsWritten = 0;

  for (const target of targets) {
    const amenities = { ...target.amenities };
    const columnUpdates: Record<string, unknown> = {};
    let dirty = false;

    for (const field of FIELDS.filter((f) => groupKeys.includes(f.group))) {
      const value =
        field.location === "column" ? source.row[field.path] : getPath(source.amenities, field.path);
      if (isBlank(value)) continue;

      if (field.location === "column") {
        const current = target.row[field.path];
        const next = field.union ? unionValues(value, current) : value;
        if (!field.union && !overwrite && !isBlank(current)) continue;
        if (JSON.stringify(next) === JSON.stringify(current ?? null)) continue;
        columnUpdates[field.path] = next;
        dirty = true;
        touchedGroups.add(field.group);
        continue;
      }

      const current = getPath(amenities, field.path);
      const next = field.union
        ? unionValues(value, current)
        : field.deep
          ? mergeValues(value, current, overwrite)
          : overwrite || isBlank(current)
            ? value
            : current;
      if (JSON.stringify(next) === JSON.stringify(current)) continue;
      setPath(amenities, field.path, next);
      dirty = true;
      touchedGroups.add(field.group);
    }

    if (dirty) {
      const { error } = await supabase
        .from("properties")
        .update({ ...columnUpdates, amenities: amenities as Json })
        .eq("id", target.id);
      if (error) throw error;
    }

    if (groupKeys.includes("contacts")) {
      const written = await applyContacts(source, target, overwrite);
      if (written > 0) {
        contactsWritten += written;
        rowsWritten += written;
        touchedGroups.add("contacts");
        dirty = true;
      }
    }

    if (groupKeys.includes("policies")) {
      const written = await applyPolicies(source, target, overwrite);
      if (written > 0) {
        rowsWritten += written;
        touchedGroups.add("policies");
        dirty = true;
      }
    }

    if (groupKeys.includes("narrative")) {
      const written = await applyBrandKit(source, target, overwrite);
      if (written > 0) {
        rowsWritten += written;
        touchedGroups.add("narrative");
        dirty = true;
      }
    }

    if (dirty) {
      updatedProperties += 1;
      // Shared content landed on a sibling listing — refresh that listing on the channel too.
      void queueChannelContentSync(target.id, "portfolio_commons_share");
    }

  }

  return { updatedProperties, updatedGroups: [...touchedGroups], contactsWritten, rowsWritten };
}

/** Copy the authored cancellation / reservation policy rows, matching on policy type. */
async function applyPolicies(
  source: PropertySnapshot,
  target: PropertySnapshot,
  overwrite: boolean,
): Promise<number> {
  const rows = commonPolicies(source);
  if (rows.length === 0) return 0;
  let written = 0;

  for (const row of rows) {
    const existing = target.policies.find((p) => p.policy_type === row.policy_type);
    if (existing && !overwrite) continue;
    if (existing) {
      if (JSON.stringify(existing.rule) === JSON.stringify(row.rule)) continue;
      const { error } = await supabase
        .from("rolos_policies")
        .update({ rule: row.rule as Json })
        .eq("id", existing.id!);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("rolos_policies")
        .insert({ property_id: target.id, policy_type: row.policy_type, rule: row.rule as Json });
      if (error) throw error;
    }
    written += 1;
  }

  return written;
}

/** Copy brand voice / AI tone into the sibling's brand kit config. */
async function applyBrandKit(
  source: PropertySnapshot,
  target: PropertySnapshot,
  overwrite: boolean,
): Promise<number> {
  const shared = commonBrandKit(source);
  if (Object.keys(shared).length === 0) return 0;

  const current = target.brandKit?.config ?? {};
  const next = { ...current };
  let changed = false;
  for (const [key, value] of Object.entries(shared)) {
    if (!overwrite && !isBlank(current[key])) continue;
    if (JSON.stringify(current[key]) === JSON.stringify(value)) continue;
    next[key] = value;
    changed = true;
  }
  if (!changed) return 0;

  if (target.brandKit?.id) {
    const { error } = await supabase
      .from("rolos_experience_configs")
      .update({ config: next as Json })
      .eq("id", target.brandKit.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("rolos_experience_configs")
      .insert({ property_id: target.id, experience_type: "brand_kit", config: next as Json });
    if (error) throw error;
  }
  return 1;
}


/** Copy the portfolio-common contact rows, matching on role. */
async function applyContacts(
  source: PropertySnapshot,
  target: PropertySnapshot,
  overwrite: boolean,
): Promise<number> {
  const rows = commonContacts(source);
  if (rows.length === 0) return 0;

  const payload: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const existing = target.contacts.find((c) => String(c.role) === String(row.role));
    if (existing && !overwrite) {
      const needsEmail = isBlank(existing.email) && !isBlank(row.email);
      const needsPhone = isBlank(existing.phone) && !isBlank(row.phone);
      const needsName = isBlank(existing.name) && !isBlank(row.name);
      if (!needsEmail && !needsPhone && !needsName) continue;
      payload.push({
        id: existing.id,
        property_id: target.id,
        role: existing.role,
        name: needsName ? row.name : existing.name,
        email: needsEmail ? row.email : existing.email,
        phone: needsPhone ? row.phone : existing.phone,
        hours: isBlank(existing.hours) ? row.hours : existing.hours,
        is_public: existing.is_public ?? row.is_public ?? true,
        sort_order: existing.sort_order ?? row.sort_order ?? 0,
      });
      continue;
    }
    payload.push({
      ...(existing?.id ? { id: existing.id } : {}),
      property_id: target.id,
      role: row.role,
      name: row.name,
      email: row.email,
      phone: row.phone,
      hours: row.hours,
      is_public: row.is_public ?? true,
      sort_order: row.sort_order ?? 0,
    });
  }
  if (payload.length === 0) return 0;

  const { error } = await supabase
    .from("property_contact_details")
    .upsert(payload as never, { onConflict: "id" });
  if (error) throw error;
  return payload.length;
}

/** Push this property's common data onto the selected siblings. */
export async function shareCommonsToSiblings(
  propertyId: string,
  targetIds: string[],
  groupKeys: string[],
  options: ApplyOptions = {},
): Promise<CommonsWriteResult> {
  if (targetIds.length === 0 || groupKeys.length === 0)
    return { updatedProperties: 0, updatedGroups: [], contactsWritten: 0, rowsWritten: 0 };
  const snapshots = await fetchSnapshots([propertyId, ...targetIds]);
  const source = snapshots.find((s) => s.id === propertyId);
  if (!source) throw new Error("Source property not found");
  return applyGroups(source, snapshots.filter((s) => s.id !== propertyId), groupKeys, options);
}

/**
 * Fill this property's blank common fields from its portfolio siblings.
 * Siblings are consulted in order; the first sibling with data for a group wins.
 */
export async function backfillCommonsFromPortfolio(
  propertyId: string,
  groupKeys: string[],
): Promise<CommonsWriteResult> {
  const portfolioIds = await fetchPortfolioIds(propertyId);
  const siblingIds = await fetchSiblingIds(propertyId, portfolioIds);
  if (siblingIds.length === 0 || groupKeys.length === 0)
    return { updatedProperties: 0, updatedGroups: [], contactsWritten: 0, rowsWritten: 0 };

  const snapshots = await fetchSnapshots([propertyId, ...siblingIds]);
  const self = snapshots.find((s) => s.id === propertyId);
  if (!self) throw new Error("Property not found");

  const result: CommonsWriteResult = { updatedProperties: 0, updatedGroups: [], contactsWritten: 0, rowsWritten: 0 };
  const touched = new Set<string>();

  for (const groupKey of groupKeys) {
    const source = snapshots.find((s) => s.id !== propertyId && groupHasData(s, groupKey));
    if (!source) continue;
    // Re-read the target each pass so sequential group writes stack correctly.
    const fresh = await fetchSnapshots([propertyId]);
    const target = fresh[0];
    if (!target) continue;
    const partial = await applyGroups(source, [target], [groupKey], { overwrite: false });
    partial.updatedGroups.forEach((g) => touched.add(g));
    result.contactsWritten += partial.contactsWritten;
    result.rowsWritten += partial.rowsWritten;
  }

  result.updatedGroups = [...touched];
  result.updatedProperties = touched.size > 0 ? 1 : 0;
  return result;
}

/**
 * Auto-share hook: called after a property save. When the portfolio has
 * auto-share enabled, completed common data is pushed into siblings' blanks
 * without overwriting. Pulling into this property remains an explicit action,
 * so intentionally cleared values cannot be silently restored after save.
 */
export async function runAutoShare(propertyId: string): Promise<CommonsWriteResult | null> {
  const portfolioIds = await fetchPortfolioIds(propertyId);
  if (portfolioIds.length === 0) return null;
  if (!(await fetchAutoShare(portfolioIds))) return null;

  const groupKeys = PORTFOLIO_COMMONS_GROUPS.map((g) => g.key);
  const siblingIds = await fetchSiblingIds(propertyId, portfolioIds);
  return shareCommonsToSiblings(propertyId, siblingIds, groupKeys, { overwrite: false });
}
