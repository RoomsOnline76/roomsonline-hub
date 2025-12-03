import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, MapPin, Users, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export const SearchForm = () => {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState<Date>();
  const [checkOut, setCheckOut] = useState<Date>();
  const [guests, setGuests] = useState({ adults: 2, children: 0 });
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);

  const handleSearch = () => {
    if (!destination || !checkIn || !checkOut) {
      return;
    }
    
    const searchParams = new URLSearchParams({
      destination,
      checkIn: format(checkIn, "yyyy-MM-dd"),
      checkOut: format(checkOut, "yyyy-MM-dd"),
      adults: guests.adults.toString(),
      children: guests.children.toString(),
    });
    
    navigate(`/search?${searchParams.toString()}`);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-card/95 backdrop-blur-md rounded-2xl shadow-[var(--shadow-strong)] border border-border/50 p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Destination */}
          <div className="sm:col-span-2 lg:col-span-1">
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

          {/* Check-in */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Check-in
            </label>
            <Popover open={showCheckIn} onOpenChange={setShowCheckIn}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-12 justify-start text-left font-normal bg-background border-border hover:bg-secondary/50",
                    !checkIn && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate text-base">
                    {checkIn ? format(checkIn, "MMM d, yyyy") : "Select date"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start">
                <Calendar
                  mode="single"
                  selected={checkIn}
                  onSelect={(date) => {
                    setCheckIn(date);
                    setShowCheckIn(false);
                  }}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Check-out */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Check-out
            </label>
            <Popover open={showCheckOut} onOpenChange={setShowCheckOut}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-12 justify-start text-left font-normal bg-background border-border hover:bg-secondary/50",
                    !checkOut && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate text-base">
                    {checkOut ? format(checkOut, "MMM d, yyyy") : "Select date"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start">
                <Calendar
                  mode="single"
                  selected={checkOut}
                  onSelect={(date) => {
                    setCheckOut(date);
                    setShowCheckOut(false);
                  }}
                  disabled={(date) => date <= (checkIn || new Date())}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Guests */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Guests
            </label>
            <Popover open={showGuestPicker} onOpenChange={setShowGuestPicker}>
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
              <PopoverContent className="w-72 sm:w-80 p-4 z-50" align="start">
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
        <div className="mt-5">
          <Button
            onClick={handleSearch}
            className="w-full h-12 text-base font-semibold bg-[var(--hero-gradient)] hover:opacity-90 transition-opacity touch-manipulation rounded-xl"
            disabled={!destination || !checkIn || !checkOut}
          >
            <Search className="mr-2 h-5 w-5" />
            Search Properties
          </Button>
        </div>
      </div>
    </div>
  );
};
