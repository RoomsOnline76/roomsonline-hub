/**
 * Public credit-or-refund page for a modified booking.
 *
 * When a change leaves the guest in credit, they decide what happens to the money: keep it against
 * the stay, or have it refunded now. The token from the email is the only credential.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2, Undo2, Wallet, XCircle } from "lucide-react";

interface SettlementView {
  reference: string;
  guest_name: string | null;
  property_name: string | null;
  check_in_date: string;
  check_out_date: string;
  total_price: number;
  amount_paid: number;
  due_back: number;
  credit_held: number;
}

type Choice = "hold_credit" | "refund_now";

const money = (n: number) =>
  `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

export default function BookingCreditChoice() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const preset = params.get("choice");
  const [view, setView] = useState<SettlementView | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Choice | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: fnError } = await supabase.functions.invoke("booking-balance-api", {
        body: { action: "get_settlement", token },
      });
      if (!mounted) return;
      if (fnError || data?.error) {
        setError(
          typeof data?.error === "string" ? data.error : "This link is invalid or has expired.",
        );
      } else if (data?.booking) {
        setView(data.booking as SettlementView);
        if (data.choice === "hold_credit" || data.choice === "refund_now") setChoice(data.choice);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const decide = useCallback(
    async (next: Choice) => {
      setSubmitting(next);
      setError(null);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("booking-balance-api", {
          body: { action: next === "hold_credit" ? "choose_credit" : "choose_refund", token },
        });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(String(data.error));
        setChoice((data?.choice ?? data?.already ?? next) as Choice);
      } catch (e) {
        setError(e instanceof Error ? e.message : "We could not record your choice. Please try again.");
      } finally {
        setSubmitting(null);
      }
    },
    [token],
  );

  // Following a button straight from the email pre-selects that outcome for confirmation.
  const suggested: Choice | null =
    preset === "credit" ? "hold_credit" : preset === "refund" ? "refund_now" : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />Link no longer valid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="text-2xl font-serif">An amount is due back to you</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {view.property_name ?? "Rooms Online"} · {view.reference}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {choice && (
            <Alert className="border-green-500/50 bg-green-500/5">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>
                {choice === "hold_credit" ? "Held as credit" : "Refund requested"}
              </AlertTitle>
              <AlertDescription>
                {choice === "hold_credit"
                  ? `${money(view.due_back)} stays on your reservation as credit and is settled at check-out.`
                  : `${money(view.due_back)} has been sent to the property for approval and will be paid back to your original payment method.`}
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border divide-y text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Guest</span>
              <span>{view.guest_name ?? "—"}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Stay</span>
              <span>
                {view.check_in_date} → {view.check_out_date}
              </span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Updated total</span>
              <span className="tabular-nums">{money(view.total_price)}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Already received</span>
              <span className="tabular-nums">{money(view.amount_paid)}</span>
            </div>
            <div className="flex justify-between px-4 py-3 text-lg">
              <span className="font-semibold">Due back to you</span>
              <span className="font-bold text-primary tabular-nums">{money(view.due_back)}</span>
            </div>
          </div>

          {!choice && (
            <>
              <p className="text-sm text-muted-foreground">
                Choose what happens to this amount. Nothing is paid out until you decide.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  size="lg"
                  variant={suggested === "hold_credit" || !suggested ? "default" : "outline"}
                  disabled={!!submitting}
                  onClick={() => decide("hold_credit")}
                  className="h-auto py-3 flex-col gap-1"
                >
                  {submitting === "hold_credit" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                  <span>Hold as credit</span>
                  <span className="text-[11px] font-normal opacity-80">Kept for your stay</span>
                </Button>
                <Button
                  size="lg"
                  variant={suggested === "refund_now" ? "default" : "outline"}
                  disabled={!!submitting}
                  onClick={() => decide("refund_now")}
                  className="h-auto py-3 flex-col gap-1"
                >
                  {submitting === "refund_now" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Undo2 className="h-4 w-4" />
                  )}
                  <span>Refund me now</span>
                  <span className="text-[11px] font-normal opacity-80">Back to your card</span>
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
