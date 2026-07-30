import { useState } from "react";
import { Send, Loader2, FileText } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { PropertyPayout } from "@/hooks/usePropertyPayouts";
import { toast } from "sonner";

interface PaymentAdviceDialogProps {
  payout: PropertyPayout | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (n: number) =>
  `R${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentAdviceDialog({ payout, open, onOpenChange }: PaymentAdviceDialogProps) {
  const [sending, setSending] = useState(false);

  if (!payout) return null;

  const handleSend = async () => {
    try {
      setSending(true);
      const { error } = await supabase.functions.invoke('send-payment-advice', {
        body: {
          property_id: payout.property_id,
          property_name: payout.property_name,
          owner_email: payout.owner_email,
          gross_amount: payout.gross_amount,
          commission_rate: payout.commission_rate,
          commission_amount: payout.commission_amount,
          fees: payout.fees,
          net_amount: payout.net_amount,
          booking_count: payout.booking_count,
          white_label_fee: payout.white_label_fee,
          subscription_fee: payout.subscription_fee,
        },
      });

      if (error) throw error;
      toast.success(`Payment advice sent to ${payout.owner_email}`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send payment advice');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Payment Advice Preview
          </DialogTitle>
          <DialogDescription>
            Review before sending to {payout.owner_email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
            <h4 className="font-semibold text-sm">{payout.property_name}</h4>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Gross Collected</span>
              <span className="font-medium">{fmt(payout.gross_amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Commission ({payout.commission_rate.toFixed(1)}% eff.)</span>
              <span className="text-destructive">−{fmt(payout.commission_amount)}</span>
            </div>
            {payout.white_label_fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">White-label fee</span>
                <span className="text-destructive">−{fmt(payout.white_label_fee)}</span>
              </div>
            )}
            {payout.subscription_fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subscription fee</span>
                <span className="text-destructive">−{fmt(payout.subscription_fee)}</span>
              </div>
            )}
            {payout.fees > 0 && payout.white_label_fee === 0 && payout.subscription_fee === 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fees</span>
                <span className="text-destructive">−{fmt(payout.fees)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-sm font-bold">
              <span>Net Payout</span>
              <span className="text-emerald-600">{fmt(payout.net_amount)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Based on {payout.booking_count} completed booking{payout.booking_count !== 1 ? 's' : ''}.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Send to Owner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
