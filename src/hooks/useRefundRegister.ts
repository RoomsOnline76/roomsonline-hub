import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface RefundRecord {
  id: string;
  booking_id: string | null;
  property_id: string | null;
  amount: number;
  requested_amount: number | null;
  entitled_amount: number | null;
  reason: string | null;
  reason_category: string | null;
  internal_notes: string | null;
  status: string;
  gateway: string | null;
  pf_payment_id: string | null;
  gateway_refund_id: string | null;
  gateway_error: string | null;
  manual_settlement: boolean | null;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  processed_at: string | null;
  created_at: string;
  booking?: {
    id: string;
    booking_reference: string | null;
    guest_name: string | null;
    check_in: string | null;
    check_out: string | null;
    total_price: number | null;
    booking_channel: string | null;
  } | null;
}

export const REFUND_REASON_CATEGORIES = [
  { value: "guest_request", label: "Guest request" },
  { value: "date_change", label: "Date change" },
  { value: "property_operator", label: "Property / operator" },
  { value: "channel_cancelled", label: "Cancelled at channel" },
  { value: "no_show", label: "No-show" },
  { value: "overpayment", label: "Overpayment" },
  { value: "goodwill", label: "Goodwill gesture" },
  { value: "other", label: "Other" },
] as const;

async function callRefundsApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("refunds-api", { body });
  if (error) {
    const details =
      typeof (error as { context?: { text?: () => Promise<string> } }).context?.text === "function"
        ? await (error as { context: { text: () => Promise<string> } }).context.text()
        : error.message;
    throw new Error(details || error.message);
  }
  if ((data as { error?: unknown })?.error) {
    throw new Error(JSON.stringify((data as { error: unknown }).error));
  }
  return data as T;
}

export function useRefundRegister(propertyId?: string | null, status?: string | null) {
  return useQuery({
    queryKey: ["refund-register", propertyId ?? "all", status ?? "all"],
    queryFn: async () => {
      const res = await callRefundsApi<{ refunds: RefundRecord[] }>({
        action: "list_refunds",
        property_id: propertyId ?? null,
        status: status ?? null,
      });
      return res.refunds ?? [];
    },
  });
}

export function useRequestRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      booking_id: string;
      amount: number;
      reason: string;
      reason_category: string;
      internal_notes?: string;
    }) => callRefundsApi<{ auto_approved: boolean }>({ action: "request_refund", ...params }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["refund-register"] });
      toast.success(
        res.auto_approved
          ? "Refund raised and auto-approved"
          : "Refund raised — awaiting approval",
      );
    },
    onError: (err: Error) => toast.error("Could not raise refund", { description: err.message }),
  });
}

export function useRefundDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      action: "approve_refund" | "reject_refund" | "execute_refund";
      refund_id: string;
      note?: string;
    }) => callRefundsApi<Record<string, unknown>>(params),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["refund-register"] });
      qc.invalidateQueries({ queryKey: ["property-payouts"] });
      if (vars.action === "approve_refund") toast.success("Refund approved");
      else if (vars.action === "reject_refund") toast.success("Refund rejected");
      else if ((res as { manual_settlement_required?: boolean }).manual_settlement_required) {
        toast.warning("Refund recorded — settle manually", {
          description:
            (res as { gateway_error?: string }).gateway_error ??
            "No gateway refund handle for this payment.",
        });
      } else if ((res as { success?: boolean }).success === false) {
        toast.error("Gateway refund failed", {
          description: (res as { error?: string }).error,
        });
      } else {
        toast.success("Refund processed at the gateway");
      }
    },
    onError: (err: Error) => toast.error("Refund action failed", { description: err.message }),
  });
}

export function useRefundCapability(propertyId?: string | null) {
  return useQuery({
    queryKey: ["refund-capability", propertyId ?? "none"],
    enabled: !!propertyId,
    queryFn: () =>
      callRefundsApi<{ available: boolean; reason?: string }>({
        action: "refund_capability",
        property_id: propertyId ?? null,
      }),
    staleTime: 5 * 60 * 1000,
  });
}
