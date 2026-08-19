import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { GuestCheckInForm, type CheckInSubmission } from "./GuestCheckInForm";
import { Loader2, Link2, Copy } from "lucide-react";
import { toast } from "sonner";
import { PUBLIC_DOMAIN } from "@/lib/config";

interface GuestCheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string | null;
  onCompleted?: () => void;
}

interface FormState {
  booking: {
    reference: string;
    guest_name: string | null;
    check_in_date: string | null;
    property_name: string | null;
  };
  checkin: (Partial<CheckInSubmission> & { completed_at?: string | null }) | null;
}

/** Staff-side check-in capture, plus a shareable guest link for self-service. */
export function GuestCheckInDialog({
  open,
  onOpenChange,
  bookingId,
  onCompleted,
}: GuestCheckInDialogProps) {
  const [state, setState] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [guestLink, setGuestLink] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    if (!open || !bookingId) return;
    let cancelled = false;
    setLoading(true);
    setGuestLink(null);
    (async () => {
      const { data, error } = await supabase.functions.invoke("guest-checkin-api", {
        body: { action: "get_form", booking_id: bookingId },
      });
      if (cancelled) return;
      if (error || (data as { error?: string })?.error) {
        toast.error((data as { error?: string })?.error || "Could not load the check-in form");
        setState(null);
      } else {
        setState(data as FormState);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  const submit = useCallback(
    async (submission: CheckInSubmission) => {
      if (!bookingId) return;
      setSubmitting(true);
      const { data, error } = await supabase.functions.invoke("guest-checkin-api", {
        body: { action: "submit", booking_id: bookingId, submission },
      });
      setSubmitting(false);
      if (error || (data as { error?: string })?.error) {
        toast.error((data as { error?: string })?.error || "Could not save the check-in");
        return;
      }
      toast.success("Check-in captured");
      onCompleted?.();
      onOpenChange(false);
    },
    [bookingId, onCompleted, onOpenChange],
  );

  const issueLink = useCallback(async () => {
    if (!bookingId) return;
    setIssuing(true);
    const { data, error } = await supabase.functions.invoke("guest-checkin-api", {
      body: { action: "issue_link", booking_id: bookingId },
    });
    setIssuing(false);
    const payload = data as { path?: string; error?: string } | null;
    if (error || payload?.error || !payload?.path) {
      toast.error(payload?.error || "Could not create a guest link");
      return;
    }
    setGuestLink(`${PUBLIC_DOMAIN}${payload.path}`);
  }, [bookingId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Digital check-in
            {state?.booking.reference ? ` · ${state.booking.reference}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
          <Button variant="outline" size="sm" onClick={issueLink} disabled={issuing}>
            {issuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Guest self check-in link
          </Button>
          {guestLink && (
            <div className="flex flex-1 items-center gap-2">
              <Input readOnly value={guestLink} className="h-8 text-xs" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(guestLink);
                  toast.success("Link copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading booking…
          </div>
        ) : (
          <GuestCheckInForm
            initial={{
              ...(state?.checkin || {}),
              full_name: state?.checkin?.full_name || state?.booking.guest_name || "",
            }}
            submitting={submitting}
            submitLabel={state?.checkin?.completed_at ? "Update check-in" : "Complete check-in"}
            onSubmit={submit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
