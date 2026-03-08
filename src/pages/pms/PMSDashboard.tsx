import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, BedDouble, Users, CalendarCheck, AlertTriangle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function PMSDashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const [stats, setStats] = useState({ totalRooms: 0, occupied: 0, dirty: 0, maintenance: 0, available: 0 });
  const [propertyName, setPropertyName] = useState("");

  useEffect(() => {
    if (!propertyId) return;

    const fetchStats = async () => {
      const [{ data: rooms }, { data: prop }] = await Promise.all([
        supabase.from("rolos_rooms").select("status").eq("property_id", propertyId),
        supabase.from("properties").select("name").eq("id", propertyId).single(),
      ]);

      if (prop) setPropertyName(prop.name);
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
    fetchStats();
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
              <CardTitle className="text-lg">Today's Arrivals</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">No arrivals today</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Today's Departures</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">No departures today</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
