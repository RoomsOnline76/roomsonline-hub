import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, Download, Home, Calendar, Sparkles, Share2, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TimelineVisualizer } from '@/components/journey';
import { ItineraryStay } from '@/contexts/ItineraryContext';
import { format } from 'date-fns';
import { toast } from 'sonner';
// PDF generation uses browser print dialog for better compatibility

export default function JourneyConfirmation() {
  const navigate = useNavigate();
  const { itineraryId } = useParams<{ itineraryId: string }>();
  const [searchParams] = useSearchParams();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const autoDownloadTriggered = useRef(false);
  
  // Check if auto-download was requested via URL param
  const autoDownload = searchParams.get('action') === 'download';

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

  // Check if itinerary is confirmed
  const stays = (itinerary?.stays || []) as unknown as ItineraryStay[];
  const isConfirmed = itinerary?.status === 'confirmed';

  // Auto-trigger brochure download if action=download is in URL
  useEffect(() => {
    if (autoDownload && itinerary && isConfirmed && !isGeneratingPdf && !autoDownloadTriggered.current) {
      autoDownloadTriggered.current = true;
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        handleDownloadPdf();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoDownload, itinerary, isConfirmed, isGeneratingPdf]);

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
      console.log('[PDF] Fetching brochure HTML...');
      const { data, error } = await supabase.functions.invoke('generate-itinerary-pdf', {
        body: { itinerary_id: itineraryId }
      });
      
      if (error) throw error;
      if (!data?.html) throw new Error('No brochure content received');
      
      console.log('[PDF] HTML received, length:', data.html.length);
      
      // Open HTML in new window for printing/saving as PDF
      // This is more reliable than html2pdf which has issues with fonts and off-screen rendering
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Please allow popups to download your brochure.');
        return;
      }
      
      // Write the full HTML document (includes all styles and fonts)
      printWindow.document.write(data.html);
      printWindow.document.close();
      
      // Wait for content to load, then trigger print dialog
      printWindow.onload = () => {
        console.log('[PDF] Triggering print dialog...');
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
      
      // Fallback: trigger print after a delay if onload doesn't fire
      setTimeout(() => {
        try {
          printWindow.print();
        } catch (e) {
          console.log('[PDF] Print already triggered or window closed');
        }
      }, 2000);
      
      toast.success('Brochure ready! Use "Save as PDF" in the print dialog.');
      
    } catch (e) {
      console.error('[PDF] Generation failed:', e);
      toast.error('Failed to generate brochure. Please try again.');
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

  // stays and isConfirmed are defined above, after the query

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
          
          {isConfirmed && (
            <p className="text-lg font-serif italic text-muted-foreground mb-3">
              You're about to sleep in Africa like never before
            </p>
          )}
          
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

        {/* Magical Itinerary Section */}
        {isConfirmed && (
          <Card className="mb-8 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200 dark:border-amber-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-amber-100 dark:bg-amber-900/50 px-4 py-2 rounded-full mb-4">
                  <Gift className="h-5 w-5 text-amber-600" />
                  <span className="text-amber-700 dark:text-amber-300 font-medium">Your Magical Itinerary</span>
                </div>
                
                <h3 className="text-xl font-serif font-semibold mb-4">
                  Download Your Journey Brochure
                </h3>
                
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button
                    onClick={handleDownloadPdf}
                    disabled={isGeneratingPdf}
                    className="gap-2 bg-amber-600 hover:bg-amber-700"
                    size="lg"
                  >
                    {isGeneratingPdf ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Download Your Journey Brochure
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: 'My African Journey',
                          text: `Check out my upcoming trip!`,
                          url: window.location.href,
                        });
                      } else {
                        navigator.clipboard.writeText(window.location.href);
                        toast.success('Link copied to clipboard!');
                      }
                    }}
                  >
                    <Share2 className="h-4 w-4" />
                    Share Journey
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {!isConfirmed && (
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
          )}
          
          <Button onClick={() => navigate('/')} className="gap-2">
            <Home className="h-4 w-4" />
            Return Home
          </Button>
        </div>
      </main>
    </div>
  );
}
