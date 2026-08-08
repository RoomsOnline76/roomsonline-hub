import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Calculator } from "lucide-react";
import { computeRunway, formatZar, DEFAULT_FX } from "@/lib/burnRate";

interface AddMetricModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Derived monthly burn in ZAR (from recurring bills). */
  derivedBurnZar: number;
  /** Actual ROL revenue per month in ZAR (commission + subscriptions). */
  derivedRevenueZar: number;
}

export function AddMetricModal({
  open,
  onOpenChange,
  derivedBurnZar,
  derivedRevenueZar,
}: AddMetricModalProps) {
  const [formData, setFormData] = useState({
    metric_date: new Date().toISOString().split("T")[0],
    cash_balance_zar: "",
    exchange_rate: String(DEFAULT_FX.usdZar),
    eur_rate: String(DEFAULT_FX.eurZar),
    notes: "",
  });

  const queryClient = useQueryClient();

  const cashZar = parseFloat(formData.cash_balance_zar);
  const runway = computeRunway(
    Number.isFinite(cashZar) ? cashZar : null,
    derivedBurnZar,
    derivedRevenueZar,
  );

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: userData } = await supabase.auth.getUser();
      const usdRate = data.exchange_rate ? parseFloat(data.exchange_rate) : DEFAULT_FX.usdZar;
      const cash = data.cash_balance_zar ? parseFloat(data.cash_balance_zar) : null;

      const payload = {
        metric_date: data.metric_date,
        cash_balance_zar: cash,
        cash_balance_usd: cash !== null && usdRate ? Number((cash / usdRate).toFixed(2)) : null,
        monthly_burn_zar: Number(derivedBurnZar.toFixed(2)),
        monthly_revenue_zar: Number(derivedRevenueZar.toFixed(2)),
        monthly_burn_usd: usdRate ? Number((derivedBurnZar / usdRate).toFixed(2)) : null,
        monthly_revenue_usd: usdRate
          ? Number((derivedRevenueZar / usdRate).toFixed(2))
          : null,
        exchange_rate: usdRate,
        eur_rate: data.eur_rate ? parseFloat(data.eur_rate) : null,
        burn_source: "recurring_invoices",
        notes: data.notes || null,
        created_by: userData.user?.id,
      };

      const { error } = await supabase.from("financial_metrics").upsert(payload, {
        onConflict: "metric_date",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-metrics"] });
      toast.success("Metric recorded");
      onOpenChange(false);
      setFormData({
        metric_date: new Date().toISOString().split("T")[0],
        cash_balance_zar: "",
        exchange_rate: String(DEFAULT_FX.usdZar),
        eur_rate: String(DEFAULT_FX.eurZar),
        notes: "",
      });
    },
    onError: (error) => {
      toast.error("Failed to save: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Record Financial Snapshot</DialogTitle>
          <DialogDescription>
            Burn comes from your recurring bills and revenue from actual commission
            and subscription income — only the cash position and exchange rates are
            captured here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="metric_date">Date</Label>
              <Input
                id="metric_date"
                type="date"
                value={formData.metric_date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, metric_date: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cash_balance_zar">Cash Balance (ZAR)</Label>
              <Input
                id="cash_balance_zar"
                type="number"
                step="0.01"
                value={formData.cash_balance_zar}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    cash_balance_zar: e.target.value,
                  }))
                }
                placeholder="0.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="exchange_rate">Rate (USD/ZAR)</Label>
                <Input
                  id="exchange_rate"
                  type="number"
                  step="0.01"
                  value={formData.exchange_rate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, exchange_rate: e.target.value }))
                  }
                  placeholder="18.50"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="eur_rate">Rate (EUR/ZAR)</Label>
                <Input
                  id="eur_rate"
                  type="number"
                  step="0.01"
                  value={formData.eur_rate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, eur_rate: e.target.value }))
                  }
                  placeholder="20.00"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Derived monthly burn</span>
                <span className="font-semibold">{formatZar(derivedBurnZar)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Actual monthly revenue</span>
                <span className="font-semibold">{formatZar(derivedRevenueZar)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Net burn</span>
                <span className="font-semibold">
                  {runway.netBurnZar > 0 ? formatZar(runway.netBurnZar) : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 border-t border-border pt-2">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Runway:{" "}
                  <span className="font-semibold text-foreground">
                    {runway.cashFlowPositive
                      ? "Cash-flow positive"
                      : runway.months !== null
                        ? `${runway.months.toFixed(1)} months`
                        : "—"}
                  </span>
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Any context for this snapshot..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Record Snapshot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
