// ============================================================================
// ROL'OS GROUPS ENGINE
// Group room blocks, rooming lists, pickup, release/attrition, master folios.
//
// All inventory movements go through the atomic SQL routines:
//   rolos_apply_block_inventory / rolos_convert_block_to_booked
// and mirror into pms_availability_cache so the online engine + channels
// stop selling blocked rooms.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { expandPackageById, packageAddOnTotal } from "../_shared/packages.ts";

const SOURCE = "roomsonline";

// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nightsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  for (let d = new Date(s); d < e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}

/**
 * Mirror the authoritative inventory calendar into the availability cache the
 * booking engine + channel pushes read. Derived (not delta-applied) so blocks,
 * releases and pickups can never drift, and rows are created when missing —
 * a property with no cache rows yet would otherwise keep selling blocked rooms.
 */
async function syncAvailabilityCache(
  supabase: Client,
  propertyId: string,
  roomTypeId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const dates = nightsBetween(startDate, endDate);
  if (!dates.length) return 0;

  const { data: calendar, error } = await supabase
    .from("rolos_inventory_calendar")
    .select("date, available_units")
    .eq("property_id", propertyId)
    .eq("room_type_id", roomTypeId)
    .in("date", dates);
  if (error) {
    console.error("[pms-groups] inventory calendar read failed", error);
    return 0;
  }
  if (!calendar?.length) return 0;

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("pms_availability_cache")
    .select("date, restrictions")
    .eq("property_id", propertyId)
    .eq("system_type", SOURCE)
    .eq("external_room_type_id", roomTypeId)
    .in("date", dates);
  const restrictionsByDate = new Map<string, unknown>(
    (existing || []).map((r: { date: string; restrictions: unknown }) => [r.date, r.restrictions]),
  );

  const rows = calendar.map((c: { date: string; available_units: number | null }) => ({
    property_id: propertyId,
    system_type: SOURCE,
    external_room_type_id: roomTypeId,
    date: c.date,
    available_units: Math.max(0, Number(c.available_units || 0)),
    restrictions: restrictionsByDate.get(c.date) ?? {},
    fetched_at: now,
    source_timestamp: now,
    updated_at: now,
  }));

  const { error: upsertErr } = await supabase
    .from("pms_availability_cache")
    .upsert(rows, { onConflict: "property_id,system_type,external_room_type_id,date", ignoreDuplicates: false });
  if (upsertErr) {
    console.error("[pms-groups] availability cache sync failed", upsertErr);
    return 0;
  }
  return rows.length;
}


async function ensureMasterFolio(
  supabase: Client,
  group: { id: string; property_id: string; name: string; master_folio_id: string | null },
): Promise<string> {
  if (group.master_folio_id) return group.master_folio_id;

  const { data: existing } = await supabase
    .from("rolos_folios")
    .select("id")
    .eq("group_id", group.id)
    .maybeSingle();

  let folioId = existing?.id as string | undefined;

  if (!folioId) {
    const { data: created, error } = await supabase
      .from("rolos_folios")
      .insert({
        group_id: group.id,
        property_id: group.property_id,
        guest_name: `${group.name} (Master)`,
        status: "open",
        balance: 0,
        currency: "ZAR",
      })
      .select("id")
      .single();
    if (error) throw error;
    folioId = created.id;
  }

  await supabase.from("rolos_groups").update({ master_folio_id: folioId }).eq("id", group.id);
  return folioId!;
}

async function refreshFolioBalance(supabase: Client, folioId: string): Promise<void> {
  const { data: txns } = await supabase
    .from("rolos_folio_transactions")
    .select("amount")
    .eq("folio_id", folioId);
  const balance = (txns || []).reduce((sum: number, t: { amount: number }) => sum + Number(t.amount || 0), 0);
  await supabase
    .from("rolos_folios")
    .update({ balance: Math.round(balance * 100) / 100, updated_at: new Date().toISOString() })
    .eq("id", folioId);
}

