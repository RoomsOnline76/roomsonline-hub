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
import { loadCanonicalRooms } from "../_shared/canonicalRooms.ts";
import { queueRuAriDelta } from "../_shared/ruAriDelta.ts";
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

/**
 * Imported reservations are real occupancy, so the channel must be told about every stay
 * that still lies ahead. The ARI push is owned by `push-property-to-ru`; here we only fire
 * the delta (forced — a cron refresh seconds earlier must not swallow the import) and report
 * the outcome so the operator sees it instead of silence. Past stays are never pushed.
 */
/** Imported stays with a check-out still ahead of today — the ones that owe the channel. */
async function countFutureImportedStays(sb: any, propertyId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await sb
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("integration_type", "nightsbridge")
    .neq("status", "cancelled")
    .gte("check_out_date", today);
  return count ?? 0;
}

async function queueImportedOccupancyDelta(
  sb: any,
  propertyId: string,
  futureStays: number,
  trigger: string,
): Promise<{ future_stays: number; queued: boolean; reason?: string; error?: string; blockers?: string[] }> {
  if (futureStays <= 0) return { future_stays: 0, queued: false, reason: "no_future_stays" };
  const outcome = await queueRuAriDelta(sb, propertyId, trigger, { force: true });
  return { future_stays: futureStays, queued: outcome.queued, reason: outcome.reason, error: outcome.error, blockers: outcome.blockers };
}

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

/**
 * Persist one import run (preview or live) so an upload can never disappear
 * without a trace. Never throws — logging must not break an import.
 */
async function logImportRun(
  sb: ReturnType<typeof createClient>,
  run: {
    property_id: string;
    created_by: string | null;
    file_name: string | null;
    file_bytes: number | null;
    mode: "preview" | "live";
    summary: Record<string, unknown>;
    errors: unknown[];
    skipped: unknown[];
    unmapped_rooms: string[];
    arrivals: string[];
    future_stays: number;
  },
): Promise<string | null> {
  try {
    const sorted = [...run.arrivals].filter(Boolean).sort();
    const { data } = await sb
      .from("nb_import_runs")
      .insert({
        property_id: run.property_id,
        created_by: run.created_by,
        file_name: run.file_name || null,
        file_bytes: run.file_bytes,
        mode: run.mode,
        summary: run.summary,
        errors: run.errors.slice(0, 200),
        skipped: run.skipped.slice(0, 200),
        unmapped_rooms: run.unmapped_rooms,
        min_arrival: sorted[0] ?? null,
        max_arrival: sorted[sorted.length - 1] ?? null,
        future_stays: run.future_stays,
      })
      .select("id")
      .maybeSingle();
    return (data?.id as string) ?? null;
  } catch (e) {
    console.error("nb-import-bookings: could not log run", e);
    return null;
  }
}

interface RoomRef {
  id: string;
  room_type_id: string | null;
  keys: string[];
}

const EXCLUDE_SENTINEL = "__exclude__";
const UNASSIGNED_SENTINEL = "__unassigned__";

/** NightsBridge room name kept on the booking note by the importer. */
function nbRoomFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const line = notes.split("\n").find((l) => l.trim().toLowerCase().startsWith("nb room:"));
  if (!line) return null;
  const value = line.slice(line.indexOf(":") + 1).trim();
  return value || null;
}

/**
 * Re-map imported NightsBridge bookings that carry no unit / room type. Dry run reports the
 * outstanding groups; a live run writes `rolos_room_ids`, `room_type_id` and room lines.
 */
