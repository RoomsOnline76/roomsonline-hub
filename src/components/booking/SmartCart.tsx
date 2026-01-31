import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ShoppingBag, ChevronUp, ChevronDown, X, Users, Calendar, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useItinerary } from "@/contexts/ItineraryContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { motion, AnimatePresence } from "framer-motion";

interface SmartCartProps {
  onCheckout: () => void;
  onClear?: () => void;
  className?: string;
}

export function SmartCart({ onCheckout, onClear, className }: SmartCartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { stays, totalPrice, totalNights, hasStays, removeStay } = useItinerary();
  const { formatPrice } = useCurrency();

  if (!hasStays) return null;

  const firstStay = stays[0];
  const totalGuests = stays.reduce((sum, stay) => {
    return sum + (stay.guests?.adults || 0) + (stay.guests?.children || 0) + (stay.guests?.infants || 0);
  }, 0);

  // Build summary string
  const roomNames = stays.flatMap(stay => stay.rooms.map(r => r.room_type_name));
  const uniqueRoomNames = [...new Set(roomNames)];
  const summaryText = uniqueRoomNames.length > 2 
    ? `${uniqueRoomNames.slice(0, 2).join(', ')} +${uniqueRoomNames.length - 2}`
    : uniqueRoomNames.join(', ');

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 z-40",
      "pb-[env(safe-area-inset-bottom,0px)]",
      className
    )}>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-background/98 backdrop-blur-xl border-t border-border shadow-2xl"
          >
            <div className="max-w-lg mx-auto p-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {stays.map((stay, index) => (
                <div 
                  key={stay.id} 
                  className="flex items-start gap-3 p-3 bg-muted/50 rounded-xl"
                >
                  <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden shrink-0">
                    {stay.property_image && (
                      <img 
                        src={stay.property_image} 
                        alt={stay.property_name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{stay.property_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {stay.rooms.map(r => r.room_type_name).join(', ')}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{format(parseISO(stay.dates.check_in), 'MMM d')} – {format(parseISO(stay.dates.check_out), 'MMM d')}</span>
                      <span>·</span>
                      <span>{stay.nights} night{stay.nights !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">{formatPrice(stay.price_breakdown.total)}</p>
                    <button
                      onClick={() => removeStay(stay.id)}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors mt-1"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              
              {/* Totals */}
              <div className="pt-3 border-t border-border">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total ({stays.length} stay{stays.length !== 1 ? 's' : ''})</span>
                  <span className="text-lg font-bold">{formatPrice(totalPrice)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed bar */}
      <div className="bg-background/98 backdrop-blur-xl border-t border-border shadow-2xl">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Expand/collapse trigger */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              <div className="relative">
                <ShoppingBag className="h-5 w-5 text-primary" />
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                  {stays.length}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{summaryText}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Moon className="h-3 w-3" />
                    {totalNights} night{totalNights !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {totalGuests} guest{totalGuests !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <ChevronUp className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isExpanded && "rotate-180"
              )} />
            </button>

            {/* Price + CTA */}
            <div className="text-right shrink-0">
              <p className="text-lg font-bold">{formatPrice(totalPrice)}</p>
            </div>
            <Button 
              onClick={onCheckout}
              className="shrink-0 rounded-full px-6"
            >
              Checkout
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-2 font-serif italic">
            Sleep in Africa like never before
          </p>
        </div>
      </div>
    </div>
  );
}
