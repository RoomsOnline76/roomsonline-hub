import { format, parseISO, differenceInDays } from "date-fns";
import { Calendar, Users, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface FluentBookingHeaderProps {
  propertyName: string;
  propertyImage?: string | null;
  location?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  totalGuests?: number;
  rooms?: number;
  className?: string;
}

/**
 * Mini property hero banner for checkout pages.
 * Shows property image, name, dates, and guest count.
 */
export function FluentBookingHeader({
  propertyName,
  propertyImage,
  location,
  checkIn,
  checkOut,
  totalGuests = 0,
  rooms = 1,
  className,
}: FluentBookingHeaderProps) {
  const nights = checkIn && checkOut
    ? differenceInDays(parseISO(checkOut), parseISO(checkIn))
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border border-border/50 bg-muted/20 p-4 flex gap-4",
        className
      )}
    >
      {propertyImage && (
        <div className="h-20 w-24 rounded-lg overflow-hidden shrink-0 bg-muted">
          <img
            src={propertyImage}
            alt={propertyName}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h2 className="font-serif text-base sm:text-lg font-medium tracking-tight truncate">
          {propertyName}
        </h2>
        {location && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{location}</span>
          </div>
        )}
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          {checkIn && checkOut && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>
                {format(parseISO(checkIn), "MMM d")} – {format(parseISO(checkOut), "MMM d")}
              </span>
              {nights > 0 && (
                <span className="text-foreground font-medium ml-1">
                  ({nights} night{nights !== 1 ? "s" : ""})
                </span>
              )}
            </div>
          )}
          {totalGuests > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>{totalGuests} guest{totalGuests !== 1 ? "s" : ""}</span>
            </div>
          )}
          {rooms > 1 && (
            <span>{rooms} rooms</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