async function repairUnmappedBookings(
  // deno-lint-ignore no-explicit-any
  sb: any,
  propertyId: string,
  overrides: Record<string, string>,
  dryRun: boolean,
) {
  const [registry, { data: bookingRows }] = await Promise.all([
    loadCanonicalRooms(sb, propertyId),
    sb
      .from("bookings")
      .select("id, internal_notes, total_price, adults, children, check_in_date, check_out_date, rolos_room_ids, room_type_id")
      .eq("property_id", propertyId)
      .eq("integration_type", "nightsbridge")
      .is("rolos_room_ids", null),
  ]);

  // Only canonical rooms may be offered or accepted — retired twins are invisible here.
  const rooms = [...registry.byKey.values()]
    .filter((c) => c.roomId)
    .map((c) => ({
      id: c.roomId as string,
      room_name: c.roomLabel,
      room_number: null as string | null,
      room_type_id: c.roomTypeId,
    }));
  const byId = new Map(rooms.map((r) => [r.id, r]));


  interface Group {
    room_name: string;
    bookings: { id: string; total_price: number; adults: number; children: number; nights: number }[];
  }
  const groups = new Map<string, Group>();
  let unnamed = 0;
  const suspectDates: { id: string; check_in_date: string; check_out_date: string; nights: number }[] = [];

  for (const b of (bookingRows ?? []) as Record<string, unknown>[]) {
    const inDate = String(b.check_in_date ?? "");
    const outDate = String(b.check_out_date ?? "");
    const nights = Math.round(
      (new Date(outDate).getTime() - new Date(inDate).getTime()) / 86_400_000,
    );
    if (!Number.isFinite(nights) || nights <= 0 || nights > 60) {
      suspectDates.push({ id: String(b.id), check_in_date: inDate, check_out_date: outDate, nights });
    }
    const name = nbRoomFromNotes(b.internal_notes as string | null);
    if (!name) {
      unnamed++;
      continue;
    }
    const key = normaliseRoomKey(name) || name;
    const group = groups.get(key) ?? { room_name: name, bookings: [] };
    group.bookings.push({
      id: String(b.id),
      total_price: Number(b.total_price ?? 0),
      adults: Number(b.adults ?? 1),
      children: Number(b.children ?? 0),
      nights: Number.isFinite(nights) && nights > 0 ? nights : 1,
    });
    groups.set(key, group);
  }

  const groupList = [...groups.entries()].map(([key, g]) => ({
    key,
    room_name: g.room_name,
    count: g.bookings.length,
  }));

  if (dryRun) {
    return {
      mode: "repair",
      dry_run: true,
      unmapped_total: (bookingRows ?? []).length,
      unnamed,
      groups: groupList,
      suspect_dates: suspectDates,
      rooms: rooms.map((r) => ({ id: r.id, label: r.room_name || r.room_number || r.id })),
      repaired: 0,
    };
  }

  let repaired = 0;
  const lines: Record<string, unknown>[] = [];
  for (const [key, group] of groups) {
    const decision = overrides[group.room_name] ?? overrides[key] ?? null;
    if (!decision || decision === EXCLUDE_SENTINEL || decision === UNASSIGNED_SENTINEL) continue;
    const room = byId.get(decision);
    if (!room) continue;
    for (let i = 0; i < group.bookings.length; i += BATCH) {
      const chunk = group.bookings.slice(i, i + BATCH);
      const { error } = await sb
        .from("bookings")
        .update({ rolos_room_ids: [room.id], room_type_id: room.room_type_id })
        .in("id", chunk.map((b) => b.id));
      if (error) continue;
      repaired += chunk.length;
      for (const b of chunk) {
        lines.push({
          booking_id: b.id,
          room_id: room.id,
          room_type_id: room.room_type_id,
          rate_charged: b.total_price,
          nightly_rate: b.nights > 0 ? Number((b.total_price / b.nights).toFixed(2)) : b.total_price,
          adults: b.adults,
          children: b.children,
        });
      }
    }
  }

  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    const ids = chunk.map((l) => l.booking_id as string);
    await sb.from("rolos_booking_rooms").delete().in("booking_id", ids);
    await sb.from("rolos_booking_rooms").insert(chunk);
  }

  return {
    mode: "repair",
    dry_run: false,
    repaired,
    unmapped_total: (bookingRows ?? []).length,
    unnamed,
    groups: groupList,
    suspect_dates: suspectDates,
    rooms: rooms.map((r) => ({ id: r.id, label: r.room_name || r.room_number || r.id })),
  };
}

/**
 * Repair superseded (retired) room inventory for one property.
 *
 * 1. Re-points bookings and their room lines from retired room types / rooms to the
 *    canonical row for the same room name.
 * 2. Repairs the channel-unit links (`linked_rolos_id`, `linked_overview_id`).
 * 3. Deletes retired rooms and room types — only when nothing references them.
 */
