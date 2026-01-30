import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, AlertCircle, CreditCard, XCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useEffect } from "react";

// Declare gtag for TypeScript
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
  const { bookingId } = useParams<{ bookingId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Get external reservation ID from URL if available
  const externalRef = searchParams.get("ref");
  // Check for payment status from PayFast redirect
  const paymentStatus = searchParams.get("payment");

  // Fetch booking details
  const { data: booking, isLoading, error, refetch } = useQuery({
    queryKey: ["booking-confirmation", bookingId],
    queryFn: async () => {
      if (!bookingId) throw new Error("No booking ID provided");
      
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          *,
          properties:property_id (
            name,
            city,
            country,
            slug
          )
        `)
        .eq("id", bookingId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  // Refetch booking when returning from payment to get updated status
  useEffect(() => {
    if (paymentStatus === "success") {
      // Give PayFast ITN time to update the booking
      const timer = setTimeout(() => {
        refetch();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [paymentStatus, refetch]);

  // Fire Google Ads conversion on page load
  useEffect(() => {
    if (booking && typeof window.gtag_report_conversion === 'function') {
      window.gtag_report_conversion();
    }
  }, [booking]);

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-lg mx-auto">
            <Skeleton className="h-16 w-16 rounded-full mx-auto mb-6" />
            <Skeleton className="h-8 w-64 mx-auto mb-4" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (error || !booking) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-24 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground/30 mx-auto mb-6" />
          <h1 className="font-display text-2xl sm:text-3xl mb-4">Booking Not Found</h1>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            We couldn't find this booking. It may have expired or the link is invalid.
          </p>
          <Button asChild>
            <Link to="/">Return to Home</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const property = booking.properties as { name: string; city: string; country: string; slug: string } | null;
  const rooms = (Array.isArray(booking.rooms) ? booking.rooms : []) as unknown as RoomBooking[];
  const totalGuests = booking.adults + (booking.children || 0) + (booking.teens || 0) + (booking.infants || 0);
  
  // Check if there are per-room custom dates
  const hasMultipleRoomDates = rooms.some(room => 
    room.checkIn && room.checkOut && 
    (room.checkIn !== booking.check_in_date || room.checkOut !== booking.check_out_date)
  );

  const displayRef = externalRef || booking.external_reservation_id || bookingId?.slice(0, 8).toUpperCase();
  const isPaid = booking.payment_status === "paid";
  const paymentCancelled = paymentStatus === "cancelled";

  return (
    <PublicLayout>
      <div className="container mx-auto px-3 sm:px-4 py-12 sm:py-20">
        <Card className="max-w-lg mx-auto text-center border-border/50">
          <CardContent className="pt-8 pb-8 sm:pt-10 sm:pb-10 px-6 sm:px-8">
            {paymentCancelled ? (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
                  <XCircle className="h-8 w-8 text-amber-500" />
                </div>
                <h2 className="font-display text-2xl sm:text-3xl mb-3">Payment Cancelled</h2>
                <p className="text-muted-foreground mb-6">
                  Your payment was cancelled. Your reservation is still pending. 
                  You can return to the property page to try again.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
                <h2 className="font-display text-2xl sm:text-3xl mb-3">
                  {isPaid ? "Reservation Confirmed!" : "Reservation Submitted!"}
                </h2>
                <p className="text-muted-foreground mb-6">
                  Your reservation for <span className="font-medium text-foreground">{property?.name || "this property"}</span> has been {isPaid ? "confirmed" : "submitted"}. 
                  A confirmation email will be sent to {booking.guest_email}.
                </p>
              </>
            )}
            <div className="space-y-2 text-sm text-left bg-muted/30 rounded-lg p-4 sm:p-5 mb-6">
              <p><strong>Reference:</strong> {displayRef}</p>
              
              {/* Show per-room itinerary if rooms have different dates */}
              {rooms.length > 0 && (hasMultipleRoomDates || rooms.length > 1) ? (
                <div className="space-y-2 mt-3">
                  <p className="font-semibold">Itinerary:</p>
                  {rooms.map((room, index) => {
                    const roomCheckIn = room.checkIn || booking.check_in_date;
                    const roomCheckOut = room.checkOut || booking.check_out_date;
                    return (
                      <div key={index} className="pl-3 border-l-2 border-primary/30 ml-1">
                        <p className="font-medium">Room {index + 1}: {room.roomTypeName}</p>
                        <p className="text-muted-foreground">
                          {roomCheckIn && format(parseISO(roomCheckIn), "MMM d, yyyy")} – {roomCheckOut && format(parseISO(roomCheckOut), "MMM d, yyyy")}
                        </p>
                        <p className="text-muted-foreground">
                          {room.numberOfAdults} Adult{room.numberOfAdults !== 1 ? 's' : ''}
                          {room.numberOfTeens > 0 && `, ${room.numberOfTeens} Teen${room.numberOfTeens !== 1 ? 's' : ''}`}
                          {room.numberOfChildren > 0 && `, ${room.numberOfChildren} Child${room.numberOfChildren !== 1 ? 'ren' : ''}`}
                          {room.numberOfInfants > 0 && `, ${room.numberOfInfants} Infant${room.numberOfInfants !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <p><strong>Check-in:</strong> {booking.check_in_date && format(parseISO(booking.check_in_date), "MMM d, yyyy")}</p>
                  <p><strong>Check-out:</strong> {booking.check_out_date && format(parseISO(booking.check_out_date), "MMM d, yyyy")}</p>
                  <p><strong>Guests:</strong> {totalGuests}</p>
                </>
              )}
              
              {/* Payment Status */}
              {isPaid && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <div className="flex items-center gap-2 text-green-600">
                    <CreditCard className="h-4 w-4" />
                    <span className="font-medium">Payment Confirmed</span>
                  </div>
                  {booking.payment_reference && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Transaction: {booking.payment_reference}
                    </p>
                  )}
                </div>
              )}
            </div>
            <Button onClick={() => navigate("/")} className="w-full sm:w-auto">
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
};

export default BookingConfirmation;
