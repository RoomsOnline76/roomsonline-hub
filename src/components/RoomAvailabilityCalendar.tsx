import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, Calendar, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  addMonths, 
  subMonths, 
  isBefore, 
  startOfDay,
  isAfter,
  isSameDay,
  differenceInDays,
  parseISO
} from "date-fns";
import { DayPicker, DateRange } from "react-day-picker";

interface AvailabilityData {
  date: string;
  available_units: number;
  rates?: any;
  restrictions?: any;
}

interface RoomAvailabilityCalendarProps {
  propertyId: string;
  propertySlug: string;
  propertyName: string;
  roomName: string;
  roomId: string;
}

export default function RoomAvailabilityCalendar({
  propertyId,
  propertySlug,
  propertyName,
  roomName,
  roomId,
}: RoomAvailabilityCalendarProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Initialize dates from URL params if available
  const initialCheckIn = searchParams.get('checkIn');
  const initialCheckOut = searchParams.get('checkOut');
  const initialGuests = parseInt(searchParams.get('guests') || '2', 10);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (initialCheckIn && initialCheckOut) {
      return {
        from: parseISO(initialCheckIn),
        to: parseISO(initialCheckOut)
      };
    }
    return undefined;
  });
  
  const [guests, setGuests] = useState({ adults: initialGuests, children: 0 });
  const [hoverDate, setHoverDate] = useState<Date | undefined>();
  const [displayedMonth, setDisplayedMonth] = useState<Date>(() => {
    if (initialCheckIn) {
      return startOfMonth(parseISO(initialCheckIn));
    }
    return new Date();
  });
  
  const [availability, setAvailability] = useState<Map<string, AvailabilityData>>(new Map());
  const [loading, setLoading] = useState(true);
  const autoNavTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchAvailability();
  }, [displayedMonth, propertyId, roomId]);

  const fetchAvailability = async () => {
    setLoading(true);
    try {
      // Fetch 3 months of data for smooth navigation
      const monthStart = format(startOfMonth(displayedMonth), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(addMonths(displayedMonth, 2)), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("pms_availability_cache")
        .select("date, available_units, rates, restrictions")
        .eq("property_id", propertyId)
        .eq("external_room_type_id", roomId)
        .gte("date", monthStart)
        .lte("date", monthEnd);

      if (error) throw error;

      const availMap = new Map<string, AvailabilityData>();
      data?.forEach((item) => {
        availMap.set(item.date, item);
      });
      setAvailability(availMap);
    } catch (error) {
      console.error("Error fetching availability:", error);
    } finally {
      setLoading(false);
    }
  };

  const slugifyRoomName = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  const handleBackToRoom = () => {
    navigate(`/property/${propertySlug}/room/${slugifyRoomName(roomName)}`);
  };

  // Handle date range selection
  const handleDayClick = (day: Date) => {
    if (isBefore(day, startOfDay(new Date()))) return; // Can't select past dates
    
    // If both dates already selected, reset and start fresh
    if (dateRange?.from && dateRange?.to) {
      setHoverDate(undefined);
      setDateRange({ from: day, to: undefined });
      return;
    }
    
    // If no start date, set it
    if (!dateRange?.from) {
      setDateRange({ from: day, to: undefined });
      return;
    }
    
    // Second click - lock the range (handle forward or backward selection)
    if (isBefore(day, dateRange.from)) {
      // User selected backwards - swap dates
      setDateRange({ from: day, to: dateRange.from });
    } else {
      setDateRange({ from: dateRange.from, to: day });
    }
    setHoverDate(undefined);
  };

  const handleDayMouseEnter = (day: Date) => {
    if (dateRange?.from && !dateRange?.to) {
      setHoverDate(day);
    }
  };

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
  const nights = dateRange?.from && dateRange?.to 
    ? differenceInDays(dateRange.to, dateRange.from) 
    : 0;

  // Check if a date is available
  const isDateAvailable = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const availData = availability.get(dateStr);
    return availData && availData.available_units > 0;
  };

  // Get rate for a date
  const getRateForDate = (date: Date): number | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    const availData = availability.get(dateStr);
    if (!availData?.rates) return null;
    
    // Try to get room amount first
    if (availData.rates.room_amount) return availData.rates.room_amount;
    if (availData.rates.adult_amounts?.adultAmount1) return availData.rates.adult_amounts.adultAmount1;
    if (availData.rates.adult_amounts?.adultAmount2) return availData.rates.adult_amounts.adultAmount2;
    return null;
  };

  const handleProceedToBooking = () => {
    if (dateRange?.from && dateRange?.to) {
      const params = new URLSearchParams({
        checkIn: format(dateRange.from, 'yyyy-MM-dd'),
        checkOut: format(dateRange.to, 'yyyy-MM-dd'),
        guests: String(guests.adults + guests.children)
      });
      navigate(`/booking/${propertySlug}?${params.toString()}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBackToRoom}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-sm text-muted-foreground">{propertyName}</p>
              <h1 className="text-xl font-bold">{roomName}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Calendar Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Select your dates
                </h2>
                
                {/* Date Display */}
                <div className="flex items-center gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
                  <div className="flex-1 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Check-in</p>
                    <p className="font-semibold">
                      {dateRange?.from ? format(dateRange.from, "EEE, d MMM") : "Select date"}
                    </p>
                  </div>
                  <div className="text-muted-foreground">→</div>
                  <div className="flex-1 text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Check-out</p>
                    <p className="font-semibold">
                      {dateRange?.to ? format(dateRange.to, "EEE, d MMM") : "Select date"}
                    </p>
                  </div>
                  {nights > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {nights} night{nights > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                {loading ? (
                  <Skeleton className="h-[320px] w-full" />
                ) : (
                  <DayPicker
                    mode="range"
                    selected={displayRange}
                    onDayClick={handleDayClick}
                    onDayMouseEnter={handleDayMouseEnter}
                    month={displayedMonth}
                    onMonthChange={setDisplayedMonth}
                    numberOfMonths={2}
                    disabled={(date) => isBefore(date, startOfDay(new Date()))}
                    modifiers={{
                      unavailable: (date) => !isBefore(date, startOfDay(new Date())) && !isDateAvailable(date) && availability.has(format(date, "yyyy-MM-dd")),
                    }}
                    modifiersStyles={{
                      unavailable: { backgroundColor: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--muted-foreground))' },
                    }}
                    className="pointer-events-auto"
                    classNames={{
                      months: "flex flex-col sm:flex-row gap-4",
                      month: "flex flex-col gap-2",
                      caption: "flex justify-center pt-1 relative items-center",
                      caption_label: "text-sm font-medium",
                      nav: "flex items-center gap-1",
                      nav_button: cn(
                        "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md border border-input hover:bg-accent"
                      ),
                      nav_button_previous: "absolute left-1",
                      nav_button_next: "absolute right-1",
                      table: "w-full border-collapse",
                      head_row: "flex",
                      head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] flex-1 text-center",
                      row: "flex w-full mt-1",
                      cell: "flex-1 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                      day: cn(
                        "h-9 w-9 p-0 font-normal mx-auto rounded-md transition-colors",
                        "hover:bg-primary hover:text-primary-foreground",
                        "focus:bg-primary focus:text-primary-foreground"
                      ),
                      day_range_start: "day-range-start bg-primary text-primary-foreground rounded-l-md rounded-r-none",
                      day_range_end: "day-range-end bg-primary text-primary-foreground rounded-r-md rounded-l-none",
                      day_selected: "bg-primary text-primary-foreground",
                      day_today: "ring-2 ring-primary ring-offset-2",
                      day_outside: "text-muted-foreground opacity-50",
                      day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
                      day_range_middle: "bg-primary/20 text-foreground rounded-none",
                      day_hidden: "invisible",
                    }}
                  />
                )}

                {/* Legend */}
                <div className="flex gap-6 mt-6 justify-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-primary/20 border border-primary/30" />
                    <span>Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" />
                    <span>Unavailable</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Booking Summary */}
          <div>
            <Card className="sticky top-4">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Booking Summary</h3>
                
                {/* Guests */}
                <div className="mb-6">
                  <p className="text-sm text-muted-foreground mb-2">Guests</p>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Adults</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setGuests(g => ({ ...g, adults: Math.max(1, g.adults - 1) }))}
                        disabled={guests.adults <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{guests.adults}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setGuests(g => ({ ...g, adults: g.adults + 1 }))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Selected Dates Summary */}
                {dateRange?.from && dateRange?.to && (
                  <div className="mb-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Check-in</span>
                      <span className="font-medium">{format(dateRange.from, "d MMM yyyy")}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Check-out</span>
                      <span className="font-medium">{format(dateRange.to, "d MMM yyyy")}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-primary/20">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-semibold">{nights} night{nights > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  size="lg"
                  disabled={!dateRange?.from || !dateRange?.to}
                  onClick={handleProceedToBooking}
                >
                  {dateRange?.from && dateRange?.to ? 'Proceed to Booking' : 'Select Dates'}
                </Button>

                <p className="text-xs text-center text-muted-foreground mt-3">
                  You won't be charged yet
                </p>
              </CardContent>
            </Card>

            {/* Back Button */}
            <Button variant="outline" className="w-full mt-4" onClick={handleBackToRoom}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Room
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
