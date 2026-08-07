import { supabase } from "@/integrations/supabase/client";
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

const PROPERTY_COLUMNS = "id, name, slug, amenities, country, timezone, ru_location_id";

async function fetchSnapshots(ids: string[]): Promise<PropertySnapshot[]> {
  if (ids.length === 0) return [];
  const [{ data: rows, error }, { data: contacts, error: contactError }] = await Promise.all([
    supabase.from("properties").select(PROPERTY_COLUMNS).in("id", ids),
    supabase
      .from("property_contact_details")
      .select("id, property_id, role, name, email, phone, hours, is_public, sort_order")
      .in("property_id", ids),
  ]);
  if (error) throw error;
  if (contactError) throw contactError;

  return (rows ?? []).map((row) => {
    const record = row as unknown as Record<string, unknown>;
    return {
      id: String(record.id),
      name: (record.name as string) ?? "Unnamed property",
      slug: (record.slug as string) ?? null,
      row: record,
      amenities: asRecord(record.amenities),
      contacts: ((contacts ?? []) as unknown as ContactRow[]).filter((c) => c.property_id === row.id),
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

function groupHasData(snapshot: PropertySnapshot, groupKey: string): boolean {
  if (groupKey === "contacts") return commonContacts(snapshot).length > 0;
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

export async function setPortfolioAutoShare(portfolioIds: string[], enabled: boolean): Promise<void> {
  for (const portfolioId of portfolioIds) {
    const { data, error } = await supabase
      .from("property_portfolios")
      .select("metadata")
      .eq("id", portfolioId)
      .maybeSingle();
    if (error) throw error;
    const metadata = asRecord(data?.metadata);
    metadata.commons = { ...asRecord(metadata.commons), auto_share: enabled };
    const { error: updateError } = await supabase
      .from("property_portfolios")
      .update({ metadata: metadata as Json })
      .eq("id", portfolioId);
    if (updateError) throw updateError;
  }
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface CommonsWriteResult {
  updatedProperties: number;
  updatedGroups: string[];
  contactsWritten: number;
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
        if (!overwrite && !isBlank(current)) continue;
        columnUpdates[field.path] = value;
        dirty = true;
        touchedGroups.add(field.group);
        continue;
      }

      const current = getPath(amenities, field.path);
      const next = field.deep ? mergeValues(value, current, overwrite) : overwrite || isBlank(current) ? value : current;
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
        touchedGroups.add("contacts");
        dirty = true;
      }
    }

    if (dirty) updatedProperties += 1;
  }

  return { updatedProperties, updatedGroups: [...touchedGroups], contactsWritten };
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
    return { updatedProperties: 0, updatedGroups: [], contactsWritten: 0 };
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
    return { updatedProperties: 0, updatedGroups: [], contactsWritten: 0 };

  const snapshots = await fetchSnapshots([propertyId, ...siblingIds]);
  const self = snapshots.find((s) => s.id === propertyId);
  if (!self) throw new Error("Property not found");

  const result: CommonsWriteResult = { updatedProperties: 0, updatedGroups: [], contactsWritten: 0 };
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
  }

  result.updatedGroups = [...touched];
  result.updatedProperties = touched.size > 0 ? 1 : 0;
  return result;
}

/**
 * Auto-share hook: called after a property save. When the portfolio has
 * auto-share enabled, completed common data is pushed into siblings' blanks
 * (never overwriting) and blanks on this property are filled from siblings.
 */
export async function runAutoShare(propertyId: string): Promise<CommonsWriteResult | null> {
  const portfolioIds = await fetchPortfolioIds(propertyId);
  if (portfolioIds.length === 0) return null;
  if (!(await fetchAutoShare(portfolioIds))) return null;

  const groupKeys = PORTFOLIO_COMMONS_GROUPS.map((g) => g.key);
  const siblingIds = await fetchSiblingIds(propertyId, portfolioIds);
  const pushed = await shareCommonsToSiblings(propertyId, siblingIds, groupKeys, { overwrite: false });
  const pulled = await backfillCommonsFromPortfolio(propertyId, groupKeys);
  return {
    updatedProperties: pushed.updatedProperties + pulled.updatedProperties,
    updatedGroups: [...new Set([...pushed.updatedGroups, ...pulled.updatedGroups])],
    contactsWritten: pushed.contactsWritten + pulled.contactsWritten,
  };
}
