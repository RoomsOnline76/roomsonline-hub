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

interface AddMetricModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMetricModal({ open, onOpenChange }: AddMetricModalProps) {
  const [formData, setFormData] = useState({
    metric_date: new Date().toISOString().split("T")[0],
    cash_balance_usd: "",
    cash_balance_zar: "",
    monthly_burn_usd: "",
    monthly_revenue_usd: "",
    exchange_rate: "18.50",
    notes: "",
  });

  const queryClient = useQueryClient();

  const calculatedRunway =
    formData.cash_balance_usd && formData.monthly_burn_usd
      ? (
          parseFloat(formData.cash_balance_usd) /
          parseFloat(formData.monthly_burn_usd)
        ).toFixed(1)
      : null;

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: userData } = await supabase.auth.getUser();

      const payload = {
        metric_date: data.metric_date,
        cash_balance_usd: data.cash_balance_usd
          ? parseFloat(data.cash_balance_usd)
          : null,
        cash_balance_zar: data.cash_balance_zar
          ? parseFloat(data.cash_balance_zar)
          : null,
        monthly_burn_usd: data.monthly_burn_usd
          ? parseFloat(data.monthly_burn_usd)
          : null,
        monthly_revenue_usd: data.monthly_revenue_usd
          ? parseFloat(data.monthly_revenue_usd)
          : null,
        exchange_rate: data.exchange_rate ? parseFloat(data.exchange_rate) : null,
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
        cash_balance_usd: "",
        cash_balance_zar: "",
        monthly_burn_usd: "",
        monthly_revenue_usd: "",
        exchange_rate: "18.50",
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
          <DialogTitle>Record Financial Metrics</DialogTitle>
          <DialogDescription>
            Track cash position and burn rate. Runway is calculated automatically.
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cash_balance_usd">Cash Balance (USD)</Label>
                <Input
                  id="cash_balance_usd"
                  type="number"
                  step="0.01"
                  value={formData.cash_balance_usd}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      cash_balance_usd: e.target.value,
                    }))
                  }
                  placeholder="0.00"
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="monthly_burn_usd">Monthly Burn (USD)</Label>
                <Input
                  id="monthly_burn_usd"
                  type="number"
                  step="0.01"
                  value={formData.monthly_burn_usd}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      monthly_burn_usd: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="monthly_revenue_usd">Monthly Revenue (USD)</Label>
                <Input
                  id="monthly_revenue_usd"
                  type="number"
                  step="0.01"
                  value={formData.monthly_revenue_usd}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      monthly_revenue_usd: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="exchange_rate">Exchange Rate (USD/ZAR)</Label>
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

            {calculatedRunway && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Calculator className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Calculated runway:{" "}
                  <span className="font-semibold text-foreground">
                    {calculatedRunway} months
                  </span>
                </span>
              </div>
            )}

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
              Record Metric
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
