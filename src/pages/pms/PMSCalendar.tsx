import { useState, useMemo, useRef, useEffect } from "react";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInDays, isWithinInterval, isSameDay, parseISO, isToday, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  AlertTriangle,
  MessageSquare,
  User,
  Mail,
  Phone,
  CreditCard,
  Globe,
  Clock,
  BedDouble,
  Baby,
  PawPrint,
  Ban,
} from "lucide-react";

type ViewMode = "week" | "month";

interface BookingRow {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  adults: number;
  children: number | null;
  infants: number | null;
  pets: number | null;
  teens: number | null;
  total_price: number;
  special_requests: string | null;
  special_requests_parsed: any;
  requires_intervention: boolean | null;
  booking_channel: string | null;
  payment_status: string | null;
  payment_method: string | null;
  rolos_check_in_time: string | null;
  rolos_check_out_time: string | null;
  rolos_room_ids: string[] | null;
  rolos_rate_plan_id: string | null;
  modification_notes: any;
  room_type_id: string | null;
}

interface RoomType {
  id: string;
  name: string;
  default_rate: number | null;
  is_active: boolean | null;
}

interface Room {
  id: string;
  room_number: string;
  room_name: string | null;
  room_type_id: string | null;
  status: string;
}

interface RateSeason {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_peak: boolean | null;
  rate_plan_id: string;
  min_stay_override: number | null;
}

interface RatePrice {
  id: string;
  base_rate: number;
  room_type_id: string;
  season_id: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  confirmed: { bg: "bg-blue-500/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-500/40" },
  pending: { bg: "bg-amber-500/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/40" },
  checked_in: { bg: "bg-green-500/20", text: "text-green-700 dark:text-green-300", border: "border-green-500/40" },
  checked_out: { bg: "bg-slate-500/20", text: "text-slate-700 dark:text-slate-300", border: "border-slate-500/40" },
  cancelled: { bg: "bg-red-500/20", text: "text-red-700 dark:text-red-300 line-through", border: "border-red-500/40" },
  no_show: { bg: "bg-rose-500/20", text: "text-rose-700 dark:text-rose-300", border: "border-rose-500/40" },
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  pending: "secondary",
  checked_in: "default",
  checked_out: "outline",
  cancelled: "destructive",
  no_show: "destructive",
};

function getStatusColor(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.pending;
}

