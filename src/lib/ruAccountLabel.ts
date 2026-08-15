/**
 * One canonical way to name a Channel Manager distribution sub-account.
 *
 * Two addresses exist per account: the portal login (used to sign in at the
 * channel) and the contact address stored against the company profile. Screens
 * that printed one or the other made a single account read as two different
 * accounts, so every surface uses this helper instead.
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

/** e.g. `rooms@example.com · OwnerID 741765 (contact connect@example.com)` */
export function ruAccountLabel(account: RuAccountIdentity | null | undefined): string {
  const login = ruAccountLogin(account);
  const ownerId = account?.ru_owner_id != null ? String(account.ru_owner_id).trim() : "";
  const base = [login || "Unnamed sub-account", ownerId ? `OwnerID ${ownerId}` : null]
    .filter(Boolean)
    .join(" · ");
  const contact = account?.owner_email || null;
  return contact && contact !== login ? `${base} (contact ${contact})` : base;
}
