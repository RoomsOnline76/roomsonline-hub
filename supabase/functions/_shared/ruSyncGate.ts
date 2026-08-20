/**
 * Operational RU push/pull gate.
 *
 * Dashboard edits (bookings, cancels, mods, blockouts) always write locally.
 * A property is distributed as soon as it is genuinely connected: bound owner +
 * key/secret, company details sent, and a live listing. There is no separate
 * "switch pushes on" step — distribution is the default state.
 *
 * The only way a connected property stops syncing is an explicit hold, which
 * carries a reason so the refusal always explains itself.
 */

import { ruCompanyDetailsSatisfied } from "./ruCompanyDetails.ts";

export const RU_WIZARD_SYNC_CODE = "WIZARD_SYNC_NOT_READY";
/** Deliberate, recorded hold on channel distribution for this property. */
export const RU_ON_HOLD_CODE = "RU_ON_HOLD";

export interface RuSyncGateResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

function deny(code: string, message: string): RuSyncGateResult {
  return { allowed: false, code, message };
}

/** True only when the property is connected and not on an explicit hold. */
export async function evaluateRuOperationalSync(
  admin: { from: (table: string) => any },
  propertyId: string,
): Promise<RuSyncGateResult> {
  const { data: prop } = await admin
    .from("properties")
    .select(
      "id, ru_push_enabled, ru_hold_reason, ru_hold_set_at, rentalsunited_property_id, owner_email",
    )
    .eq("id", propertyId)
    .maybeSingle();
  if (!prop) return deny("no_property", "Property not found");
  if (prop.ru_push_enabled === false) {
    const since = prop.ru_hold_set_at ? ` since ${String(prop.ru_hold_set_at).slice(0, 10)}` : "";
    const why = prop.ru_hold_reason ? `: ${prop.ru_hold_reason}` : "";
    return deny(
      RU_ON_HOLD_CODE,
      `Channel distribution is on hold for this property${since}${why}.`,
    );
  }


  const { data: listed } = await admin
    .from("hostfully_room_types")
    .select("id")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .not("rentalsunited_property_id", "is", null)
    .limit(1);
  if (!prop.rentalsunited_property_id && !(listed ?? []).length) {
    return deny("RU_NOT_LISTED", "No Channel Manager listing yet.");
  }

  const { data: mem } = await admin
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId)
    .maybeSingle();

  let accQuery = admin
    .from("ru_owner_accounts")
    .select("id, ru_owner_id, ru_api_access_key, company_details_sent, company_filled_at")
    .not("ru_owner_id", "is", null)
    .limit(1);
  accQuery = mem?.portfolio_id
    ? accQuery.eq("portfolio_id", mem.portfolio_id)
    : accQuery.eq("property_id", propertyId);
  const { data: acc } = await accQuery.maybeSingle();

  if (!acc?.ru_owner_id) {
    return deny(RU_WIZARD_SYNC_CODE, "Property is unbound — Channel wizard gates have not passed.");
  }
  const company = await ruCompanyDetailsSatisfied(admin, acc.ru_owner_id, acc);
  if (!company.satisfied) {
    return deny(
      RU_WIZARD_SYNC_CODE,
      "Company details have not been sent — Channel wizard is incomplete.",
    );
  }

  const { data: cred } = await admin
    .from("ru_api_credentials")
    .select("access_key")
    .eq("ru_owner_id", String(acc.ru_owner_id))
    .maybeSingle();
  if (!cred?.access_key && !acc.ru_api_access_key) {
    return deny(
      RU_WIZARD_SYNC_CODE,
      "Owner key & secret are not configured — Channel wizard is incomplete.",
    );
  }

  return { allowed: true };
}

/** OwnerIDs that have at least one property with an explicit wizard-passed push. */
export async function ownerIdsWithOperationalSync(
  admin: { from: (table: string) => any },
): Promise<Set<string>> {
  const { data: accounts } = await admin
    .from("ru_owner_accounts")
    .select("id, ru_owner_id, portfolio_id, property_id, company_details_sent, company_filled_at")
    .not("ru_owner_id", "is", null);
  const ready = new Set<string>();
  for (const acc of accounts ?? []) {
    if (!acc.ru_owner_id) continue;
    if (!(await ruCompanyDetailsSatisfied(admin, acc.ru_owner_id, acc)).satisfied) continue;
    let ids: string[] = [];
    if (acc.portfolio_id) {
      const { data: members } = await admin
        .from("property_portfolio_members")
        .select("property_id")
        .eq("portfolio_id", acc.portfolio_id);
      ids = (members ?? []).map((m: { property_id: string }) => m.property_id);
    } else if (acc.property_id) {
      ids = [acc.property_id];
    }
    if (!ids.length) continue;
    const { data: props } = await admin
      .from("properties")
      .select("id")
      .in("id", ids)
      .eq("ru_push_enabled", true)
      .limit(1);
    if ((props ?? []).length) ready.add(String(acc.ru_owner_id));
  }
  return ready;
}
