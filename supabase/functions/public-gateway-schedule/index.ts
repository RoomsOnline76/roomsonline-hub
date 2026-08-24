/**
 * Public read of the ACTIVE payment-processing schedule.
 *
 * The Connect portal is anonymous, and `gateway_billing_configs` is readable by
 * signed-in users only. This returns just the commercial fields of the active
 * row so the public pricing page, FAQ and the Connect assistant quote exactly
 * what the invoice run charges and the contract states — no table access is
 * widened and no internal columns are exposed.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  });

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Keep only the fields the public surfaces are allowed to quote. */
function publicTiers(input: unknown) {
  const raw = typeof input === "string" ? safeParse(input) : input;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const r = entry as Record<string, unknown>;
      const percentage = num(r.percentage);
      if (percentage == null) return null;
      return {
        min_monthly_volume: num(r.min_monthly_volume) ?? 0,
        max_monthly_volume: num(r.max_monthly_volume),
        percentage,
        fixed_fee: num(r.fixed_fee),
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => a.min_monthly_volume - b.min_monthly_volume);
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase
      .from("gateway_billing_configs")
      .select(
        "name, version, model, base_percentage, fixed_fee_per_txn, monthly_platform_fee, passthrough_markup_percentage, volume_tiers, currency, effective_from",
      )
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("public-gateway-schedule read failed:", error.message);
      return json({ schedule: null, error: "schedule_unavailable" }, 200);
    }
    if (!data) return json({ schedule: null }, 200);

    return json({
      schedule: {
        name: data.name ?? null,
        version: num(data.version),
        model: String(data.model ?? "flat").toLowerCase(),
        base_percentage: num(data.base_percentage),
        fixed_fee_per_txn: num(data.fixed_fee_per_txn),
        monthly_platform_fee: num(data.monthly_platform_fee),
        passthrough_markup_percentage: num(data.passthrough_markup_percentage),
        volume_tiers: publicTiers(data.volume_tiers),
        currency: data.currency ?? "ZAR",
        effective_from: data.effective_from ?? null,
      },
    });
  } catch (e) {
    console.error("public-gateway-schedule error:", e);
    return json({ schedule: null, error: "schedule_unavailable" }, 200);
  }
});
