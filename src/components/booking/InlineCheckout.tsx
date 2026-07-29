import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { CreditCard, Lock, X, ChevronDown, ChevronUp, AlertCircle, Check } from "lucide-react";
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
import { PayFastOnsiteModal } from "./PayFastOnsiteModal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface InlineCheckoutProps {
  open: boolean;
  onClose: () => void;
  onPaymentSuccess: (bookingId: string) => void;
  onPaymentCancelled?: () => void;
  className?: string;
}

export function InlineCheckout({ 
  open, 
  onClose,
  onPaymentSuccess,
  onPaymentCancelled,
  className 
}: InlineCheckoutProps) {
  const { stays, guestDetails, setGuestDetails, specialRequests, setSpecialRequests, totalPrice, saveToDatabase } = useItinerary();
  const { formatPrice, currency } = useCurrency();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payFastUuid, setPayFastUuid] = useState<string | null>(null);
  const [payFastSandbox, setPayFastSandbox] = useState<boolean | undefined>(undefined);
  const [payFastCredentialSource, setPayFastCredentialSource] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [showPayFastModal, setShowPayFastModal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!guestDetails.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (!guestDetails.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestDetails.email)) {
      newErrors.email = "Invalid email format";
    }
    if (!guestDetails.phone.trim()) {
      newErrors.phone = "Phone is required";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle PayFast payment initiation
  const handlePayment = async () => {
    if (!validateForm()) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (stays.length === 0) {
      toast.error("No items in cart");
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Save itinerary first
      const itineraryId = await saveToDatabase();
      if (!itineraryId) {
        throw new Error("Failed to save itinerary");
      }

      // Create booking record from first stay
      const firstStay = stays[0];
      // DEDUPLICATION: Check for existing pending booking for same property/dates/email
      const { data: existingPending } = await supabase
        .from('bookings')
        .select('id')
        .eq('property_id', firstStay.property_id)
        .eq('check_in_date', firstStay.dates.check_in)
        .eq('check_out_date', firstStay.dates.check_out)
        .eq('guest_email', guestDetails.email)
        .eq('status', 'pending')
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const origin = captureBookingOrigin(firstStay.property_id);
      const bookingPayload = {
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
        status: 'pending',
        payment_status: 'pending',
        booking_channel: 'rol-website',
        special_requests: specialRequests || null,
        ...origin,
      };

      let booking;
      if (existingPending) {
        console.log('[InlineCheckout] Reusing existing pending booking:', existingPending.id);
        const { data: updated, error: updateErr } = await supabase
          .from('bookings')
          .update(bookingPayload)
          .eq('id', existingPending.id)
          .select('id')
          .single();
        if (updateErr) throw new Error("Failed to update booking");
        booking = updated;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('bookings')
          .insert(bookingPayload)
          .select('id')
          .single();
        if (insertErr || !inserted) {
          console.error('Booking creation error:', insertErr);
          throw new Error("Failed to create booking");
        }
        booking = inserted;
      }

      // Get PayFast UUID using the booking ID
      const { data, error } = await supabase.functions.invoke('payfast-api', {
        body: {
          action: 'initiate_onsite_payment',
          booking_id: booking.id,
        }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || data?.details || "Failed to initiate payment");
      }

      setBookingId(booking.id);
      setPayFastUuid(data.uuid);
      if (typeof data.is_sandbox === "boolean") setPayFastSandbox(data.is_sandbox);
      if (data.credential_source) setPayFastCredentialSource(data.credential_source);
      setShowPayFastModal(true);
    } catch (err) {
      console.error('Payment initiation error:', err);
      toast.error(err instanceof Error ? err.message : "Failed to start payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle successful payment
  const handlePayFastSuccess = () => {
    setShowPayFastModal(false);
    toast.success("Payment successful!");
    // The ITN callback handles actual booking creation
    // Navigate to confirmation page with itinerary ID
    onPaymentSuccess(stays[0]?.property_id || 'success');
  };

  // Handle cancelled payment
  const handlePayFastCancelled = () => {
    setShowPayFastModal(false);
    setPayFastUuid(null);
    toast.info("Payment cancelled");
    onPaymentCancelled?.();
  };

  if (!open) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className={cn(
            "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm",
            className
          )}
        >
          <div className="fixed inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto bg-background border-t border-border shadow-2xl rounded-t-3xl">
            {/* Header */}
            <div className="sticky top-0 bg-background/98 backdrop-blur-xl border-b border-border px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl font-semibold">Checkout</h2>
                  <p className="text-sm text-muted-foreground">
                    {stays.length} stay{stays.length !== 1 ? 's' : ''} · {formatPrice(totalPrice)}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3 font-serif italic">
                You're about to sleep in Africa like never before
              </p>
            </div>

            <div className="p-4 space-y-4 pb-32">
              {/* Order Summary (collapsible) */}
              <Accordion type="single" collapsible defaultValue="summary">
                <AccordionItem value="summary" className="border rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-4 py-3 bg-muted/30 hover:bg-muted/50">
                    <span className="font-medium">Order Summary</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 py-3 space-y-3">
                    {stays.map((stay) => (
                      <div key={stay.id} className="flex gap-3">
                        <div className="h-16 w-16 rounded-lg overflow-hidden shrink-0 bg-muted">
                          {stay.property_image && (
                            <img 
                              src={stay.property_image} 
                              alt={stay.property_name}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{stay.property_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {stay.rooms.map(r => r.room_type_name).join(', ')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(parseISO(stay.dates.check_in), 'MMM d')} – {format(parseISO(stay.dates.check_out), 'MMM d')} · {stay.nights} nights
                          </p>
                        </div>
                        <p className="font-semibold text-sm">{formatPrice(stay.price_breakdown.total)}</p>
                      </div>
                    ))}
                    <div className="border-t pt-3 flex justify-between font-semibold">
                      <span>Total</span>
                      <span>{formatPrice(totalPrice)}</span>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Guest Details */}
              <div className="space-y-4 rounded-xl border p-4">
                <h3 className="font-medium flex items-center gap-2">
                  Guest Details
                  <span className="text-xs text-muted-foreground">(required)</span>
                </h3>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="guest-name">Full Name</Label>
                    <Input
                      id="guest-name"
                      value={guestDetails.name}
                      onChange={(e) => setGuestDetails({ name: e.target.value })}
                      placeholder="John Smith"
                      className={cn(errors.name && "border-destructive")}
                    />
                    {errors.name && (
                      <p className="text-xs text-destructive mt-1">{errors.name}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="guest-email">Email</Label>
                    <Input
                      id="guest-email"
                      type="email"
                      value={guestDetails.email}
                      onChange={(e) => setGuestDetails({ email: e.target.value })}
                      placeholder="john@example.com"
                      className={cn(errors.email && "border-destructive")}
                    />
                    {errors.email && (
                      <p className="text-xs text-destructive mt-1">{errors.email}</p>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="guest-phone">Phone</Label>
                    <Input
                      id="guest-phone"
                      type="tel"
                      value={guestDetails.phone}
                      onChange={(e) => setGuestDetails({ phone: e.target.value })}
                      placeholder="+27 82 123 4567"
                      className={cn(errors.phone && "border-destructive")}
                    />
                    {errors.phone && (
                      <p className="text-xs text-destructive mt-1">{errors.phone}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Special Requests */}
              <div className="space-y-3 rounded-xl border p-4">
                <h3 className="font-medium">Special Requests</h3>
                <Textarea
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="Any dietary requirements, accessibility needs, or special occasions..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Special requests are subject to availability and cannot be guaranteed.
                </p>
              </div>
            </div>

            {/* Sticky Payment Button */}
            <div className="fixed bottom-0 left-0 right-0 bg-background/98 backdrop-blur-xl border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button
                onClick={handlePayment}
                disabled={isSubmitting}
                className="w-full h-12 text-base font-medium rounded-xl gap-2"
              >
                {isSubmitting ? (
                  "Processing..."
                ) : (
                  <>
                    <CreditCard className="h-5 w-5" />
                    Pay {formatPrice(totalPrice)}
                  </>
                )}
              </Button>
              <div className="flex items-center justify-center gap-2 mt-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                <span>Secured by PayFast · 256-bit SSL</span>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* PayFast Modal */}
      {payFastUuid && bookingId && (
        <PayFastOnsiteModal
          isOpen={showPayFastModal}
          onClose={() => {
            setShowPayFastModal(false);
            setPayFastUuid(null);
            setBookingId(null);
          }}
          onPaymentSuccess={handlePayFastSuccess}
          onPaymentCancelled={handlePayFastCancelled}
          bookingId={bookingId}
          amount={totalPrice}
          propertyName={stays.map(s => s.property_name).join(', ')}
            uuid={payFastUuid}
            isSandbox={payFastSandbox}
            credentialSource={payFastCredentialSource}
        />
      )}
    </>
  );
}