async function repairSupersededRooms(
  // deno-lint-ignore no-explicit-any
  sb: any,
  propertyId: string,
  dryRun: boolean,
) {
  const registry = await loadCanonicalRooms(sb, propertyId);

  const canonicalTypeIds = new Set([...registry.byKey.values()].map((c) => c.roomTypeId));
  const canonicalRoomIds = new Set(
    [...registry.byKey.values()].map((c) => c.roomId).filter(Boolean) as string[],
  );

  const report = {
    mode: "repair_superseded_rooms",
    dry_run: dryRun,
    canonical: [...registry.byKey.values()].map((c) => ({
      room_name: c.name,
      room_type_id: c.roomTypeId,
      room_id: c.roomId,
      channel_units: c.unitIds.length,
    })),
    bookings_repointed: 0,
    booking_lines_repointed: 0,
    links_repaired: 0,
    rooms_deleted: 0,
    room_types_deleted: 0,
    retained: [] as { kind: string; id: string; reason: string }[],
    actions: [] as string[],
  };

  /* ---------------------------------------------- 1. bookings + room lines */

  const { data: bookingRows } = await sb
    .from("bookings")
    .select("id, room_type_id, rolos_room_ids")
    .eq("property_id", propertyId);

  const moves: { id: string; room_type_id: string; room_id: string | null }[] = [];
  for (const b of (bookingRows ?? []) as { id: string; room_type_id: string | null; rolos_room_ids: string[] | null }[]) {
    const roomIds = Array.isArray(b.rolos_room_ids) ? b.rolos_room_ids : [];
    const typeRetired = b.room_type_id ? registry.supersededTypeIds.has(b.room_type_id) : false;
    const roomRetired = roomIds.some((id) => registry.supersededRoomIds.has(id));
    if (!typeRetired && !roomRetired) continue;

    const key =
      (b.room_type_id ? registry.keyByTypeId.get(b.room_type_id) : null) ??
      roomIds.map((id) => registry.keyByRoomId.get(id)).find(Boolean) ??
      null;
    const canonical = key ? registry.byKey.get(key) : null;
    if (!canonical) {
      report.retained.push({ kind: "booking", id: b.id, reason: "no current room with this name" });
      continue;
    }
    moves.push({ id: b.id, room_type_id: canonical.roomTypeId, room_id: canonical.roomId });
  }

  report.bookings_repointed = moves.length;
  if (moves.length > 0) report.actions.push(`Re-point ${moves.length} booking(s) to current rooms`);

  if (!dryRun) {
    for (const move of moves) {
      const { error } = await sb
        .from("bookings")
        .update({
          room_type_id: move.room_type_id,
          rolos_room_ids: move.room_id ? [move.room_id] : null,
        })
        .eq("id", move.id);
      if (error) {
        report.retained.push({ kind: "booking", id: move.id, reason: error.message });
        continue;
      }
      const { error: lineErr, count } = await sb
        .from("rolos_booking_rooms")
        .update({ room_type_id: move.room_type_id, room_id: move.room_id }, { count: "exact" })
        .eq("booking_id", move.id);
      if (!lineErr) report.booking_lines_repointed += count ?? 0;
    }
  }

  /* ----------------------------------------------------- 2. channel links */

  const { data: unitRows } = await sb
    .from("hostfully_room_types")
    .select("id, name, is_active, linked_rolos_id, rentalsunited_property_id")
    .eq("property_id", propertyId);

  for (const u of (unitRows ?? []) as { id: string; name: string | null; linked_rolos_id: string | null; is_active: boolean | null }[]) {
    if (u.is_active === false) continue;
    const canonical = registry.canonicalForUnit(u);
    if (!canonical) {
      report.retained.push({ kind: "channel_unit", id: u.id, reason: "no ROL'OS room with this name" });
      continue;
    }
    const needsLink = u.linked_rolos_id !== canonical.roomTypeId;
    if (!needsLink) continue;
    report.links_repaired += 1;
    report.actions.push(`Link channel unit "${u.name ?? u.id}" to its current room`);
    if (!dryRun) {
      await sb.from("hostfully_room_types").update({ linked_rolos_id: canonical.roomTypeId }).eq("id", u.id);
      await sb.from("rolos_room_types").update({ linked_overview_id: u.id }).eq("id", canonical.roomTypeId);
    }
  }

  /* --------------------------------------- 3. delete unreferenced retirees */

  const referenceTables: { table: string; column: string }[] = [
    { table: "bookings", column: "room_type_id" },
    { table: "rolos_booking_rooms", column: "room_type_id" },
    { table: "rolos_rate_plan_room_types", column: "room_type_id" },
    { table: "rolos_rate_plan_season_rates", column: "room_type_id" },
    { table: "rolos_rate_prices", column: "room_type_id" },
    { table: "rolos_rate_strategies", column: "room_type_id" },
    { table: "rolos_inventory_calendar", column: "room_type_id" },
    { table: "rolos_stay_restrictions", column: "room_type_id" },
    { table: "rolos_reservation_rooms", column: "room_type_id" },
    { table: "rolos_group_reservations", column: "room_type_id" },
    { table: "rolos_group_room_blocks", column: "room_type_id" },
    { table: "rolos_channel_room_mapping", column: "room_type_id" },
    { table: "rolos_waitlist", column: "room_type_id" },
    { table: "hostfully_unit_map", column: "room_type_id" },
  ];
  const roomReferenceTables: { table: string; column: string }[] = [
    { table: "rolos_booking_rooms", column: "room_id" },
    { table: "rolos_reservation_rooms", column: "room_id" },
    { table: "rolos_housekeeping_tasks", column: "room_id" },
    { table: "rolos_housekeeping_schedules", column: "room_id" },
    { table: "rolos_maintenance_requests", column: "room_id" },
    { table: "rolos_group_reservations", column: "room_id" },
  ];

  const isReferenced = async (
    id: string,
    tables: { table: string; column: string }[],
  ): Promise<string | null> => {
    for (const t of tables) {
      const { count, error } = await sb
        .from(t.table)
        .select("id", { count: "exact", head: true })
        .eq(t.column, id);
      if (error) continue;
      if ((count ?? 0) > 0) return `${count} row(s) in ${t.table}`;
    }
    return null;
  };

  // Rooms first — a room type cannot go while its rooms remain.
  for (const roomId of registry.supersededRoomIds) {
    if (canonicalRoomIds.has(roomId)) continue;
    const blocked = await isReferenced(roomId, roomReferenceTables);
    if (blocked) {
      report.retained.push({ kind: "room", id: roomId, reason: blocked });
      continue;
    }
    report.rooms_deleted += 1;
    if (!dryRun) await sb.from("rolos_rooms").delete().eq("id", roomId).eq("property_id", propertyId);
  }

  for (const typeId of registry.supersededTypeIds) {
    if (canonicalTypeIds.has(typeId)) continue;
    const blocked = await isReferenced(typeId, referenceTables);
    if (blocked) {
      report.retained.push({ kind: "room_type", id: typeId, reason: blocked });
      continue;
    }
    const { count: roomCount } = await sb
      .from("rolos_rooms")
      .select("id", { count: "exact", head: true })
      .eq("room_type_id", typeId);
    if ((roomCount ?? 0) > 0 && dryRun === false) {
      report.retained.push({ kind: "room_type", id: typeId, reason: `${roomCount} room(s) still attached` });
      continue;
    }
    report.room_types_deleted += 1;
    if (!dryRun) await sb.from("rolos_room_types").delete().eq("id", typeId).eq("property_id", propertyId);
  }

  if (report.rooms_deleted > 0) report.actions.push(`Remove ${report.rooms_deleted} retired room(s)`);
  if (report.room_types_deleted > 0) report.actions.push(`Remove ${report.room_types_deleted} retired room type(s)`);

  return report;
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
    const mode = String(body?.mode ?? "import").trim() || "import";
    const fileName = String(body?.file_name ?? "").trim();
    const fileB64 = String(body?.file_base64 ?? "");
    const defaultCurrency = String(body?.default_currency ?? "ZAR").toUpperCase().slice(0, 3);
    const roomOverrides: Record<string, string> = (body?.room_overrides ?? {}) as Record<string, string>;

    if (mode === "import") {
      if (!fileB64) return json({ ok: false, error: "No file was received" }, 400);
      if (fileName && !/\.(xlsx|xls|csv)$/i.test(fileName)) {
        return json({ ok: false, error: "Only .xlsx, .xls and .csv exports are supported" }, 400);
      }
    }

    // Access: mirrors the property write checks used elsewhere (admin / fearless_leader /
    // owner / portfolio + staff scope all resolve inside can_access_property).
    const { data: allowed, error: accessErr } = await sb.rpc("can_access_property", {
      _property_id: propertyId,
      _user_id: userId,
    });
    if (accessErr) return json({ ok: false, error: accessErr.message }, 403);
    if (allowed !== true) return json({ ok: false, error: "You do not have access to this property" }, 403);

    /* ------------------------------------------------------- repair mode ---
     * Re-maps already-imported bookings that never matched a unit. The NightsBridge
     * room name is preserved in `internal_notes` ("NB Room: <name>"), so it can be
     * grouped and mapped after the fact without re-uploading the export.
     */
    if (mode === "repair_superseded_rooms") {
      const result = await repairSupersededRooms(sb, propertyId, dryRun);
      const channelDelta = dryRun
        ? undefined
        : await queueImportedOccupancyDelta(sb, propertyId, await countFutureImportedStays(sb, propertyId), "nb_repair_superseded");
      return json({ ok: true, ...result, channel_delta: channelDelta });
    }

    if (mode === "repair") {

      const repair = await repairUnmappedBookings(sb, propertyId, roomOverrides, dryRun);
      const channelDelta = dryRun
        ? undefined
        : await queueImportedOccupancyDelta(sb, propertyId, await countFutureImportedStays(sb, propertyId), "nb_repair_remap");
      return json({ ok: true, ...repair, channel_delta: channelDelta });
    }


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

    /* ---------------------------------------------------------- room lookup
     * HARD GATE: only canonical (non-superseded) rooms may be matched. Legacy
     * ALL-CAPS twins of a live unit are invisible here, so an import can never
     * again attach bookings to inventory that no longer trades.
     */

    const registry = await loadCanonicalRooms(sb, propertyId);

    const roomIndex = new Map<string, RoomRef>();
    const typeIndex = new Map<string, string>();
    for (const [key, canonical] of registry.byKey) {
      if (canonical.roomId) {
        roomIndex.set(key, { id: canonical.roomId, room_type_id: canonical.roomTypeId, keys: [key] });
      }
      typeIndex.set(key, canonical.roomTypeId);
    }
    const canonicalRoomList = [...registry.byKey.values()]
      .filter((c) => c.roomId)
      .map((c) => ({ id: c.roomId as string, label: c.roomLabel || c.name }));
    const canonicalRoomIds = new Set(canonicalRoomList.map((r) => r.id));
    /** Keys that exist in the database only as retired inventory (no canonical room/type). */
    const retiredOnlyKeys = new Set<string>();
    for (const [roomId, key] of registry.keyByRoomId) {
      if (!registry.supersededRoomIds.has(roomId)) continue;
      if (!registry.byKey.has(key)) retiredOnlyKeys.add(key);
    }


    /** Operator decisions for unmatched room names. */
    const EXCLUDE = "__exclude__";
    const UNASSIGNED = "__unassigned__";
    /** Legacy sentinel from earlier builds — behaved as "import unassigned". */
    const LEGACY_SKIP = "__skip__";

    /** Overrides pointing at a superseded (retired) room are refused outright. */
    const rejectedOverrides = Object.entries(roomOverrides)
      .filter(([, v]) => v && v !== EXCLUDE && v !== UNASSIGNED && v !== LEGACY_SKIP && !canonicalRoomIds.has(v))
      .map(([name]) => name);
    if (rejectedOverrides.length > 0) {
      return json(
        {
          ok: false,
          error:
            `These room choices point at rooms that no longer exist: ${rejectedOverrides.join(", ")}. ` +
            `Pick a current room instead.`,
          rejected_overrides: rejectedOverrides,
          rooms: canonicalRoomList,
        },
        400,
      );
    }

    const overrideFor = (name: string | null): string | null => {
      if (!name) return null;
      return roomOverrides[name] ?? roomOverrides[normaliseRoomKey(name)] ?? null;
    };

    const resolveRoom = (name: string | null): { roomId: string | null; roomTypeId: string | null } => {
      if (!name) return { roomId: null, roomTypeId: null };
      const override = overrideFor(name);
      if (override && override !== EXCLUDE && override !== UNASSIGNED && override !== LEGACY_SKIP) {
        const canonical = [...registry.byKey.values()].find((c) => c.roomId === override);
        if (canonical) return { roomId: canonical.roomId, roomTypeId: canonical.roomTypeId };
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

    /* Chunked live writes: the client may walk a large export in slices so a single
     * invocation can never time out mid-write. Preview always sees the whole file. */
    const totalMapped = mapped.length;
    const chunkFrom = Math.max(0, Number(body?.row_from ?? 0) || 0);
    const chunkSize = Number(body?.row_limit ?? 0) || 0;
    const chunkedWrite = !dryRun && chunkSize > 0;
    const writeSlice = chunkedWrite ? mapped.slice(chunkFrom, chunkFrom + chunkSize) : mapped;




    // Existing NightsBridge bookings for this property, keyed by external id.
    const existing = new Map<string, string>();
    {
      const ids = writeSlice.map((m) => m.external_id);
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
    const arrivals = mapped.map((m) => m.check_in_date);
    const futureStays = mapped.filter((m) => m.check_out_date >= today).length;
    const arrivalSpan = (() => {
      const sorted = [...arrivals].filter(Boolean).sort();
      return { min: sorted[0] ?? null, max: sorted[sorted.length - 1] ?? null };
    })();

    /** Names whose only inventory match is retired — the operator must pick a current room. */
    const supersededNames = [...unmappedRooms].filter((name) => retiredOnlyKeys.has(normaliseRoomKey(name)));

    if (dryRun) {
      const summary = {
        total_rows: rows.length,
        parsed: mapped.length,
        created: willCreate,
        updated: willUpdate,
        skipped: skipped.length,
        excluded: excludedByOperator,
        errors: errors.length,
        unmapped_rooms: [...unmappedRooms],
        /** Rows blocked because the spreadsheet room no longer exists. */
        blocked_superseded: supersededNames.length,
        superseded_rooms: supersededNames,
        future_stays: futureStays,
        min_arrival: arrivalSpan.min,
        max_arrival: arrivalSpan.max,
      };

      const runId = await logImportRun(sb, {
        property_id: propertyId,
        created_by: userId,
        file_name: fileName,
        file_bytes: bytes.byteLength,
        mode: "preview",
        summary,
        errors,
        skipped,
        unmapped_rooms: [...unmappedRooms],
        arrivals,
        future_stays: futureStays,
      });

      return json({
        ok: true,
        dry_run: true,
        run_id: runId,
        summary,
        errors,
        skipped,
        rooms: canonicalRoomList,
        preview,
      });
    }


    /* ---------------------------------------------------------------- write */

    let created = 0;
    let updated = 0;

    // Guest profiles by full name (NB exports carry no email).
    const nameSet = [...new Set(writeSlice.map((m) => m.guest_name).filter(Boolean))];
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

    for (let i = 0; i < writeSlice.length; i += BATCH) {
      const chunk = writeSlice.slice(i, i + BATCH);

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
          // Imported actuals belong to the property but carry no ROL commission.
          commission_type: "none",
          calculated_commission: 0,
          commission_rate_applied: 0,

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

    const chunkDone = chunkedWrite ? chunkFrom + writeSlice.length : totalMapped;
    const liveSummary = {
      total_rows: rows.length,
      parsed: totalMapped,
      /** Rows written by this call (a chunked run reports its own slice). */
      written: writeSlice.length,
      row_from: chunkFrom,
      row_done: chunkDone,
      has_more: chunkDone < totalMapped,
      created,
      updated,
      skipped: skipped.length,
      excluded: excludedByOperator,
      errors: errors.length,
      unmapped_rooms: [...unmappedRooms],
      /** Stays that still lie ahead — these must block channel availability upstream. */
      future_stays: futureStays,
      min_arrival: arrivalSpan.min,
      max_arrival: arrivalSpan.max,
    };

    const liveRunId = await logImportRun(sb, {
      property_id: propertyId,
      created_by: userId,
      file_name: fileName,
      file_bytes: bytes.byteLength,
      mode: "live",
      summary: liveSummary,
      errors,
      skipped,
      unmapped_rooms: [...unmappedRooms],
      arrivals,
      future_stays: futureStays,
    });

    /* Only the final chunk pushes: a chunked run would otherwise fire one delta per slice. */
    const channelDelta = liveSummary.has_more
      ? { future_stays: futureStays, queued: false, reason: "awaiting_remaining_chunks" as const }
      : await queueImportedOccupancyDelta(sb, propertyId, await countFutureImportedStays(sb, propertyId), "nb_import");

    return json({
      ok: true,
      dry_run: false,
      run_id: liveRunId,
      summary: { ...liveSummary, channel_delta: channelDelta },
      channel_delta: channelDelta,
      errors,
      skipped,
      preview: [],
    });
  } catch (e) {
    console.error("nb-import-bookings failed", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
