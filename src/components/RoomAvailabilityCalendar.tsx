import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, isToday, isBefore, startOfDay } from "date-fns";

interface AvailabilityData {
  date: string;
  available_units: number;
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
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availability, setAvailability] = useState<Map<string, AvailabilityData>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAvailability();
  }, [currentMonth, propertyId, roomId]);

  const fetchAvailability = async () => {
    setLoading(true);
    try {
      const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("pms_availability_cache")
        .select("date, available_units, restrictions")
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

  const goToPreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Get the day of the week for the first day of the month (0-6)
  const firstDayOfMonth = startOfMonth(currentMonth).getDay();

  const slugifyRoomName = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  const handleBackToRoom = () => {
    navigate(`/property/${propertySlug}/room/${slugifyRoomName(roomName)}`);
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
              <h1 className="text-xl font-bold">{roomName} - Availability</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-xl">
                {format(currentMonth, "MMMM yyyy")}
              </CardTitle>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Legend */}
            <div className="flex gap-6 mb-6 justify-center text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-primary" />
                <span>Unavailable</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-muted" />
                <span>Past / No Data</span>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <>
                {/* Week day headers */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {weekDays.map((day) => (
                    <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-2">
                  {/* Empty cells for days before the first of the month */}
                  {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                    <div key={`empty-${idx}`} className="h-12" />
                  ))}

                  {/* Day cells */}
                  {days.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const availData = availability.get(dateStr);
                    const isPast = isBefore(day, startOfDay(new Date()));
                    const hasData = availData !== undefined;
                    const isAvailable = hasData && availData.available_units > 0;
                    const todayClass = isToday(day) ? "ring-2 ring-foreground ring-offset-2" : "";

                    let bgColor = "bg-muted text-muted-foreground"; // default: past or no data
                    if (!isPast && hasData) {
                      bgColor = isAvailable 
                        ? "bg-green-500 text-white hover:bg-green-600" 
                        : "bg-primary text-primary-foreground hover:bg-primary/90";
                    }

                    return (
                      <div
                        key={dateStr}
                        className={cn(
                          "h-12 rounded-lg flex flex-col items-center justify-center transition-colors",
                          bgColor,
                          todayClass,
                          isPast && "opacity-50"
                        )}
                      >
                        <span className="text-sm font-medium">{format(day, "d")}</span>
                        {hasData && !isPast && (
                          <span className="text-[10px]">
                            {availData.available_units} left
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="text-center mt-6">
          <Button variant="outline" onClick={handleBackToRoom}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {roomName}
          </Button>
        </div>
      </div>
    </div>
  );
}
