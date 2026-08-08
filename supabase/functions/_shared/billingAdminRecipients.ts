// Resolves the internal billing recipients that must be copied on every
// subscription / once-off invoice email.
//
// Precedence:
//   1. BILLING_ADMIN_EMAILS secret (comma separated) — explicit override.
//   2. Profiles holding the `admin` / `fearless_leader` role.
//
// Results are cached per function instance to avoid a lookup on every send.

let cached: string[] | null = null;

const ADMIN_ROLES = ["admin", "fearless_leader"] as const;

function parseEnvList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

export async function getBillingAdminRecipients(supabase: any): Promise<string[]> {
  if (cached) return cached;

  const fromEnv = parseEnvList(Deno.env.get("BILLING_ADMIN_EMAILS"));
  if (fromEnv.length > 0) {
    cached = fromEnv;
    return cached;
  }

  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ADMIN_ROLES as unknown as string[]);
    const ids = [...new Set((roles ?? []).map((r: any) => r.user_id).filter(Boolean))];
    if (ids.length === 0) {
      cached = [];
      return cached;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("email")
      .in("id", ids);
    cached = [
      ...new Set(
        (profiles ?? [])
          .map((p: any) => String(p.email || "").trim())
          .filter((e: string) => e.includes("@")),
      ),
    ];
  } catch (e) {
    console.error("[billingAdminRecipients] lookup failed:", e);
    cached = [];
  }
  return cached;
}

/** Admin copies minus the owner, so nobody receives a duplicate. */
export async function getAdminCopyRecipients(supabase: any, ownerEmail?: string | null) {
  const admins = await getBillingAdminRecipients(supabase);
  const owner = String(ownerEmail || "").trim().toLowerCase();
  return admins.filter((e) => e.toLowerCase() !== owner);
}
