import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, MapPin, Users, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { DateRange } from "react-day-picker";

export const SearchForm = () => {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [guests, setGuests] = useState({ adults: 2, children: 0 });
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Track if we're in the middle of selecting (have start but not end)
  const [isSelecting, setIsSelecting] = useState(false);

  // Handle date range selection
  const handleDateSelect = (range: DateRange | undefined) => {
    setDateRange(range);
    
    // If we have both from and to dates, close the calendar
    if (range?.from && range?.to) {
      setIsSelecting(false);
      // Small delay to let user see the selection before closing
      setTimeout(() => {
        setShowDatePicker(false);
      }, 150);
    } else if (range?.from && !range?.to) {
      // User clicked first date, now selecting end date
      setIsSelecting(true);
    }
  };

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
  };

  const formatDateRange = () => {
    if (!dateRange?.from) return "Select dates";
    if (!dateRange?.to) return format(dateRange.from, "d MMM yyyy") + " — ...";
    return `${format(dateRange.from, "d MMM yyyy")} — ${format(dateRange.to, "d MMM yyyy")}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <form onSubmit={handleSearch} className="bg-card/95 backdrop-blur-md rounded-2xl shadow-[var(--shadow-strong)] border border-border/50 p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Destination */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Destination
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Where to?"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="pl-10 h-12 text-base bg-background border-border focus:border-primary"
              />
            </div>
          </div>

          {/* Date Range Picker */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Dates
            </label>
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker} modal={false}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-12 justify-start text-left font-normal bg-background border-border hover:bg-secondary/50 group",
                    !dateRange?.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm flex-1">
                    {formatDateRange()}
                  </span>
                  {dateRange?.from && (
                    <X 
                      className="h-4 w-4 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity" 
                      onClick={clearDates}
                    />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start" sideOffset={8}>
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={handleDateSelect}
                  numberOfMonths={2}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className="pointer-events-auto p-3"
                  modifiersClassNames={{
                    range_start: "bg-primary text-primary-foreground rounded-l-md rounded-r-none",
                    range_end: "bg-primary text-primary-foreground rounded-r-md rounded-l-none",
                    range_middle: "bg-primary/20 text-foreground rounded-none",
                  }}
                  classNames={{
                    months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                    month: "space-y-4",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-sm font-medium",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                    row: "flex w-full mt-2",
                    cell: cn(
                      "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                      "[&:has([aria-selected])]:bg-primary/20",
                      "[&:has([aria-selected].day-range-end)]:rounded-r-md",
                      "[&:has([aria-selected].day-range-start)]:rounded-l-md"
                    ),
                    day: cn(
                      "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-primary/30 rounded-md transition-colors cursor-pointer"
                    ),
                    day_range_start: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-l-md rounded-r-none",
                    day_range_end: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-r-md rounded-l-none",
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground font-semibold",
                    day_outside: "text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
                    day_range_middle: "aria-selected:bg-primary/20 aria-selected:text-foreground rounded-none",
                    day_hidden: "invisible",
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Guests */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Guests
            </label>
            <Popover open={showGuestPicker} onOpenChange={setShowGuestPicker} modal={false}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-12 justify-start text-left font-normal bg-background border-border hover:bg-secondary/50"
                >
                  <Users className="mr-2 h-5 w-5 text-muted-foreground" />
                  <span className="text-base">
                    {guests.adults + guests.children} Guest{guests.adults + guests.children !== 1 ? 's' : ''}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 sm:w-80 p-4 z-50" align="start" sideOffset={8}>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Adults</p>
                      <p className="text-sm text-muted-foreground">Ages 13+</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-full touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, adults: Math.max(1, g.adults - 1) }))}
                        disabled={guests.adults <= 1}
                      >
                        −
                      </Button>
                      <span className="w-8 text-center font-medium">{guests.adults}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-full touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, adults: Math.min(10, g.adults + 1) }))}
                        disabled={guests.adults >= 10}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Children</p>
                      <p className="text-sm text-muted-foreground">Ages 0-12</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-full touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, children: Math.max(0, g.children - 1) }))}
                        disabled={guests.children <= 0}
                      >
                        −
                      </Button>
                      <span className="w-8 text-center font-medium">{guests.children}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-full touch-manipulation"
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
        <div className="mt-5 relative z-10">
          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold bg-[var(--hero-gradient)] hover:opacity-90 transition-opacity touch-manipulation rounded-xl"
            disabled={!destination || !dateRange?.from || !dateRange?.to}
          >
            <Search className="mr-2 h-5 w-5" />
            Search Properties
          </Button>
        </div>
      </form>
    </div>
  );
};
