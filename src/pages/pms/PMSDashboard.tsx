import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, BedDouble, Users, CalendarCheck, AlertTriangle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { format } from "date-fns";

interface ArrivalDeparture {
  id: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  rooms: any;
}

export default function PMSDashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const { propertyName: brandName } = usePMSBrand();
  const [stats, setStats] = useState({ totalRooms: 0, occupied: 0, dirty: 0, maintenance: 0, available: 0 });
  const [propertyName, setPropertyName] = useState("");
  const [arrivals, setArrivals] = useState<ArrivalDeparture[]>([]);
  const [departures, setDepartures] = useState<ArrivalDeparture[]>([]);

  useEffect(() => {
    if (!propertyId) return;

    const fetchData = async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      const [{ data: rooms }, { data: prop }, { data: arrivalsData }, { data: departuresData }] = await Promise.all([
        supabase.from("rolos_rooms").select("status").eq("property_id", propertyId),
        supabase.from("properties").select("name").eq("id", propertyId).single(),
        supabase
          .from("bookings")
          .select("id, guest_name, check_in_date, check_out_date, status, rooms")
          .eq("property_id", propertyId)
          .eq("check_in_date", today)
          .in("status", ["confirmed", "pending"])
          .limit(20),
        supabase
          .from("bookings")
          .select("id, guest_name, check_in_date, check_out_date, status, rooms")
          .eq("property_id", propertyId)
          .eq("check_out_date", today)
          .in("status", ["confirmed", "checked_in"])
          .limit(20),
      ]);

      if (prop) setPropertyName(prop.name);
      if (arrivalsData) setArrivals(arrivalsData);
      if (departuresData) setDepartures(departuresData);
      if (rooms) {
        setStats({
          totalRooms: rooms.length,
          occupied: rooms.filter(r => r.status === "occupied").length,
          dirty: rooms.filter(r => r.status === "dirty").length,
          maintenance: rooms.filter(r => r.status === "maintenance" || r.status === "out_of_order").length,
          available: rooms.filter(r => r.status === "available").length,
        });
      }
    };
    fetchData();
  }, [propertyId]);

  if (!propertyId) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Sparkles className="h-12 w-12 text-primary" />
          <h1 className="text-2xl font-bold">ROL'OS Native PMS</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Select a ROL property from your Property Overview to access the PMS module.
          </p>
        </div>
      </AppLayout>
    );
  }

  const statCards = [
    { label: "Total Rooms", value: stats.totalRooms, icon: Building2, color: "text-foreground" },
    { label: "Available", value: stats.available, icon: BedDouble, color: "text-emerald-600" },
    { label: "Occupied", value: stats.occupied, icon: Users, color: "text-blue-600" },
    { label: "Needs Cleaning", value: stats.dirty, icon: CalendarCheck, color: "text-amber-600" },
    { label: "Maintenance", value: stats.maintenance, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{propertyName}</h1>
          <Badge variant="outline" className="text-primary border-primary">ROL'OS PMS</Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Today's Arrivals ({arrivals.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {arrivals.length === 0 ? (
                <p className="text-muted-foreground text-sm">No arrivals today</p>
              ) : (
                <div className="space-y-3">
                  {arrivals.map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="font-medium text-sm">{booking.guest_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(booking.check_in_date), "MMM d")} → {format(new Date(booking.check_out_date), "MMM d")}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">{booking.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Today's Departures ({departures.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {departures.length === 0 ? (
                <p className="text-muted-foreground text-sm">No departures today</p>
              ) : (
                <div className="space-y-3">
                  {departures.map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="font-medium text-sm">{booking.guest_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(booking.check_in_date), "MMM d")} → {format(new Date(booking.check_out_date), "MMM d")}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">{booking.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
