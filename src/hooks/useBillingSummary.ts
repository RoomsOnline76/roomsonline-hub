import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BillingSummary {
  totalCommission: number;
  totalFees: number;
  transactionCount: number;
  lastInvoice: {
    id: string;
    period_start: string;
    period_end: string;
    net_payout: number;
    status: string;
    pdf_url: string | null;
  } | null;
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    created_at: string;
    calculated_by: string | null;
  }>;
}

export function useBillingSummary(ownerId: string | undefined) {
  return useQuery({
    queryKey: ["billing-summary", ownerId],
    queryFn: async (): Promise<BillingSummary> => {
      if (!ownerId) throw new Error("No owner ID");

      // Get current month transactions
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [txResult, invoiceResult] = await Promise.all([
        supabase
          .from("billing_transactions")
          .select("id, type, amount, created_at, calculated_by")
          .eq("owner_id", ownerId)
          .gte("created_at", monthStart.toISOString())
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("owner_invoices")
          .select("id, period_start, period_end, net_payout, status, pdf_url")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      if (txResult.error) throw txResult.error;

      const transactions = (txResult.data || []) as Array<{
        id: string; type: string; amount: number; created_at: string; calculated_by: string | null;
      }>;

      let totalCommission = 0;
      let totalFees = 0;
      for (const tx of transactions) {
        if (tx.type === 'commission') totalCommission += Number(tx.amount);
        else totalFees += Number(tx.amount);
      }

      return {
        totalCommission,
        totalFees,
        transactionCount: transactions.length,
        lastInvoice: (invoiceResult.data?.[0] as BillingSummary['lastInvoice']) || null,
        recentTransactions: transactions.slice(0, 5),
      };
    },
    enabled: !!ownerId,
  });
}
