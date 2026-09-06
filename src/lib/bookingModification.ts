import { supabase } from "@/integrations/supabase/client";
import { extractFunctionError } from "@/lib/functionError";

export interface BookingStayModifications {
  check_in_date?: string;
  check_out_date?: string;
  adults?: number;
  children?: number;
  teens?: number;
  infants?: number;
  accommodation_total?: number;
  special_requests?: string;
  note?: string;
  overbook_override_reason?: string;
}

export interface BookingModificationRequest {
  booking_id: string;
  modifications: BookingStayModifications;
  quote_only?: boolean;
  expected_updated_at?: string | null;
  expected_check_in_date?: string | null;
  expected_check_out_date?: string | null;
  settlement?: {
    raise_refund?: boolean;
    request_balance?: boolean;
    overpayment_mode?: "refund" | "credit" | "guest_choice";
  };
}

export interface BookingModificationResult {
  success?: boolean;
  queued?: boolean;
  message?: string;
  code?: string;
  capacity?: number | null;
  new_total_price?: number;
  ru_request_accepted?: boolean;
  quote?: {
    accommodation: number;
    extras_total: number;
    deposit_total: number;
    guest_total: number;
    nights: number;
    currency: string;
    repriced_from: string | null;
    amount_paid: number;
    balance_due: number;
    capacity?: number | null;
    lines: Array<{
      name: string;
      category: string | null;
      amount: number;
      breakdown: string | null;
      is_refundable: boolean;
      counts_in_total: boolean;
    }>;
  };
}

export async function modifyBooking(request: BookingModificationRequest): Promise<BookingModificationResult> {
  const { data, error } = await supabase.functions.invoke("modify-booking", { body: request });
  if (error) throw new Error(await extractFunctionError(error, "Modification failed"));
  const result = (data ?? {}) as BookingModificationResult;
  if (result.success === false) throw new Error(result.message || "Modification failed");
  return result;
}