export default function PMSCalendar() {
  const { propertyId, loading: propLoading } = usePmsPropertyId();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Compute date range
  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      const start = startOfWeek(anchorDate, { weekStartsOn: 1 });
      const end = endOfWeek(anchorDate, { weekStartsOn: 1 });
      return { start, end };
    }
    const start = startOfMonth(anchorDate);
    const end = endOfMonth(anchorDate);
    return { start, end };
  }, [anchorDate, viewMode]);

  const dates = useMemo(() => {
    const days: Date[] = [];
    let d = dateRange.start;
    while (d <= dateRange.end) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [dateRange]);

  // Fetch room types
  const { data: roomTypes = [] } = useQuery({
    queryKey: ["pms-cal-room-types", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("rolos_room_types")
        .select("id, name, default_rate, is_active")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("name");
      return (data || []) as RoomType[];
    },
    enabled: !!propertyId,
  });

  // Fetch rooms
  const { data: rooms = [] } = useQuery({
    queryKey: ["pms-cal-rooms", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("rolos_rooms")
        .select("id, room_number, room_name, room_type_id, status")
        .eq("property_id", propertyId)
        .order("room_number");
      return (data || []) as Room[];
    },
    enabled: !!propertyId,
  });

  // Fetch bookings in range
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["pms-cal-bookings", propertyId, format(dateRange.start, "yyyy-MM-dd"), format(dateRange.end, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data } = await supabase
        .from("bookings")
        .select("id, guest_name, guest_email, guest_phone, check_in_date, check_out_date, status, adults, children, infants, pets, teens, total_price, special_requests, special_requests_parsed, requires_intervention, booking_channel, payment_status, payment_method, rolos_check_in_time, rolos_check_out_time, rolos_room_ids, rolos_rate_plan_id, modification_notes, room_type_id")
        .eq("property_id", propertyId)
        .neq("status", "cancelled")
        .lte("check_in_date", format(dateRange.end, "yyyy-MM-dd"))
        .gte("check_out_date", format(dateRange.start, "yyyy-MM-dd"));
      return (data || []) as BookingRow[];
    },
    enabled: !!propertyId,
  });

  // Fetch rate seasons & prices
  const { data: rateSeasons = [] } = useQuery({
    queryKey: ["pms-cal-seasons", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data: plans } = await supabase
        .from("rolos_rate_plans")
        .select("id")
        .eq("property_id", propertyId)
        .eq("is_active", true);
      if (!plans?.length) return [];
      const planIds = plans.map(p => p.id);
      const { data } = await supabase
        .from("rolos_rate_seasons")
        .select("id, name, start_date, end_date, is_peak, rate_plan_id, min_stay_override")
        .in("rate_plan_id", planIds);
      return (data || []) as RateSeason[];
    },
    enabled: !!propertyId,
  });

  const { data: ratePrices = [] } = useQuery({
    queryKey: ["pms-cal-prices", propertyId, rateSeasons.map(s => s.id).join(",")],
    queryFn: async () => {
      if (!rateSeasons.length) return [];
      const seasonIds = rateSeasons.map(s => s.id);
      const { data } = await supabase
        .from("rolos_rate_prices")
        .select("id, base_rate, room_type_id, season_id")
        .in("season_id", seasonIds);
      return (data || []) as RatePrice[];
    },
    enabled: rateSeasons.length > 0,
  });

  // Group rooms by room type
  const roomsByType = useMemo(() => {
    const map = new Map<string, Room[]>();
    rooms.forEach(r => {
      const key = r.room_type_id || "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return map;
  }, [rooms]);

  // Get rate for a room type on a date
  const getRateForDate = (roomTypeId: string, date: Date): number | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    for (const season of rateSeasons) {
      if (dateStr >= season.start_date && dateStr <= season.end_date) {
        const price = ratePrices.find(p => p.season_id === season.id && p.room_type_id === roomTypeId);
        if (price) return price.base_rate;
      }
    }
    const rt = roomTypes.find(t => t.id === roomTypeId);
    return rt?.default_rate || null;
  };

  // Get season for date
  const getSeasonForDate = (date: Date): RateSeason | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    return rateSeasons.find(s => dateStr >= s.start_date && dateStr <= s.end_date) || null;
  };

  // Get bookings for a specific room on a date
  const getBookingsForRoom = (roomId: string, date: Date): BookingRow[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return bookings.filter(b => {
      if (!b.rolos_room_ids?.includes(roomId)) return false;
      return dateStr >= b.check_in_date && dateStr < b.check_out_date;
    });
  };

  // Get bookings for a room type (unassigned to specific room)
  const getBookingsForRoomType = (roomTypeId: string, date: Date): BookingRow[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return bookings.filter(b => {
      if (b.rolos_room_ids && b.rolos_room_ids.length > 0) return false;
      if (b.room_type_id !== roomTypeId) return false;
      return dateStr >= b.check_in_date && dateStr < b.check_out_date;
    });
  };

  // Compute daily occupancy
  const dailyOccupancy = useMemo(() => {
    const totalRooms = rooms.filter(r => r.status !== "out_of_service").length;
    if (!totalRooms) return dates.map(() => 0);
    return dates.map(date => {
      const dateStr = format(date, "yyyy-MM-dd");
      const occupied = bookings.filter(b => dateStr >= b.check_in_date && dateStr < b.check_out_date).length;
      return Math.round((occupied / totalRooms) * 100);
    });
  }, [dates, bookings, rooms]);

  // Navigation
  const navigateBy = (dir: number) => {
    setAnchorDate(prev => addDays(prev, dir * (viewMode === "week" ? 7 : 30)));
  };
  const goToToday = () => setAnchorDate(new Date());

  const hasSpecialIndicator = (b: BookingRow) =>
    b.requires_intervention || b.special_requests || (b.special_requests_parsed && Object.keys(b.special_requests_parsed).length > 0);

  const CELL_W = "w-[100px] min-w-[100px]";
  const LABEL_W = "w-[180px] min-w-[180px]";

  if (propLoading) {
    return (
      <PMSLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </PMSLayout>
    );
  }

  return (
    <PMSLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              {format(dateRange.start, "d MMM")} – {format(dateRange.end, "d MMM yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View mode */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("week")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent text-foreground"
                )}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === "month" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent text-foreground"
                )}
              >
                Month
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigateBy(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigateBy(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarDays className="h-4 w-4 mr-1" />
                  Jump
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={anchorDate}
                  onSelect={(d) => { if (d) { setAnchorDate(d); setDatePickerOpen(false); } }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(STATUS_COLORS).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={cn("w-3 h-3 rounded-sm border", colors.bg, colors.border)} />
              <span className="capitalize text-muted-foreground">{status.replace("_", " ")}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-muted border border-border flex items-center justify-center">
              <Ban className="h-2 w-2 text-muted-foreground" />
            </div>
            <span className="text-muted-foreground">Blocked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span className="text-muted-foreground">Needs attention</span>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <ScrollArea className="w-full" ref={scrollRef}>
            <div className="min-w-max">
              {/* Occupancy bar */}
              <div className="flex border-b border-border bg-muted/30">
                <div className={cn(LABEL_W, "shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border flex items-center")}>
                  Occupancy
                </div>
                {dates.map((date, i) => {
                  const occ = dailyOccupancy[i];
                  return (
                    <div key={i} className={cn(CELL_W, "shrink-0 px-1 py-2 text-center border-r border-border last:border-r-0")}>
                      <div className="w-full bg-muted rounded-full h-2 mb-1">
                        <div
                          className={cn(
                            "h-2 rounded-full transition-all",
                            occ >= 90 ? "bg-green-500" : occ >= 60 ? "bg-blue-500" : occ >= 30 ? "bg-amber-500" : "bg-muted-foreground/30"
                          )}
                          style={{ width: `${Math.min(occ, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{occ}%</span>
                    </div>
                  );
                })}
              </div>

              {/* Date header */}
              <div className="flex border-b border-border bg-muted/50 sticky top-0 z-10">
                <div className={cn(LABEL_W, "shrink-0 px-3 py-2 text-xs font-semibold text-foreground border-r border-border")}>
                  Room
                </div>
                {dates.map((date, i) => {
                  const season = getSeasonForDate(date);
                  return (
                    <div
                      key={i}
                      className={cn(
                        CELL_W,
                        "shrink-0 px-1 py-2 text-center border-r border-border last:border-r-0",
                        isToday(date) && "bg-primary/10",
                        season?.is_peak && "bg-amber-500/5"
                      )}
                    >
                      <div className="text-[10px] uppercase text-muted-foreground">{format(date, "EEE")}</div>
                      <div className={cn("text-sm font-semibold", isToday(date) ? "text-primary" : "text-foreground")}>
                        {format(date, "d")}
                      </div>
                      <div className="text-[9px] text-muted-foreground">{format(date, "MMM")}</div>
                      {season?.is_peak && (
                        <div className="text-[8px] text-amber-600 font-medium mt-0.5">PEAK</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Room type rows */}
              {roomTypes.map((rt) => {
                const typeRooms = roomsByType.get(rt.id) || [];
                const unassignedBookings = bookings.filter(
                  b => b.room_type_id === rt.id && (!b.rolos_room_ids || b.rolos_room_ids.length === 0)
                );

                return (
                  <div key={rt.id}>
                    {/* Room type header row with rates */}
                    <div className="flex border-b border-border bg-muted/20">
                      <div className={cn(LABEL_W, "shrink-0 px-3 py-2 border-r border-border flex items-center gap-2")}>
                        <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <div className="text-xs font-semibold text-foreground">{rt.name}</div>
                          <div className="text-[10px] text-muted-foreground">{typeRooms.length} room{typeRooms.length !== 1 ? "s" : ""}</div>
                        </div>
                      </div>
                      {dates.map((date, i) => {
                        const rate = getRateForDate(rt.id, date);
                        return (
                          <div key={i} className={cn(CELL_W, "shrink-0 px-1 py-2 text-center border-r border-border last:border-r-0", isToday(date) && "bg-primary/5")}>
                            {rate != null ? (
                              <span className="text-[10px] font-medium text-muted-foreground">
                                R{rate.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/50">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Individual room rows */}
                    {typeRooms.map((room) => (
                      <RoomRow
                        key={room.id}
                        room={room}
                        dates={dates}
                        bookings={bookings}
                        onSelectBooking={setSelectedBooking}
                        cellW={CELL_W}
                        labelW={LABEL_W}
                      />
                    ))}

                    {/* Unassigned bookings row */}
                    {unassignedBookings.length > 0 && (
                      <div className="flex border-b border-border bg-amber-500/5">
                        <div className={cn(LABEL_W, "shrink-0 px-3 py-1.5 border-r border-border flex items-center")}>
                          <span className="text-[10px] text-amber-600 italic ml-4">Unassigned</span>
                        </div>
                        {dates.map((date, i) => {
                          const dayBookings = getBookingsForRoomType(rt.id, date);
                          return (
                            <div key={i} className={cn(CELL_W, "shrink-0 border-r border-border last:border-r-0 relative h-8")}>
                              {dayBookings.map(b => {
                                const colors = getStatusColor(b.status);
                                const isStart = b.check_in_date === format(date, "yyyy-MM-dd");
                                return (
                                  <button
                                    key={b.id}
                                    onClick={() => setSelectedBooking(b)}
                                    className={cn(
                                      "absolute inset-y-0.5 inset-x-0.5 rounded-sm border flex items-center px-1 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity",
                                      colors.bg, colors.border
                                    )}
                                  >
                                    {isStart && (
                                      <span className={cn("text-[9px] font-medium truncate", colors.text)}>
                                        {b.guest_name.split(" ")[0]}
                                      </span>
                                    )}
                                    {hasSpecialIndicator(b) && isStart && (
                                      <AlertTriangle className="h-2.5 w-2.5 text-amber-500 ml-auto shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Empty state */}
              {roomTypes.length === 0 && !bookingsLoading && (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <div className="text-center space-y-2">
                    <CalendarDays className="h-10 w-10 mx-auto opacity-30" />
                    <p className="text-sm">No room types configured</p>
                    <p className="text-xs">Add room types in the Rooms section to get started</p>
                  </div>
                </div>
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>

      {/* Booking Detail Sheet */}
      <Sheet open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {selectedBooking && <BookingDetail booking={selectedBooking} rooms={rooms} />}
        </SheetContent>
      </Sheet>
    </PMSLayout>
  );
}

// ──────────── Room Row Component ────────────
function RoomRow({
  room,
  dates,
  bookings,
  onSelectBooking,
  cellW,
  labelW,
}: {
  room: Room;
  dates: Date[];
  bookings: BookingRow[];
  onSelectBooking: (b: BookingRow) => void;
  cellW: string;
  labelW: string;
}) {
  const isOOS = room.status === "out_of_service";

  return (
    <div className={cn("flex border-b border-border", isOOS && "opacity-50")}>
      <div className={cn(labelW, "shrink-0 px-3 py-1.5 border-r border-border flex items-center gap-2")}>
        <span className="text-xs text-foreground/80 ml-4">{room.room_number}</span>
        {room.room_name && <span className="text-[10px] text-muted-foreground truncate">({room.room_name})</span>}
        {isOOS && <Badge variant="outline" className="text-[8px] px-1 py-0">OOS</Badge>}
      </div>
      {dates.map((date, i) => {
        const dateStr = format(date, "yyyy-MM-dd");
        const dayBookings = bookings.filter(b => {
          if (!b.rolos_room_ids?.includes(room.id)) return false;
          return dateStr >= b.check_in_date && dateStr < b.check_out_date;
        });

        if (isOOS) {
          return (
            <div key={i} className={cn(cellW, "shrink-0 border-r border-border last:border-r-0 h-8 bg-muted/30")}>
              <div className="h-full flex items-center justify-center">
                <Ban className="h-3 w-3 text-muted-foreground/40" />
              </div>
            </div>
          );
        }

        return (
          <div key={i} className={cn(cellW, "shrink-0 border-r border-border last:border-r-0 relative h-8", isToday(date) && "bg-primary/5")}>
            {dayBookings.map(b => {
              const colors = getStatusColor(b.status);
              const isStart = b.check_in_date === dateStr;
              const isEnd = addDays(parseISO(b.check_out_date), -1).toISOString().slice(0, 10) === dateStr;
              return (
                <button
                  key={b.id}
                  onClick={() => onSelectBooking(b)}
                  className={cn(
                    "absolute inset-y-0.5 border flex items-center px-1 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity z-[1]",
                    colors.bg, colors.border,
                    isStart ? "left-0.5 rounded-l-sm" : "left-0",
                    isEnd ? "right-0.5 rounded-r-sm" : "right-0"
                  )}
                >
                  {isStart && (
                    <>
                      <span className={cn("text-[9px] font-medium truncate", colors.text)}>
                        {b.guest_name.split(" ")[0]}
                      </span>
                      {hasSpecialIndicator(b) && (
                        <AlertTriangle className="h-2.5 w-2.5 text-amber-500 ml-auto shrink-0" />
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ──────────── Booking Detail Component ────────────
function BookingDetail({ booking, rooms }: { booking: BookingRow; rooms: Room[] }) {
  const b = booking;
  const nights = differenceInDays(parseISO(b.check_out_date), parseISO(b.check_in_date));
  const statusColor = getStatusColor(b.status);
  const assignedRooms = rooms.filter(r => b.rolos_room_ids?.includes(r.id));

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <User className="h-4 w-4" />
          {b.guest_name}
        </SheetTitle>
        <SheetDescription>
          Booking #{b.id.slice(0, 8)}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 mt-4">
        {/* Status + intervention */}
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_BADGE_VARIANT[b.status] || "secondary"} className="capitalize">
            {b.status.replace("_", " ")}
          </Badge>
          {b.requires_intervention && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Needs Attention
            </Badge>
          )}
        </div>

        <Separator />

        {/* Stay details */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stay Details</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Check-in</span>
              <p className="font-medium">{format(parseISO(b.check_in_date), "d MMM yyyy")}</p>
              {b.rolos_check_in_time && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />{b.rolos_check_in_time}
                </p>
              )}
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Check-out</span>
              <p className="font-medium">{format(parseISO(b.check_out_date), "d MMM yyyy")}</p>
              {b.rolos_check_out_time && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />{b.rolos_check_out_time}
                </p>
              )}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""}</div>
        </div>

        <Separator />

        {/* Guest info */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guest</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{b.guest_email}</span>
            </div>
            {b.guest_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{b.guest_phone}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className="text-xs gap-1">
              <User className="h-3 w-3" />{b.adults} Adult{b.adults !== 1 ? "s" : ""}
            </Badge>
            {(b.children ?? 0) > 0 && (
              <Badge variant="outline" className="text-xs">{b.children} Child{(b.children ?? 0) !== 1 ? "ren" : ""}</Badge>
            )}
            {(b.teens ?? 0) > 0 && (
              <Badge variant="outline" className="text-xs">{b.teens} Teen{(b.teens ?? 0) !== 1 ? "s" : ""}</Badge>
            )}
            {(b.infants ?? 0) > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <Baby className="h-3 w-3" />{b.infants} Infant{(b.infants ?? 0) !== 1 ? "s" : ""}
              </Badge>
            )}
            {(b.pets ?? 0) > 0 && (
              <Badge variant="outline" className="text-xs gap-1">
                <PawPrint className="h-3 w-3" />{b.pets} Pet{(b.pets ?? 0) !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Room assignment */}
        {assignedRooms.length > 0 && (
          <>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room Assignment</h4>
              <div className="flex flex-wrap gap-2">
                {assignedRooms.map(r => (
                  <Badge key={r.id} variant="secondary">
                    <BedDouble className="h-3 w-3 mr-1" />
                    {r.room_number}{r.room_name ? ` (${r.room_name})` : ""}
                  </Badge>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Payment */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment</h4>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold text-lg">R{b.total_price.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" />
            <span className="capitalize">{b.payment_status || "unknown"}</span>
            {b.payment_method && <span>· {b.payment_method}</span>}
          </div>
        </div>

        {/* Channel */}
        {b.booking_channel && (
          <>
            <Separator />
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Channel:</span>
              <span className="capitalize">{b.booking_channel}</span>
            </div>
          </>
        )}

        {/* Special requests */}
        {(b.special_requests || (b.special_requests_parsed && Object.keys(b.special_requests_parsed).length > 0)) && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                Special Requests
              </h4>
              {b.special_requests && (
                <p className="text-sm bg-amber-500/10 p-3 rounded-md border border-amber-500/20">{b.special_requests}</p>
              )}
              {b.special_requests_parsed && typeof b.special_requests_parsed === "object" && Object.entries(b.special_requests_parsed).length > 0 && (
                <div className="space-y-1">
                  {Object.entries(b.special_requests_parsed).map(([key, val]) => (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <span className="font-medium capitalize text-muted-foreground">{key.replace(/_/g, " ")}:</span>
                      <span>{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Modification history */}
        {b.modification_notes && Array.isArray(b.modification_notes) && b.modification_notes.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modification History</h4>
              <div className="space-y-2">
                {(b.modification_notes as any[]).slice(-5).reverse().map((note: any, i: number) => (
                  <div key={i} className="text-xs bg-muted/50 p-2 rounded border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-[10px] capitalize">{note.action}</Badge>
                      <span className="text-muted-foreground">{note.timestamp ? format(new Date(note.timestamp), "d MMM HH:mm") : ""}</span>
                    </div>
                    {note.changes && Object.entries(note.changes).map(([k, v]) => (
                      <div key={k} className="text-muted-foreground">
                        {k.replace(/_/g, " ")}: {String(v)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function hasSpecialIndicator(b: BookingRow): boolean {
  return !!(b.requires_intervention || b.special_requests || (b.special_requests_parsed && typeof b.special_requests_parsed === "object" && Object.keys(b.special_requests_parsed).length > 0));
}
