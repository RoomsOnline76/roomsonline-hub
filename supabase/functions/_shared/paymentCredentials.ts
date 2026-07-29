// Shared resolver for per-property (BYO) payment gateway credentials.
//
// Resolution order for a given property:
//   1. Property (or its portfolio) is allowed to use a custom provider AND has an
//      active `integration_configs` row of type `payment_credentials` with usable
//      values  -> use those  (source: "byo")
//   2. Otherwise fall back to the RoomsOnline facilitator env secrets (source: "rol")
//
// Never log full credential values — only the masked helpers exported here.

export type CredentialSource = "byo" | "rol";

export interface PayfastCredentials {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  isSandbox: boolean;
  source: CredentialSource;
  /** Property whose BYO config was used (null when falling back to ROL) */
  ownerPropertyId: string | null;
  /** True when the BYO config came from another property in the same portfolio */
  inherited: boolean;
  /**
   * False when this merchant account is known NOT to support PayFast Onsite
   * (in-page) payments — checkout must use the hosted redirect flow instead.
   */
  onsiteSupported: boolean;
}


/** Strip invisible / control characters that break PayFast signatures. */
function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/[\x00-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

export function maskId(value?: string | null): string {
  const v = clean(value);
  if (!v) return "";
  return v.length <= 4 ? "****" : `****${v.slice(-4)}`;
}

function envPayfastCredentials(): PayfastCredentials {
  return {
    merchantId: clean(Deno.env.get("PAYFAST_MERCHANT_ID")),
    merchantKey: clean(Deno.env.get("PAYFAST_MERCHANT_KEY")),
    passphrase: clean(Deno.env.get("PAYFAST_PASSPHRASE")),
    isSandbox: Deno.env.get("PAYFAST_SANDBOX") !== "false",
    source: "rol",
    ownerPropertyId: null,
    inherited: false,
  };
}

interface StoredConfig {
  property_id: string;
  config: Record<string, unknown> | null;
}

function extractPayfast(config: Record<string, unknown> | null) {
  if (!config) return null;
  const merchantId = clean((config as any).merchant_id);
  const merchantKey = clean((config as any).merchant_key);
  if (!merchantId || !merchantKey) return null;
  const sandboxFlag = (config as any).sandbox ?? (config as any).is_sandbox ?? (config as any).test_mode;
  return {
    merchantId,
    merchantKey,
    passphrase: clean((config as any).passphrase),
    isSandbox: sandboxFlag === true || sandboxFlag === "true",
  };
}

/**
 * Resolve the PayFast merchant account that should be used for a property.
 * Falls back to the RoomsOnline facilitator account whenever BYO is not
 * enabled or not fully configured.
 */
export async function resolvePayfastCredentials(
  supabase: any,
  propertyId?: string | null,
): Promise<PayfastCredentials> {
  const fallback = envPayfastCredentials();
  if (!propertyId) return fallback;

  try {
    const { data: property } = await supabase
      .from("properties")
      .select("id, allow_custom_payment_provider")
      .eq("id", propertyId)
      .maybeSingle();

    if (!property?.allow_custom_payment_provider) return fallback;

    // Candidate properties: this one first, then portfolio siblings (inheritance).
    const candidates: string[] = [propertyId];

    const { data: memberships } = await supabase
      .from("property_portfolio_members")
      .select("portfolio_id")
      .eq("property_id", propertyId);

    const portfolioIds = (memberships || []).map((m: any) => m.portfolio_id).filter(Boolean);
    if (portfolioIds.length > 0) {
      const { data: siblings } = await supabase
        .from("property_portfolio_members")
        .select("property_id")
        .in("portfolio_id", portfolioIds);
      for (const s of siblings || []) {
        if (s.property_id && !candidates.includes(s.property_id)) candidates.push(s.property_id);
      }
    }

    const { data: configs } = await supabase
      .from("integration_configs")
      .select("property_id, config")
      .eq("integration_type", "payment_credentials")
      .eq("is_active", true)
      .in("property_id", candidates);

    const rows = (configs || []) as StoredConfig[];
    // Prefer the property's own config, then any portfolio sibling.
    const ordered = [
      ...rows.filter((r) => r.property_id === propertyId),
      ...rows.filter((r) => r.property_id !== propertyId),
    ];

    for (const row of ordered) {
      const creds = extractPayfast(row.config);
      if (creds) {
        return {
          ...creds,
          source: "byo",
          ownerPropertyId: row.property_id,
          inherited: row.property_id !== propertyId,
        };
      }
    }
  } catch (e) {
    console.error("[paymentCredentials] resolve failed, using facilitator account:", e);
  }

  return fallback;
}
