export interface RuCreatedUserIdentity {
  userAccountId: string | null;
  ownerId: string | null;
}

/**
 * RU returns the newly-created account identity as `UserAccountId` in
 * `Push_CreateUser_RS`. Despite the historical field name, this is the OwnerID used by
 * subsequent owner-scoped calls for that new child account.
 */
export function parseRuCreatedUserIdentity(xml: string): RuCreatedUserIdentity {
  const match = xml.match(/<UserAccountI[dD]>\s*(\d+)\s*<\/UserAccountI[dD]>/i);
  const userAccountId = match?.[1]?.trim() ?? null;
  const validId = userAccountId && userAccountId !== "0" ? userAccountId : null;
  return { userAccountId: validId, ownerId: validId };
}