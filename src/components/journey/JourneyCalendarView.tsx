import { useMemo } from 'react';
import { format, eachDayOfInterval, differenceInDays, parseISO, addDays } from 'date-fns';
import { X, Moon, MapPin } from 'lucide-react';
import { useItinerary, type ItineraryStay } from '@/contexts/ItineraryContext';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const STAY_COLORS = [
  'bg-primary/80 border-primary',
  'bg-accent/80 border-accent',
  'bg-secondary/80 border-secondary',
  'bg-chart-1/80 border-chart-1',
  'bg-chart-2/80 border-chart-2',
  'bg-chart-3/80 border-chart-3',
];

const STAY_TEXT_COLORS = [
  'text-primary-foreground',
  'text-accent-foreground',
  'text-secondary-foreground',
  'text-primary-foreground',
  'text-primary-foreground',
  'text-primary-foreground',
];

interface JourneyCalendarViewProps {
  compact?: boolean;
}

export function JourneyCalendarView({ compact = false }: JourneyCalendarViewProps) {
  const { stays, totalPrice, totalNights, removeStay } = useItinerary();

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const { days, dateRange, sortedStays } = useMemo(() => {
    if (stays.length === 0) return { days: [] as Date[], dateRange: null as { start: Date; end: Date } | null, sortedStays: [] as ItineraryStay[] };

    const sorted = [...stays].sort((a, b) =>
      new Date(a.dates.check_in).getTime() - new Date(b.dates.check_in).getTime()
    );

    const earliest = parseISO(sorted[0].dates.check_in);
    const latest = sorted.reduce((max, s) => {
      const co = parseISO(s.dates.check_out);
      return co > max ? co : max;
    }, parseISO(sorted[0].dates.check_out));

    const allDays = eachDayOfInterval({ start: earliest, end: addDays(latest, -1) });

    return {
      days: allDays,
      dateRange: { start: earliest, end: latest },
      sortedStays: sorted,
    };
  }, [stays]);

  // Find gaps between stays
  const gaps = useMemo(() => {
    const result: { startDay: number; days: number }[] = [];
    for (let i = 0; i < sortedStays.length - 1; i++) {
      const currentEnd = parseISO(sortedStays[i].dates.check_out);
      const nextStart = parseISO(sortedStays[i + 1].dates.check_in);
      const gapDays = differenceInDays(nextStart, currentEnd);
      if (gapDays > 0 && dateRange) {
        result.push({
          startDay: differenceInDays(currentEnd, dateRange.start),
          days: gapDays,
        });
      }
    }
    return result;
  }, [sortedStays, dateRange]);

  if (stays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MapPin className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No stays added yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Browse properties to start building your journey</p>
      </div>
    );
  }

  const DAY_WIDTH = compact ? 36 : 44;
  const totalWidth = days.length * DAY_WIDTH;

  const getStayPosition = (stay: ItineraryStay) => {
    if (!dateRange) return { left: 0, width: 0 };
    const startOffset = differenceInDays(parseISO(stay.dates.check_in), dateRange.start);
    const stayNights = differenceInDays(parseISO(stay.dates.check_out), parseISO(stay.dates.check_in));
    return {
      left: startOffset * DAY_WIDTH,
      width: stayNights * DAY_WIDTH,
    };
  };


  return (
    <div className="space-y-3">
      {/* Timeline */}
      <ScrollArea className="w-full">
        <div style={{ width: totalWidth, minWidth: '100%' }}>
          {/* Date headers */}
          <div className="flex border-b border-border pb-1 mb-2">
            {days.map((day, i) => {
              const isFirstOfMonth = day.getDate() === 1 || i === 0;
              return (
                <div
                  key={i}
                  className="flex-shrink-0 text-center"
                  style={{ width: DAY_WIDTH }}
                >
                  {isFirstOfMonth && (
                    <div className="text-[10px] font-medium text-muted-foreground leading-none mb-0.5">
                      {format(day, 'MMM')}
                    </div>
                  )}
                  <div className={cn(
                    "text-xs leading-none",
                    day.getDay() === 0 || day.getDay() === 6
                      ? "text-muted-foreground/60"
                      : "text-foreground/80"
                  )}>
                    {format(day, 'd')}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stay bars */}
          <div className="relative space-y-2">
            {sortedStays.map((stay, index) => {
              const pos = getStayPosition(stay);
              const colorIndex = index % STAY_COLORS.length;

              return (
                <div key={stay.id} className="relative" style={{ height: compact ? 40 : 52 }}>
                  <div
                    className={cn(
                      "absolute top-0 rounded-lg border-2 flex items-center gap-2 px-2 overflow-hidden cursor-default transition-shadow hover:shadow-md",
                      STAY_COLORS[colorIndex]
                    )}
                    style={{
                      left: pos.left,
                      width: Math.max(pos.width, DAY_WIDTH * 2),
                      height: '100%',
                    }}
                  >
                    {/* Property image */}
                    {!compact && stay.property_image && (
                      <div className="h-8 w-8 rounded-md overflow-hidden flex-shrink-0 bg-background/20">
                        <img
                          src={stay.property_image}
                          alt={stay.property_name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    {/* Info */}
                    <div className={cn("flex-1 min-w-0", STAY_TEXT_COLORS[colorIndex])}>
                      <p className="text-xs font-semibold truncate leading-tight">
                        {stay.property_name}
                      </p>
                      <p className="text-[10px] opacity-80 leading-tight flex items-center gap-1">
                        <Moon className="h-2.5 w-2.5" />
                        {stay.nights} night{stay.nights !== 1 ? 's' : ''}
                        {stay.rooms.length > 0 && ` · ${stay.rooms[0].room_type_name}`}
                      </p>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeStay(stay.id);
                      }}
                      className="flex-shrink-0 p-0.5 rounded-full hover:bg-background/30 transition-colors"
                    >
                      <X className="h-3 w-3 opacity-70" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Gap indicators */}
            {gaps.map((gap, i) => (
              <div
                key={`gap-${i}`}
                className="absolute top-0 h-full flex items-center justify-center pointer-events-none"
                style={{
                  left: gap.startDay * DAY_WIDTH,
                  width: gap.days * DAY_WIDTH,
                }}
              >
                <div className="bg-destructive/10 border border-dashed border-destructive/30 rounded-md px-2 py-1">
                  <span className="text-[10px] text-destructive font-medium">
                    {gap.days} day gap
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Summary */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="text-xs text-muted-foreground">
          {sortedStays.length} {sortedStays.length === 1 ? 'stay' : 'stays'} · {totalNights} nights
        </div>
        <div className="text-sm font-semibold">{formatCurrency(totalPrice)}</div>
      </div>
    </div>
  );
}
