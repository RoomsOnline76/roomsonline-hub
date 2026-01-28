import { useState } from 'react';
import { Download, MessageCircle, Mail, Copy, Check, Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ShareBrochureButtonsProps {
  bookingId?: string;
  itineraryId?: string;
  propertyName?: string;
  checkIn?: string;
  guestName?: string;
  variant?: 'default' | 'compact';
  className?: string;
}

export function ShareBrochureButtons({
  bookingId,
  itineraryId,
  propertyName,
  checkIn,
  guestName,
  variant = 'default',
  className = ''
}: ShareBrochureButtonsProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = itineraryId 
    ? `${window.location.origin}/journey/confirmation/${itineraryId}`
    : `${window.location.origin}/booking-confirmation/${bookingId}`;

  const shareMessage = `Check out my upcoming trip to ${propertyName || 'an amazing destination'}${checkIn ? ` on ${new Date(checkIn).toLocaleDateString()}` : ''}! 🌍✨`;

  const handleDownloadBrochure = async () => {
    if (!itineraryId) {
      toast({
        title: 'Brochure not available',
        description: 'Brochures are available for multi-property itineraries.',
        variant: 'destructive'
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-itinerary-pdf', {
        body: { itinerary_id: itineraryId }
      });

      if (error) throw error;

      if (data?.html_url) {
        // Open brochure in new tab for printing/saving
        window.open(data.html_url, '_blank');
        toast({
          title: 'Brochure ready!',
          description: 'Your travel brochure has opened in a new tab.'
        });
      } else if (data?.html) {
        // Create blob and download
        const blob = new Blob([data.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `journey-brochure-${itineraryId.slice(0, 8)}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast({
          title: 'Brochure downloaded!',
          description: 'Open the file in your browser and print to PDF.'
        });
      }
    } catch (error) {
      console.error('Brochure generation error:', error);
      toast({
        title: 'Error generating brochure',
        description: 'Please try again later.',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareWhatsApp = () => {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage + '\n\n' + shareUrl)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`My upcoming trip to ${propertyName || 'an amazing destination'}`);
    const body = encodeURIComponent(`Hi!\n\n${shareMessage}\n\nView details: ${shareUrl}\n\nCan't wait! 🎉`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({
        title: 'Link copied!',
        description: 'Share it with friends and family.'
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Failed to copy',
        description: 'Please try again.',
        variant: 'destructive'
      });
    }
  };

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {itineraryId && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleDownloadBrochure}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleShareWhatsApp}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={handleCopyLink}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Share2 className="h-4 w-4" />
        <span className="text-sm font-medium">Share your adventure</span>
      </div>
      
      <div className="flex flex-wrap gap-3">
        {itineraryId && (
          <Button 
            variant="default"
            onClick={handleDownloadBrochure}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download Brochure
          </Button>
        )}
        
        <Button 
          variant="outline"
          onClick={handleShareWhatsApp}
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          WhatsApp
        </Button>
        
        <Button 
          variant="outline"
          onClick={handleShareEmail}
        >
          <Mail className="h-4 w-4 mr-2" />
          Email
        </Button>
        
        <Button 
          variant="outline"
          onClick={handleCopyLink}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copy Link
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
