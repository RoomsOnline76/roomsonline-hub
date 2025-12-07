import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, isAfter, isBefore, isSameDay } from "date-fns";
import { CalendarIcon, MapPin, Users, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { DayPicker, DateRange } from "react-day-picker";

export const SearchForm = () => {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [guests, setGuests] = useState({ adults: 2, children: 0 });
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Track hover date for preview "worm" effect
  const [hoverDate, setHoverDate] = useState<Date | undefined>();

  // Handle date range selection
  const handleDayClick = (day: Date) => {
    if (!dateRange?.from) {
      setDateRange({ from: day, to: undefined });
      setHoverDate(undefined);
    } else if (dateRange.from && !dateRange.to) {
      if (isBefore(day, dateRange.from)) {
        setDateRange({ from: day, to: undefined });
      } else {
        setDateRange({ from: dateRange.from, to: day });
        setHoverDate(undefined);
        setTimeout(() => {
          setShowDatePicker(false);
        }, 150);
      }
    } else {
      setDateRange({ from: day, to: undefined });
      setHoverDate(undefined);
    }
  };

  const handleDayMouseEnter = (day: Date) => {
    if (dateRange?.from && !dateRange?.to) {
      setHoverDate(day);
    }
  };

  const handleDayMouseLeave = () => {};

  const getDisplayRange = (): DateRange | undefined => {
    if (dateRange?.from && dateRange?.to) {
      return dateRange;
    }
    if (dateRange?.from && hoverDate) {
      if (isAfter(hoverDate, dateRange.from) || isSameDay(hoverDate, dateRange.from)) {
        return { from: dateRange.from, to: hoverDate };
      }
      return { from: hoverDate, to: dateRange.from };
    }
    if (dateRange?.from) {
      return { from: dateRange.from, to: dateRange.from };
    }
    return undefined;
  };

  const displayRange = getDisplayRange();

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!destination || !dateRange?.from || !dateRange?.to) {
      return;
    }
    
    const searchParams = new URLSearchParams({
      destination,
      checkIn: format(dateRange.from, "yyyy-MM-dd"),
      checkOut: format(dateRange.to, "yyyy-MM-dd"),
      adults: guests.adults.toString(),
      children: guests.children.toString(),
    });
    
    navigate(`/search?${searchParams.toString()}`);
  };

  const clearDates = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDateRange(undefined);
    setHoverDate(undefined);
  };

  const formatDateRange = () => {
    if (!dateRange?.from) return "Select dates";
    if (!dateRange?.to) return format(dateRange.from, "d MMM") + " — ...";
    return `${format(dateRange.from, "d MMM")} — ${format(dateRange.to, "d MMM")}`;
  };

  const isRangeStart = (day: Date): boolean => {
    return displayRange?.from ? isSameDay(day, displayRange.from) : false;
  };

  const isRangeEnd = (day: Date): boolean => {
    return displayRange?.to ? isSameDay(day, displayRange.to) : false;
  };

  const isRangeMiddle = (day: Date): boolean => {
    if (!displayRange?.from || !displayRange?.to) return false;
    return isAfter(day, displayRange.from) && isBefore(day, displayRange.to);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <form onSubmit={handleSearch} className="bg-card/95 backdrop-blur-md rounded-xl sm:rounded-2xl shadow-lg border border-border/50 p-3 sm:p-5">
        <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-3">
          {/* Destination */}
          <div>
            <label className="block text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Where to
            </label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="City or region"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="pl-8 h-10 sm:h-11 text-sm bg-background border-border focus:border-primary"
              />
            </div>
          </div>

          {/* Date Range Picker */}
          <div>
            <label className="block text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Dates
            </label>
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker} modal={true}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-10 sm:h-11 justify-start text-left font-normal bg-background border-border hover:bg-secondary/50 group",
                    !dateRange?.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm flex-1">
                    {formatDateRange()}
                  </span>
                  {dateRange?.from && (
                    <X 
                      className="h-4 w-4 text-muted-foreground hover:text-foreground" 
                      onClick={clearDates}
                    />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-auto p-0 z-50 bg-background border border-border shadow-xl" 
                align="center" 
                sideOffset={8}
              >
                <DayPicker
                  mode="range"
                  selected={displayRange}
                  numberOfMonths={1}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  onDayClick={handleDayClick}
                  onDayMouseEnter={handleDayMouseEnter}
                  onDayMouseLeave={handleDayMouseLeave}
                  modifiers={{
                    range_start: (day) => isRangeStart(day),
                    range_end: (day) => isRangeEnd(day),
                    range_middle: (day) => isRangeMiddle(day),
                  }}
                  modifiersClassNames={{
                    range_start: "bg-primary text-primary-foreground rounded-l-md rounded-r-none",
                    range_end: "bg-primary text-primary-foreground rounded-r-md rounded-l-none",
                    range_middle: "bg-primary/30 text-foreground rounded-none",
                  }}
                  className="p-3 pointer-events-auto"
                  classNames={{
                    months: "flex flex-col",
                    month: "space-y-3",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-sm font-medium",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse",
                    head_row: "flex",
                    head_cell: "text-muted-foreground rounded-md w-8 font-normal text-[11px]",
                    row: "flex w-full mt-1",
                    cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                    day: cn(
                      "h-8 w-8 p-0 font-normal hover:bg-primary/20 rounded-md transition-colors cursor-pointer inline-flex items-center justify-center text-sm"
                    ),
                    day_today: "bg-accent text-accent-foreground font-semibold",
                    day_outside: "text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed hover:bg-transparent",
                    day_hidden: "invisible",
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Guests */}
          <div>
            <label className="block text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Guests
            </label>
            <Popover open={showGuestPicker} onOpenChange={setShowGuestPicker} modal={true}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-10 sm:h-11 justify-start text-left font-normal bg-background border-border hover:bg-secondary/50"
                >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {guests.adults + guests.children} Guest{guests.adults + guests.children !== 1 ? 's' : ''}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 z-50 bg-background border border-border shadow-xl" align="center" sideOffset={8}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Adults</p>
                      <p className="text-xs text-muted-foreground">Ages 13+</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, adults: Math.max(1, g.adults - 1) }))}
                        disabled={guests.adults <= 1}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{guests.adults}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, adults: Math.min(10, g.adults + 1) }))}
                        disabled={guests.adults >= 10}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Children</p>
                      <p className="text-xs text-muted-foreground">Ages 0-12</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, children: Math.max(0, g.children - 1) }))}
                        disabled={guests.children <= 0}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{guests.children}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-full touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, children: Math.min(10, g.children + 1) }))}
                        disabled={guests.children >= 10}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Search Button */}
        <div className="mt-3 sm:mt-4">
          <Button
            type="submit"
            className="w-full h-10 sm:h-11 text-sm font-semibold bg-[var(--hero-gradient)] hover:opacity-90 transition-opacity touch-manipulation rounded-lg"
            disabled={!destination || !dateRange?.from || !dateRange?.to}
          >
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </div>
      </form>
    </div>
  );
};
