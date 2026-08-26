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

/** RU's ordered schema requires Authentication, then Label, then Scope. */
export function buildCreateApiKeyXml(auth: RuApiKeyAuth, label: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<Push_CreateApiKey_RQ>${buildAuthXml(auth)}<Label>${escapeXml(label)}</Label><Scope>XmlApi</Scope></Push_CreateApiKey_RQ>`;
}