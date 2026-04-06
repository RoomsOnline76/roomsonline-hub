import { useState, useEffect } from 'react';
import { format, addDays, differenceInDays, eachDayOfInterval } from 'date-fns';
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
import { fetchLiveRates } from '@/lib/pmsLiveAvailability';

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
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);

  // Reset dates when stay changes
  useEffect(() => {
    setDateRange({
      from: new Date(stay.dates.check_in),
      to: new Date(stay.dates.check_out),
    });
  }, [stay.id, stay.dates.check_in, stay.dates.check_out]);

  // Fetch unavailable dates — use live ARI for PMS-backed properties, DB fallback for manual
  useEffect(() => {
    if (!open || !stay.property_id) return;

    const fetchAvailability = async () => {
      setIsLoadingAvailability(true);
      const today = new Date();
      const endDate = addDays(today, 395);
      const isPmsBacked = stay.external_system && stay.external_system !== 'manual' && stay.external_system !== 'roomsonline';

      if (isPmsBacked) {
        // Use live ARI — fetch in chunks (3 months at a time) for better coverage
        try {
          const allBlocked: Date[] = [];
          const chunkSize = 90;
          const chunks = Math.ceil(395 / chunkSize);

          for (let i = 0; i < chunks; i++) {
            const chunkStart = addDays(today, i * chunkSize);
            const chunkEnd = addDays(today, Math.min((i + 1) * chunkSize, 395));
            const ci = format(chunkStart, 'yyyy-MM-dd');
            const co = format(chunkEnd, 'yyyy-MM-dd');

            const liveData = await fetchLiveRates(stay.property_id, stay.external_system, ci, co);

            if (liveData.rooms.length > 0) {
              // Find the matching room type or use first available
              const matchingRoom = liveData.rooms.find(r => 
                stay.rooms.some(sr => sr.room_type_id === r.roomTypeId)
              ) || liveData.rooms[0];

              // Mark dates with 0 availability as blocked
              const daysInChunk = eachDayOfInterval({ start: chunkStart, end: addDays(chunkEnd, -1) });
              for (const day of daysInChunk) {
                const dateStr = format(day, 'yyyy-MM-dd');
                const avail = matchingRoom.availableByDate[dateStr];
                if (avail !== undefined && avail === 0) {
                  allBlocked.push(day);
                }
              }
            }
          }

          setUnavailableDates(allBlocked);
        } catch (err) {
          console.error('Failed to fetch live ARI for date editing:', err);
          setUnavailableDates([]);
        }
      } else {
        // Fallback: use property_availability table for manual/roomsonline properties
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
      }

      setIsLoadingAvailability(false);
    };

    fetchAvailability();
  }, [open, stay.property_id, stay.external_system, stay.rooms]);

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

      if (error) {
        throw error;
      }

      const isAvailable = data?.is_available ?? data?.all_available ?? data?.results?.[0]?.is_available;

      if (!isAvailable) {
        toast.error(data?.message || data?.results?.[0]?.error || 'These dates are not available');
        return;
      }

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
              {isLoadingAvailability ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading availability…</span>
                </div>
              ) : (
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
              )}
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
