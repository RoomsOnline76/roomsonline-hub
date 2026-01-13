import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, Download, Home, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TimelineVisualizer } from '@/components/journey';
import { ItineraryStay } from '@/contexts/ItineraryContext';
import { format } from 'date-fns';

export default function JourneyConfirmation() {
  const navigate = useNavigate();
  const { itineraryId } = useParams<{ itineraryId: string }>();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const { data: itinerary, isLoading, error } = useQuery({
    queryKey: ['itinerary-confirmation', itineraryId],
    queryFn: async () => {
      if (!itineraryId) throw new Error('No itinerary ID');
      
      const { data, error } = await supabase
        .from('itineraries')
        .select('*, itinerary_bookings(*)')
        .eq('id', itineraryId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!itineraryId
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleDownloadPdf = async () => {
    if (!itineraryId) return;
    setIsGeneratingPdf(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-itinerary-pdf', {
        body: { itinerary_id: itineraryId }
      });
      
      if (error) throw error;
      if (data?.pdf_url) {
        window.open(data.pdf_url, '_blank');
      }
    } catch (e) {
      console.error('PDF generation failed:', e);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your journey...</p>
        </div>
      </div>
    );
  }

  if (error || !itinerary) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Journey Not Found</h1>
          <p className="text-muted-foreground mb-6">We couldn't find this itinerary.</p>
          <Button onClick={() => navigate('/')}>Return Home</Button>
        </div>
      </div>
    );
  }

  const stays = (itinerary.stays || []) as unknown as ItineraryStay[];
  const isConfirmed = itinerary.status === 'confirmed';

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className={`py-16 px-4 ${isConfirmed ? 'bg-green-50 dark:bg-green-950/20' : 'bg-orange-50 dark:bg-orange-950/20'}`}>
        <div className="max-w-3xl mx-auto text-center">
          {isConfirmed ? (
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-6" />
          ) : (
            <AlertCircle className="h-16 w-16 text-orange-600 mx-auto mb-6" />
          )}
          
          <h1 className="text-3xl md:text-4xl font-serif font-semibold mb-4">
            {isConfirmed ? 'Your Journey is Confirmed!' : 'Booking Status'}
          </h1>
          
          <p className="text-muted-foreground max-w-lg mx-auto">
            {isConfirmed 
              ? `We've sent a confirmation email to ${itinerary.guest_email}. Your adventure awaits!`
              : 'Some bookings may require attention. Please check the details below.'
            }
          </p>
        </div>
      </div>

      <main className="container max-w-4xl py-12">
        {/* Timeline */}
        {stays.length > 0 && (
          <TimelineVisualizer stays={stays} className="mb-12" />
        )}

        {/* Booking Summary */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Journey Summary</h2>
            
            <div className="space-y-4">
              {stays.map((stay, index) => (
                <div key={stay.id} className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg">
                  <div className="h-12 w-12 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                    {stay.property_image ? (
                      <img 
                        src={stay.property_image} 
                        alt={stay.property_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{stay.property_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(stay.dates.check_in), 'MMM d')} – {format(new Date(stay.dates.check_out), 'MMM d, yyyy')}
                      {' · '}{stay.nights} {stay.nights === 1 ? 'night' : 'nights'}
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(stay.price_breakdown.total)}</p>
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-6" />

            <div className="flex justify-between items-center text-lg font-semibold">
              <span>Total</span>
              <span>{formatCurrency(itinerary.total_price || 0)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Guest Details */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Guest Details</h2>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{itinerary.guest_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium">{itinerary.guest_email}</p>
              </div>
              {itinerary.guest_phone && (
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{itinerary.guest_phone}</p>
                </div>
              )}
              {itinerary.special_requests && (
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Special Requests</p>
                  <p className="font-medium">{itinerary.special_requests}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="outline"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="gap-2"
          >
            {isGeneratingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download Brochure
          </Button>
          
          <Button onClick={() => navigate('/')} className="gap-2">
            <Home className="h-4 w-4" />
            Return Home
          </Button>
        </div>
      </main>
    </div>
  );
}
