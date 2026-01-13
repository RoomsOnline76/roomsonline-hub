import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { FormattedPrice } from "@/components/FormattedPrice";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Loader2, 
  MapPin, 
  Calendar, 
  Users, 
  CreditCard,
  Shield,
  CheckCircle2
} from "lucide-react";

export default function JourneyCheckout() {
  const navigate = useNavigate();
  const { currency } = useCurrency();
  const { 
    stays, 
    totalPrice, 
    totalNights,
    guestDetails, 
    setGuestDetails, 
    specialRequests, 
    setSpecialRequests,
    saveToDatabase,
    hasStays
  } = useItinerary();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Guest form state
  const [guestName, setGuestName] = useState(guestDetails.name || "");
  const [guestEmail, setGuestEmail] = useState(guestDetails.email || "");
  const [guestPhone, setGuestPhone] = useState(guestDetails.phone || "");

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

      // Step 4: Call multi-push-booking
      const { data: bookingResult, error: bookingError } = await supabase.functions.invoke('multi-push-booking', {
        body: { itinerary_id: itineraryId }
      });

      if (bookingError) throw bookingError;

      if (bookingResult?.success) {
        toast.success("Your journey has been booked!");
        navigate(`/journey/confirmation/${itineraryId}`);
      } else if (bookingResult?.partial_success) {
        toast.warning("Some bookings could not be completed. Please check your confirmation.");
        navigate(`/journey/confirmation/${itineraryId}`);
      } else {
        throw new Error(bookingResult?.error || "Booking failed");
      }
    } catch (error) {
      console.error('Booking error:', error);
      toast.error("Failed to complete booking. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
              {stays.length} destination{stays.length > 1 ? 's' : ''} · {totalNights} nights
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
                  <TimelineVisualizer stays={stays} compact />
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
                  <CardContent className="space-y-4">
                    {stays.map((stay, index) => (
                      <div key={stay.id} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{stay.property_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(stay.dates.check_in).toLocaleDateString()} - {new Date(stay.dates.check_out).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <FormattedPrice amount={stay.price_breakdown.total} className="text-sm font-medium" />
                        </div>
                      </div>
                    ))}

                    <Separator />

                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Grand Total</span>
                      <span className="text-2xl font-bold text-primary">
                        <FormattedPrice amount={totalPrice} />
                      </span>
                    </div>

                    <Button
                      onClick={handleCompleteBooking}
                      disabled={isSubmitting || isValidating}
                      className="w-full h-14 text-lg font-medium"
                      size="lg"
                    >
                      {isSubmitting || isValidating ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          {isValidating ? "Checking Availability..." : "Booking..."}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-5 w-5 mr-2" />
                          Confirm Booking
                        </>
                      )}
                    </Button>

                    {/* Trust badges */}
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
                      <Shield className="h-4 w-4" />
                      <span>Secure booking · Instant confirmation</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Stays overview */}
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <MapPin className="h-5 w-5 mx-auto text-primary mb-1" />
                        <p className="text-2xl font-bold">{stays.length}</p>
                        <p className="text-xs text-muted-foreground">Destination{stays.length > 1 ? 's' : ''}</p>
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
    </PublicLayout>
  );
}
