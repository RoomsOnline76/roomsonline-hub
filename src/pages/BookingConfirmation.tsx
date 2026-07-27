import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { useBrandOverride } from "@/hooks/useBrandOverride";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { WhiteLabelLayout } from "@/components/layout/WhiteLabelLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, AlertCircle, CreditCard, XCircle, CalendarDays, Users, Share2, Home, MapPin } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import React, { useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

declare global {
  interface Window {
    gtag_report_conversion?: (url?: string) => boolean;
  }
}

interface RoomBooking {
  roomTypeId: string;
  roomTypeName: string;
  numberOfAdults: number;
  numberOfTeens: number;
  numberOfChildren: number;
  numberOfInfants: number;
  checkIn?: string;
  checkOut?: string;
}

const BookingConfirmation = () => {
  const { brandReady } = useBrandOverride();
  usePageSEO({
    title: "Booking Confirmation",
    description: "Your booking confirmation details.",
    noIndex: true,
  });
  const { bookingId } = useParams<{ bookingId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const externalRef = searchParams.get("ref");
  const paymentStatus = searchParams.get("payment");
  const integrationParam = searchParams.get("integration");
  const isIntegration = !!integrationParam;

  // Capture referrer once — later in-page navigation would overwrite it.
  const initialReferrerRef = useRef<string>(typeof document !== "undefined" ? document.referrer : "");

  const { data: booking, isLoading, error, refetch } = useQuery({
    queryKey: ["booking-confirmation", bookingId],
    queryFn: async () => {
      if (!bookingId) throw new Error("No booking ID provided");
      const { data, error } = await supabase
        .from("bookings")
        .select(`*, properties!bookings_property_id_fkey (name, city, country, slug, brand_override_enabled, brand_logo_url)`)
        .eq("id", bookingId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  // Post booking-complete to parent iframe when on an integration
  useEffect(() => {
    if (booking && isIntegration && window.parent !== window) {
      const propertySlug = (booking as any).properties?.slug;
      window.parent.postMessage({
        type: "rolos:booking-complete",
        bookingId: booking.id,
        confirmationNumber: booking.external_reservation_id || booking.id,
        slug: propertySlug || "",
      }, "*");
      window.parent.postMessage({
        type: "rolos:step-change",
        step: "confirmation",
        slug: propertySlug || "",
      }, "*");
    }
  }, [booking, isIntegration]);

  useEffect(() => {
    if (paymentStatus === "success") {
      const timer = setTimeout(() => refetch(), 2000);
      return () => clearTimeout(timer);
    }
  }, [paymentStatus, refetch]);

  useEffect(() => {
    if (booking && typeof window.gtag_report_conversion === "function") {
      window.gtag_report_conversion();
    }
  }, [booking]);

  // Fire portfolio-share notification once booking is confirmed (idempotent server-side)
  useEffect(() => {
    if (!booking) return;
    const status = (booking as any).status;
    const hasOrigin = (booking as any).origin_property_id || (booking as any).origin_portfolio_id;
    if (!hasOrigin) return;
    if (!["confirmed", "paid", "completed"].includes(status)) return;
    supabase.functions
      .invoke("notify-portfolio-share", { body: { booking_id: (booking as any).id } })
      .catch((e) => console.warn("notify-portfolio-share failed", e));
  }, [booking]);

  const propertyName = booking?.properties ? (booking.properties as any).name : undefined;
  const propertyLogoUrl = booking?.properties ? (booking.properties as any).brand_logo_url : null;
  const isWhiteLabel = isIntegration || Boolean(booking?.properties && (booking.properties as any).brand_override_enabled);
  const hideRolBranding = searchParams.get("wl") === "1";
  const wrapLayout = useCallback(
    (children: React.ReactNode) =>
      isWhiteLabel ? (
        <WhiteLabelLayout propertyName={propertyName} propertyLogoUrl={propertyLogoUrl} hideRolBranding={hideRolBranding}>{children}</WhiteLabelLayout>
      ) : (
        <PublicLayout>{children}</PublicLayout>
      ),
    [isWhiteLabel, hideRolBranding, propertyName, propertyLogoUrl]
  );

  if (isLoading) {
    return wrapLayout(
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-xl mx-auto text-center space-y-6">
          <Skeleton className="h-20 w-20 rounded-full mx-auto" />
          <Skeleton className="h-8 w-56 mx-auto" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return wrapLayout(
      <div className="container mx-auto px-4 py-24 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
          </div>
          <h1 className="text-2xl font-semibold mb-3 tracking-tight">Booking Not Found</h1>
          <p className="text-muted-foreground mb-8">
            We couldn't find this booking. It may have expired or the link is invalid.
          </p>
          <Button asChild size="lg">
            <Link to="/">Return to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const property = (booking.properties as unknown) as { name: string; city: string; country: string; slug: string } | null;
  const rooms = (Array.isArray(booking.rooms) ? booking.rooms : []) as unknown as RoomBooking[];
  const totalGuests = booking.adults + (booking.children || 0) + (booking.teens || 0) + (booking.infants || 0);
  const nights = differenceInCalendarDays(parseISO(booking.check_out_date), parseISO(booking.check_in_date));

  const hasMultipleRoomDates = rooms.some(
    (room) =>
      room.checkIn && room.checkOut && (room.checkIn !== booking.check_in_date || room.checkOut !== booking.check_out_date)
  );

  const displayRef = externalRef || booking.external_reservation_id || bookingId?.slice(0, 8).toUpperCase();
  const isPaid = booking.payment_status === "paid";
  const paymentCancelled = paymentStatus === "cancelled";

  const canonicalPropertyUrl = property?.slug
    ? `https://sleepinafrica.roomsonline.co.za/p/${property.slug}`
    : "https://sleepinafrica.roomsonline.co.za";

  const CANONICAL_HOST_RE = /(^|\.)roomsonline\.co\.za$|\.lovable\.(app|dev)$|^localhost$/i;
  const isCanonicalHost = (host: string) => CANONICAL_HOST_RE.test(host);

  const inIframe = typeof window !== "undefined" && window.parent !== window;
  const isWhitelabelHost =
    typeof window !== "undefined" && !isCanonicalHost(window.location.hostname);

  // Resolve where "Close" should send the user back to. Priority:
  //   1. ?return_url= (http/https only)
  //   2. document.referrer if it's a WL (non-canonical) origin
  //   3. Current host root if we're on a WL host
  //   4. Canonical property page
  const resolveCloseTarget = (): string => {
    const rawReturn = searchParams.get("return_url") || searchParams.get("returnUrl");
    if (rawReturn) {
      try {
        const u = new URL(rawReturn);
        if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
      } catch { /* ignore */ }
    }
    const ref = initialReferrerRef.current;
    if (ref) {
      try {
        const u = new URL(ref);
        if (!isCanonicalHost(u.hostname)) return u.toString();
      } catch { /* ignore */ }
    }
    if (typeof window !== "undefined" && isWhitelabelHost) {
      return window.location.origin + "/";
    }
    return canonicalPropertyUrl;
  };

  const handleShare = async () => {
    const shareUrl = canonicalPropertyUrl;
    // navigator.share is unreliable inside cross-origin iframes and on white-label hosts — go straight to clipboard.
    if (!inIframe && !isWhitelabelHost && navigator.share) {
      try {
        await navigator.share({ title: `Booking at ${property?.name}`, url: shareUrl });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.info("Copy this link to share: " + shareUrl);
    }
  };


  return wrapLayout(
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-lg">
        {/* Status icon + heading */}
        <div className="text-center mb-8">
          {paymentCancelled ? (
            <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
              <XCircle className="h-10 w-10 text-amber-500" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="h-10 w-10 text-primary" />
            </div>
          )}

          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2 text-foreground">
            {paymentCancelled ? "Payment Cancelled" : isPaid ? "Booking Confirmed!" : "Reservation Submitted!"}
          </h1>

          <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
            {paymentCancelled
              ? "Your payment was cancelled. Your reservation is still pending — you can return to the property page to try again."
              : (
                <>
                  Your booking at <span className="font-medium text-foreground">{property?.name || "this property"}</span> has
                  been {isPaid ? "confirmed" : "submitted"}. A confirmation email is on its way to{" "}
                  <span className="font-medium text-foreground">{booking.guest_email}</span>.
                </>
              )}
          </p>
        </div>

        {/* Booking details card */}
        <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm mb-6">
          {/* Reference bar — uses primary as accent */}
          <div className="bg-primary/5 px-5 py-3 flex items-center justify-between border-b border-primary/10">
            <span className="text-xs font-medium text-primary/70 uppercase tracking-wider">Reference</span>
            <span className="font-mono text-sm font-semibold tracking-wide text-primary">{displayRef}</span>
          </div>

          <div className="px-5 py-5 space-y-4">
            {/* Property */}
            {property && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-foreground">{property.name}</p>
                  {(property.city || property.country) && (
                    <p className="text-xs text-muted-foreground">{[property.city, property.country].filter(Boolean).join(", ")}</p>
                  )}
                </div>
              </div>
            )}

            {/* Dates & Guests — single booking */}
            {!(rooms.length > 0 && (hasMultipleRoomDates || rooms.length > 1)) && (
              <>
                <div className="flex items-start gap-3">
                  <CalendarDays className="h-4 w-4 text-secondary-foreground mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm font-medium text-foreground">
                        {format(parseISO(booking.check_in_date), "MMM d")} – {format(parseISO(booking.check_out_date), "MMM d, yyyy")}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {nights} night{nights !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 text-secondary-foreground mt-0.5 shrink-0" />
                  <p className="text-sm font-medium text-foreground">{totalGuests} guest{totalGuests !== 1 ? "s" : ""}</p>
                </div>
              </>
            )}

            {/* Multi-room itinerary */}
            {rooms.length > 0 && (hasMultipleRoomDates || rooms.length > 1) && (
              <div className="space-y-3">
                {rooms.map((room, index) => {
                  const roomCheckIn = room.checkIn || booking.check_in_date;
                  const roomCheckOut = room.checkOut || booking.check_out_date;
                  const roomNights = differenceInCalendarDays(parseISO(roomCheckOut), parseISO(roomCheckIn));
                  return (
                    <div key={index} className="pl-4 border-l-2 border-primary/40">
                      <p className="text-sm font-medium text-foreground">{room.roomTypeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(roomCheckIn), "MMM d")} – {format(parseISO(roomCheckOut), "MMM d")} · {roomNights}n ·{" "}
                        {room.numberOfAdults} adult{room.numberOfAdults !== 1 ? "s" : ""}
                        {room.numberOfChildren > 0 && `, ${room.numberOfChildren} child${room.numberOfChildren !== 1 ? "ren" : ""}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Payment */}
            {isPaid && (
              <div className="pt-3 mt-1 border-t border-border/40">
                <div className="flex items-center gap-2 text-primary">
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm font-medium">Payment Confirmed</span>
                </div>
                {booking.payment_reference && (
                  <p className="text-xs text-muted-foreground mt-1 pl-6">Ref: {booking.payment_reference}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => {
              const slug = (booking?.properties as any)?.slug || searchParams.get('property') || searchParams.get('slug');
              const canonicalUrl = slug
                ? `https://sleepinafrica.roomsonline.co.za/p/${slug}`
                : "https://sleepinafrica.roomsonline.co.za";
              if (isIntegration || inIframe) {
                // Tell parent host to close/redirect, then try to close the popup window.
                try { window.parent.postMessage({ type: 'roomsonline:close' }, '*'); } catch {}
                try { window.parent.postMessage({ type: 'roomsonline:navigate', url: canonicalUrl }, '*'); } catch {}
                try { window.close(); } catch {}
                // Fallback: navigate the top-level page (not this iframe) to the canonical property page.
                // Never route to `/p/<slug>` on the current host — white-label hosts don't serve that route.
                try {
                  if (window.top && window.top !== window.self) {
                    window.top.location.assign(canonicalUrl);
                    return;
                  }
                } catch {}
                if (isWhitelabelHost) {
                  window.location.assign(canonicalUrl);
                }
                // Otherwise stay on the confirmation page.
              } else {
                navigate("/");
              }
            }}
            className="flex-1 gap-2"
            size="lg"
          >
            <Home className="h-4 w-4" />
            {isIntegration ? "Close" : "Return Home"}
          </Button>
          <Button variant="outline" size="lg" className="gap-2 border-secondary text-secondary-foreground hover:bg-secondary/10" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
            Share
          </Button>

        </div>
      </div>
    </div>
  );
};

export default BookingConfirmation;
