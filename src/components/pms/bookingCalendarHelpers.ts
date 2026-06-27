// Shared helpers for rendering bookings on PMS calendars / grids.

export interface CalendarBookingRow {
  id: string;
  property_id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  adults: number | null;
  children: number | null;
  teens: number | null;
  infants: number | null;
  pets: number | null;
  total_price: number;
  special_requests: string | null;
  requires_intervention: boolean | null;
  payment_status: string | null;
  room_type_id: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  confirmed:   { bg: "bg-blue-500/20",  text: "text-blue-700 dark:text-blue-300",         border: "border-blue-500/40"  },
  pending:     { bg: "bg-amber-500/20", text: "text-amber-700 dark:text-amber-300",       border: "border-amber-500/40" },
  checked_in:  { bg: "bg-green-500/20", text: "text-green-700 dark:text-green-300",       border: "border-green-500/40" },
  checked_out: { bg: "bg-slate-500/20", text: "text-slate-700 dark:text-slate-300",       border: "border-slate-500/40" },
  cancelled:   { bg: "bg-red-500/20",   text: "text-red-700 dark:text-red-300 line-through", border: "border-red-500/40" },
  no_show:     { bg: "bg-rose-500/20",  text: "text-rose-700 dark:text-rose-300",         border: "border-rose-500/40"  },
};

export function getBookingStatusColor(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.pending;
}

export function bookingHasSpecialIndicator(b: Pick<CalendarBookingRow, "requires_intervention" | "special_requests">): boolean {
  return !!(b.requires_intervention || (b.special_requests && b.special_requests.trim().length > 0));
}
