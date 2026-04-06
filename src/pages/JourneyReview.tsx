import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useItinerary, ItineraryStay, RoomSelection } from '@/contexts/ItineraryContext';
import { StayCard, TimelineVisualizer, EditStayDatesDialog, EditStayRoomsDialog } from '@/components/journey';
import { PropertyRecommendations } from '@/components/booking/PropertyRecommendations';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO } from 'date-fns';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { WhiteLabelLayout } from '@/components/layout/WhiteLabelLayout';
import { loadBrandFromSession } from '@/lib/brandOverride';
import { useBrandOverride } from '@/hooks/useBrandOverride';

export default function JourneyReview() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Brand override - check if first stay has a branded property
  const cachedBrand = loadBrandFromSession();
  const isBranded = !!cachedBrand?.enabled;
  useBrandOverride(cachedBrand?.propertyId);
  
  const {
    stays,
    guestDetails,
    specialRequests,
    totalPrice,
    totalNights,
    hasStays,
    stayCount,
    removeStay,
    updateStay,
    setGuestDetails,
    setSpecialRequests,
    saveToDatabase,
    isLoading
  } = useItinerary();

  const [isSaving, setIsSaving] = useState(false);
  const [editingStay, setEditingStay] = useState<ItineraryStay | null>(null);
  const [editingRoomsStay, setEditingRoomsStay] = useState<ItineraryStay | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleProceedToCheckout = () => {
    if (!guestDetails.name || !guestDetails.email) {
      toast({
        title: 'Guest details required',
        description: 'Please enter your name and email to continue.',
        variant: 'destructive'
      });
      return;
    }

    // Navigate to checkout page (saving happens there)
    navigate('/journey/checkout');
  };

  const LayoutWrapper = isBranded ? WhiteLabelLayout : PublicLayout;
  const layoutProps = isBranded
    ? { propertyName: stays[0]?.property_name }
    : { hideJourneyBuilder: true };

  if (!hasStays) {
    return (
      <LayoutWrapper {...layoutProps as any}>
        <div className="container max-w-4xl py-16 text-center">
          <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-6" />
          <h1 className="text-3xl font-serif font-semibold mb-4">
            Your Journey Awaits
          </h1>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            You haven't added any stays to your journey yet. Start exploring our collection of extraordinary properties.
          </p>
          <Button onClick={() => navigate('/')} size="lg">
            Browse Properties
          </Button>
        </div>
      </LayoutWrapper>
    );
  }

  return (
    <LayoutWrapper {...layoutProps as any}>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
          <div className="container flex items-center justify-between h-16">
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <h1 className="font-serif text-lg font-medium">Your Journey</h1>
            <div className="w-20" /> {/* Spacer for centering */}
          </div>
        </header>

        <main className="container max-w-5xl py-8 lg:py-12">
          {/* Timeline */}
          <TimelineVisualizer stays={stays} className="mb-12" />

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Stays column */}
            <div className="lg:col-span-2 space-y-6">
              <div>
                <h2 className="text-2xl font-serif font-semibold mb-2">
                  Your Stays
                </h2>
                <p className="text-muted-foreground">
                  {stayCount} {stayCount === 1 ? 'destination' : 'destinations'} · {totalNights} nights
                </p>
              </div>

              <div className="space-y-6">
                {stays.map((stay, index) => (
                  <StayCard
                    key={stay.id}
                    stay={stay}
                    index={index}
                    onEditDates={() => setEditingStay(stay)}
                    onEditRooms={() => setEditingRoomsStay(stay)}
                    onRemove={() => removeStay(stay.id)}
                  />
                ))}
              </div>

              {/* Add another stay */}
              <Button
                variant="outline"
                onClick={() => {
                  // Derive portfolio slug from stays' property_slug or metadata
                  const portfolioSlug = stays[0]?.portfolio_slug;
                  const lastCheckOut = stays[stays.length - 1]?.dates?.check_out || '';
                  if (portfolioSlug) {
                    navigate(`/embed/portfolio/${portfolioSlug}?journey_mode=true&checkIn=${lastCheckOut}`);
                  } else {
                    // Fallback: try to find portfolio from the first stay's property
                    navigate(`/book?journey_mode=true&checkIn=${lastCheckOut}`);
                  }
                }}
                className="w-full"
              >
                Add Another Destination
              </Button>

              {/* Personalized Recommendations */}
              <PropertyRecommendations 
                currentPropertyId={stays[0]?.property_id}
                variant="compact"
                maxItems={3}
                className="mt-8"
              />
            </div>

            {/* Summary column */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Guest details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Guest Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="guest-name">Full Name *</Label>
                      <Input
                        id="guest-name"
                        value={guestDetails.name}
                        onChange={(e) => setGuestDetails({ name: e.target.value })}
                        placeholder="Enter your full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guest-email">Email *</Label>
                      <Input
                        id="guest-email"
                        type="email"
                        value={guestDetails.email}
                        onChange={(e) => setGuestDetails({ email: e.target.value })}
                        placeholder="your@email.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guest-phone">Phone (optional)</Label>
                      <Input
                        id="guest-phone"
                        type="tel"
                        value={guestDetails.phone}
                        onChange={(e) => setGuestDetails({ phone: e.target.value })}
                        placeholder="+27 82 123 4567"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Special requests */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Special Requests</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      placeholder="Anything to make your journey perfect? Dietary requirements, accessibility needs, celebrations..."
                      rows={4}
                    />
                  </CardContent>
                </Card>

                {/* Price summary */}
                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      {stays.map((stay) => (
                        <div key={stay.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground truncate max-w-[60%]">
                            {stay.property_name}
                          </span>
                          <span>{formatCurrency(stay.price_breakdown.total)}</span>
                        </div>
                      ))}

                      <Separator />

                      <div className="flex justify-between font-semibold text-lg">
                        <span>Grand Total</span>
                        <span>{formatCurrency(totalPrice)}</span>
                      </div>
                    </div>

                    <Button
                      onClick={handleProceedToCheckout}
                      disabled={isSaving || isLoading}
                      className="w-full mt-6"
                      size="lg"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Saving...
                        </>
                      ) : (
                        'Complete Your Journey'
                      )}
                    </Button>

                    <p className="text-xs text-muted-foreground text-center mt-3">
                      We'll confirm availability before processing payment
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>

        {/* Edit Stay Dates Dialog */}
        {editingStay && (
          <EditStayDatesDialog
            open={!!editingStay}
            onOpenChange={(open) => !open && setEditingStay(null)}
            stay={editingStay}
            onConfirm={(checkIn, checkOut, newPrice) => {
              const nights = differenceInDays(parseISO(checkOut), parseISO(checkIn));
              updateStay(editingStay.id, {
                dates: { check_in: checkIn, check_out: checkOut },
                nights,
                price_breakdown: {
                  ...editingStay.price_breakdown,
                  subtotal: newPrice,
                  total: newPrice,
                },
              });
              setEditingStay(null);
            }}
          />
        )}

        {/* Edit Stay Rooms Dialog */}
        {editingRoomsStay && (
          <EditStayRoomsDialog
            open={!!editingRoomsStay}
            onOpenChange={(open) => !open && setEditingRoomsStay(null)}
            stay={editingRoomsStay}
            onConfirm={(rooms: RoomSelection[], newTotal: number) => {
              updateStay(editingRoomsStay.id, {
                rooms,
                price_breakdown: {
                  ...editingRoomsStay.price_breakdown,
                  subtotal: newTotal,
                  total: newTotal,
                },
              });
              setEditingRoomsStay(null);
            }}
          />
        )}
      </LayoutWrapper>
  );
}
