/**
 * Company-details satisfaction for a Rentals United sub-account.
 *
 * `ru_owner_accounts.company_details_sent` only becomes true when WE run
 * Push_FillCompanyDetails_RQ. That path is parked whenever RU user management is
 * off, and a rebind resets the flag — so a sub-account that RU itself already
 * carries a complete company profile for (proven by working, verified API keys
 * issued under that OwnerID) was permanently unable to enable push.
 *
 * Verified per-owner API credentials are therefore accepted as equivalent
 * evidence, and the durable account row is backfilled so every other reader
 * (wizard, entitlement, sync gate, cert pack) agrees.
 */

export interface RuCompanyDetailsState {
  satisfied: boolean;
  via: "flag" | "verified_keys" | "none";
}

type Db = { from: (table: string) => any };

export async function ruCompanyDetailsSatisfied(
  admin: Db,
  ruOwnerId: string | number | null | undefined,
  account?: {
    id?: string | null;
    company_details_sent?: boolean | null;
    company_filled_at?: string | null;
  } | null,
): Promise<RuCompanyDetailsState> {
  if (account?.company_details_sent === true || account?.company_filled_at) {
    return { satisfied: true, via: "flag" };
  }
  const ownerId = String(ruOwnerId ?? "").trim();
  if (!ownerId) return { satisfied: false, via: "none" };

  const { data: cred } = await admin
    .from("ru_api_credentials")
    .select("access_key, verified_at")
    .eq("ru_owner_id", ownerId)
    .maybeSingle();
  if (!cred?.access_key || !cred?.verified_at) return { satisfied: false, via: "none" };

  if (account?.id) {
    try {
      await admin
        .from("ru_owner_accounts")
        .update({
          company_details_sent: true,
          company_filled_at: cred.verified_at,
          company_details_status: "credentials_verified",
        })
        .eq("id", account.id);
    } catch (e) {
      console.warn(
        "[ruCompanyDetails] backfill failed",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return { satisfied: true, via: "verified_keys" };
}
