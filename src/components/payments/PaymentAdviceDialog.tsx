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

  const mode = payout.settlement_mode;
  const title =
    mode === 'invoice' ? 'Commission Invoice Preview'
      : mode === 'mixed' ? 'Settlement Statement Preview'
        : 'Payment Advice Preview';

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
          net_amount: payout.net_payout,
          booking_count: payout.booking_count,
          white_label_fee: payout.white_label_fee,
          subscription_fee: payout.subscription_fee,
          rol_gross: payout.rol_gross,
          byo_gross: payout.byo_gross,
          rol_commission: payout.rol_commission,
          byo_commission: payout.byo_commission,
          pf_fee: payout.pf_fee,
          pf_fee_rate: payout.pf_fee_rate,
          invoiced_amount: payout.invoiced_amount,
          settlement_mode: payout.settlement_mode,
        },
      });

      if (error) throw error;
      toast.success(
        `${mode === 'invoice' ? 'Commission invoice' : 'Payment advice'} sent to ${payout.owner_email}`,
      );
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
            {title}
          </DialogTitle>
          <DialogDescription>
            Review before sending to {payout.owner_email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
            <h4 className="font-semibold text-sm">{payout.property_name}</h4>
            <Separator />

            {payout.rol_gross > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase">Collected by RoomsOnline</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross collected</span>
                  <span className="font-medium">{fmt(payout.rol_gross)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Commission</span>
                  <span className="text-destructive">−{fmt(payout.rol_commission)}</span>
                </div>
                {payout.pf_fee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Payment provider fee ({payout.pf_fee_rate}%)
                    </span>
                    <span className="text-destructive">−{fmt(payout.pf_fee)}</span>
                  </div>
                )}
              </>
            )}

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

            {payout.byo_gross > 0 && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Settled to your own gateway
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Booking value</span>
                  <span className="font-medium">{fmt(payout.byo_gross)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Commission due to RoomsOnline</span>
                  <span className="text-amber-600">{fmt(payout.byo_commission)}</span>
                </div>
              </>
            )}

            <Separator />
            {payout.net_payout > 0 && (
              <div className="flex justify-between text-sm font-bold">
                <span>Net payout to you</span>
                <span className="text-emerald-600">{fmt(payout.net_payout)}</span>
              </div>
            )}
            {payout.invoiced_amount > 0 && (
              <div className="flex justify-between text-sm font-bold">
                <span>Payable to RoomsOnline</span>
                <span className="text-amber-600">{fmt(payout.invoiced_amount)}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Based on {payout.booking_count} completed booking{payout.booking_count !== 1 ? 's' : ''}.
            {payout.byo_gross > 0 && ' Funds for BYO bookings were settled directly to the owner’s merchant account.'}
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
