import { useState, useEffect } from 'react';
import { format, addDays, differenceInDays, eachDayOfInterval } from 'date-fns';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { StayRangePicker } from '@/components/ui/stay-range-picker';
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

const LIVE_ARI_HORIZON_DAYS = 395;
const LIVE_ARI_CHUNK_DAYS = 90;
const LIVE_ARI_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Availability request timed out')), timeoutMs);
      return () => window.clearTimeout(timer);
    }) as Promise<T>,
  ]);
}

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

    let cancelled = false;

    const fetchAvailability = async () => {
      setIsLoadingAvailability(true);
      const today = new Date();
      const endDate = addDays(today, LIVE_ARI_HORIZON_DAYS);
      const isPmsBacked = stay.external_system && stay.external_system !== 'manual' && stay.external_system !== 'roomsonline';

      try {
        if (isPmsBacked) {
          const chunks = Math.ceil(LIVE_ARI_HORIZON_DAYS / LIVE_ARI_CHUNK_DAYS);
          const requests = Array.from({ length: chunks }, (_, i) => {
            const chunkStart = addDays(today, i * LIVE_ARI_CHUNK_DAYS);
            const chunkEnd = addDays(today, Math.min((i + 1) * LIVE_ARI_CHUNK_DAYS, LIVE_ARI_HORIZON_DAYS));
            const ci = format(chunkStart, 'yyyy-MM-dd');
            const co = format(chunkEnd, 'yyyy-MM-dd');

            return withTimeout(
              fetchLiveRates(stay.property_id, stay.external_system, ci, co),
              LIVE_ARI_TIMEOUT_MS,
            ).then((liveData) => ({ chunkStart, chunkEnd, liveData }));
          });

          const settled = await Promise.allSettled(requests);
          const blockedDates = new Set<string>();

          for (const result of settled) {
            if (result.status !== 'fulfilled') continue;

            const { chunkStart, chunkEnd, liveData } = result.value;
            if (!liveData.rooms.length) continue;

            const matchingRoom = liveData.rooms.find((room) =>
              stay.rooms.some((selectedRoom) => String(selectedRoom.room_type_id) === String(room.roomTypeId))
            ) || liveData.rooms[0];

            const daysInChunk = eachDayOfInterval({ start: chunkStart, end: addDays(chunkEnd, -1) });
            for (const day of daysInChunk) {
              const dateStr = format(day, 'yyyy-MM-dd');
              const avail = matchingRoom.availableByDate[dateStr];
              if (avail !== undefined && avail <= 0) {
                blockedDates.add(dateStr);
              }
            }
          }

          if (!cancelled) {
            setUnavailableDates(Array.from(blockedDates, (date) => new Date(date)));
          }
        } else {
          const { data } = await supabase
            .from('property_availability')
            .select('date, is_stop_sell, available_units')
            .eq('property_id', stay.property_id)
            .gte('date', format(today, 'yyyy-MM-dd'))
            .lte('date', format(endDate, 'yyyy-MM-dd'));

          if (!cancelled) {
            const blocked = (data || [])
              .filter((day) => day.is_stop_sell || day.available_units === 0)
              .map((day) => new Date(day.date));
            setUnavailableDates(blocked);
          }
        }
      } catch (err) {
        console.error('Failed to fetch availability for date editing:', err);
        if (!cancelled) {
          setUnavailableDates([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAvailability(false);
        }
      }
    };

    fetchAvailability();

    return () => {
      cancelled = true;
    };
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
          <StayRangePicker
            numberOfMonths={1}
            from={dateRange?.from}
            to={dateRange?.to}
            onChange={({ fromDate, toDate }) => setDateRange(fromDate ? { from: fromDate, to: toDate } : undefined)}
            placeholder="Pick dates"
            disabledDays={unavailableDates}
            header={
              isLoadingAvailability ? (
                <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading blocked dates…</span>
                </div>
              ) : null
            }
          />

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
