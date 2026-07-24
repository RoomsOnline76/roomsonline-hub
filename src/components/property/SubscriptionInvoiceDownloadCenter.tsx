import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, ExternalLink } from "lucide-react";

interface Props {
  scope: "property" | "portfolio";
  entityId: string;
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-500/10 text-green-700 border-green-500/40",
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/40",
  past_due: "bg-destructive/10 text-destructive border-destructive/40",
  cancelled: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/40",
};

export function SubscriptionInvoiceDownloadCenter({ scope, entityId }: Props) {
  const keyCol = scope === "property" ? "property_id" : "portfolio_id";

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["subscription-invoices-history", scope, entityId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("subscription_invoices")
        .select("id, invoice_number, amount, currency, status, period_start, period_end, pdf_url, invoice_kind, created_at, paid_at, payfast_token")
        .eq(keyCol, entityId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!entityId,
  });

  if (isLoading) return null;
  if (!invoices || invoices.length === 0) return null;

  return (
    <Card className="mb-4 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Invoice Download Centre
          <Badge variant="outline" className="text-[10px]">{invoices.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs">
        <div className="divide-y">
          {invoices.map((inv: any) => {
            const styleCls = STATUS_STYLES[inv.status] || STATUS_STYLES.pending;
            const payUrl = inv.status === "pending" && inv.payfast_token
              ? `${window.location.origin}/subscribe/pay/${inv.payfast_token}`
              : null;
            return (
              <div key={inv.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {inv.invoice_number || `Invoice ${String(inv.id).slice(0, 8)}`}
                    </span>
                    <Badge variant="outline" className={`text-[10px] capitalize ${styleCls}`}>
                      {inv.status}
                    </Badge>
                    {inv.invoice_kind && (
                      <span className="text-[10px] text-muted-foreground capitalize">
                        {inv.invoice_kind}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {inv.period_start} → {inv.period_end} · {inv.currency} {Number(inv.amount).toFixed(2)}
                    {inv.paid_at && ` · Paid ${new Date(inv.paid_at).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {inv.pdf_url ? (
                    <Button size="sm" variant="outline" asChild className="h-7 px-2">
                      <a href={inv.pdf_url} target="_blank" rel="noreferrer" download>
                        <Download className="h-3 w-3 mr-1" />PDF
                      </a>
                    </Button>
                  ) : payUrl ? (
                    <Button size="sm" variant="outline" asChild className="h-7 px-2">
                      <a href={payUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1" />Pay
                      </a>
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic px-2">
                      No PDF
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          PDF invoices are emailed automatically after each successful payment. Download historical invoices here anytime.
        </p>
      </CardContent>
    </Card>
  );
}
