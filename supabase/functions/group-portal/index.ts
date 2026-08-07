/**
 * Public rooming-list portal for group bookings.
 * A group organiser opens /group-rooming/<token> and completes guest names for
 * the rooms held for them. No login required — the token is the credential.
 * Writes are capped at the remaining held (blocked, not yet picked up) rooms.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

type Client = SupabaseClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const rowSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  block_id: z.string().uuid(),
  guest_name: z.string().min(1).max(200),
  guest_email: z.string().max(200).nullable().optional(),
  guest_phone: z.string().max(50).nullable().optional(),
  adults: z.number().int().min(1).max(20).optional(),
  children: z.number().int().min(0).max(20).optional(),
  room_preference: z.string().max(200).nullable().optional(),
  special_requests: z.string().max(2000).nullable().optional(),
});

const bodySchema = z.object({
  action: z.enum(["load", "save"]),
  token: z.string().uuid(),
  rows: z.array(rowSchema).max(500).optional(),
});

async function resolveGroup(supabase: Client, token: string) {
  const { data, error } = await supabase
    .from("rolos_groups")
    .select("id, name, property_id, check_in_date, check_out_date, portal_enabled, portal_expires_at, cutoff_date")
    .eq("portal_token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.portal_enabled) return null;
  if (data.portal_expires_at && new Date(data.portal_expires_at).getTime() < Date.now()) return null;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { action, token, rows } = parsed.data;

    const group = await resolveGroup(supabase, token);
    if (!group) return json({ error: "This rooming-list link is not valid or has expired." }, 404);

    const [{ data: property }, { data: blocks }, { data: lines }] = await Promise.all([
      supabase.from("properties").select("name").eq("id", group.property_id).maybeSingle(),
      supabase
        .from("rolos_group_room_blocks")
        .select("id, room_type_id, blocked_count, picked_up_count, start_date, end_date, status, room_type:rolos_room_types!room_type_id(name)")
        .eq("group_id", group.id)
        .order("start_date"),
      supabase
        .from("rolos_group_reservations")
        .select("id, block_id, guest_name, guest_email, guest_phone, adults, children, room_preference, special_requests, status, booking_id")
        .eq("group_id", group.id)
        .order("created_at"),
    ]);

    if (action === "load") {
      return json({ success: true, group: { id: group.id, name: group.name, check_in_date: group.check_in_date, check_out_date: group.check_out_date, cutoff_date: group.cutoff_date }, property_name: property?.name ?? null, blocks: blocks || [], rows: lines || [] });
    }

    // ------------------------------------------------------------------ save
    const existing = lines || [];
    const capacity = new Map<string, number>();
    for (const b of (blocks || [])) {
      if (b.status === "released") continue;
      capacity.set(b.id, Number(b.blocked_count) || 0);
    }

    const accepted: typeof rows = [];
    const rejected: { guest_name: string; reason: string }[] = [];
    const used = new Map<string, number>();

    for (const row of (rows || [])) {
      const cap = capacity.get(row.block_id);
      if (cap === undefined) {
        rejected.push({ guest_name: row.guest_name, reason: "Room block is no longer available" });
        continue;
      }
      const soFar = used.get(row.block_id) || 0;
      if (soFar >= cap) {
        rejected.push({ guest_name: row.guest_name, reason: "No rooms left in this block" });
        continue;
      }
      used.set(row.block_id, soFar + 1);
      accepted.push(row);
    }

    const keepIds = new Set(accepted.map((r) => r.id).filter(Boolean) as string[]);
    const lockedIds = new Set(existing.filter((l) => l.booking_id).map((l) => l.id));

    for (const row of accepted) {
      const payload = {
        group_id: group.id,
        block_id: row.block_id,
        guest_name: row.guest_name.trim(),
        guest_email: row.guest_email?.trim() || null,
        guest_phone: row.guest_phone?.trim() || null,
        adults: row.adults ?? 1,
        children: row.children ?? 0,
        room_preference: row.room_preference?.trim() || null,
        special_requests: row.special_requests?.trim() || null,
      };
      if (row.id && !lockedIds.has(row.id)) {
        await supabase.from("rolos_group_reservations").update(payload).eq("id", row.id).eq("group_id", group.id);
      } else if (!row.id) {
        await supabase.from("rolos_group_reservations").insert({ ...payload, status: "pending" });
      }
    }

    // Rows the organiser removed — only ones not yet turned into a booking.
    const toDelete = existing
      .filter((l) => !l.booking_id && !keepIds.has(l.id))
      .map((l) => l.id);
    if (toDelete.length) {
      await supabase.from("rolos_group_reservations").delete().in("id", toDelete).eq("group_id", group.id);
    }

    console.log(`[group-portal] Saved rooming list for group ${group.id}: ${accepted.length} rows, ${rejected.length} rejected`);
    return json({ success: true, saved: accepted.length, rejected });
  } catch (error) {
    console.error("[group-portal] Error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
