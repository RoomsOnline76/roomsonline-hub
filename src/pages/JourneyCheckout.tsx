import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useBrandOverride } from "@/hooks/useBrandOverride";
import { supabase } from "@/integrations/supabase/client";
import { useItinerary } from "@/contexts/ItineraryContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { TimelineVisualizer } from "@/components/journey/TimelineVisualizer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormattedPrice } from "@/components/FormattedPrice";
import { PaymentGatewayRouter } from "@/components/booking/PaymentGatewayRouter";
import { PaymentMethodSelector } from "@/components/booking/PaymentMethodSelector";
import { useActivePaymentGateways } from "@/hooks/useActivePaymentGateway";
import type { PaymentGateway } from "@/hooks/useActivePaymentGateway";
import { sortStaysChronologically } from "@/lib/journeyUtils";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Loader2, 
  MapPin, 
  Calendar, 
  Users, 
  CreditCard,
  Shield,
  CheckCircle2,
  X,
  ChevronDown,
  Tag,
  Check
} from "lucide-react";

export default function JourneyCheckout() {
  useBrandOverride();
  const navigate = useNavigate();
  const { gateways: activeGateways } = useActivePaymentGateways();
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const effectiveGateway = selectedGateway || activeGateways[0] || "payfast";
  const { currency } = useCurrency();
  const { 
    stays, 
    totalPrice, 
    totalNights,
    guestDetails, 
    setGuestDetails, 
    specialRequests, 
    setSpecialRequests,
    appliedVoucher,
    setAppliedVoucher,
    saveToDatabase,
    clearItinerary,
    removeStay,
    hasStays
  } = useItinerary();

  const sortedStays = useMemo(() => sortStaysChronologically(stays), [stays]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // PayFast modal state
  const [showPayFastModal, setShowPayFastModal] = useState(false);
  const [paymentBookingId, setPaymentBookingId] = useState<string | null>(null);
  const [paymentUuid, setPaymentUuid] = useState<string | null>(null);
  const [pendingItineraryId, setPendingItineraryId] = useState<string | null>(null);

  // Guest form state
  const [guestName, setGuestName] = useState(guestDetails.name || "");
  const [guestEmail, setGuestEmail] = useState(guestDetails.email || "");
  const [guestPhone, setGuestPhone] = useState(guestDetails.phone || "");

  // Voucher state
  const [voucherCode, setVoucherCode] = useState(appliedVoucher?.code || "");
  const [isApplyingVoucher, setIsApplyingVoucher] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  // Effective total after voucher
  const effectiveTotal = appliedVoucher 
    ? Math.max(0, totalPrice - appliedVoucher.discount_amount) 
    : totalPrice;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Redirect if no stays
  if (!hasStays) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="font-serif text-2xl mb-4">No journey to complete</h1>
          <p className="text-muted-foreground mb-8">
            Start by adding properties to your journey.
          </p>
          <Button onClick={() => navigate("/properties")}>
            Browse Properties
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const validateForm = (): boolean => {
    const errors: string[] = [];
    if (!guestName.trim()) errors.push("Guest name is required");
    if (!guestEmail.trim()) errors.push("Email is required");
    if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      errors.push("Please enter a valid email address");
    }
    if (!guestPhone.trim()) errors.push("Phone number is required");
    
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleApplyVoucher = async () => {
    const code = voucherCode.trim();
    if (!code) return;

    setIsApplyingVoucher(true);
    setVoucherError(null);

    try {
      // Try validation against each property, use first valid result
      for (const stay of sortedStays) {
        const { data, error } = await supabase.functions.invoke('validate-voucher', {
          body: { code, property_id: stay.property_id, subtotal: totalPrice }
        });

        if (error) continue;
        if (data?.valid) {
          setAppliedVoucher({
            code: code.toUpperCase(),
            discount_type: data.discount_type,
            discount_value: data.discount_value,
            discount_amount: data.discount_amount,
            promo_id: data.promo_id,
            description: data.description,
          });
          toast.success(`Voucher applied! ${data.discount_type === 'percentage' ? `${data.discount_value}% off` : formatCurrency(data.discount_amount) + ' off'}`);
          return;
        } else if (data?.reason) {
          setVoucherError(data.reason);
          return;
        }
      }
      setVoucherError("Invalid voucher code");
    } catch {
      setVoucherError("Could not validate voucher. Please try again.");
    } finally {
      setIsApplyingVoucher(false);
    }
  };

  const handleRemoveVoucher = () => {
    setAppliedVoucher(null);
    setVoucherCode("");
    setVoucherError(null);
    toast.info("Voucher removed");
  };

  const handleValidateAvailability = async () => {
    setIsValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-itinerary-availability', {
        body: {
          action: 'validate_all',
          stays: stays.map(s => ({
            id: s.id,
            property_id: s.property_id,
            external_system: s.external_system,
            dates: s.dates,
            rooms: s.rooms,
            guests: s.guests,
          }))
        }
      });

      if (error) throw error;

      const unavailable = data?.validations?.filter((v: any) => !v.is_available) || [];
      if (unavailable.length > 0) {
        toast.error(`${unavailable.length} stay(s) are no longer available. Please review your journey.`);
        navigate('/journey/review');
        return false;
      }

      toast.success("All stays confirmed available!");
      return true;
    } catch (error) {
      console.error('Validation error:', error);
      toast.error("Could not validate availability. Please try again.");
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleCompleteBooking = async () => {
    if (!validateForm()) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Update guest details in context
    setGuestDetails({ name: guestName, email: guestEmail, phone: guestPhone });

    setIsSubmitting(true);
    try {
      // Step 0: Ensure user is signed in (at least anonymously) for RLS policies
      let { data: { session } } = await supabase.auth.getSession();
      console.log('[JourneyCheckout] Current session:', session ? `user: ${session.user.id}, anon: ${session.user.is_anonymous}` : 'none');
      
      if (!session) {
        console.log('[JourneyCheckout] No session, signing in anonymously...');
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) {
          console.error('[JourneyCheckout] Anonymous sign-in failed:', anonError);
          throw new Error("Failed to initialize booking session");
        }
        session = anonData.session;
        console.log('[JourneyCheckout] Anonymous sign-in successful, user:', session?.user?.id);
      }
      
      if (!session) {
        throw new Error("Failed to establish session for booking");
      }

      // Step 1: Validate availability
      const isAvailable = await handleValidateAvailability();
      if (!isAvailable) {
        setIsSubmitting(false);
        return;
      }

      // Step 2: Save itinerary to database
      const itineraryId = await saveToDatabase();
      if (!itineraryId) {
        throw new Error("Failed to save itinerary");
      }

      // Step 3: Update with guest details
      const { error: updateError } = await supabase
        .from('itineraries')
        .update({
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          special_requests: specialRequests,
          status: 'pending'
        })
        .eq('id', itineraryId);

      if (updateError) throw updateError;

      // Step 4: Create a placeholder booking for PayFast
      const firstStay = sortedStays[0];
      
      const aiMetadata = {
        itinerary_id: itineraryId,
        is_itinerary_booking: true,
        stays_count: stays.length,
        total_nights: totalNights,
        ...(appliedVoucher ? { voucher_code: appliedVoucher.code, voucher_discount: appliedVoucher.discount_amount } : {})
      };
      
      console.log('[JourneyCheckout] Creating booking with metadata:', aiMetadata);
      
      const { data: tempBooking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          property_id: firstStay.property_id,
          user_id: session.user.id,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          check_in_date: firstStay.dates.check_in,
          check_out_date: sortedStays[sortedStays.length - 1].dates.check_out,
          adults: firstStay.guests.adults,
          children: firstStay.guests.children || 0,
          total_price: effectiveTotal,
          status: 'pending_payment',
          booking_channel: 'rol_itinerary',
          special_requests: specialRequests ? `Itinerary ${itineraryId}: ${specialRequests}` : `Itinerary: ${itineraryId}`,
          ai_metadata: aiMetadata,
          voucher: appliedVoucher?.code || null,
        })
        .select('id')
        .single();

      if (bookingError || !tempBooking) {
        console.error('[JourneyCheckout] Booking creation failed:', bookingError);
        throw new Error(`Failed to create booking record: ${bookingError?.message || 'Unknown error'}`);
      }
      
      console.log('[JourneyCheckout] Booking created:', tempBooking.id);

      // Step 5: Initiate payment
      console.log('[JourneyCheckout] Opening payment modal for booking:', tempBooking.id, 'gateway:', effectiveGateway);
      setPendingItineraryId(itineraryId);
      setPaymentBookingId(tempBooking.id);
      setShowPayFastModal(true);
      setIsSubmitting(false);

    } catch (error) {
      console.error('Booking error:', error);
      toast.error("Failed to initiate payment. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPayFastModal(false);
    
    if (!pendingItineraryId) {
      toast.error("Missing itinerary reference");
      return;
    }

    toast.success("Payment successful! Processing your journey...");
    
    // Clear the itinerary/cart after successful payment
    clearItinerary();
    
    // Navigate to confirmation
    navigate(`/journey/confirmation/${pendingItineraryId}`);
  };

  const handlePaymentCancelled = () => {
    setShowPayFastModal(false);
    toast.info("Payment cancelled. Your journey has been saved as a draft.");
  };

  return (
    <PublicLayout hideJourneyBuilder>
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
        <div className="bg-background border-b">
          <div className="container mx-auto px-4 py-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/journey/review')}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Review
            </Button>
            <h1 className="font-serif text-3xl md:text-4xl font-light">
              Complete Your Journey
            </h1>
            <p className="text-muted-foreground mt-2">
              {sortedStays.length} destination{sortedStays.length > 1 ? 's' : ''} · {totalNights} nights
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left: Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Timeline Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5 text-primary" />
                    Your Itinerary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TimelineVisualizer stays={sortedStays} compact />
                </CardContent>
              </Card>

              {/* Guest Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-primary" />
                    Guest Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="guestName">Full Name *</Label>
                      <Input
                        id="guestName"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        onBlur={() => setGuestDetails({ name: guestName })}
                        placeholder="John Smith"
                        className="h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guestPhone">Phone Number *</Label>
                      <Input
                        id="guestPhone"
                        type="tel"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        onBlur={() => setGuestDetails({ phone: guestPhone })}
                        placeholder="+27 82 123 4567"
                        className="h-12"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guestEmail">Email Address *</Label>
                    <Input
                      id="guestEmail"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      onBlur={() => setGuestDetails({ email: guestEmail })}
                      placeholder="john@example.com"
                      className="h-12"
                    />
                  </div>

                  {validationErrors.length > 0 && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                      <ul className="text-sm text-destructive space-y-1">
                        {validationErrors.map((err, i) => (
                          <li key={i}>• {err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Special Requests */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Special Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder="Anything to make your journey perfect? Dietary requirements, celebrations, accessibility needs..."
                    className="min-h-[100px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    We'll share these with each property. Special requests are not guaranteed but we'll do our best.
                  </p>
                </CardContent>
              </Card>

              {/* Voucher / Promo Code */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Tag className="h-5 w-5 text-primary" />
                    Voucher / Promo Code
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {appliedVoucher ? (
                    <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">{appliedVoucher.code}</p>
                          <p className="text-xs text-muted-foreground">
                            {appliedVoucher.discount_type === 'percentage' 
                              ? `${appliedVoucher.discount_value}% off` 
                              : `${formatCurrency(appliedVoucher.discount_amount)} off`}
                            {appliedVoucher.description ? ` — ${appliedVoucher.description}` : ''}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={handleRemoveVoucher}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={voucherCode}
                        onChange={(e) => { setVoucherCode(e.target.value); setVoucherError(null); }}
                        placeholder="Enter voucher code"
                        className={`h-12 uppercase ${voucherError ? 'border-destructive' : ''}`}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyVoucher()}
                      />
                      <Button 
                        onClick={handleApplyVoucher} 
                        disabled={isApplyingVoucher || !voucherCode.trim()}
                        className="h-12 px-6"
                      >
                        {isApplyingVoucher ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                      </Button>
                    </div>
                  )}
                  {voucherError && (
                    <p className="text-sm text-destructive mt-2">{voucherError}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CreditCard className="h-5 w-5 text-primary" />
                      Booking Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sortedStays.map((stay, index) => (
                      <Collapsible key={stay.id}>
                        <div className="group">
                          <CollapsibleTrigger className="w-full">
                            <div className="flex items-start gap-3 text-left hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0 mt-0.5">
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{stay.property_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(stay.dates.check_in).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} – {new Date(stay.dates.check_out).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} · {stay.nights} night{stay.nights !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <FormattedPrice amount={stay.price_breakdown.total} className="text-sm font-medium" />
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                              </div>
                            </div>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <div className="ml-10 mr-2 mb-3 space-y-1 text-xs border-l-2 border-muted pl-3">
                              {/* Room lines */}
                              {stay.rooms?.map((room, ri) => (
                                <div key={ri} className="flex justify-between">
                                  <span className="text-muted-foreground">{room.room_type_name} × {stay.nights}n</span>
                                  <span>{formatCurrency(room.total_price)}</span>
                                </div>
                              ))}
                              {/* Fees */}
                              {stay.price_breakdown.fees?.map((fee, fi) => (
                                <div key={`fee-${fi}`} className="flex justify-between">
                                  <span className="text-muted-foreground">{fee.name}</span>
                                  <span>{formatCurrency(fee.amount)}</span>
                                </div>
                              ))}
                              {/* Taxes */}
                              {stay.price_breakdown.taxes?.map((tax, ti) => (
                                <div key={`tax-${ti}`} className="flex justify-between">
                                  <span className="text-muted-foreground">{tax.name}</span>
                                  <span>{formatCurrency(tax.amount)}</span>
                                </div>
                              ))}
                              <Separator className="my-1" />
                              <div className="flex justify-between font-medium">
                                <span>Stay Total</span>
                                <span>{formatCurrency(stay.price_breakdown.total)}</span>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>

                        {/* Remove button on hover */}
                        {sortedStays.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              removeStay(stay.id);
                              toast.success(`${stay.property_name} removed`);
                              if (stays.length <= 1) navigate('/journey/review');
                            }}
                            className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title="Remove stay"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </Collapsible>
                    ))}

                    <Separator />

                    {/* Voucher discount line */}
                    {appliedVoucher && (
                      <div className="flex justify-between text-sm text-primary">
                        <span>Voucher ({appliedVoucher.code})</span>
                        <span>-{formatCurrency(appliedVoucher.discount_amount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Grand Total</span>
                      <span className="text-2xl font-bold text-primary">
                        <FormattedPrice amount={effectiveTotal} />
                      </span>
                    </div>

                    {/* Payment method selector (multi-gateway) */}
                    {activeGateways.length > 1 && (
                      <PaymentMethodSelector
                        gateways={activeGateways}
                        selected={effectiveGateway}
                        onSelect={setSelectedGateway}
                      />
                    )}

                    <Button
                      onClick={handleCompleteBooking}
                      disabled={isSubmitting || isValidating}
                      className="w-full h-14 text-lg font-medium"
                      size="lg"
                    >
                      {isSubmitting || isValidating ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          {isValidating ? "Checking Availability..." : "Preparing Payment..."}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-5 w-5 mr-2" />
                          Pay & Confirm Booking
                        </>
                      )}
                    </Button>

                    {/* Trust badges */}
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                      <Shield className="h-4 w-4" />
                      <span>Secure payment via {effectiveGateway === "payfast" ? "PayFast" : effectiveGateway.charAt(0).toUpperCase() + effectiveGateway.slice(1)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Stays overview */}
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <MapPin className="h-5 w-5 mx-auto text-primary mb-1" />
                        <p className="text-2xl font-bold">{sortedStays.length}</p>
                        <p className="text-xs text-muted-foreground">Destination{sortedStays.length > 1 ? 's' : ''}</p>
                      </div>
                      <div>
                        <Calendar className="h-5 w-5 mx-auto text-primary mb-1" />
                        <p className="text-2xl font-bold">{totalNights}</p>
                        <p className="text-xs text-muted-foreground">Night{totalNights > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal - routes based on active gateway */}
      {paymentBookingId && (
        <PaymentGatewayRouter
          gateway={effectiveGateway}
          isOpen={showPayFastModal}
          onClose={() => setShowPayFastModal(false)}
          onPaymentSuccess={handlePaymentSuccess}
          onPaymentCancelled={handlePaymentCancelled}
          onPaymentInitiated={() => setShowPayFastModal(false)}
          bookingId={paymentBookingId}
          amount={effectiveTotal}
          propertyName={`Journey: ${sortedStays.length} destinations`}
          isSandbox={true}
          uuid={paymentUuid || undefined}
        />
      )}
    </PublicLayout>
  );
}
