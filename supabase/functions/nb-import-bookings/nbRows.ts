/**
 * NightsBridge "Client Summary / Bookings Report" export parsing + mapping.
 *
 * Offline ingestion only — no NightsBridge API is contacted. Pure functions so the
 * mapping rules can be unit tested without a database.
 */

import * as XLSX from "npm:xlsx@0.18.5";

export const NB_HEADER_ANCHORS = ["booking id", "nbid"];

export interface NbRawRow {
  row: number; // 1-based line number in the sheet (header excluded)
  values: Record<string, string>;
}

/** Normalised header key: lowercase, collapsed whitespace, punctuation stripped. */
export function headerKey(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[._]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse an .xlsx/.xls/.csv export. Title rows above the real header are skipped by
 * scanning for the row that contains both "Booking ID" and "NBID".
 */
export function parseNbWorkbook(bytes: Uint8Array): { rows: NbRawRow[]; headerRow: number } {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The file contains no worksheets");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    defval: "",
    raw: true,
  });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const keys = (grid[i] || []).map(headerKey);
    if (NB_HEADER_ANCHORS.every((a) => keys.includes(a))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      'Could not find the report header row — the file must contain a row with both "Booking ID" and "NBID" columns.',
    );
  }

  const headers = (grid[headerIdx] || []).map(headerKey);
  const rows: NbRawRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const cells = grid[i] || [];
    const values: Record<string, string> = {};
    let hasContent = false;
    headers.forEach((h, c) => {
      if (!h) return;
      const cell = cells[c];
      const text = cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? "").trim();
      values[h] = text;
      if (text) hasContent = true;
    });
    if (!hasContent) continue;
    rows.push({ row: i + 1, values });
  }

  return { rows, headerRow: headerIdx + 1 };
}

