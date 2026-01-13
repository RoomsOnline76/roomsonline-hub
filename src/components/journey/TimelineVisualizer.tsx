import { format, differenceInDays, addDays } from 'date-fns';
import { Plane, MapPin } from 'lucide-react';
import { ItineraryStay } from '@/contexts/ItineraryContext';
import { cn } from '@/lib/utils';

interface TimelineVisualizerProps {
  stays: ItineraryStay[];
  className?: string;
  compact?: boolean;
}

export function TimelineVisualizer({ stays, className, compact = false }: TimelineVisualizerProps) {
  if (stays.length === 0) return null;

  // Sort stays by check-in date
  const sortedStays = [...stays].sort(
    (a, b) => new Date(a.dates.check_in).getTime() - new Date(b.dates.check_in).getTime()
  );

  const firstDate = new Date(sortedStays[0].dates.check_in);
  const lastCheckOut = new Date(sortedStays[sortedStays.length - 1].dates.check_out);
  const totalDays = differenceInDays(lastCheckOut, firstDate);

  // Calculate timeline points
  const timelinePoints = sortedStays.map((stay, index) => {
    const checkInDate = new Date(stay.dates.check_in);
    const checkOutDate = new Date(stay.dates.check_out);
    const startPosition = (differenceInDays(checkInDate, firstDate) / totalDays) * 100;
    const endPosition = (differenceInDays(checkOutDate, firstDate) / totalDays) * 100;
    const width = endPosition - startPosition;

    return {
      stay,
      index,
      startPosition,
      endPosition,
      width,
      checkInDate,
      checkOutDate
    };
  });

  // Compact view for smaller spaces
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 overflow-x-auto pb-2", className)}>
        {sortedStays.map((stay, index) => (
          <div key={stay.id} className="flex items-center">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg whitespace-nowrap">
              <MapPin className="h-3 w-3 text-primary" />
              <span className="text-sm font-medium">{stay.property_name}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(stay.dates.check_in), 'MMM d')}
              </span>
            </div>
            {index < sortedStays.length - 1 && (
              <div className="w-6 h-px bg-border mx-1" />
            )}
          </div>
        ))}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg whitespace-nowrap">
          <Plane className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {format(lastCheckOut, 'MMM d')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("py-8", className)}>
      {/* Date range header */}
      <div className="text-center mb-6">
        <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">
          Your Journey
        </p>
        <p className="text-lg font-medium">
          {format(firstDate, 'MMMM d')} – {format(lastCheckOut, 'MMMM d, yyyy')}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {totalDays} {totalDays === 1 ? 'night' : 'nights'} · {stays.length} {stays.length === 1 ? 'destination' : 'destinations'}
        </p>
      </div>

      {/* Timeline visualization */}
      <div className="relative px-4">
        {/* Base line */}
        <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-border -translate-y-1/2" />

        {/* Timeline container */}
        <div className="relative h-24">
          {timelinePoints.map(({ stay, index, startPosition, width, checkInDate, checkOutDate }) => (
            <div
              key={stay.id}
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: `${startPosition}%`, width: `${width}%` }}
            >
              {/* Stay segment */}
              <div className="relative h-12">
                {/* Connecting bar */}
                <div 
                  className={cn(
                    "absolute top-1/2 left-0 right-0 h-2 rounded-full -translate-y-1/2",
                    stay.availability_status === 'unavailable' 
                      ? "bg-destructive/50" 
                      : "bg-primary/20"
                  )}
                />

                {/* Start point */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2">
                  <div className={cn(
                    "h-4 w-4 rounded-full border-2 bg-card",
                    stay.availability_status === 'unavailable'
                      ? "border-destructive"
                      : "border-primary"
                  )}>
                    <div className={cn(
                      "absolute inset-1 rounded-full",
                      stay.availability_status === 'unavailable'
                        ? "bg-destructive"
                        : "bg-primary"
                    )} />
                  </div>
                </div>

                {/* Property name - above */}
                <div className="absolute -top-8 left-0 whitespace-nowrap">
                  <p className="text-xs font-medium truncate max-w-24">
                    {stay.property_name}
                  </p>
                </div>

                {/* Date - below */}
                <div className="absolute -bottom-6 left-0 whitespace-nowrap">
                  <p className="text-xs text-muted-foreground">
                    {format(checkInDate, 'MMM d')}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* End point (departure) */}
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: '100%' }}
          >
            <div className="relative -translate-x-1/2">
              <div className="h-4 w-4 rounded-full border-2 border-muted-foreground bg-card flex items-center justify-center">
                <Plane className="h-2 w-2 text-muted-foreground" />
              </div>
              
              {/* Departure label - above */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <p className="text-xs font-medium text-muted-foreground">Departure</p>
              </div>

              {/* Date - below */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <p className="text-xs text-muted-foreground">
                  {format(lastCheckOut, 'MMM d')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compact mobile view */}
      <div className="mt-8 md:hidden">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {sortedStays.map((stay, index) => (
            <div key={stay.id} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-full">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium truncate max-w-24">
                  {stay.property_name}
                </span>
              </div>
              {index < sortedStays.length - 1 && (
                <div className="text-muted-foreground">→</div>
              )}
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-full">
            <Plane className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">End</span>
          </div>
        </div>
      </div>
    </div>
  );
}
