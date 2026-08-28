export type RuApiKeyAuth =
  | { mode: "keys"; access_key: string; secret_key: string }
  | { mode: "password"; username: string; password: string };

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
 * Push_CreateApiKey_RQ per the documented schema: Authentication, then Label, then Scope.
 * The documented request has NO OwnerID element — the channel always issues the pair for
 * whichever account authenticates. A master-authenticated envelope therefore only ever
 * yields a MASTER pair, so it is not expressible here.
 *
 * A newly-created sub-account uses the login/password sent in Push_CreateUser_RQ to mint
 * its first pair atomically. Existing accounts may use their current pair for rotation.
 */
export function buildCreateApiKeyXml(auth: RuApiKeyAuth, label: string): string {
  if (auth.mode === "keys" && (!auth.access_key || !auth.secret_key)) {
    throw new Error("RU_CHILD_AUTH_REQUIRED: AccessKey and SecretKey are required");
  }
  if (auth.mode === "password" && (!auth.username || !auth.password)) {
    throw new Error("RU_CHILD_AUTH_REQUIRED: UserName and Password are required");
  }
  return `<?xml version="1.0" encoding="utf-8"?>\n<Push_CreateApiKey_RQ>${buildAuthXml(auth)}<Label>${escapeXml(label)}</Label><Scope>XmlApi</Scope></Push_CreateApiKey_RQ>`;
}