/** Shared release path: restores inventory and optionally posts attrition. */
async function releaseBlock(
  supabase: Client,
  blockId: string,
  opts: { reason: string; chargeAttrition: boolean; userId: string | null },
): Promise<{ released: number; attrition: number }> {
  const { data: block, error: blockErr } = await supabase
    .from("rolos_group_room_blocks")
    .select("*, group:rolos_groups!group_id(id, property_id, name, attrition_rate, cutoff_date, billing_mode, master_folio_id)")
    .eq("id", blockId)
    .single();
  if (blockErr || !block) throw blockErr || new Error("Block not found");
  if (block.status !== "blocked") return { released: 0, attrition: 0 };

  const group = block.group;
  const propertyId = block.property_id || group.property_id;
  const remaining = Math.max(0, (block.blocked_count || 0) - (block.picked_up_count || 0));

  if (remaining > 0) {
    await supabase.rpc("rolos_apply_block_inventory", {
      _property_id: propertyId,
      _room_type_id: block.room_type_id,
      _start_date: block.start_date,
      _end_date: block.end_date,
      _delta: -remaining,
    });
    await syncAvailabilityCache(supabase, propertyId, block.room_type_id, block.start_date, block.end_date);
  }

  let attritionAmount = 0;
  const rate = Number(group.attrition_rate ?? 0);
  const pastCutoff = group.cutoff_date ? new Date(group.cutoff_date) <= new Date() : true;

  if (opts.chargeAttrition && rate > 0 && remaining > 0 && !block.attrition_charged && pastCutoff) {
    let nightlyRate = Number(block.rate_override || 0);
    if (!nightlyRate) {
      const { data: rt } = await supabase
        .from("rolos_room_types")
        .select("default_rate")
        .eq("id", block.room_type_id)
        .maybeSingle();
      nightlyRate = Number(rt?.default_rate || 0);
    }
    const nights = nightsBetween(block.start_date, block.end_date).length;
    attritionAmount = Math.round(remaining * nights * nightlyRate * (rate / 100) * 100) / 100;

    if (attritionAmount > 0) {
      const folioId = await ensureMasterFolio(supabase, group);
      await supabase.from("rolos_folio_transactions").insert({
        folio_id: folioId,
        transaction_type: "charge",
        description: `Attrition charge — ${remaining} unsold room(s) released (${rate}%)`,
        amount: attritionAmount,
        revenue_stream: "accommodation",
        created_by: opts.userId,
      });
      await refreshFolioBalance(supabase, folioId);
    }
  }

  await supabase
    .from("rolos_group_room_blocks")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
      attrition_charged: attritionAmount > 0 ? true : block.attrition_charged,
    })
    .eq("id", blockId);

  console.log(`[pms-groups] Released block ${blockId} (${remaining} rooms, reason=${opts.reason})`);
  return { released: remaining, attrition: attritionAmount };
}

// ============================== SCHEMAS =====================================

const createBlockSchema = z.object({
  property_id: z.string().uuid(),
  group_id: z.string().uuid(),
  room_type_id: z.string().uuid(),
  blocked_count: z.number().int().min(1).max(500),
  start_date: z.string().min(10),
  end_date: z.string().min(10),
  rate_override: z.number().nonnegative().nullable().optional(),
  release_date: z.string().min(10).nullable().optional(),
  package_id: z.string().uuid().nullable().optional(),
});

const pickupSchema = z.object({
  property_id: z.string().uuid(),
  group_id: z.string().uuid(),
  block_id: z.string().uuid(),
  rooming_list_id: z.string().uuid().nullable().optional(),
  guest_name: z.string().min(1).max(200),
  guest_email: z.string().email().nullable().optional(),
  guest_phone: z.string().max(50).nullable().optional(),
  arrival_date: z.string().min(10).nullable().optional(),
  departure_date: z.string().min(10).nullable().optional(),
  adults: z.number().int().min(1).max(20).optional(),
  children: z.number().int().min(0).max(20).optional(),
  room_preference: z.string().max(200).nullable().optional(),
  special_requests: z.string().max(2000).nullable().optional(),
  package_id: z.string().uuid().nullable().optional(),
});

