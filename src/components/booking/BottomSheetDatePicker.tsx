import { useState, useEffect, useRef } from "react";
import { format, addDays, addMonths, isBefore, isAfter, isSameDay, startOfDay, eachDayOfInterval } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";

interface BottomSheetDatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkIn: Date | null;
  checkOut: Date | null;
  onDatesChange: (checkIn: Date, checkOut: Date) => void;
  minDate?: Date;
  availabilityMap?: Map<string, { available: boolean; rate?: number }>;
  minNights?: number;  // minimum nights for stay
  maxNights?: number;  // maximum nights for stay (undefined = unlimited)
}

// Format rate for display (compact format for calendar cells)
const formatRate = (rate: number): string => {
  if (rate >= 1000) {
    const k = rate / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return rate.toFixed(0);
};

export function BottomSheetDatePicker({
  open,
  onOpenChange,
  checkIn,
  checkOut,
  onDatesChange,
  minDate = new Date(),
  availabilityMap,
  minNights = 1,
  maxNights,
}: BottomSheetDatePickerProps) {
  const isMobile = useIsMobile();
  const [tempCheckIn, setTempCheckIn] = useState<Date | null>(checkIn);
  const [tempCheckOut, setTempCheckOut] = useState<Date | null>(checkOut);
  // Smart month initialization - start on next month if we're past the 25th
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (checkIn) return checkIn;
    const now = new Date();
    if (now.getDate() > 25) {
      return new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    return now;
  });
  const [selectingCheckOut, setSelectingCheckOut] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset temp dates when drawer opens
  useEffect(() => {
    if (open) {
      setTempCheckIn(checkIn);
      setTempCheckOut(checkOut);
      setSelectingCheckOut(false);
      if (checkIn) {
        setCurrentMonth(checkIn);
      } else {
        // No checkIn selected - start from a sensible month
        const now = new Date();
        if (now.getDate() > 25) {
          setCurrentMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1));
        } else {
          setCurrentMonth(now);
        }
      }
    }
  }, [open, checkIn, checkOut]);

  // Generate 21 days for horizontal scroll (expanded for easier navigation)
  const today = startOfDay(new Date());
  const quickDates = eachDayOfInterval({
    start: today,
    end: addDays(today, 20),
  });

  // Get days for current month
  const getDaysInMonth = (month: Date) => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const startPadding = firstDay.getDay();
    
    const days: (Date | null)[] = [];
    
    // Add padding for days before first of month
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    // Add days of month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, monthIndex, d));
    }
    
    return days;
  };

  const handleDateClick = (date: Date) => {
    if (isBefore(date, startOfDay(minDate))) return;
    
    // Prevent selecting unavailable/blocked dates
    const status = getDateStatus(date);
    if (status && !status.available) return;

    if (!selectingCheckOut || !tempCheckIn) {
      // Selecting check-in date
      setTempCheckIn(date);
      setTempCheckOut(null);
      setSelectingCheckOut(true);
    } else {
      // Selecting check-out date
      if (isBefore(date, tempCheckIn)) {
        // If selected date is before check-in, start over with this as check-in
        setTempCheckIn(date);
        setTempCheckOut(null);
      } else if (isSameDay(date, tempCheckIn)) {
        // If same day, set checkout to minNights ahead
        setTempCheckOut(addDays(date, minNights));
        setSelectingCheckOut(false);
      } else {
        // Enforce min/max nights
        const nightsSelected = Math.ceil((date.getTime() - tempCheckIn.getTime()) / (1000 * 60 * 60 * 24));
        if (nightsSelected < minNights) return; // Too few nights
        if (maxNights && nightsSelected > maxNights) return; // Too many nights
        setTempCheckOut(date);
        setSelectingCheckOut(false);
      }
    }
  };

  // Check if a date is outside the valid checkout range when selecting checkout
  const isOutsideStayRange = (date: Date) => {
    if (!selectingCheckOut || !tempCheckIn) return false;
    if (isBefore(date, tempCheckIn) || isSameDay(date, tempCheckIn)) return false;
    const nightsFromCheckIn = Math.ceil((date.getTime() - tempCheckIn.getTime()) / (1000 * 60 * 60 * 24));
    if (nightsFromCheckIn < minNights) return true;
    if (maxNights && nightsFromCheckIn > maxNights) return true;
    return false;
  };

  const isInRange = (date: Date) => {
    if (!tempCheckIn || !tempCheckOut) return false;
    return isAfter(date, tempCheckIn) && isBefore(date, tempCheckOut);
  };

  const isCheckIn = (date: Date) => tempCheckIn && isSameDay(date, tempCheckIn);
  const isCheckOut = (date: Date) => tempCheckOut && isSameDay(date, tempCheckOut);
  const isDisabled = (date: Date) => isBefore(date, startOfDay(minDate));

  const getDateStatus = (date: Date) => {
    if (!availabilityMap) return null;
    const key = format(date, "yyyy-MM-dd");
    return availabilityMap.get(key);
  };

  const handleConfirm = () => {
    if (tempCheckIn && tempCheckOut) {
      onDatesChange(tempCheckIn, tempCheckOut);
      onOpenChange(false);
    }
  };

  const prevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const jumpMonths = (offset: number) => {
    setCurrentMonth((prev) => addMonths(prev, offset));
  };

  const nights = tempCheckIn && tempCheckOut
    ? Math.ceil((tempCheckOut.getTime() - tempCheckIn.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] mx-auto sm:max-w-lg md:max-w-xl">
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="font-sans text-lg font-medium tracking-tight">
              Select Dates
            </DrawerTitle>
            <p className="text-sm text-muted-foreground">
              {selectingCheckOut ? "Select check-out date" : "Select check-in date"}
              {selectingCheckOut && (minNights > 1 || maxNights) && (
                <span className="ml-1 text-xs">
                  ({minNights > 1 ? `min ${minNights} nights` : ''}{minNights > 1 && maxNights ? ' · ' : ''}{maxNights ? `max ${maxNights} nights` : ''})
                </span>
              )}
            </p>
          </DrawerHeader>

          {/* Quick date scroll */}
          <div 
            ref={scrollRef}
            className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b"
          >
            {quickDates.map((date) => {
              const isSelected = isCheckIn(date) || isCheckOut(date);
              const status = getDateStatus(date);
              const disabled = isDisabled(date);
              const outsideRange = isOutsideStayRange(date);
              
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => !disabled && !outsideRange && handleDateClick(date)}
                  disabled={disabled || outsideRange}
                  className={cn(
                    "flex flex-col items-center min-w-[3.5rem] py-2 px-3 rounded-xl transition-all duration-200",
                    "border border-transparent",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : isInRange(date)
                      ? "bg-primary/10 border-primary/20"
                      : "hover:bg-muted hover:border-border/60",
                    disabled && "opacity-30 cursor-not-allowed"
                  )}
                >
                  <span className="text-[10px] uppercase tracking-wider opacity-70">
                    {format(date, "EEE")}
                  </span>
                  <span className="text-lg font-medium">
                    {format(date, "d")}
                  </span>
                  {status && !disabled && (
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full mt-1",
                      status.available ? "bg-green-500" : "bg-red-400"
                    )} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Calendar grid */}
          <div className="px-4 py-3 overflow-y-auto max-h-[50vh]">
          {/* Month navigation with jump buttons */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => jumpMonths(-3)}
                className="h-8 w-8 rounded-full hidden sm:flex"
                title="Back 3 months"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={prevMonth}
                className="h-10 w-10 rounded-full"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </div>
            <span className="font-medium tracking-tight">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={nextMonth}
                className="h-10 w-10 rounded-full"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => jumpMonths(3)}
                className="h-8 w-8 rounded-full hidden sm:flex"
                title="Forward 3 months"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <div
                key={day}
                className="text-center text-xs text-muted-foreground font-medium py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {getDaysInMonth(currentMonth).map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className={cn("h-11", !isMobile && "sm:h-14")} />;
              }

              const status = getDateStatus(date);
              const disabled = isDisabled(date);
              const unavailable = status && !status.available;
              const outsideStayRange = isOutsideStayRange(date);
              const selected = isCheckIn(date) || isCheckOut(date);
              const inRange = isInRange(date);

              return (
                <button
                  key={date.toISOString()}
                  onClick={() => !disabled && !unavailable && !outsideStayRange && handleDateClick(date)}
                  disabled={disabled || !!unavailable || outsideStayRange}
                  className={cn(
                    "h-11 rounded-xl text-sm font-medium transition-all duration-200",
                    "flex flex-col items-center justify-center gap-0.5",
                    !isMobile && "sm:h-14",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : inRange
                      ? "bg-primary/10"
                      : unavailable
                      ? "bg-muted/60 text-muted-foreground/50 line-through cursor-not-allowed"
                      : outsideStayRange
                      ? "bg-muted/30 text-muted-foreground/30 cursor-not-allowed"
                      : "hover:bg-muted",
                    disabled && "bg-muted/40 text-muted-foreground/30 cursor-not-allowed",
                    isCheckIn(date) && "rounded-r-none",
                    isCheckOut(date) && "rounded-l-none",
                    inRange && "rounded-none"
                  )}
                >
                  <span>{format(date, "d")}</span>
                  {/* Show rate on larger screens for available dates only */}
                  {!isMobile && status?.rate && status.available && !selected ? (
                    <span className="text-[9px] text-muted-foreground leading-none">
                      {formatRate(status.rate)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          
          {/* Availability Legend */}
          <div className="flex justify-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-background border border-border" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-muted/60 flex items-center justify-center text-[8px] line-through">X</span>
              Unavailable
            </span>
          </div>
          </div>

          {/* Summary */}
          {tempCheckIn && (
            <div className="px-4 py-3 border-t bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>
                    {format(tempCheckIn, "MMM d")}
                    {tempCheckOut && ` – ${format(tempCheckOut, "MMM d")}`}
                  </span>
                </div>
                {nights > 0 && (
                  <span className="text-muted-foreground">
                    {nights} night{nights !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          )}

          <DrawerFooter className="pt-2">
            <Button
              onClick={handleConfirm}
              disabled={!tempCheckIn || !tempCheckOut}
              className="w-full h-12 text-base font-medium"
            >
              Confirm Dates
            </Button>
            <DrawerClose asChild>
              <Button variant="ghost" className="w-full">
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
