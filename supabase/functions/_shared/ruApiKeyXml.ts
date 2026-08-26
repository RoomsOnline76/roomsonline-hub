export type RuApiKeyAuth = { mode: "keys"; access_key: string; secret_key: string };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildAuthXml(auth: RuApiKeyAuth): string {
  return `<Authentication><AccessKey>${escapeXml(auth.access_key)}</AccessKey><SecretKey>${escapeXml(auth.secret_key)}</SecretKey></Authentication>`;
}

/**
 * RU's ordered schema requires Authentication, then Label, then Scope.
 *
 * Portal username/password is NOT accepted by this endpoint: the first key pair
 * must be generated in the channel portal. The runtime guard below keeps a loose
 * cast at a future call site from ever re-emitting a password-mode payload.
 */
export function buildCreateApiKeyXml(auth: RuApiKeyAuth, label: string): string {
  const candidate = auth as Partial<RuApiKeyAuth> & { username?: unknown; password?: unknown };
  if (candidate?.mode !== "keys" || !candidate.access_key || !candidate.secret_key) {
    throw new Error(
      "RU_FIRST_API_KEY_REQUIRED: Push_CreateApiKey_RQ requires an existing child AccessKey/SecretKey pair — portal credentials are never sent to this endpoint.",
    );
  }
  return `<?xml version="1.0" encoding="utf-8"?>\n<Push_CreateApiKey_RQ>${buildAuthXml(auth)}<Label>${escapeXml(label)}</Label><Scope>XmlApi</Scope></Push_CreateApiKey_RQ>`;
}
