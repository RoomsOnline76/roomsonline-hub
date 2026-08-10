import { useState, useEffect, useRef } from "react";
import { useBrandOverride } from "@/hooks/useBrandOverride";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle, AlertCircle, Home, Calendar, Sparkles, Share2, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TimelineVisualizer } from "@/components/journey";
import { ItineraryStay } from "@/contexts/ItineraryContext";
import { format } from "date-fns";
import { toast } from "sonner";

export default function JourneyConfirmation() {
  useBrandOverride();
  const navigate = useNavigate();
  const { itineraryId } = useParams<{ itineraryId: string }>();
  const [searchParams] = useSearchParams();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const autoDownloadTriggered = useRef(false);
  const autoDownload = searchParams.get("action") === "download";

  const { data: itinerary, isLoading, error } = useQuery({
    queryKey: ["itinerary-confirmation", itineraryId],
    queryFn: async () => {
      if (!itineraryId) throw new Error("No itinerary ID");
      const { data, error } = await supabase.from("itineraries").select("*, itinerary_bookings(*)").eq("id", itineraryId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!itineraryId,
  });

  const stays = (itinerary?.stays || []) as unknown as ItineraryStay[];
  const isConfirmed = itinerary?.status === "confirmed";
  /** Readable journey reference (ROL-TRIP-0014); each stay keeps its own booking reference. */
  const journeyReference = (itinerary as { rol_reference?: string | null } | undefined)?.rol_reference || null;


  useEffect(() => {
    if (autoDownload && itinerary && isConfirmed && !isGeneratingPdf && !autoDownloadTriggered.current) {
      autoDownloadTriggered.current = true;
      const timer = setTimeout(() => handleDownloadPdf(), 500);
      return () => clearTimeout(timer);
    }
  }, [autoDownload, itinerary, isConfirmed, isGeneratingPdf]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const handleDownloadPdf = async () => {
    if (!itineraryId) return;
    setIsGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-itinerary-pdf", { body: { itinerary_id: itineraryId } });
      if (error) throw error;
      if (!data?.html) throw new Error("No brochure content received");

      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("Please allow popups to download your brochure.");
        return;
      }
      printWindow.document.write(data.html);
      printWindow.document.close();
      printWindow.onload = () => setTimeout(() => printWindow.print(), 500);
      setTimeout(() => { try { printWindow.print(); } catch {} }, 2000);
      toast.success('Brochure ready! Use "Save as PDF" in the print dialog.');
    } catch {
      toast.error("Failed to generate brochure. Please try again.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: "My African Journey", url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading your journey…</p>
        </div>
      </div>
    );
  }

  if (error || !itinerary) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-3">Journey Not Found</h1>
          <p className="text-muted-foreground mb-8">We couldn't find this itinerary.</p>
          <Button onClick={() => navigate("/")} size="lg">Return Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className={`py-16 px-4 ${isConfirmed ? "bg-green-50 dark:bg-green-950/20" : "bg-amber-50 dark:bg-amber-950/20"}`}>
        <div className="max-w-2xl mx-auto text-center">
          {isConfirmed ? (
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="h-10 w-10 text-amber-600" />
            </div>
          )}

          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">
            {isConfirmed ? "Your Journey is Confirmed!" : "Booking Status"}
          </h1>

          {isConfirmed && (
            <p className="text-base font-serif italic text-muted-foreground mb-2">
              You're about to sleep in Africa like never before
            </p>
          )}

          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            {isConfirmed
              ? `We've sent a confirmation email to ${itinerary.guest_email}. Your adventure awaits!`
              : "Some bookings may require attention. Please check the details below."}
          </p>

          {journeyReference && (
            <div className="mt-6 inline-flex flex-col items-center rounded-xl border border-border/60 bg-card px-5 py-3">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Journey reference</span>
              <span className="font-mono text-lg font-semibold tracking-tight">{journeyReference}</span>
            </div>
          )}
        </div>
      </div>


      <main className="container max-w-3xl py-12 px-4">
        {/* Timeline */}
        {stays.length > 0 && <TimelineVisualizer stays={stays} className="mb-10" />}

        {/* Journey Summary */}
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm mb-8">
          <div className="px-6 py-4 border-b border-border/40 bg-muted/30">
            <h2 className="text-lg font-semibold tracking-tight">Journey Summary</h2>
          </div>

          <div className="divide-y divide-border/30">
            {stays.map((stay) => (
              <div key={stay.id} className="flex items-center gap-4 px-6 py-4">
                <div className="h-12 w-12 rounded-xl overflow-hidden flex-shrink-0 bg-muted">
                  {stay.property_image ? (
                    <img src={stay.property_image} alt={stay.property_name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{stay.property_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(stay.dates.check_in), "MMM d")} – {format(new Date(stay.dates.check_out), "MMM d, yyyy")} · {stay.nights}{" "}
                    {stay.nights === 1 ? "night" : "nights"}
                  </p>
                </div>
                <p className="font-semibold text-sm shrink-0">{formatCurrency(stay.price_breakdown.total)}</p>
              </div>
            ))}
          </div>

          <div className="px-6 py-4 border-t border-border/40 bg-muted/20 flex justify-between items-center">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-semibold">{formatCurrency(itinerary.total_price || 0)}</span>
          </div>
        </div>

        {/* Guest Details */}
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm mb-8">
          <div className="px-6 py-4 border-b border-border/40 bg-muted/30">
            <h2 className="text-lg font-semibold tracking-tight">Guest Details</h2>
          </div>
          <div className="px-6 py-5 grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Name</p>
              <p className="font-medium">{itinerary.guest_name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Email</p>
              <p className="font-medium">{itinerary.guest_email}</p>
            </div>
            {itinerary.guest_phone && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Phone</p>
                <p className="font-medium">{itinerary.guest_phone}</p>
              </div>
            )}
            {itinerary.special_requests && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Special Requests</p>
                <p className="font-medium">{itinerary.special_requests}</p>
              </div>
            )}
          </div>
        </div>

        {/* Magical Itinerary Brochure */}
        {isConfirmed && (
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl overflow-hidden shadow-sm mb-8">
            <div className="px-6 py-8 text-center">
              <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-900/50 px-4 py-1.5 rounded-full mb-4">
                <Gift className="h-4 w-4 text-amber-600" />
                <span className="text-amber-700 dark:text-amber-300 text-xs font-semibold uppercase tracking-wider">Your Magical Itinerary</span>
              </div>

              <h3 className="text-xl font-semibold tracking-tight mb-5">Download Your Journey Brochure</h3>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={handleDownloadPdf} disabled={isGeneratingPdf} className="gap-2 bg-amber-600 hover:bg-amber-700" size="lg">
                  {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Download Brochure
                </Button>
                <Button variant="outline" size="lg" className="gap-2" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                  Share Journey
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {!isConfirmed && (
            <Button variant="outline" onClick={handleDownloadPdf} disabled={isGeneratingPdf} className="gap-2" size="lg">
              {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Download Brochure
            </Button>
          )}
          <Button onClick={() => navigate("/")} className="gap-2" size="lg">
            <Home className="h-4 w-4" />
            Return Home
          </Button>
        </div>
      </main>
    </div>
  );
}
