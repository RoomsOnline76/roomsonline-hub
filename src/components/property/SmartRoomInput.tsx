import { useState, useCallback } from 'react';
import { Sparkles, Loader2, Check, X, Wand2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ParsedRoomType {
  name: string;
  maxGuests: number;
  bedrooms?: number;
  bathrooms?: number;
  bedConfiguration: { type: string; count: number }[];
  amenities: string[];
  description?: string;
  roomSize?: number;
  roomSizeUnit?: string;
  viewType?: string;
  confidence: number;
}

interface SmartRoomInputProps {
  onRoomParsed: (roomType: ParsedRoomType) => void;
  propertyContext?: string;
  className?: string;
}

const BED_TYPE_LABELS: Record<string, string> = {
  king: 'King',
  queen: 'Queen',
  double: 'Double',
  twin: 'Twin',
  single: 'Single',
  bunk: 'Bunk',
  sofa_bed: 'Sofa Bed',
  daybed: 'Daybed',
};

const AMENITY_LABELS: Record<string, string> = {
  balcony: 'Balcony',
  ocean_view: 'Ocean View',
  mountain_view: 'Mountain View',
  garden_view: 'Garden View',
  city_view: 'City View',
  pool_access: 'Pool Access',
  kitchen: 'Kitchen',
  jacuzzi: 'Jacuzzi',
  fireplace: 'Fireplace',
  air_conditioning: 'A/C',
  wifi: 'WiFi',
  ensuite: 'Ensuite',
};

export function SmartRoomInput({ onRoomParsed, propertyContext, className }: SmartRoomInputProps) {
  const [description, setDescription] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedRoomType | null>(null);
  const [showResult, setShowResult] = useState(false);
  const { toast } = useToast();

  const handleParse = useCallback(async () => {
    if (!description.trim()) {
      toast({
        title: 'Enter a description',
        description: 'Describe the room type in natural language',
        variant: 'destructive'
      });
      return;
    }

    setParsing(true);
    setParsedResult(null);
    setShowResult(false);

    try {
      const { data, error } = await supabase.functions.invoke('smart-room-parser', {
        body: { description, property_context: propertyContext }
      });

      if (error) throw error;

      if (data?.roomType) {
        setParsedResult(data.roomType);
        setShowResult(true);
      }
    } catch (error) {
      console.error('Room parsing error:', error);
      toast({
        title: 'Parsing failed',
        description: 'Could not parse the room description. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setParsing(false);
    }
  }, [description, propertyContext, toast]);

  const handleAccept = () => {
    if (parsedResult) {
      onRoomParsed(parsedResult);
      setDescription('');
      setParsedResult(null);
      setShowResult(false);
      toast({
        title: 'Room type created',
        description: `"${parsedResult.name}" has been added`
      });
    }
  };

  const handleDismiss = () => {
    setParsedResult(null);
    setShowResult(false);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-success';
    if (confidence >= 0.6) return 'text-warning';
    return 'text-warning';
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          Smart Room Creator
        </label>
        <Textarea
          placeholder="Describe the room in natural language, e.g.: 'Ocean view suite with king bed, balcony, sleeps 2, 45sqm'"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-[80px] text-xs"
        />
        <div className="flex items-center gap-2">
          <Button
            onClick={handleParse}
            disabled={parsing || !description.trim()}
            size="sm"
            variant="outline"
          >
            {parsing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Parse Description
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            AI will extract room details automatically
          </span>
        </div>
      </div>

      <AnimatePresence>
        {showResult && parsedResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Parsed Room Type
                  </CardTitle>
                  <span className={cn('text-xs font-medium', getConfidenceColor(parsedResult.confidence))}>
                    {Math.round(parsedResult.confidence * 100)}% confidence
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium">{parsedResult.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max Guests</p>
                    <p className="font-medium">{parsedResult.maxGuests}</p>
                  </div>
                </div>

                {parsedResult.bedConfiguration.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Bed Configuration</p>
                    <div className="flex flex-wrap gap-1">
                      {parsedResult.bedConfiguration.map((bed, i) => (
                        <Badge key={i} variant="secondary">
                          {bed.count}x {BED_TYPE_LABELS[bed.type] || bed.type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {parsedResult.amenities.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Amenities</p>
                    <div className="flex flex-wrap gap-1">
                      {parsedResult.amenities.map((amenity) => (
                        <Badge key={amenity} variant="outline">
                          {AMENITY_LABELS[amenity] || amenity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {parsedResult.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Description</p>
                    <p className="text-sm italic">{parsedResult.description}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={handleAccept} size="sm" className="gap-2">
                    <Check className="h-4 w-4" />
                    Add Room Type
                  </Button>
                  <Button onClick={handleDismiss} variant="ghost" size="sm" className="gap-2">
                    <X className="h-4 w-4" />
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
