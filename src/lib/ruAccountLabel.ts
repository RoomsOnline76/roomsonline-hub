/**
 * One canonical way to name a Channel Manager distribution sub-account.
 *
 * The account IS its portal login. `owner_email` on our own records is the
 * PROPERTY owner's address, not the sub-account's contact address, so it must
 * never be printed as a second "contact" for the account — doing so made one
 * account read as two (OwnerID 741765 showed as connect@ "(contact rooms@)"
 * when both its login and its contact address are connect@).
 */
export interface RuAccountIdentity {
  ru_owner_id?: string | number | null;
  ru_login_email?: string | null;
  owner_email?: string | null;
}

/** Portal login first — it is the login used in the channel portal. */
export function ruAccountLogin(account: RuAccountIdentity | null | undefined): string | null {
  return account?.ru_login_email || account?.owner_email || null;
}

/** e.g. `connect@example.com · OwnerID 741765` */
export function ruAccountLabel(account: RuAccountIdentity | null | undefined): string {
  const login = ruAccountLogin(account);
  const ownerId = account?.ru_owner_id != null ? String(account.ru_owner_id).trim() : "";
  return [login || "Unnamed sub-account", ownerId ? `OwnerID ${ownerId}` : null]
    .filter(Boolean)
    .join(" · ");
}