const roomingRowSchema = z.object({
  guest_name: z.string().min(1).max(200),
  guest_email: z.string().max(200).nullable().optional(),
  guest_phone: z.string().max(50).nullable().optional(),
  arrival_date: z.string().nullable().optional(),
  departure_date: z.string().nullable().optional(),
  room_type_id: z.string().uuid().nullable().optional(),
  block_id: z.string().uuid().nullable().optional(),
  room_preference: z.string().max(200).nullable().optional(),
  special_requests: z.string().max(2000).nullable().optional(),
  adults: z.number().int().min(1).max(20).optional(),
  children: z.number().int().min(0).max(20).optional(),
});

// ============================== HANDLER =====================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Missing authorization" }, 401);

    const isServiceCall = token === serviceKey;
    let userId: string | null = null;
    if (!isServiceCall) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) return json({ error: "Unauthorized" }, 401);
      userId = user.id;
    }

    const body = await req.json();
    const action = String(body?.action || "");

    // Every non-service action is scoped to a property the caller can access.
    const propertyId = body?.property_id as string | undefined;
    if (!isServiceCall) {
      if (!propertyId) return json({ error: "property_id is required" }, 400);
      const { data: allowed, error: accessErr } = await supabase.rpc("can_access_property", {
        _property_id: propertyId,
        _user_id: userId,
      });
      if (accessErr || !allowed) return json({ error: "Forbidden: no access to this property" }, 403);
    }

    switch (action) {
      // ---------------------------------------------------------------- block
      case "group_create_block": {
        const parsed = createBlockSchema.safeParse(body);
        if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
        const p = parsed.data;
        if (nightsBetween(p.start_date, p.end_date).length === 0) {
          return json({ error: "end_date must be after start_date" }, 400);
        }

        // Atomic capacity-guarded hold: the RPC locks every night in the range,
        // refuses the whole hold on shortfall, and takes the rooms in the same
        // statement sequence — so two concurrent creates cannot over-hold.
        const { error: holdErr } = await supabase.rpc("rolos_hold_block_inventory", {
          _property_id: p.property_id,
          _room_type_id: p.room_type_id,
          _start_date: p.start_date,
          _end_date: p.end_date,
          _units: p.blocked_count,
        });
        if (holdErr) {
          const msg = String(holdErr.message || "");
          if (msg.includes("INSUFFICIENT_INVENTORY")) {
            return json({ error: msg.replace(/^.*INSUFFICIENT_INVENTORY:\s*/, "Not enough inventory: ") }, 409);
          }
          throw holdErr;
        }

        const { data: block, error } = await supabase
          .from("rolos_group_room_blocks")
          .insert({
            group_id: p.group_id,
            property_id: p.property_id,
            room_type_id: p.room_type_id,
            blocked_count: p.blocked_count,
            picked_up_count: 0,
            rate_override: p.rate_override ?? null,
            start_date: p.start_date,
            end_date: p.end_date,
            release_date: p.release_date ?? null,
            package_id: p.package_id ?? null,
            status: "blocked",
          })
          .select("*")
          .single();
        if (error) {
          // Give the rooms back — the hold already landed.
          await supabase.rpc("rolos_apply_block_inventory", {
            _property_id: p.property_id,
            _room_type_id: p.room_type_id,
            _start_date: p.start_date,
            _end_date: p.end_date,
            _delta: -p.blocked_count,
          });
          throw error;
        }

        await syncAvailabilityCache(supabase, p.property_id, p.room_type_id, p.start_date, p.end_date);

        return json({ success: true, block });
      }


      case "group_release_block": {
        const blockId = String(body?.block_id || "");
        if (!blockId) return json({ error: "block_id is required" }, 400);
        const result = await releaseBlock(supabase, blockId, {
          reason: body?.reason || "manual",
          chargeAttrition: body?.charge_attrition !== false,
          userId,
        });
        return json({ success: true, ...result });
      }

      // -------------------------------------------------------------- pickup
      case "group_pickup_room": {
        const parsed = pickupSchema.safeParse(body);
        if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
        const p = parsed.data;

        const { data: block, error: blockErr } = await supabase
          .from("rolos_group_room_blocks")
          .select("*, group:rolos_groups!group_id(id, name, contact_email, property_id, billing_mode, master_folio_id, deposit_amount)")
          .eq("id", p.block_id)
          .single();
        if (blockErr || !block) return json({ error: "Room block not found" }, 404);

        const remaining = (block.blocked_count || 0) - (block.picked_up_count || 0);
        if (block.status === "released") return json({ error: "This block has been released" }, 409);
        if (remaining <= 0) return json({ error: "No rooms left in this block" }, 409);

        const arrival = p.arrival_date || block.start_date;
        const departure = p.departure_date || block.end_date;
        const nights = nightsBetween(arrival, departure);
        if (!nights.length) return json({ error: "Departure must be after arrival" }, 400);

        let nightlyRate = Number(block.rate_override || 0);
        if (!nightlyRate) {
          const { data: rt } = await supabase
            .from("rolos_room_types")
            .select("default_rate")
            .eq("id", block.room_type_id)
            .maybeSingle();
          nightlyRate = Number(rt?.default_rate || 0);
        }
        const totalPrice = Math.round(nightlyRate * nights.length * 100) / 100;

        // Payment status follows the group's billing mode AND its deposit state:
        // individually-billed guests owe their own room; master/hybrid groups are
        // billed centrally, and a settled deposit makes that a part-payment.
        const billingMode = String(block.group?.billing_mode || "individual");
        const centralBilled = billingMode === "master" || billingMode === "hybrid";
        let paymentStatus = "pending";
        if (centralBilled) {
          paymentStatus = "invoiced";
          const depositDue = Number(block.group?.deposit_amount || 0);
          if (depositDue > 0 && block.group?.master_folio_id) {
            const { data: payments } = await supabase
              .from("rolos_folio_transactions")
              .select("amount")
              .eq("folio_id", block.group.master_folio_id)
              .eq("transaction_type", "payment");
            const paid = (payments || []).reduce(
              (s: number, t: { amount: number | null }) => s + Math.abs(Number(t.amount || 0)),
              0,
            );
            if (paid > 0) paymentStatus = "partial";
          }
        }

        const { data: booking, error: bookingErr } = await supabase
          .from("bookings")
          .insert({
            property_id: p.property_id,
            guest_name: p.guest_name,
            guest_email: p.guest_email || block.group?.contact_email || "no-email@rolos.local",
            guest_phone: p.guest_phone || null,
            check_in_date: arrival,
            check_out_date: departure,
            room_type_id: block.room_type_id,
            adults: p.adults ?? 1,
            children: p.children ?? 0,
            total_price: totalPrice,
            status: "confirmed",
            payment_status: paymentStatus,
            booking_channel: "group",
            integration_type: "rolos",
            special_requests: p.special_requests || null,
            internal_notes: `Group pickup — ${block.group?.name ?? ""}`.trim(),
          })
          .select("id")
          .single();
        if (bookingErr) throw bookingErr;

        const packageId = p.package_id || block.package_id || null;
        let packageAddOn = 0;

        /** Undo everything this pickup created — a half-picked-up room is worse than none. */
        const rollbackPickup = async (stage: string, err: unknown) => {
          console.error(`[pms-groups] pickup failed at ${stage}, rolling back`, err);
          try {
            await supabase.from("rolos_group_reservations").update({ booking_id: null, status: "pending" })
              .eq("booking_id", booking.id);
            await supabase.from("rolos_booking_rooms").delete().eq("booking_id", booking.id);
            await supabase.from("rolos_folio_transactions").delete().eq("reference", `pickup:${booking.id}`);
            const { data: folio } = await supabase.from("rolos_folios").select("id").eq("booking_id", booking.id).maybeSingle();
            if (folio?.id) {
              await supabase.from("rolos_folio_transactions").delete().eq("folio_id", folio.id);
              await supabase.from("rolos_folios").delete().eq("id", folio.id);
            }
            await supabase.from("bookings").delete().eq("id", booking.id);
            await supabase
              .from("rolos_group_room_blocks")
              .update({ picked_up_count: block.picked_up_count || 0, status: block.status })
              .eq("id", p.block_id);
          } catch (rbErr) {
            console.error("[pms-groups] pickup rollback failed", rbErr);
          }
        };

        try {
          const { error: roomErr } = await supabase.from("rolos_booking_rooms").insert({
            booking_id: booking.id,
            room_type_id: block.room_type_id,
            rate_charged: totalPrice,
            nightly_rate: nightlyRate || null,
            adults: p.adults ?? 1,
            children: p.children ?? 0,
            package_id: packageId,
          });
          if (roomErr) throw roomErr;

          // Rooming list line: update the placeholder if given, otherwise create one.
          const roomingPayload = {
            group_id: p.group_id,
            block_id: p.block_id,
            booking_id: booking.id,
            room_type_id: block.room_type_id,
            guest_name: p.guest_name,
            guest_email: p.guest_email || null,
            guest_phone: p.guest_phone || null,
            arrival_date: arrival,
            departure_date: departure,
            adults: p.adults ?? 1,
            children: p.children ?? 0,
            room_preference: p.room_preference || null,
            special_requests: p.special_requests || null,
            package_id: packageId,
            status: "picked_up",
          };
          const { error: roomingErr } = p.rooming_list_id
            ? await supabase.from("rolos_group_reservations").update(roomingPayload).eq("id", p.rooming_list_id)
            : await supabase.from("rolos_group_reservations").insert(roomingPayload);
          if (roomingErr) throw roomingErr;

          const newPickedUp = (block.picked_up_count || 0) + 1;
          const { error: counterErr } = await supabase
            .from("rolos_group_room_blocks")
            .update({
              picked_up_count: newPickedUp,
              status: newPickedUp >= (block.blocked_count || 0) ? "converted" : "blocked",
            })
            .eq("id", p.block_id);
          if (counterErr) throw counterErr;

          // Blocked -> booked: the cache was already reduced when the block was created.
          const { error: convertErr } = await supabase.rpc("rolos_convert_block_to_booked", {
            _property_id: p.property_id,
            _room_type_id: block.room_type_id,
            _start_date: arrival,
            _end_date: departure,
            _units: 1,
          });
          if (convertErr) throw convertErr;
          // Blocked -> booked is net-neutral, but re-derive the cache so it can never drift
          // (and so pickup dates outside the original block window stay correct).
          await syncAvailabilityCache(supabase, p.property_id, block.room_type_id, arrival, departure);

          // Package expansion: post component lines already tagged by revenue stream.
          if (packageId) {
            const { name: packageName, lines } = await expandPackageById(supabase, packageId, {
              subtotal: totalPrice,
              nights: nights.length,
              rooms: 1,
              adults: p.adults ?? 1,
              children: p.children ?? 0,
            });
            packageAddOn = packageAddOnTotal(lines);

            let folioId: string | null = null;
            if (centralBilled) {
              folioId = await ensureMasterFolio(supabase, {
                id: p.group_id,
                property_id: p.property_id,
                name: block.group?.name || "Group",
                master_folio_id: block.group?.master_folio_id ?? null,
              });
            } else {
              const { data: folio } = await supabase
                .from("rolos_folios")
                .select("id")
                .eq("booking_id", booking.id)
                .maybeSingle();
              folioId = folio?.id ?? null;
            }

            if (folioId && lines.length) {
              const { error: txErr } = await supabase.from("rolos_folio_transactions").insert(
                lines.map((l) => ({
                  folio_id: folioId,
                  transaction_type: "charge",
                  description: `${packageName} — ${l.name}${l.includedInRate ? " (included)" : ""}`,
                  amount: l.includedInRate ? 0 : l.amount,
                  revenue_stream: l.stream,
                  reference: `package:${packageId}`,
                  created_by: userId,
                })),
              );
              if (txErr) throw txErr;
              await refreshFolioBalance(supabase, folioId);
            }

            if (packageAddOn > 0) {
              await supabase
                .from("bookings")
                .update({ total_price: Math.round((totalPrice + packageAddOn) * 100) / 100 })
                .eq("id", booking.id);
            }
          }
        } catch (stepErr) {
          await rollbackPickup("post-booking", stepErr);
          return json({ error: stepErr instanceof Error ? stepErr.message : "Pickup failed and was rolled back" }, 500);
        }

        return json({ success: true, booking_id: booking.id, package_add_on: packageAddOn });
      }


      // ------------------------------------------------------- rooming list
      case "group_import_rooming_list": {
        const groupId = String(body?.group_id || "");
        const rowsParsed = z.array(roomingRowSchema).min(1).max(500).safeParse(body?.rows);
        if (!groupId || !rowsParsed.success) {
          return json({ error: rowsParsed.success ? "group_id is required" : rowsParsed.error.flatten() }, 400);
        }

        const { data: blocks } = await supabase
          .from("rolos_group_room_blocks")
          .select("id, room_type_id, blocked_count, picked_up_count, status")
          .eq("group_id", groupId)
          .eq("status", "blocked");

        const capacity = new Map<string, number>();
        for (const b of (blocks || [])) {
          capacity.set(b.room_type_id, (capacity.get(b.room_type_id) || 0) + Math.max(0, b.blocked_count - b.picked_up_count));
        }

        const accepted: Record<string, unknown>[] = [];
        const rejected: { guest_name: string; reason: string }[] = [];

        for (const row of rowsParsed.data) {
          const blockId = row.block_id
            || (row.room_type_id ? (blocks || []).find((b: { room_type_id: string }) => b.room_type_id === row.room_type_id)?.id : null)
            || null;
          const rtId = row.room_type_id
            || (blockId ? (blocks || []).find((b: { id: string }) => b.id === blockId)?.room_type_id : null)
            || null;

          if (rtId) {
            const left = capacity.get(rtId) ?? 0;
            if (left <= 0) {
              rejected.push({ guest_name: row.guest_name, reason: "No blocked rooms left for this room type" });
              continue;
            }
            capacity.set(rtId, left - 1);
          }

          accepted.push({
            group_id: groupId,
            block_id: blockId,
            room_type_id: rtId,
            guest_name: row.guest_name,
            guest_email: row.guest_email || null,
            guest_phone: row.guest_phone || null,
            arrival_date: row.arrival_date || null,
            departure_date: row.departure_date || null,
            room_preference: row.room_preference || null,
            special_requests: row.special_requests || null,
            adults: row.adults ?? 1,
            children: row.children ?? 0,
            status: "pending",
          });
        }

        if (accepted.length) {
          const { error } = await supabase.from("rolos_group_reservations").insert(accepted);
          if (error) throw error;
        }

        return json({ success: true, imported: accepted.length, rejected });
      }

      // -------------------------------------------------------- master folio
      case "group_ensure_master_folio": {
        const groupId = String(body?.group_id || "");
        if (!groupId) return json({ error: "group_id is required" }, 400);
        const { data: group, error } = await supabase
          .from("rolos_groups")
          .select("id, property_id, name, master_folio_id")
          .eq("id", groupId)
          .single();
        if (error || !group) return json({ error: "Group not found" }, 404);
        const folioId = await ensureMasterFolio(supabase, group);
        return json({ success: true, folio_id: folioId });
      }

      // ------------------------------------------------------- group cancel
      case "group_cancel": {
        const groupId = String(body?.group_id || "");
        if (!groupId) return json({ error: "group_id is required" }, 400);
        const { data: blocks } = await supabase
          .from("rolos_group_room_blocks")
          .select("id")
          .eq("group_id", groupId)
          .eq("status", "blocked");
        let released = 0;
        for (const b of (blocks || [])) {
          const res = await releaseBlock(supabase, b.id, {
            reason: "group_cancelled",
            chargeAttrition: body?.charge_attrition === true,
            userId,
          });
          released += res.released;
        }
        await supabase.from("rolos_groups").update({ status: "cancelled" }).eq("id", groupId);
        return json({ success: true, released_rooms: released, blocks_released: (blocks || []).length });
      }

      // --------------------------------------- scheduled auto-release sweep
      case "group_release_due_blocks": {
        const today = new Date().toISOString().split("T")[0];
        let query = supabase
          .from("rolos_group_room_blocks")
          .select("id, property_id")
          .eq("status", "blocked")
          .not("release_date", "is", null)
          .lt("release_date", today);
        if (propertyId) query = query.eq("property_id", propertyId);

        const { data: due, error } = await query;
        if (error) throw error;

        const results: { block_id: string; released: number; attrition: number }[] = [];
        for (const b of (due || [])) {
          try {
            const res = await releaseBlock(supabase, b.id, { reason: "release_date_passed", chargeAttrition: true, userId });
            results.push({ block_id: b.id, ...res });
          } catch (e) {
            console.error(`[pms-groups] Auto-release failed for ${b.id}:`, e);
          }
        }
        return json({ success: true, processed: results.length, results });
      }

      // ------------------------------------------- bulk check-in / check-out
      case "group_bulk_check_in":
      case "group_bulk_check_out": {
        const groupId = String(body?.group_id || "");
        if (!groupId) return json({ error: "group_id is required" }, 400);
        const isCheckIn = action === "group_bulk_check_in";

        const { data: lines, error: linesErr } = await supabase
          .from("rolos_group_reservations")
          .select("id, guest_name, booking_id, booking:bookings!booking_id(id, status, guest_name)")
          .eq("group_id", groupId)
          .not("booking_id", "is", null);
        if (linesErr) throw linesErr;

        const eligible = (lines || []).filter((l: Record<string, unknown>) => {
          const status = (l.booking as { status?: string } | null)?.status;
          return isCheckIn
            ? status === "confirmed" || status === "pending"
            : status === "checked_in";
        });

        const results: { booking_id: string; guest_name: string; ok: boolean; error?: string }[] = [];
        for (const line of eligible) {
          const bookingId = String(line.booking_id);
          const guestName = String(line.guest_name || (line.booking as { guest_name?: string } | null)?.guest_name || "Guest");
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/roomsonline-pms-api`, {
              method: "POST",
              headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ action: isCheckIn ? "check_in" : "check_out", booking_id: bookingId }),
            });
            const payload = await res.json().catch(() => null);
            const ok = res.ok && payload?.success !== false;
            results.push({
              booking_id: bookingId,
              guest_name: guestName,
              ok,
              error: ok ? undefined : payload?.error?.message || `HTTP ${res.status}`,
            });
          } catch (e) {
            results.push({ booking_id: bookingId, guest_name: guestName, ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }

        const succeeded = results.filter((r) => r.ok).length;
        console.log(`[pms-groups] ${action} group=${groupId} ok=${succeeded}/${results.length}`);
        return json({ success: true, processed: results.length, succeeded, failed: results.length - succeeded, results });
      }

      // ------------------------------------------------ rooming-list portal
      case "group_portal_token": {
        const groupId = String(body?.group_id || "");
        const mode = String(body?.mode || "enable"); // enable | rotate | disable
        if (!groupId) return json({ error: "group_id is required" }, 400);

        const { data: group, error: gErr } = await supabase
          .from("rolos_groups")
          .select("id, portal_token")
          .eq("id", groupId)
          .single();
        if (gErr || !group) return json({ error: "Group not found" }, 404);

        if (mode === "disable") {
          await supabase.from("rolos_groups").update({ portal_enabled: false }).eq("id", groupId);
          return json({ success: true, portal_enabled: false, portal_token: null });
        }

        const token = mode === "rotate" || !group.portal_token ? crypto.randomUUID() : group.portal_token;
        const expiresAt = body?.expires_at ? String(body.expires_at) : null;
        const { error: upErr } = await supabase
          .from("rolos_groups")
          .update({ portal_token: token, portal_enabled: true, portal_expires_at: expiresAt })
          .eq("id", groupId);
        if (upErr) throw upErr;
        return json({ success: true, portal_enabled: true, portal_token: token, portal_expires_at: expiresAt });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error("[pms-groups] Error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
