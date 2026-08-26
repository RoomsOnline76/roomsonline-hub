export type RuApiKeyAuth =
  | { mode: "keys"; access_key: string; secret_key: string }
  | { mode: "password"; username: string; password: string }
  /**
   * Master-authenticated, sub-account-scoped mint. Used only after the sub-account's
   * own login/password envelope has been refused ("Incorrect login or password"),
   * which the channel returns even for an account created seconds earlier. The
   * OwnerID keeps the pair scoped to the sub-account, so this is not a master
   * fallback for child-scoped writes (those stay password-authenticated).
   */
  | { mode: "owner_scoped"; access_key: string; secret_key: string; owner_id: string };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildAuthXml(auth: RuApiKeyAuth): string {
  if (auth.mode === "password") {
    return `<Authentication><UserName>${escapeXml(auth.username)}</UserName><Password>${escapeXml(auth.password)}</Password></Authentication>`;
  }
  return `<Authentication><AccessKey>${escapeXml(auth.access_key)}</AccessKey><SecretKey>${escapeXml(auth.secret_key)}</SecretKey></Authentication>`;
}

/**
 * RU's ordered schema requires Authentication, then (owner-scoped only) OwnerID,
 * then Label, then Scope.
 *
 * A newly-created sub-account uses its generated username/password to mint the
 * first pair atomically. Existing accounts may use their current pair for rotation.
 */
export function buildCreateApiKeyXml(auth: RuApiKeyAuth, label: string): string {
  if (auth.mode === "keys" && (!auth.access_key || !auth.secret_key)) {
    throw new Error("RU_CHILD_AUTH_REQUIRED: AccessKey and SecretKey are required");
  }
  if (auth.mode === "password" && (!auth.username || !auth.password)) {
    throw new Error("RU_CHILD_AUTH_REQUIRED: UserName and Password are required");
  }
  if (auth.mode === "owner_scoped" && (!auth.access_key || !auth.secret_key || !auth.owner_id)) {
    throw new Error("RU_CHILD_AUTH_REQUIRED: AccessKey, SecretKey and OwnerID are required");
  }
  const ownerXml = auth.mode === "owner_scoped" ? `<OwnerID>${escapeXml(auth.owner_id)}</OwnerID>` : "";
  return `<?xml version="1.0" encoding="utf-8"?>\n<Push_CreateApiKey_RQ>${buildAuthXml(auth)}${ownerXml}<Label>${escapeXml(label)}</Label><Scope>XmlApi</Scope></Push_CreateApiKey_RQ>`;
}

