/**
 * nb-import-bookings — NightsBridge export ingestion for ONE property.
 *
 * Offline ingestion of the NightsBridge "Client Summary / Bookings Report" export
 * (.xlsx / .xls / .csv) into ROL'OS `bookings` (+ `rolos_booking_rooms`).
 *
 * Isolation: this is the only NightsBridge ingestion path. No shared availability or
 * reservation fetch code is touched, and no NightsBridge API is called.
 *
 * Idempotency: (property_id, external_reservation_id) with integration_type = 'nightsbridge'
 * is backed by a partial unique index, so re-uploading the same file updates rows.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  mapNbRow,
  normaliseRoomKey,
  parseNbWorkbook,
  splitName,
  type MappedNbBooking,
  type RowOutcome,
} from "./nbRows.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_BYTES = 10 * 1024 * 1024;
const PREVIEW_LIMIT = 200;
const BATCH = 50;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function decodeBase64(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface RoomRef {
  id: string;
  room_type_id: string | null;
  keys: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ ok: false, error: "Not authenticated" }, 401);

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));

    const propertyId = String(body?.property_id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return json({ ok: false, error: "A valid property_id is required" }, 400);

    const dryRun = body?.dry_run === true;
    const fileName = String(body?.file_name ?? "").trim();
    const fileB64 = String(body?.file_base64 ?? "");
    const defaultCurrency = String(body?.default_currency ?? "ZAR").toUpperCase().slice(0, 3);
    const roomOverrides: Record<string, string> = (body?.room_overrides ?? {}) as Record<string, string>;

    if (!fileB64) return json({ ok: false, error: "No file was received" }, 400);
    if (fileName && !/\.(xlsx|xls|csv)$/i.test(fileName)) {
      return json({ ok: false, error: "Only .xlsx, .xls and .csv exports are supported" }, 400);
    }

    // Access: mirrors the property write checks used elsewhere (admin / fearless_leader /
    // owner / portfolio + staff scope all resolve inside can_access_property).
    const { data: allowed, error: accessErr } = await sb.rpc("can_access_property", {
      _property_id: propertyId,
      _user_id: userId,
    });
    if (accessErr) return json({ ok: false, error: accessErr.message }, 403);
    if (allowed !== true) return json({ ok: false, error: "You do not have access to this property" }, 403);

    const bytes = decodeBase64(fileB64);
    if (bytes.byteLength > MAX_BYTES) {
      return json({ ok: false, error: "File is larger than 10 MB" }, 400);
    }

    let parsedRows;
    try {
      parsedRows = parseNbWorkbook(bytes);
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not read the file" }, 400);
    }
    const { rows } = parsedRows;

    /* ---------------------------------------------------------- room lookup */

    const [{ data: roomRows }, { data: typeRows }] = await Promise.all([
      sb.from("rolos_rooms").select("id, room_number, room_name, room_type_id").eq("property_id", propertyId),
      sb.from("rolos_room_types").select("id, name, code").eq("property_id", propertyId),
    ]);

    const roomIndex = new Map<string, RoomRef>();
    for (const r of roomRows ?? []) {
      const ref: RoomRef = { id: r.id as string, room_type_id: (r.room_type_id as string) ?? null, keys: [] };
      for (const candidate of [r.room_name, r.room_number]) {
        const key = normaliseRoomKey(candidate as string | null);
        if (key && !roomIndex.has(key)) roomIndex.set(key, ref);
      }
    }
    const typeIndex = new Map<string, string>();
    for (const t of typeRows ?? []) {
      for (const candidate of [t.name, t.code]) {
        const key = normaliseRoomKey(candidate as string | null);
        if (key && !typeIndex.has(key)) typeIndex.set(key, t.id as string);
      }
    }

    /** Operator decisions for unmatched room names. */
    const EXCLUDE = "__exclude__";
    const UNASSIGNED = "__unassigned__";
    /** Legacy sentinel from earlier builds — behaved as "import unassigned". */
    const LEGACY_SKIP = "__skip__";

    const overrideFor = (name: string | null): string | null => {
      if (!name) return null;
      return roomOverrides[name] ?? roomOverrides[normaliseRoomKey(name)] ?? null;
    };

    const resolveRoom = (name: string | null): { roomId: string | null; roomTypeId: string | null } => {
      if (!name) return { roomId: null, roomTypeId: null };
      const override = overrideFor(name);
      if (override && override !== EXCLUDE && override !== UNASSIGNED && override !== LEGACY_SKIP) {
        const byId = (roomRows ?? []).find((r) => r.id === override);
        if (byId) return { roomId: byId.id as string, roomTypeId: (byId.room_type_id as string) ?? null };
      }
      if (override === UNASSIGNED || override === LEGACY_SKIP) return { roomId: null, roomTypeId: null };
      const key = normaliseRoomKey(name);
      const room = roomIndex.get(key);
      if (room) return { roomId: room.id, roomTypeId: room.room_type_id };
      const typeId = typeIndex.get(key);
      if (typeId) return { roomId: null, roomTypeId: typeId };
      return { roomId: null, roomTypeId: null };
    };


    /* ------------------------------------------------------------- map rows */

    const today = todayIso();
    const outcomes: RowOutcome[] = rows.map((r) => mapNbRow(r, today, defaultCurrency));

    const errors: { row: number; nbid: string | null; message: string }[] = [];
    const skipped: { row: number; nbid: string | null; message: string }[] = [];
    const kept: MappedNbBooking[] = [];
    const seen = new Set<string>();

    for (const o of outcomes) {
      if (o.action === "error") {
        errors.push({ row: o.row, nbid: o.nbid, message: o.reason ?? "Row could not be mapped" });
        continue;
      }
      if (o.action === "skip" || !o.mapped) {
        skipped.push({ row: o.row, nbid: o.nbid, message: o.reason ?? "Skipped" });
        continue;
      }
      if (seen.has(o.mapped.external_id)) {
        skipped.push({ row: o.row, nbid: o.nbid, message: "Duplicate NBID inside the file — later row ignored" });
        continue;
      }
      seen.add(o.mapped.external_id);
      kept.push(o.mapped);
    }

    // Rows whose unmatched room name the operator chose to exclude never reach the writes.
    let excludedByOperator = 0;
    const mapped: MappedNbBooking[] = [];
    for (const m of kept) {
      if (overrideFor(m.room_name) === EXCLUDE) {
        excludedByOperator++;
        skipped.push({
          row: m.row,
          nbid: m.nbid,
          message: `Unknown room "${m.room_name}" — excluded by operator`,
        });
        continue;
      }
      mapped.push(m);
    }


    // Existing NightsBridge bookings for this property, keyed by external id.
    const existing = new Map<string, string>();
    {
      const ids = mapped.map((m) => m.external_id);
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const { data } = await sb
          .from("bookings")
          .select("id, external_reservation_id")
          .eq("property_id", propertyId)
          .eq("integration_type", "nightsbridge")
          .in("external_reservation_id", chunk);
        for (const b of data ?? []) existing.set(b.external_reservation_id as string, b.id as string);
      }
    }

    const unmappedRooms = new Set<string>();
    const preview = mapped.slice(0, PREVIEW_LIMIT).map((m) => {
      const { roomId, roomTypeId } = resolveRoom(m.room_name);
      if (m.room_name && !roomId && !roomTypeId) unmappedRooms.add(m.room_name);
      return {
        row: m.row,
        nbid: m.nbid,
        action: existing.has(m.external_id) ? "update" : "create",
        guest_name: m.guest_name,
        check_in_date: m.check_in_date,
        check_out_date: m.check_out_date,
        nights: m.nights,
        room_name: m.room_name,
        room_matched: Boolean(roomId || roomTypeId),
        adults: m.adults,
        children: m.children,
        total_price: m.total_price,
        currency: m.currency,
        status: m.status,
        payment_status: m.payment_status,
        booking_channel: m.booking_channel,
        raw_status: m.raw_status,
        is_history: m.is_history,
      };
    });
    // Room warnings must cover every row, not just the previewed ones — and must keep
    // listing names the operator excluded so their decision stays visible/editable.
    for (const m of kept) {
      if (!m.room_name) continue;
      if (overrideFor(m.room_name) === EXCLUDE) {
        unmappedRooms.add(m.room_name);
        continue;
      }
      const { roomId, roomTypeId } = resolveRoom(m.room_name);
      if (!roomId && !roomTypeId) unmappedRooms.add(m.room_name);
    }

    const willCreate = mapped.filter((m) => !existing.has(m.external_id)).length;
    const willUpdate = mapped.length - willCreate;

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        summary: {
          total_rows: rows.length,
          parsed: mapped.length,
          created: willCreate,
          updated: willUpdate,
          skipped: skipped.length,
          excluded: excludedByOperator,
          errors: errors.length,
          unmapped_rooms: [...unmappedRooms],
        },

        errors,
        skipped,
        rooms: (roomRows ?? []).map((r) => ({
          id: r.id,
          label: (r.room_name as string) || (r.room_number as string),
        })),
        preview,
      });
    }

    /* ---------------------------------------------------------------- write */

    let created = 0;
    let updated = 0;

    // Guest profiles by full name (NB exports carry no email).
    const nameSet = [...new Set(mapped.map((m) => m.guest_name).filter(Boolean))];
    const guestIdByName = new Map<string, string>();
    for (let i = 0; i < nameSet.length; i += 200) {
      const chunk = nameSet.slice(i, i + 200);
      const { data } = await sb
        .from("rolos_guest_profiles")
        .select("id, full_name")
        .eq("property_id", propertyId)
        .in("full_name", chunk);
      for (const p of data ?? []) guestIdByName.set(String(p.full_name).toLowerCase(), p.id as string);
    }
    const missingNames = nameSet.filter((n) => !guestIdByName.has(n.toLowerCase()));
    for (let i = 0; i < missingNames.length; i += BATCH) {
      const chunk = missingNames.slice(i, i + BATCH);
      const { data, error } = await sb
        .from("rolos_guest_profiles")
        .insert(chunk.map((full_name) => ({ property_id: propertyId, full_name })))
        .select("id, full_name");
      if (error) break; // profiles are a nice-to-have; never block the booking import
      for (const p of data ?? []) guestIdByName.set(String(p.full_name).toLowerCase(), p.id as string);
    }

    const roomLines: Record<string, unknown>[] = [];

    for (let i = 0; i < mapped.length; i += BATCH) {
      const chunk = mapped.slice(i, i + BATCH);

      const inserts: Record<string, unknown>[] = [];
      for (const m of chunk) {
        const { roomId, roomTypeId } = resolveRoom(m.room_name);
        const { first, last } = splitName(m.guest_name);
        const payload: Record<string, unknown> = {
          property_id: propertyId,
          guest_name: m.guest_name,
          guest_first_name: first,
          guest_last_name: last,
          guest_email: "",
          guest_company: m.guest_company,
          booking_made_by: m.booking_made_by,
          check_in_date: m.check_in_date,
          check_out_date: m.check_out_date,
          adults: m.adults,
          children: m.children,
          total_price: m.total_price,
          deposit_amount: m.paid_to_date,
          status: m.status,
          payment_status: m.payment_status,
          booking_channel: m.booking_channel,
          integration_type: "nightsbridge",
          external_reservation_id: m.external_id,
          internal_notes: m.internal_notes,
          rolos_guest_id: guestIdByName.get(m.guest_name.toLowerCase()) ?? null,
          rolos_room_ids: roomId ? [roomId] : null,
          room_type_id: roomTypeId,
        };

        const existingId = existing.get(m.external_id);
        if (existingId) {
          const { error } = await sb.from("bookings").update(payload).eq("id", existingId);
          if (error) {
            errors.push({ row: m.row, nbid: m.nbid, message: error.message });
            continue;
          }
          updated++;
          await sb.from("rolos_booking_rooms").delete().eq("booking_id", existingId);
          if (roomId || roomTypeId) {
            roomLines.push({
              booking_id: existingId,
              room_id: roomId,
              room_type_id: roomTypeId,
              rate_charged: m.total_price,
              nightly_rate: m.nights > 0 ? Number((m.total_price / m.nights).toFixed(2)) : m.total_price,
              adults: m.adults,
              children: m.children,
            });
          }
        } else {
          inserts.push({ ...payload, __row: m.row });
        }
      }

      if (inserts.length) {
        const rowsToInsert = inserts.map(({ __row: _row, ...rest }) => rest);
        const { data, error } = await sb.from("bookings").insert(rowsToInsert).select("id, external_reservation_id");
        if (error) {
          // Fall back to row-by-row so one bad record does not lose the whole batch.
          for (const ins of inserts) {
            const { __row: rowNo, ...rest } = ins as Record<string, unknown> & { __row: number };
            const single = await sb.from("bookings").insert(rest).select("id, external_reservation_id").maybeSingle();
            if (single.error || !single.data) {
              errors.push({ row: rowNo, nbid: null, message: single.error?.message ?? "Insert failed" });
              continue;
            }
            created++;
            existing.set(single.data.external_reservation_id as string, single.data.id as string);
          }
        } else {
          created += data?.length ?? 0;
          for (const b of data ?? []) existing.set(b.external_reservation_id as string, b.id as string);
        }

        for (const m of chunk) {
          const bookingId = existing.get(m.external_id);
          if (!bookingId) continue;
          const { roomId, roomTypeId } = resolveRoom(m.room_name);
          if (!roomId && !roomTypeId) continue;
          if (roomLines.some((l) => l.booking_id === bookingId)) continue;
          roomLines.push({
            booking_id: bookingId,
            room_id: roomId,
            room_type_id: roomTypeId,
            rate_charged: m.total_price,
            nightly_rate: m.nights > 0 ? Number((m.total_price / m.nights).toFixed(2)) : m.total_price,
            adults: m.adults,
            children: m.children,
          });
        }
      }
    }

    for (let i = 0; i < roomLines.length; i += BATCH) {
      const chunk = roomLines.slice(i, i + BATCH);
      const { error } = await sb.from("rolos_booking_rooms").insert(chunk);
      if (error) errors.push({ row: 0, nbid: null, message: `Room lines: ${error.message}` });
    }

    return json({
      ok: true,
      dry_run: false,
      summary: {
        total_rows: rows.length,
        parsed: mapped.length,
        created,
        updated,
        skipped: skipped.length,
        errors: errors.length,
        unmapped_rooms: [...unmappedRooms],
      },
      errors,
      skipped,
      preview: [],
    });
  } catch (e) {
    console.error("nb-import-bookings failed", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
