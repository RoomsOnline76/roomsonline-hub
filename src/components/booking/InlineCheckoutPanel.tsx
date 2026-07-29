import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { CreditCard, Lock, X, Calendar, Users, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useItinerary } from "@/contexts/ItineraryContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { captureBookingOrigin } from "@/lib/bookingOrigin";
import { PaymentGatewayRouter } from "./PaymentGatewayRouter";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { useActivePaymentGateways } from "@/hooks/useActivePaymentGateway";
import type { PaymentGateway } from "@/hooks/useActivePaymentGateway";
import { FormattedPrice } from "@/components/FormattedPrice";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface InlineCheckoutPanelProps {
  open: boolean;
  onClose: () => void;
  onPaymentSuccess: (bookingId: string) => void;
  onPaymentCancelled?: () => void;
}

/**
 * Fluent-inspired inline checkout panel
 * 3 numbered steps: Your Stay → Your Details → Payment
 * Desktop: slide-in panel overlay. Mobile: full-screen drawer.
 */
export function InlineCheckoutPanel({
  open,
  onClose,
  onPaymentSuccess,
  onPaymentCancelled,
}: InlineCheckoutPanelProps) {
  const {
    stays, guestDetails, setGuestDetails,
    specialRequests, setSpecialRequests,
    totalPrice, totalNights, saveToDatabase,
    removeStay, hasStays,
  } = useItinerary();
  const { formatPrice } = useCurrency();
  const { gateways: activeGateways } = useActivePaymentGateways();
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const activeGateway = selectedGateway || activeGateways[0] || "payfast";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payFastUuid, setPayFastUuid] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingPaymentAmount, setPendingPaymentAmount] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [specialOpen, setSpecialOpen] = useState(false);

  const isFormValid =
    guestDetails.name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestDetails.email) &&
    guestDetails.phone.trim().length >= 10;

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!guestDetails.name.trim()) e.name = "Required";
    if (!guestDetails.email.trim()) e.email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestDetails.email)) e.email = "Invalid email";
    if (!guestDetails.phone.trim()) e.phone = "Required";
    else if (guestDetails.phone.trim().length < 10) e.phone = "Min 10 digits";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePayment = async () => {
    if (!validateForm()) return;
    if (stays.length === 0) { toast.error("No items to book"); return; }

    setIsSubmitting(true);
    try {
      // Save itinerary
      const itineraryId = await saveToDatabase();
      if (!itineraryId) throw new Error("Failed to save itinerary");

      // Anonymous auth
      let { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const { data: anon } = await supabase.auth.signInAnonymously();
        user = anon?.user || null;
      }

      const firstStay = stays[0];

      // Deduplication check
      const { data: existing } = await supabase
        .from("bookings")
        .select("id")
        .eq("property_id", firstStay.property_id)
        .eq("check_in_date", firstStay.dates.check_in)
        .eq("check_out_date", firstStay.dates.check_out)
        .eq("guest_email", guestDetails.email)
        .eq("status", "pending")
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const origin = captureBookingOrigin(firstStay.property_id);
      const payload = {
        property_id: firstStay.property_id,
        room_type_id: firstStay.rooms[0]?.room_type_id || null,
        check_in_date: firstStay.dates.check_in,
        check_out_date: firstStay.dates.check_out,
        adults: firstStay.guests.adults,
        children: firstStay.guests.children,
        infants: firstStay.guests.infants,
        guest_name: guestDetails.name,
        guest_email: guestDetails.email,
        guest_phone: guestDetails.phone,
        total_price: totalPrice,
        status: "pending",
        payment_status: "pending",
        booking_channel: "rol-website",
        special_requests: specialRequests || null,
        user_id: user?.id || null,
        ...origin,
        rooms: firstStay.rooms.map(r => ({
          roomTypeId: r.room_type_id,
          roomTypeName: r.room_type_name,
          numberOfAdults: firstStay.guests.adults,
          numberOfChildren: firstStay.guests.children,
          numberOfInfants: firstStay.guests.infants,
          numberOfTeens: 0,
          numberOfPets: 0,
        })),
      };

      let booking;
      if (existing) {
        const { data: updated, error } = await supabase
          .from("bookings")
          .update(payload)
          .eq("id", existing.id)
          .select("id, total_price")
          .single();
        if (error) throw error;
        booking = updated;
      } else {
        const { data: inserted, error } = await supabase
          .from("bookings")
          .insert(payload)
          .select("id, total_price")
          .single();
        if (error) throw error;
        booking = inserted;
      }

      // Initiate payment
      setBookingId(booking.id);
      setPendingPaymentAmount(booking.total_price);

      if (activeGateway === "paygate") {
        setShowPaymentModal(true);
      } else {
        // PayFast: get UUID
        const { data, error } = await supabase.functions.invoke("payfast-api", {
          body: { action: "initiate_onsite_payment", booking_id: booking.id },
        });
        if (error || !data?.success) throw new Error(data?.error || "Payment initiation failed");
        setPayFastUuid(data.uuid);
        setShowPaymentModal(true);
      }
    } catch (err) {
      console.error("Payment error:", err);
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    if (bookingId) onPaymentSuccess(bookingId);
  };

  const handlePaymentCancelled = () => {
    setShowPaymentModal(false);
    setPayFastUuid(null);
    toast.info("Payment cancelled. Your booking is saved.");
    onPaymentCancelled?.();
  };

  const firstStay = stays[0];

  // Content shared between desktop panel and mobile drawer
  const CheckoutContent = () => (
    <div className="space-y-6 pb-32">
      {/* Step 1: Your Stay */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">1</span>
          <h3 className="font-medium">Your Stay</h3>
        </div>

        {stays.map((stay) => (
          <div key={stay.id} className="rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="flex gap-3">
              {stay.property_image && (
                <div className="h-16 w-20 rounded-lg overflow-hidden shrink-0 bg-muted">
                  <img src={stay.property_image} alt={stay.property_name} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{stay.property_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stay.rooms.map(r => r.room_type_name).join(", ")}
                </p>
              </div>
              {stays.length > 1 && (
                <button
                  onClick={() => {
                    removeStay(stay.id);
                    toast.info("Stay removed from itinerary");
                  }}
                  className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="Remove stay"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>
                  {format(parseISO(stay.dates.check_in), "MMM d")} – {format(parseISO(stay.dates.check_out), "MMM d")}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{stay.guests.adults + stay.guests.children} guest{(stay.guests.adults + stay.guests.children) !== 1 ? "s" : ""}</span>
              </div>
              <span>{stay.nights} night{stay.nights !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-border/30">
              <span className="text-xs text-muted-foreground">
                {stay.rooms.length} room{stay.rooms.length !== 1 ? "s" : ""}
              </span>
              <span className="font-semibold text-sm">
                <FormattedPrice amount={stay.price_breakdown.total} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Step 2: Your Details */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">2</span>
          <h3 className="font-medium">Your Details</h3>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="checkout-name" className="text-xs">Full Name *</Label>
            <Input
              id="checkout-name"
              value={guestDetails.name}
              onChange={(e) => setGuestDetails({ name: e.target.value })}
              placeholder="John Smith"
              className={cn("h-10", errors.name && "border-destructive")}
            />
            {errors.name && <p className="text-xs text-destructive mt-0.5">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="checkout-email" className="text-xs">Email *</Label>
            <Input
              id="checkout-email"
              type="email"
              value={guestDetails.email}
              onChange={(e) => setGuestDetails({ email: e.target.value })}
              placeholder="john@example.com"
              className={cn("h-10", errors.email && "border-destructive")}
            />
            {errors.email && <p className="text-xs text-destructive mt-0.5">{errors.email}</p>}
          </div>
          <div>
            <Label htmlFor="checkout-phone" className="text-xs">Phone *</Label>
            <Input
              id="checkout-phone"
              type="tel"
              value={guestDetails.phone}
              onChange={(e) => setGuestDetails({ phone: e.target.value })}
              placeholder="+27 82 123 4567"
              className={cn("h-10", errors.phone && "border-destructive")}
            />
            {errors.phone && <p className="text-xs text-destructive mt-0.5">{errors.phone}</p>}
          </div>
        </div>

        {/* Special Requests - collapsed by default */}
        <Collapsible open={specialOpen} onOpenChange={setSpecialOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className={cn("h-3 w-3 transition-transform", specialOpen && "rotate-90")} />
            <span>Special requests</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Textarea
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder="Dietary needs, accessibility, celebrations..."
              rows={2}
              className="text-sm"
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Step 3: Payment Summary */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">3</span>
          <h3 className="font-medium">Payment</h3>
        </div>

        <div className="rounded-xl border border-border/50 p-4 space-y-2">
          {stays.map((stay) =>
            stay.rooms.map((room, ri) => (
              <div key={`${stay.id}-${ri}`} className="flex justify-between text-sm">
                <div>
                  <p>{room.room_type_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {stay.nights} night{stay.nights !== 1 ? "s" : ""} × <FormattedPrice amount={room.rate_per_night} />
                  </p>
                </div>
                <span className="font-medium"><FormattedPrice amount={room.total_price} /></span>
              </div>
            ))
          )}

          <div className="flex justify-between text-xs text-muted-foreground pt-1">
            <span>Service fee</span>
            <span><FormattedPrice amount={0} /></span>
          </div>

          <div className="border-t border-border/50 pt-3 flex justify-between items-center">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-bold"><FormattedPrice amount={totalPrice} /></span>
          </div>
        </div>

        {/* Payment method selector (multi-gateway) */}
        {activeGateways.length > 1 && (
          <PaymentMethodSelector
            gateways={activeGateways}
            selected={activeGateway}
            onSelect={setSelectedGateway}
          />
        )}
      </div>
    </div>
  );



  // Lock body scroll when panel is open on mobile
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={onClose} />

            {/* Panel — full-screen on mobile, right sidebar on desktop */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className={cn(
                "absolute right-0 top-0 bottom-0",
                "w-full sm:w-[440px] lg:w-[480px]",
                "bg-background border-l border-border shadow-2xl",
                "flex flex-col overflow-hidden",
              )}
            >
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border safe-area-top">
                <div>
                  <h2 className="font-serif text-lg sm:text-xl font-light tracking-tight">Checkout</h2>
                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                    {stays.length} stay{stays.length !== 1 ? "s" : ""} · {totalNights} night{totalNights !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="h-9 w-9 sm:h-8 sm:w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 overscroll-contain">
                <CheckoutContent />
              </div>

              {/* Sticky footer */}
              <div className="shrink-0 border-t border-border p-3 sm:p-4 bg-card/98 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4">
                <Button
                  onClick={handlePayment}
                  disabled={isSubmitting || !isFormValid}
                  className="w-full h-12 sm:h-12 text-base font-medium rounded-xl gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-5 w-5" />
                      Confirm & Pay <FormattedPrice amount={totalPrice} />
                    </>
                  )}
                </Button>
                <div className="flex items-center justify-center gap-2 mt-2 text-[10px] sm:text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  <span>Secured by PayFast · 256-bit SSL</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <PaymentGatewayRouter
        gateway={activeGateway}
        isOpen={showPaymentModal}
        onClose={() => { setShowPaymentModal(false); setPayFastUuid(null); setBookingId(null); }}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentCancelled={handlePaymentCancelled}
        onPaymentInitiated={() => setShowPaymentModal(false)}
        bookingId={bookingId || ""}
        amount={pendingPaymentAmount}
        propertyName={firstStay?.property_name || ""}
        uuid={payFastUuid || undefined}
      />
    </>
  );
}
