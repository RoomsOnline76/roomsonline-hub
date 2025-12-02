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
    <div className="w-full max-w-5xl mx-auto">
      <div className="bg-card rounded-xl sm:rounded-2xl shadow-[var(--shadow-strong)] p-4 sm:p-6 md:p-8">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Destination - Full width on mobile */}
          <div className="relative col-span-2 lg:col-span-1">
            <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2">
              Destination
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Where are you going?"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="pl-9 sm:pl-10 h-11 sm:h-12 text-sm sm:text-base"
              />
            </div>
          </div>

          {/* Check-in */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2">
              Check-in
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-11 sm:h-12 justify-start text-left font-normal text-xs sm:text-sm",
                    !checkIn && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                  <span className="truncate">{checkIn ? format(checkIn, "MMM dd") : "Select"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={checkIn}
                  onSelect={setCheckIn}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Check-out */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2">
              Check-out
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-11 sm:h-12 justify-start text-left font-normal text-xs sm:text-sm",
                    !checkOut && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
                  <span className="truncate">{checkOut ? format(checkOut, "MMM dd") : "Select"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={checkOut}
                  onSelect={setCheckOut}
                  disabled={(date) => date <= (checkIn || new Date())}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Guests - Full width on mobile */}
          <div className="col-span-2 lg:col-span-1">
            <label className="block text-xs sm:text-sm font-medium text-foreground mb-1.5 sm:mb-2">
              Guests
            </label>
            <Popover open={showGuestPicker} onOpenChange={setShowGuestPicker}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-11 sm:h-12 justify-start text-left font-normal text-xs sm:text-sm"
                >
                  <Users className="mr-1.5 sm:mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                  {guests.adults + guests.children} Guest{guests.adults + guests.children !== 1 ? 's' : ''}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 sm:w-80" align="start">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm sm:text-base">Adults</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Ages 13+</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 sm:h-9 sm:w-9 p-0 touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, adults: Math.max(1, g.adults - 1) }))}
                        disabled={guests.adults <= 1}
                      >
                        -
                      </Button>
                      <span className="w-6 sm:w-8 text-center text-sm sm:text-base">{guests.adults}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 sm:h-9 sm:w-9 p-0 touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, adults: Math.min(10, g.adults + 1) }))}
                        disabled={guests.adults >= 10}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm sm:text-base">Children</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">Ages 0-12</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 sm:h-9 sm:w-9 p-0 touch-manipulation"
                        onClick={() => setGuests(g => ({ ...g, children: Math.max(0, g.children - 1) }))}
                        disabled={guests.children <= 0}
                      >
                        -
                      </Button>
                      <span className="w-6 sm:w-8 text-center text-sm sm:text-base">{guests.children}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 sm:h-9 sm:w-9 p-0 touch-manipulation"
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
        <div className="mt-4 sm:mt-6">
          <Button
            onClick={handleSearch}
            className="w-full h-11 sm:h-12 text-sm sm:text-base bg-[var(--hero-gradient)] hover:opacity-90 transition-opacity touch-manipulation"
            disabled={!destination || !checkIn || !checkOut}
          >
            <Search className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
            Search Properties
          </Button>
        </div>
      </div>
    </div>
  );
};
