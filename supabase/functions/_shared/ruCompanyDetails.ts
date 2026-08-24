/**
 * Company-details satisfaction for a Rentals United sub-account.
 *
 * RU applies Push_FillCompanyDetails_RQ to whichever account authenticates the
 * call — there is no <OwnerID> selector — so the profile only lands on the
 * sub-account once it has its own verified key pair / sub-user login. A push
 * recorded BEFORE the sub-account's credentials were verified therefore proves
 * nothing about the sub-account, and verified credentials on their own are not
 * evidence of a push at all.
 *
 * The rule: `company_details_status` must be a real push outcome ("sent" or
 * "already_set") AND `company_filled_at` must be at or after the sub-account's
 * key verification timestamp.
 */

export interface RuCompanyDetailsState {
  satisfied: boolean;
  /** `pushed` = verified push on record. `stale` = a push exists but predates key verification. */
  via: "pushed" | "stale" | "none";
  pushedAt: string | null;
  keysVerifiedAt: string | null;
}

type Db = { from: (table: string) => any };

/** Push outcomes that mean RU actually accepted the company profile. */
const PUSHED_STATUSES = ["sent", "already_set"];

/** Small tolerance for the two writes landing out of order. */
const SKEW_MS = 60_000;

export async function ruCompanyDetailsSatisfied(
  admin: Db,
  ruOwnerId: string | number | null | undefined,
  account?: {
    id?: string | null;
    company_details_sent?: boolean | null;
    company_filled_at?: string | null;
    company_details_status?: string | null;
  } | null,
): Promise<RuCompanyDetailsState> {
  const ownerId = String(ruOwnerId ?? "").trim();
  let status = account?.company_details_status;
  let filledAt = account?.company_filled_at;

  // Callers that only selected the legacy flag still get a correct answer.
  if (status === undefined && (account?.id || ownerId)) {
    const q = admin.from("ru_owner_accounts").select("company_details_status, company_filled_at");
    const { data: row } = await (account?.id ? q.eq("id", account.id) : q.eq("ru_owner_id", ownerId))
      .maybeSingle();
    status = row?.company_details_status ?? null;
    filledAt = filledAt ?? row?.company_filled_at ?? null;
  }

  const pushed = PUSHED_STATUSES.includes(String(status ?? "").toLowerCase());
  const filled = filledAt ? new Date(filledAt).getTime() : 0;

  let verifiedAt: string | null = null;
  let keysCreatedAt: string | null = null;
  if (ownerId) {
    const { data: cred } = await admin
      .from("ru_api_credentials")
      .select("verified_at, created_at")
      .eq("ru_owner_id", ownerId)
      .maybeSingle();
    verifiedAt = cred?.verified_at ?? null;
    keysCreatedAt = cred?.created_at ?? null;
  }

  if (!pushed || !filled) {
    return { satisfied: false, via: "none", pushedAt: filledAt ?? null, keysVerifiedAt: verifiedAt };
  }

  // The proof point is when the sub-account FIRST had its own key pair, not the latest
  // re-verification: re-running Step A re-verifies the keys, and comparing against that
  // newer timestamp made an accepted profile read as "stale" and blocked every push.
  const firstProof = new Date(keysCreatedAt ?? verifiedAt ?? 0).getTime();
  if (!verifiedAt || (firstProof && filled < firstProof - SKEW_MS)) {
    return { satisfied: false, via: "stale", pushedAt: filledAt ?? null, keysVerifiedAt: verifiedAt };
  }
  return { satisfied: true, via: "pushed", pushedAt: filledAt ?? null, keysVerifiedAt: verifiedAt };
}

