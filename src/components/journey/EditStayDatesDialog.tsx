import { useState, useEffect } from 'react';
import { format, addDays, differenceInDays } from 'date-fns';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ItineraryStay } from '@/contexts/ItineraryContext';
import { DateRange } from 'react-day-picker';

interface EditStayDatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stay: ItineraryStay;
  onConfirm: (checkIn: string, checkOut: string, newPrice: number) => void;
}

export function EditStayDatesDialog({
  open,
  onOpenChange,
  stay,
  onConfirm,
}: EditStayDatesDialogProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(stay.dates.check_in),
    to: new Date(stay.dates.check_out),
  });
  const [isValidating, setIsValidating] = useState(false);
  const [unavailableDates, setUnavailableDates] = useState<Date[]>([]);

  // Reset dates when stay changes
  useEffect(() => {
    setDateRange({
      from: new Date(stay.dates.check_in),
      to: new Date(stay.dates.check_out),
    });
  }, [stay.id, stay.dates.check_in, stay.dates.check_out]);

  // Fetch unavailable dates for this property
  useEffect(() => {
    if (!open || !stay.property_id) return;

    const fetchAvailability = async () => {
      const today = new Date();
      const endDate = addDays(today, 395); // 13 months ahead
      
      const { data } = await supabase
        .from('property_availability')
        .select('date, is_stop_sell, available_units')
        .eq('property_id', stay.property_id)
        .gte('date', format(today, 'yyyy-MM-dd'))
        .lte('date', format(endDate, 'yyyy-MM-dd'));

      if (data) {
        const blocked = data
          .filter(d => d.is_stop_sell || d.available_units === 0)
          .map(d => new Date(d.date));
        setUnavailableDates(blocked);
      }
    };

    fetchAvailability();
  }, [open, stay.property_id]);

  const handleConfirm = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Please select check-in and check-out dates');
      return;
    }

    const checkIn = format(dateRange.from, 'yyyy-MM-dd');
    const checkOut = format(dateRange.to, 'yyyy-MM-dd');
    const nights = differenceInDays(dateRange.to, dateRange.from);

    if (nights < 1) {
      toast.error('Please select at least 1 night');
      return;
    }

    setIsValidating(true);

    try {
      // Validate new dates have availability
      const { data, error } = await supabase.functions.invoke('validate-itinerary-availability', {
        body: {
          action: 'validate_single',
          stay: {
            property_id: stay.property_id,
            external_system: stay.external_system,
            dates: { check_in: checkIn, check_out: checkOut },
            rooms: stay.rooms,
            guests: stay.guests,
          }
        }
      });

      if (error || !data?.is_available) {
        toast.error(data?.message || 'These dates are not available');
        return;
      }

      // Calculate new price based on nightly rate
      const nightlyRate = stay.price_breakdown.total / stay.nights;
      const newTotal = Math.round(nightlyRate * nights);

      onConfirm(checkIn, checkOut, newTotal);
      onOpenChange(false);
      toast.success('Dates updated successfully');
    } catch (err) {
      console.error('Date validation error:', err);
      toast.error('Failed to validate dates. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const nights = dateRange?.from && dateRange?.to 
    ? differenceInDays(dateRange.to, dateRange.from) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Stay Dates</DialogTitle>
          <DialogDescription>
            {stay.property_name}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !dateRange && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, 'LLL dd, y')} –{' '}
                      {format(dateRange.to, 'LLL dd, y')}
                    </>
                  ) : (
                    format(dateRange.from, 'LLL dd, y')
                  )
                ) : (
                  <span>Pick dates</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={1}
                disabled={(date) => 
                  date < new Date() || 
                  unavailableDates.some(d => 
                    d.toDateString() === date.toDateString()
                  )
                }
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          {nights > 0 && (
            <p className="text-sm text-muted-foreground text-center">
              {nights} {nights === 1 ? 'night' : 'nights'} selected
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isValidating || nights < 1}>
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              'Update Dates'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
