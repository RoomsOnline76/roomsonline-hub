import { useState } from "react";
import { ChevronUp, ChevronDown, Calendar, Bed, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { FormattedPrice } from "@/components/FormattedPrice";
import { cn } from "@/lib/utils";
import { useMobileBooking } from "@/contexts/MobileBookingContext";
import { motion, AnimatePresence } from "framer-motion";

interface FloatingBookingSummaryProps {
  onBook?: () => void;
  ctaLabel?: string;
  ctaDisabled?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function FloatingBookingSummary({
  onBook,
  ctaLabel = "Confirm Booking",
  ctaDisabled = false,
  isLoading = false,
  className,
}: FloatingBookingSummaryProps) {
  const { state, nights, totalGuests } = useMobileBooking();
  const [isExpanded, setIsExpanded] = useState(false);

  const checkInDate = state.checkIn ? parseISO(state.checkIn) : null;
  const checkOutDate = state.checkOut ? parseISO(state.checkOut) : null;

  // Don't show if no property selected
  if (!state.propertyId) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40",
        "pb-[env(safe-area-inset-bottom,0px)]",
        className
      )}
    >
      <motion.div
        layout
        className={cn(
          "bg-white/95 backdrop-blur-xl border-t border-border/50 shadow-2xl",
          "transition-shadow duration-300"
        )}
      >
        {/* Collapsed summary bar */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="text-left">
              <p className="text-xs text-muted-foreground">Total</p>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">
                  <FormattedPrice amount={state.totalCost} />
                </span>
                {nights > 0 && (
                  <span className="text-sm text-muted-foreground">
                    / {nights} night{nights !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick info badges */}
            {checkInDate && checkOutDate && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                <Calendar className="h-3 w-3" />
                {format(checkInDate, "MMM d")} – {format(checkOutDate, "MMM d")}
              </span>
            )}
            {state.rooms.length > 0 && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                <Bed className="h-3 w-3" />
                {state.rooms.length} room{state.rooms.length !== 1 ? "s" : ""}
              </span>
            )}
            <div className="flex items-center gap-1 text-muted-foreground">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
              <span className="text-xs">Details</span>
            </div>
          </div>
        </button>

        {/* Expanded details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-border/30"
            >
              <div className="px-4 py-3 space-y-3 max-h-[40vh] overflow-y-auto">
                {/* Property */}
                {state.propertyName && (
                  <div className="flex items-start justify-between text-sm">
                    <span className="text-muted-foreground">Property</span>
                    <span className="font-medium text-right">{state.propertyName}</span>
                  </div>
                )}

                {/* Dates */}
                {checkInDate && checkOutDate && (
                  <div className="flex items-start justify-between text-sm">
                    <span className="text-muted-foreground">Dates</span>
                    <span className="font-medium">
                      {format(checkInDate, "MMM d, yyyy")} – {format(checkOutDate, "MMM d, yyyy")}
                    </span>
                  </div>
                )}

                {/* Rooms breakdown */}
                {state.rooms.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-sm text-muted-foreground">Rooms</span>
                    {state.rooms.map((room, index) => (
                      <div
                        key={index}
                        className="flex items-start justify-between text-sm pl-3 border-l-2 border-primary/20"
                      >
                        <div>
                          <p className="font-medium">{room.roomTypeName || `Room ${index + 1}`}</p>
                          <p className="text-xs text-muted-foreground">
                            {room.numberOfAdults} adult{room.numberOfAdults !== 1 ? "s" : ""}
                            {room.numberOfChildren > 0 && `, ${room.numberOfChildren} child${room.numberOfChildren !== 1 ? "ren" : ""}`}
                            {room.numberOfInfants > 0 && `, ${room.numberOfInfants} infant${room.numberOfInfants !== 1 ? "s" : ""}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Rate type */}
                {state.rateTypeName && (
                  <div className="flex items-start justify-between text-sm">
                    <span className="text-muted-foreground">Rate</span>
                    <span className="font-medium">{state.rateTypeName}</span>
                  </div>
                )}

                {/* Guest info */}
                {state.guestDetails.name && (
                  <div className="flex items-start justify-between text-sm border-t border-border/30 pt-3">
                    <span className="text-muted-foreground">Guest</span>
                    <div className="text-right">
                      <p className="font-medium">{state.guestDetails.name}</p>
                      <p className="text-xs text-muted-foreground">{state.guestDetails.email}</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA button */}
        <div className="px-4 py-3 border-t border-border/30">
          <Button
            onClick={onBook}
            disabled={ctaDisabled || isLoading}
            className="w-full h-12 text-base font-medium rounded-xl"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              ctaLabel
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
