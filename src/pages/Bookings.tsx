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
import { Calendar, Search, Filter, RefreshCw, Users, CalendarDays, Building2, CloudDownload, Loader2, ChevronDown, ChevronUp, Bed, Plus } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, parseISO, subDays, addDays } from "date-fns";

interface Property {
  id: string;
  name: string;
  slug: string | null;
  external_system: string | null;
  benson_property_code: string | null;
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
  source?: "internal" | "pms";
}

const Bookings = () => {
  const { user, isAdmin, isDev } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState<string>(format(addDays(new Date(), 60), "yyyy-MM-dd"));
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [syncingBookings, setSyncingBookings] = useState(false);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  const canViewAllProperties = isAdmin || isDev;

  // Load properties based on user role
  useEffect(() => {
    const loadProperties = async () => {
      if (!user) return;

      try {
        let query = supabase
          .from("properties")
          .select("id, name, slug, external_system, benson_property_code")
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

  // Load bookings from both internal bookings table and PMS reservations
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

        // Fetch internal bookings
        let internalQuery = supabase
          .from("bookings")
          .select("*")
          .order("check_in_date", { ascending: false });

        if (!canViewAllProperties && propertyIds.length > 0) {
          internalQuery = internalQuery.in("property_id", propertyIds);
        }
        if (selectedProperty !== "all") {
          internalQuery = internalQuery.eq("property_id", selectedProperty);
        }
        if (dateFrom) {
          internalQuery = internalQuery.gte("check_in_date", dateFrom);
        }
        if (dateTo) {
          internalQuery = internalQuery.lte("check_in_date", dateTo);
        }
        if (statusFilter !== "all") {
          internalQuery = internalQuery.eq("status", statusFilter.toLowerCase());
        }

        // Fetch PMS reservations
        let pmsQuery = supabase
          .from("pms_reservations")
          .select("*")
          .order("arrival_date", { ascending: false });

        if (!canViewAllProperties && propertyIds.length > 0) {
          pmsQuery = pmsQuery.in("property_id", propertyIds);
        }
        if (selectedProperty !== "all") {
          pmsQuery = pmsQuery.eq("property_id", selectedProperty);
        }
        if (dateFrom) {
          pmsQuery = pmsQuery.gte("arrival_date", dateFrom);
        }
        if (dateTo) {
          pmsQuery = pmsQuery.lte("arrival_date", dateTo);
        }
        if (statusFilter !== "all") {
          pmsQuery = pmsQuery.ilike("status", `%${statusFilter}%`);
        }

        const [internalResult, pmsResult] = await Promise.all([
          internalQuery,
          pmsQuery
        ]);

        if (internalResult.error) throw internalResult.error;
        if (pmsResult.error) throw pmsResult.error;

        // Transform internal bookings
        const internalBookings: Booking[] = (internalResult.data || []).map(booking => {
          const property = properties.find(p => p.id === booking.property_id);
          return {
            ...booking,
            property_name: property?.name || "Unknown Property",
            source: "internal" as const
          };
        });

        // Transform PMS reservations to match Booking interface
        const pmsBookings: Booking[] = (pmsResult.data || []).map(res => {
          const property = properties.find(p => p.id === res.property_id);
          // Calculate guest counts from rooms or guests array
          let adults = 0, teens = 0, children = 0, infants = 0;
          if (res.rooms && Array.isArray(res.rooms)) {
            res.rooms.forEach((room: any) => {
              adults += room.numberOfAdults || 0;
              teens += room.numberOfTeens || 0;
              children += room.numberOfChildren || 0;
              infants += room.numberOfInfants || 0;
            });
          }
          
          return {
            id: res.id,
            property_id: res.property_id,
            property_name: property?.name || "Unknown Property",
            check_in_date: res.arrival_date,
            check_out_date: res.departure_date,
            guest_name: res.contact_name || "Unknown Guest",
            guest_email: res.contact_email || "",
            guest_phone: res.contact_phone,
            adults: adults || res.number_of_guests || 1,
            teens,
            children,
            infants,
            total_price: Number(res.total_amount) || 0,
            status: res.status?.toLowerCase() || "unknown",
            room_type_id: null,
            rate_type_id: null,
            rooms: res.rooms,
            special_requests: null,
            voucher: res.reservation_voucher,
            external_reservation_id: res.external_reservation_id,
            created_at: res.created_at,
            source: "pms" as const
          };
        });

        // Combine and deduplicate by external_reservation_id
        const seenExternalIds = new Set<string>();
        const allBookings: Booking[] = [];
        
        // Add PMS bookings first (they're the source of truth for external systems)
        pmsBookings.forEach(booking => {
          if (booking.external_reservation_id) {
            seenExternalIds.add(booking.external_reservation_id);
          }
          allBookings.push(booking);
        });
        
        // Add internal bookings that don't have a matching PMS reservation
        internalBookings.forEach(booking => {
          if (!booking.external_reservation_id || !seenExternalIds.has(booking.external_reservation_id)) {
            allBookings.push(booking);
          }
        });

        // Sort by check-in date descending
        allBookings.sort((a, b) => 
          new Date(b.check_in_date).getTime() - new Date(a.check_in_date).getTime()
        );

        setBookings(allBookings);
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

  // Stats - normalize status comparisons (Benson uses uppercase, internal uses lowercase)
  const stats = useMemo(() => {
    const normalizeStatus = (s: string) => s?.toLowerCase() || "";
    const total = filteredBookings.length;
    const confirmed = filteredBookings.filter(b => 
      ["confirmed", "guaranteed", "checked-in"].includes(normalizeStatus(b.status))
    ).length;
    const pending = filteredBookings.filter(b => 
      ["pending", "provisional"].includes(normalizeStatus(b.status))
    ).length;
    const cancelled = filteredBookings.filter(b => 
      normalizeStatus(b.status) === "cancelled"
    ).length;
    const totalRevenue = filteredBookings
      .filter(b => normalizeStatus(b.status) !== "cancelled")
      .reduce((sum, b) => sum + Number(b.total_price), 0);

    return { total, confirmed, pending, cancelled, totalRevenue };
  }, [filteredBookings]);

  const getStatusBadge = (status: string) => {
    const normalized = status?.toLowerCase() || "";
    if (["confirmed", "guaranteed", "checked-in"].includes(normalized)) {
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">{status}</Badge>;
    }
    if (["pending", "provisional"].includes(normalized)) {
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">{status}</Badge>;
    }
    if (normalized === "cancelled") {
      return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Cancelled</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const getTotalGuests = (booking: Booking) => {
    return booking.adults + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0);
  };

  const clearFilters = () => {
    setSelectedProperty("all");
    setDateFrom(format(subDays(new Date(), 30), "yyyy-MM-dd"));
    setDateTo(format(addDays(new Date(), 60), "yyyy-MM-dd"));
    setSearchTerm("");
    setStatusFilter("all");
  };

  // Sync bookings from Benson API
  const syncBensonBookings = async () => {
    if (!selectedProperty || selectedProperty === "all") {
      toast.error("Please select a specific property to sync");
      return;
    }

    const property = properties.find(p => p.id === selectedProperty);
    if (!property?.benson_property_code) {
      toast.error("Selected property is not connected to Benson");
      return;
    }

    setSyncingBookings(true);
    try {
      const startDate = dateFrom || format(subDays(new Date(), 30), "yyyy-MM-dd");
      const endDate = dateTo || format(addDays(new Date(), 60), "yyyy-MM-dd");

      const { data, error } = await supabase.functions.invoke("benson-api", {
        body: {
          action: "get_reservations",
          property_id: selectedProperty,
          start_date: startDate,
          end_date: endDate,
          statuses: ["PROVISIONAL", "CONFIRMED", "GUARANTEED", "CHECKED-IN", "CANCELLED"]
        }
      });

      if (error) throw error;

      const count = Array.isArray(data) ? data.length : 0;
      toast.success(`Synced ${count} reservations from Benson`);
      
      // Reload bookings after sync
      window.location.reload();
    } catch (error: any) {
      console.error("Error syncing bookings:", error);
      toast.error(error.message || "Failed to sync bookings from Benson");
    } finally {
      setSyncingBookings(false);
    }
  };

  // Check if selected property supports Benson sync
  const selectedPropertyData = properties.find(p => p.id === selectedProperty);
  const canSyncBenson = selectedProperty !== "all" && 
    selectedPropertyData?.external_system === "benson" && 
    selectedPropertyData?.benson_property_code;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Bookings
            </h1>
            <p className="text-muted-foreground">
              View and manage all reservations
            </p>
          </div>
          {canSyncBenson && (
            <Button 
              onClick={syncBensonBookings} 
              disabled={syncingBookings}
              variant="outline"
            >
              {syncingBookings ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CloudDownload className="h-4 w-4 mr-2" />
              )}
              Sync from Benson
            </Button>
          )}
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
                    {filteredBookings.map((booking) => {
                      const rooms = booking.rooms && Array.isArray(booking.rooms) ? booking.rooms : [];
                      const hasMultipleRooms = rooms.length > 1;
                      const isExpanded = expandedBookingId === booking.id;
                      
                      return (
                        <>
                          <TableRow 
                            key={booking.id} 
                            className={hasMultipleRooms ? "cursor-pointer hover:bg-muted/50" : ""}
                            onClick={() => hasMultipleRooms && setExpandedBookingId(isExpanded ? null : booking.id)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {hasMultipleRooms && (
                                  <Plus className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-45" : ""}`} />
                                )}
                                {booking.property_name}
                                {hasMultipleRooms && (
                                  <Badge variant="outline" className="ml-1 text-xs">
                                    {rooms.length} rooms
                                  </Badge>
                                )}
                              </div>
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
                          {/* Expanded room details with cost breakdown */}
                          {isExpanded && hasMultipleRooms && (
                            <TableRow key={`${booking.id}-details`} className="bg-muted/30">
                              <TableCell colSpan={8} className="p-4">
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-muted-foreground mb-3">Room Details & Cost Breakdown</p>
                                  <div className="grid gap-3">
                                    {rooms.map((room: any, index: number) => {
                                      const roomDates = {
                                        checkIn: room.arrivalDate || booking.check_in_date,
                                        checkOut: room.departureDate || booking.check_out_date,
                                      };
                                      const nights = room.arrivalDate && room.departureDate
                                        ? Math.ceil((new Date(room.departureDate).getTime() - new Date(room.arrivalDate).getTime()) / (1000 * 60 * 60 * 24))
                                        : Math.ceil((new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / (1000 * 60 * 60 * 24));
                                      
                                      const roomTotal = room.totalAmount || room.roomTotal || 0;
                                      const hasLineItems = room.lineItems && Array.isArray(room.lineItems) && room.lineItems.length > 0;
                                      
                                      return (
                                        <div key={index} className="p-3 bg-background rounded-lg border">
                                          <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3">
                                              <Bed className="h-5 w-5 text-muted-foreground mt-0.5" />
                                              <div>
                                                <p className="font-medium">{room.roomTypeName || room.roomName || `Room ${index + 1}`}</p>
                                                <p className="text-sm text-muted-foreground">
                                                  {format(parseISO(roomDates.checkIn), "dd MMM")} → {format(parseISO(roomDates.checkOut), "dd MMM")} ({nights} nights)
                                                </p>
                                              </div>
                                            </div>
                                            <div className="text-right">
                                              <p className="font-bold">R{Number(roomTotal).toLocaleString()}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {room.numberOfAdults || 0}A
                                                {(room.numberOfTeens || 0) > 0 && `, ${room.numberOfTeens}T`}
                                                {(room.numberOfChildren || 0) > 0 && `, ${room.numberOfChildren}C`}
                                                {(room.numberOfInfants || 0) > 0 && `, ${room.numberOfInfants}I`}
                                              </p>
                                            </div>
                                          </div>
                                          
                                          {/* Cost line items if available */}
                                          {hasLineItems && (
                                            <div className="mt-3 pt-3 border-t">
                                              <p className="text-xs font-medium text-muted-foreground mb-2">Cost Breakdown</p>
                                              <div className="space-y-1">
                                                {room.lineItems.map((item: any, itemIdx: number) => (
                                                  <div key={itemIdx} className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">{item.description}</span>
                                                    <span>R{Number(item.total || 0).toLocaleString()}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Rate type info if available */}
                                          {room.rateTypeName && (
                                            <p className="text-xs text-muted-foreground mt-2">
                                              Rate: {room.rateTypeName}
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
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
