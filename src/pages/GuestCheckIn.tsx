import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GuestCheckInForm, type CheckInSubmission } from "@/components/pms/crm/GuestCheckInForm";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface CheckInFormState {
  booking: {
    reference: string;
    guest_name: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    property_name: string | null;
  };
  checkin: Partial<CheckInSubmission> & { completed_at?: string | null } | null;
}

/** Public, token-gated digital check-in page. */
export default function GuestCheckIn() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [state, setState] = useState<CheckInFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = "Digital check-in | Rooms Online";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", "Complete your arrival details before you travel.");
  }, []);

  useEffect(() => {
    if (!token) {
      setError("This check-in link is incomplete.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: fnError } = await supabase.functions.invoke("guest-checkin-api", {
        body: { action: "get_form", token },
      });
      if (cancelled) return;
      if (fnError || (data as { error?: string })?.error) {
        setError((data as { error?: string })?.error || "This check-in link is not valid.");
      } else {
        setState(data as CheckInFormState);
        setDone(Boolean((data as CheckInFormState).checkin?.completed_at));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = useCallback(
    async (submission: CheckInSubmission) => {
      setSubmitting(true);
      const { data, error: fnError } = await supabase.functions.invoke("guest-checkin-api", {
        body: { action: "submit", token, submission },
      });
      setSubmitting(false);
      if (fnError || (data as { error?: string })?.error) {
        toast.error((data as { error?: string })?.error || "We could not save your details.");
        return;
      }
      setDone(true);
    },
    [token],
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your booking…
        </div>
      ) : error ? (
        <Card>
          <CardHeader>
            <CardTitle>Check-in unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">{error}</CardContent>
        </Card>
      ) : done ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-2xl font-semibold">You are checked in</h1>
            <p className="text-muted-foreground">
              Thank you — the team at {state?.booking.property_name || "the property"} has your
              details and will be ready for your arrival.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Digital check-in</CardTitle>
            <p className="text-sm text-muted-foreground">
              {state?.booking.property_name} · {state?.booking.reference}
              {state?.booking.check_in_date ? ` · arriving ${state.booking.check_in_date}` : ""}
            </p>
          </CardHeader>
          <CardContent>
            <GuestCheckInForm
              initial={{
                ...(state?.checkin || {}),
                full_name: state?.checkin?.full_name || state?.booking.guest_name || "",
              }}
              submitting={submitting}
              onSubmit={submit}
            />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
