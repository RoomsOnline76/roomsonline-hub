// Resolves the internal operations recipients for platform warning emails
// (channel-manager disparities, sync alerts, ...).
//
// Precedence:
//   1. OPS_ALERT_EMAILS secret (comma/semicolon separated) — explicit override.
//   2. Profiles holding the `dev` / `admin` / `fearless_leader` role.
//   3. dev@roomsonline.co.za as a last-resort fallback so an alert never vanishes.
//
// Cached per function instance to avoid a lookup on every send.

let cached: string[] | null = null;

const OPS_ROLES = ["dev", "admin", "fearless_leader"] as const;
const FALLBACK = "dev@roomsonline.co.za";

function parseEnvList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

export async function getOpsAlertRecipients(supabase: any): Promise<string[]> {
  if (cached) return cached;

  const fromEnv = parseEnvList(Deno.env.get("OPS_ALERT_EMAILS"));
  if (fromEnv.length > 0) {
    cached = fromEnv;
    return cached;
  }

  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", OPS_ROLES as unknown as string[]);
    const ids = [...new Set((roles ?? []).map((r: any) => r.user_id).filter(Boolean))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("email").in("id", ids);
      const emails = [
        ...new Set(
          (profiles ?? [])
            .map((p: any) => String(p.email || "").trim())
            .filter((e: string) => e.includes("@")),
        ),
      ];
      if (emails.length > 0) {
        cached = emails;
        return cached;
      }
    }
  } catch (e) {
    console.error("[opsAlertRecipients] lookup failed:", e);
  }

  cached = [FALLBACK];
  return cached;
}
