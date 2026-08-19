import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Star, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface FeedbackForm {
  guest_name: string | null;
  property_name: string | null;
  already_responded: boolean;
}

/** Public, token-gated post-departure survey. */
export default function GuestFeedback() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = "How was your stay? | Rooms Online";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", "Share feedback about your recent stay in a few seconds.");
  }, []);

  useEffect(() => {
    if (!token) {
      setError("This feedback link is incomplete.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: fnError } = await supabase.functions.invoke("guest-feedback-api", {
        body: { action: "get_form", token },
      });
      if (cancelled) return;
      if (fnError || (data as { error?: string })?.error) {
        setError((data as { error?: string })?.error || "This feedback link is not valid.");
      } else {
        const payload = data as FeedbackForm;
        setForm(payload);
        setDone(payload.already_responded);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = useCallback(async () => {
    if (!rating) {
      toast.error("Please pick a rating first");
      return;
    }
    setSubmitting(true);
    const { data, error: fnError } = await supabase.functions.invoke("guest-feedback-api", {
      body: { action: "submit", token, rating, would_recommend: recommend, comment: comment.trim() },
    });
    setSubmitting(false);
    if (fnError || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error || "We could not record your feedback.");
      return;
    }
    setDone(true);
  }, [rating, recommend, comment, token]);

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <Card>
          <CardHeader>
            <CardTitle>Feedback unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">{error}</CardContent>
        </Card>
      ) : done ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-2xl font-semibold">Thank you</h1>
            <p className="text-muted-foreground">
              Your feedback goes straight to the team at {form?.property_name || "the property"}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">How was your stay?</CardTitle>
            <p className="text-sm text-muted-foreground">
              {form?.guest_name ? `${form.guest_name}, ` : ""}a few seconds is all it takes
              {form?.property_name ? ` — ${form.property_name}` : ""}.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Overall rating</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${value} star${value > 1 ? "s" : ""}`}
                    onClick={() => setRating(value)}
                    className="p-1"
                  >
                    <Star
                      className={cn(
                        "h-8 w-8 transition-colors",
                        value <= rating ? "fill-primary text-primary" : "text-muted-foreground",
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Would you recommend us?</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={recommend === true ? "default" : "outline"}
                  onClick={() => setRecommend(true)}
                >
                  Yes
                </Button>
                <Button
                  type="button"
                  variant={recommend === false ? "default" : "outline"}
                  onClick={() => setRecommend(false)}
                >
                  Not this time
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fb-comment">Anything you want to tell us?</Label>
              <Textarea
                id="fb-comment"
                rows={4}
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <Button onClick={submit} disabled={submitting} className="w-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send feedback
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
