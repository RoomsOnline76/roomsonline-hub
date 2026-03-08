// ══════════════════════════════════════════════════════════════════════
// Centralized PMS type definitions — replaces `any` across hooks & pages
// ══════════════════════════════════════════════════════════════════════

// ── Folios ───────────────────────────────────────────────────────────
export interface PmsFolio {
  id: string;
  reservation_id: string | null;
  property_id: string;
  guest_name: string | null;
  status: string;
  balance: number;
  total_charges: number;
  total_payments: number;
  created_at: string;
  updated_at: string;
}

export interface PmsFolioTransaction {
  id: string;
  folio_id: string;
  transaction_type: string;
  description: string;
  amount: number;
  created_at: string;
}

export interface PmsPayment {
  id: string;
  folio_id: string | null;
  property_id: string;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface PmsInvoice {
  id: string;
  folio_id: string;
  property_id: string;
  invoice_number: string | null;
  pdf_url: string | null;
  amount: number;
  status: string;
  issued_date: string;
  notes: string | null;
  created_at: string;
}

export interface PmsFolioDetail {
  folio: PmsFolio;
  transactions: PmsFolioTransaction[];
  payments: PmsPayment[];
  invoices: PmsInvoice[];
}

// ── Refunds ──────────────────────────────────────────────────────────
export interface PmsRefund {
  id: string;
  payment_id: string;
  property_id: string;
  amount: number;
  reason: string;
  status: string;
  created_at: string;
  payment?: Pick<PmsPayment, 'amount' | 'method' | 'reference'>;
}

// ── Tax Rules ────────────────────────────────────────────────────────
export interface PmsTaxRule {
  id: string;
  property_id: string;
  name: string;
  rate: number;
  applies_to: string;
  created_at: string;
}

// ── Staff Shifts ─────────────────────────────────────────────────────
export interface PmsStaffShift {
  id: string;
  property_id: string;
  staff_id: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_at: string;
  staff?: { display_name: string; staff_role: string };
}

// ── Staff Activity ───────────────────────────────────────────────────
export interface PmsStaffActivity {
  id: string;
  property_id: string;
  staff_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  staff?: { display_name: string };
}

// ── Waitlist ─────────────────────────────────────────────────────────
export interface PmsWaitlistEntry {
  id: string;
  property_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  room_type_id: string | null;
  start_date: string;
  end_date: string;
  notes: string | null;
  status: string;
  created_at: string;
  room_type?: { name: string };
}

// ── Pricing Rules ────────────────────────────────────────────────────
export interface PmsPricingRule {
  id: string;
  property_id: string;
  name: string;
  rule_type: string;
  conditions: Record<string, unknown>;
  adjustments: Record<string, unknown>;
  priority: number;
  is_active: boolean;
  created_at: string;
}

// ── Deposit Schedules ────────────────────────────────────────────────
export interface PmsDepositSchedule {
  id: string;
  rate_plan_id: string;
  deposit_type: string;
  deposit_value: number;
  due_days_before: number;
  rate_plan_name?: string;
}

// ── Messaging ────────────────────────────────────────────────────────
export interface PmsMessageTemplate {
  id: string;
  property_id: string;
  name: string;
  trigger_event: string;
  subject: string;
  body: string;
  channel: string;
  is_active: boolean;
  send_offset_hours: number;
  created_at: string;
  updated_at: string;
}

export interface PmsMessageLogEntry {
  id: string;
  reservation_id: string | null;
  channel: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  recipient_email?: string;
  recipient_phone?: string;
  subject?: string;
}

export interface PmsQueueEntry {
  id: string;
  reservation_id: string | null;
  template_id: string | null;
  recipient: string;
  recipient_email?: string;
  subject: string;
  body: string;
  channel: string;
  scheduled_at: string;
  status: string;
}

export interface PmsProcessQueueResult {
  sent: number;
  failed: number;
}

// ── Bookings (Dashboard) ─────────────────────────────────────────────
export interface PmsBookingRow {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  adults: number;
  children: number | null;
  infants: number | null;
  pets: number | null;
  teens: number | null;
  total_price: number;
  special_requests: string | null;
  special_requests_parsed: Record<string, unknown> | null;
  requires_intervention: boolean | null;
  booking_channel: string | null;
  payment_status: string | null;
  payment_method: string | null;
  rolos_check_in_time: string | null;
  rolos_check_out_time: string | null;
  rolos_room_ids: string[] | null;
  rolos_rate_plan_id: string | null;
  modification_notes: Record<string, unknown>[] | null;
  room_type_id: string | null;
  rolos_guest_id: string | null;
}

// ── Rooms (Dashboard) ────────────────────────────────────────────────
export interface PmsRoom {
  id: string;
  room_number: string;
  status: string;
  room_type_id: string | null;
}