/* ------------------------------------------------------------------ values */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Normalise the many date shapes NightsBridge exports produce into YYYY-MM-DD. */
export function parseNbDate(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  // Excel serial (1900 date system, Excel's leap-year quirk handled by the 1899-12-30 epoch)
  if (/^\d{5}(\.\d+)?$/.test(value)) {
    const serial = Number(value);
    const ms = Math.round(serial * 86400000);
    const d = new Date(Date.UTC(1899, 11, 30) + ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;

  // dd/mm/yyyy (NightsBridge is a South African product — day first)
  const dmy = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    const year = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return `${year}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}`;
  }

  // 12 Jun 2025 / 12-Jun-25 / Jun 12 2025
  const named = value.match(/^(\d{1,2})[\s-]*([A-Za-z]{3,})[\s-]*(\d{2,4})/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    const year = Number(named[3]) < 100 ? 2000 + Number(named[3]) : Number(named[3]);
    if (month) return `${year}-${pad(month)}-${pad(Number(named[1]))}`;
  }
  const named2 = value.match(/^([A-Za-z]{3,})[\s-]*(\d{1,2}),?[\s-]*(\d{4})/);
  if (named2) {
    const month = MONTHS[named2[1].slice(0, 3).toLowerCase()];
    if (month) return `${named2[3]}-${pad(month)}-${pad(Number(named2[2]))}`;
  }

  const fallback = new Date(value);
  if (!isNaN(fallback.getTime())) {
    return `${fallback.getUTCFullYear()}-${pad(fallback.getUTCMonth() + 1)}-${pad(fallback.getUTCDate())}`;
  }
  return null;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Money: strips currency symbols and handles both 1,234.56 and 1 234,56 groupings. */
export function parseMoney(raw: string | null | undefined): number | null {
  let value = String(raw ?? "").trim();
  if (!value) return null;
  const negative = /^\(.*\)$/.test(value) || value.startsWith("-");
  value = value.replace(/[()]/g, "").replace(/[A-Za-z$€£\s]/g, "").replace(/^-/, "");
  if (!value) return null;
  if (value.includes(",") && value.includes(".")) {
    value = value.lastIndexOf(",") > value.lastIndexOf(".")
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, "");
  } else if (value.includes(",")) {
    value = /,\d{1,2}$/.test(value) ? value.replace(",", ".") : value.replace(/,/g, "");
  }
  const n = Number(value);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

export function parseInteger(raw: string | null | undefined): number | null {
  const n = parseMoney(raw);
  if (n === null) return null;
  return Math.max(0, Math.round(n));
}

/* ---------------------------------------------------------------- mappings */

/** ROL'OS booking_channel vocabulary (same list the manual booking dialog offers). */
export function mapNbSource(source: string | null | undefined, type?: string | null): string {
  const s = String(source ?? "").toLowerCase().trim();
  if (!s) return String(type ?? "").toLowerCase().includes("online") ? "nightsbridge" : "direct";
  if (s.includes("booking.com")) return "booking_com";
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("expedia") || s.includes("hotels.com") || s.includes("travelo")) return "expedia";
  if (s.includes("lekkeslaap")) return "lekkeslaap";
  if (s.includes("safarinow")) return "safarinow";
  if (s.includes("agoda")) return "agoda";
  if (s.includes("vrbo")) return "vrbo";
  if (s.includes("tripadvisor")) return "tripadvisor";
  if (s.includes("hostelworld")) return "hostelworld";
  if (s.includes("google")) return "google";
  if (s.includes("nightsbridge") || s === "nb") return "nightsbridge";
  if (s.includes("travel agen") || s.includes("agent")) return "travel_agent";
  if (s.includes("tour")) return "tour_operator";
  if (s.includes("corporate")) return "corporate";
  if (s.includes("own web") || s.includes("web site") || s.includes("website")) return "website";
  if (s.includes("phone") || s.includes("tel")) return "phone";
  if (s.includes("email") || s.includes("mail")) return "email";
  if (s.includes("walk")) return "walk_in";
  if (s.includes("direct") || s.includes("own booking")) return "direct";
  return "other";
}

export type NbAction = "create" | "update" | "skip" | "error";

export interface MappedNbBooking {
  row: number;
  nbid: string | null;
  external_id: string;
  external_id_fallback: boolean;
  room_name: string | null;
  guest_name: string;
  guest_company: string | null;
  booking_made_by: string | null;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  adults: number;
  children: number;
  total_price: number;
  paid_to_date: number;
  commission: number | null;
  currency: string;
  status: string;
  payment_status: string;
  booking_channel: string;
  raw_status: string;
  internal_notes: string;
  is_history: boolean;
}

export interface RowOutcome {
  row: number;
  nbid: string | null;
  action: NbAction;
  reason?: string;
  mapped?: MappedNbBooking;
}

const g = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

/**
 * Map one NightsBridge export row onto the ROL'OS booking shape.
 * "Unavailable" rows are reported as skipped (owner blocks are not guest reservations).
 */
export function mapNbRow(raw: NbRawRow, today: string, defaultCurrency: string): RowOutcome {
  const v = raw.values;
  const rawStatus = g(v, "status");
  const status = rawStatus.toLowerCase();

  if (status.startsWith("unavailable")) {
    return { row: raw.row, nbid: g(v, "nbid") || null, action: "skip", reason: "NightsBridge Unavailable block — not imported" };
  }

  const nbid = g(v, "nbid") || null;
  const bookingId = g(v, "booking id");
  const arrival = parseNbDate(g(v, "arrival date", "arrival"));
  const lastNight = parseNbDate(g(v, "last night", "departure date", "departure"));
  const roomName = g(v, "room name", "room") || null;

  if (!arrival) {
    return { row: raw.row, nbid, action: "error", reason: `Arrival Date could not be read ("${g(v, "arrival date")}")` };
  }

  const nightsCol = parseInteger(g(v, "nights"));
  const checkOut = lastNight
    ? addDays(lastNight, 1)
    : addDays(arrival, Math.max(1, nightsCol ?? 1));
  if (checkOut <= arrival) {
    return { row: raw.row, nbid, action: "error", reason: "Last Night is before the Arrival Date" };
  }
  const nights = nightsCol && nightsCol > 0
    ? nightsCol
    : Math.round((Date.parse(checkOut) - Date.parse(arrival)) / 86400000);

  const guestName = g(v, "guest name", "guest") || g(v, "made by") || "NightsBridge guest";
  const revenue = parseMoney(g(v, "revenue"));
  const nett = parseMoney(g(v, "nett", "net"));
  const total = revenue ?? nett ?? 0;
  const paid = parseMoney(g(v, "paid to date", "paid")) ?? 0;
  const commission = parseMoney(g(v, "commission"));

  let bookingStatus = "pending";
  let paymentStatus = "unpaid";
  if (status === "paid") {
    bookingStatus = "confirmed";
    paymentStatus = "paid";
  } else if (status.startsWith("confirm")) {
    bookingStatus = "confirmed";
    paymentStatus = total > 0 && paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";
  } else if (status.startsWith("provisional") || status.includes("waiting")) {
    bookingStatus = "pending";
    paymentStatus = paid > 0 ? "partial" : "unpaid";
  } else {
    bookingStatus = "pending";
    paymentStatus = paid > 0 ? "partial" : "unpaid";
  }

  const externalId = nbid ?? [bookingId, arrival, roomName ?? "-"].join("|");

  const notes = [
    "— NightsBridge import —",
    `NBID: ${nbid ?? "(none)"}`,
    bookingId ? `NB Booking ID: ${bookingId}` : null,
    g(v, "account id") ? `NB Account ID: ${g(v, "account id")}` : null,
    g(v, "invoice no") ? `Invoice No: ${g(v, "invoice no")}` : null,
    g(v, "proforma no") ? `Proforma No: ${g(v, "proforma no")}` : null,
    rawStatus ? `NB Status: ${rawStatus}` : null,
    g(v, "source") ? `NB Source: ${g(v, "source")}` : null,
    g(v, "type") ? `NB Type: ${g(v, "type")}` : null,
    g(v, "booking date") ? `NB Booking Date: ${g(v, "booking date")}` : null,
    roomName ? `NB Room: ${roomName}` : null,
    g(v, "applied rate") ? `Applied Rate: ${g(v, "applied rate")}` : null,
    commission !== null ? `Commission: ${commission.toFixed(2)}` : null,
    g(v, "extras") ? `Extras: ${g(v, "extras")}` : null,
    g(v, "avg rate") ? `Avg Rate: ${g(v, "avg rate")}` : null,
    g(v, "exchange rate") ? `Exchange Rate: ${g(v, "exchange rate")}` : null,
    checkOut < today ? "Historic stay (imported for reporting)" : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    row: raw.row,
    nbid,
    action: "create",
    mapped: {
      row: raw.row,
      nbid,
      external_id: externalId,
      external_id_fallback: !nbid,
      room_name: roomName,
      guest_name: guestName,
      guest_company: g(v, "company") || null,
      booking_made_by: g(v, "made by") || null,
      check_in_date: arrival,
      check_out_date: checkOut,
      nights,
      adults: Math.max(1, parseInteger(g(v, "adults")) ?? 1),
      children: parseInteger(g(v, "children")) ?? 0,
      total_price: total,
      paid_to_date: paid,
      commission,
      currency: (g(v, "currency") || defaultCurrency || "ZAR").toUpperCase().slice(0, 3),
      status: bookingStatus,
      payment_status: paymentStatus,
      booking_channel: mapNbSource(g(v, "source"), g(v, "type")),
      raw_status: rawStatus,
      internal_notes: notes,
      is_history: checkOut < today,
    },
  };
}

export function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function normaliseRoomKey(name: string | null | undefined): string {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
