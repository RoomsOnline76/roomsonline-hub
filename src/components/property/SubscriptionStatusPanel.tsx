import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertTriangle, Copy, ExternalLink, XCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  scope: "property" | "portfolio";
  entityId: string;
}

const STATUS_META: Record<string, { label: string; icon: any; className: string }> = {
  active:   { label: "Active",   icon: CheckCircle2, className: "bg-green-500/10 text-green-700 border-green-500/40" },
  pending:  { label: "Pending",  icon: Clock,        className: "bg-amber-500/10 text-amber-700 border-amber-500/40" },
  past_due: { label: "Past due", icon: AlertTriangle,className: "bg-destructive/10 text-destructive border-destructive/40" },
  cancelled:{ label: "Cancelled",icon: XCircle,      className: "bg-muted text-muted-foreground border-border" },
};

export function SubscriptionStatusPanel({ scope, entityId }: Props) {
  const table = scope === "property" ? "property_billing_configs" : "portfolio_billing_configs";
  const keyCol = scope === "property" ? "property_id" : "portfolio_id";

  const { data } = useQuery({
    queryKey: ["subscription-status", scope, entityId],
    queryFn: async () => {
      const { data: cfg } = await (supabase as any).from(table)
        .select("subscription_status, current_period_end, billing_start_date, last_invoice_id, cancelled_at")
        .eq(keyCol, entityId).maybeSingle();
      const { data: latest } = await supabase.from("subscription_invoices")
        .select("id, amount, currency, status, period_start, period_end, payfast_token, invoice_kind, created_at")
        .eq(keyCol, entityId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { cfg, latest };
    },
    enabled: !!entityId,
  });

  const status = data?.cfg?.subscription_status || "pending";
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;
  const latest = data?.latest;
  const payUrl = latest?.payfast_token ? `${window.location.origin}/subscribe/pay/${latest.payfast_token}` : null;

  const copyLink = () => {
    if (!payUrl) return;
    navigator.clipboard.writeText(payUrl);
    toast.success("Payment link copied");
  };

  return (
    <Card className="mb-4 border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          Subscription Status
          <Badge variant="outline" className={`gap-1 ${meta.className}`}>
            <Icon className="h-3 w-3" />{meta.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-muted-foreground">Billing start</div>
            <div className="font-medium">{data?.cfg?.billing_start_date || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Current period ends</div>
            <div className="font-medium">{data?.cfg?.current_period_end || "—"}</div>
          </div>
        </div>
        {latest && (
          <div className="rounded border bg-muted/30 p-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] text-muted-foreground capitalize">
                Latest {latest.invoice_kind} invoice · {latest.status}
              </div>
              <div className="font-medium">
                {latest.currency} {Number(latest.amount).toFixed(2)} · {latest.period_start} → {latest.period_end}
              </div>
            </div>
            {latest.status === "pending" && payUrl && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={copyLink} className="h-7 px-2">
                  <Copy className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" asChild className="h-7 px-2">
                  <a href={payUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" />Open
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Owners receive an automated email when payment is due. They can pay via PayFast and cancel any time — no lock-in.
        </p>
      </CardContent>
    </Card>
  );
}
