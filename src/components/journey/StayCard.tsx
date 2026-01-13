import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Users, Bed, Edit2, Trash2, ChevronDown, ChevronUp, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ItineraryStay } from '@/contexts/ItineraryContext';
import { cn } from '@/lib/utils';

interface StayCardProps {
  stay: ItineraryStay;
  index: number;
  onEditDates?: () => void;
  onEditRooms?: () => void;
  onRemove?: () => void;
  isValidating?: boolean;
}

export function StayCard({ 
  stay, 
  index, 
  onEditDates, 
  onEditRooms, 
  onRemove,
  isValidating = false 
}: StayCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusBadge = () => {
    if (isValidating) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking availability
        </Badge>
      );
    }

    switch (stay.availability_status) {
      case 'available':
        return (
          <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <Check className="h-3 w-3" />
            Available
          </Badge>
        );
      case 'unavailable':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Unavailable
          </Badge>
        );
      default:
        return null;
    }
  };

  const totalGuests = stay.guests.adults + stay.guests.children + stay.guests.infants;

  return (
    <Card className={cn(
      "overflow-hidden transition-all",
      stay.availability_status === 'unavailable' && "border-destructive/50"
    )}>
      {/* Hero image */}
      <div className="relative h-48 bg-muted overflow-hidden">
        {stay.property_image ? (
          <img
            src={stay.property_image}
            alt={stay.property_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Bed className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
        
        {/* Overlay with property name */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-xs text-white/80 uppercase tracking-wider mb-1">
            Stay {index + 1}
          </p>
          <h3 className="text-xl font-serif font-semibold text-white">
            {stay.property_name}
          </h3>
        </div>

        {/* Status badge */}
        <div className="absolute top-4 right-4">
          {getStatusBadge()}
        </div>
      </div>

      <CardContent className="p-0">
        {/* Date strip */}
        <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {format(new Date(stay.dates.check_in), 'EEE, MMM d')} – {format(new Date(stay.dates.check_out), 'EEE, MMM d, yyyy')}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            {stay.nights} {stay.nights === 1 ? 'night' : 'nights'}
          </span>
        </div>

        {/* Expandable details */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Bed className="h-4 w-4 text-muted-foreground" />
              <span>
                {stay.rooms.reduce((sum, r) => sum + r.quantity, 0)} {stay.rooms.length === 1 ? 'room' : 'rooms'}
              </span>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-4">
            {/* Room breakdown */}
            <div className="space-y-2">
              {stay.rooms.map((room, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {room.room_type_name} × {room.quantity}
                  </span>
                  <span>{formatCurrency(room.total_price)}</span>
                </div>
              ))}
            </div>

            {/* Price breakdown */}
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(stay.price_breakdown.subtotal)}</span>
              </div>
              {stay.price_breakdown.fees.map((fee, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{fee.name}</span>
                  <span>{formatCurrency(fee.amount)}</span>
                </div>
              ))}
              {stay.price_breakdown.taxes.map((tax, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{tax.name}</span>
                  <span>{formatCurrency(tax.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between font-semibold pt-2 border-t border-border">
                <span>Stay Total</span>
                <span>{formatCurrency(stay.price_breakdown.total)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              {onEditDates && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditDates}
                  className="gap-1"
                >
                  <Edit2 className="h-3 w-3" />
                  Edit Dates
                </Button>
              )}
              {onEditRooms && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditRooms}
                  className="gap-1"
                >
                  <Bed className="h-3 w-3" />
                  Edit Rooms
                </Button>
              )}
              {onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
