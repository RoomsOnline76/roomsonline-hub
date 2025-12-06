import { useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar, Search, Filter, RefreshCw, Users, CalendarDays, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";

interface Property {
  id: string;
  name: string;
  slug: string | null;
}

interface Booking {
  id: string;
  property_id: string;
  property_name?: string;
  check_in_date: string;
  check_out_date: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  adults: number;
  teens: number | null;
  children: number | null;
  infants: number | null;
  total_price: number;
  status: string;
  room_type_id: string | null;
  rate_type_id: string | null;
  rooms: any;
  special_requests: string | null;
  voucher: string | null;
  external_reservation_id: string | null;
  created_at: string | null;
}

const Bookings = () => {
  const { user, isAdmin, isDev } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const canViewAllProperties = isAdmin || isDev;

  // Load properties based on user role
  useEffect(() => {
    const loadProperties = async () => {
      if (!user) return;

      try {
        let query = supabase
          .from("properties")
          .select("id, name, slug")
          .eq("is_active", true)
          .is("permanently_deleted_at", null)
          .order("name");

        // For owners, filter by their email
        if (!canViewAllProperties) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", user.id)
            .maybeSingle();

          if (profile?.email) {
            query = query.eq("owner_email", profile.email);
          }
        }

        const { data, error } = await query;

        if (error) throw error;
        setProperties(data || []);
      } catch (error: any) {
        console.error("Error loading properties:", error);
        toast.error("Failed to load properties");
      }
    };

    loadProperties();
  }, [user, canViewAllProperties]);

  // Load bookings
  useEffect(() => {
    const loadBookings = async () => {
      if (!user) return;
      setLoading(true);

      try {
        // Get property IDs the user can access
        const propertyIds = properties.map(p => p.id);
        
        if (propertyIds.length === 0 && !canViewAllProperties) {
          setBookings([]);
          setLoading(false);
          return;
        }

        let query = supabase
          .from("bookings")
          .select("*")
          .order("check_in_date", { ascending: false });

        // Filter by accessible properties for owners
        if (!canViewAllProperties && propertyIds.length > 0) {
          query = query.in("property_id", propertyIds);
        }

        // Filter by selected property
        if (selectedProperty !== "all") {
          query = query.eq("property_id", selectedProperty);
        }

        // Filter by date range
        if (dateFrom) {
          query = query.gte("check_in_date", dateFrom);
        }
        if (dateTo) {
          query = query.lte("check_in_date", dateTo);
        }

        // Filter by status
        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Enrich bookings with property names
        const enrichedBookings = (data || []).map(booking => {
          const property = properties.find(p => p.id === booking.property_id);
          return {
            ...booking,
            property_name: property?.name || "Unknown Property"
          };
        });

        setBookings(enrichedBookings);
      } catch (error: any) {
        console.error("Error loading bookings:", error);
        toast.error("Failed to load bookings");
      } finally {
        setLoading(false);
      }
    };

    if (properties.length > 0 || canViewAllProperties) {
      loadBookings();
    }
  }, [user, properties, selectedProperty, dateFrom, dateTo, statusFilter, canViewAllProperties]);

  // Filter bookings by search term
  const filteredBookings = useMemo(() => {
    if (!searchTerm) return bookings;
    
    const term = searchTerm.toLowerCase();
    return bookings.filter(booking => 
      booking.guest_name.toLowerCase().includes(term) ||
      booking.guest_email.toLowerCase().includes(term) ||
      booking.property_name?.toLowerCase().includes(term) ||
      booking.external_reservation_id?.toLowerCase().includes(term)
    );
  }, [bookings, searchTerm]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredBookings.length;
    const confirmed = filteredBookings.filter(b => b.status === "confirmed").length;
    const pending = filteredBookings.filter(b => b.status === "pending").length;
    const cancelled = filteredBookings.filter(b => b.status === "cancelled").length;
    const totalRevenue = filteredBookings
      .filter(b => b.status !== "cancelled")
      .reduce((sum, b) => sum + Number(b.total_price), 0);

    return { total, confirmed, pending, cancelled, totalRevenue };
  }, [filteredBookings]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Confirmed</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pending</Badge>;
      case "cancelled":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTotalGuests = (booking: Booking) => {
    return booking.adults + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0);
  };

  const clearFilters = () => {
    setSelectedProperty("all");
    setDateFrom("");
    setDateTo("");
    setSearchTerm("");
    setStatusFilter("all");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Bookings
          </h1>
          <p className="text-muted-foreground">
            View and manage all reservations
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <CalendarDays className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-500/10">
                  <CalendarDays className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Confirmed</p>
                  <p className="text-2xl font-bold">{stats.confirmed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-500/10">
                  <CalendarDays className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-500/10">
                  <CalendarDays className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cancelled</p>
                  <p className="text-2xl font-bold">{stats.cancelled}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Revenue</p>
                  <p className="text-xl font-bold">R{stats.totalRevenue.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Property Filter */}
              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                  <SelectTrigger>
                    <SelectValue placeholder="All properties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All properties</SelectItem>
                    {properties.map(property => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date From */}
              <div className="space-y-2">
                <Label>Check-in From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              {/* Date To */}
              <div className="space-y-2">
                <Label>Check-in To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search */}
              <div className="space-y-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Guest, email, property..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bookings Table */}
        <Card>
          <CardHeader>
            <CardTitle>Reservations</CardTitle>
            <CardDescription>
              {filteredBookings.length} booking{filteredBookings.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading bookings...
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No bookings found matching your criteria
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Guest</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Guests</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ref</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="font-medium">
                          {booking.property_name}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{booking.guest_name}</p>
                            <p className="text-sm text-muted-foreground">{booking.guest_email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {format(parseISO(booking.check_in_date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          {format(parseISO(booking.check_out_date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            {getTotalGuests(booking)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          R{Number(booking.total_price).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(booking.status)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {booking.external_reservation_id || booking.id.slice(0, 8)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Bookings;
