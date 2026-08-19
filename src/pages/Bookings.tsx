import React, { useState, useEffect, useMemo } from "react";
import { useBookingCoverage } from "@/lib/bookingHistoryWindow";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { Badge } from "@/components/ui/badge";
import { BookingLifecycleVisualizer, type BookingState } from "@/components/BookingLifecycleVisualizer";
import { ModifyBookingModal } from "@/components/booking/ModifyBookingModal";
import { CancelBookingModal } from "@/components/booking/CancelBookingModal";
import {
  ROL_ORIGIN_FILTER_OPTIONS,
  ROL_ORIGIN_LABELS,
  displayBookingReference,
  describeRolReference,
  matchesReferenceSearch,
  bookingOriginCode,
  kindForOrigin,
} from "@/lib/bookingReference";

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
import { Calendar, Search, Filter, RefreshCw, Users, CalendarDays, Building2, CloudDownload, Loader2, ChevronDown, ChevronUp, Bed, Plus, XCircle, Pencil } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { pushBookingToChannel } from "@/lib/channelBookingSync";
import { useAuth } from "@/hooks/useAuth";
import { applyAdminScope } from "@/lib/adminScope";
import { toast } from "sonner";
import { isRevenuePaymentStatus } from "@/lib/revenueStatuses";
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
  rate_type_name?: string;
  rooms: any;
  charges?: any[];
  special_requests: string | null;
  voucher: string | null;
  external_reservation_id: string | null;
  /** Standardised ROL booking reference (ROL-<origin>-<kind>-<prop>-<seq>). */
  rol_reference?: string | null;
  rol_reference_legacy?: string | null;
  rol_ref_origin?: string | null;
  rol_ref_kind?: string | null;
  created_at: string | null;
  source?: "internal" | "pms";
  ai_metadata?: any;
  booking_channel?: string | null;
  integration_type?: string | null;
  rolos_rate_plan_id?: string | null;
  payment_status?: string | null;
}



const Bookings = () => {
  const { user, isAdmin, isDev, isFearlessLeader, scopedPropertyIds } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState<string>(format(addDays(new Date(), 60), "yyyy-MM-dd"));
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");

  /* Coverage of real (non-cancelled) stays so an empty grid can say where the data actually lives. */
  const coverageIds = useMemo(
    () => (selectedProperty === "all" ? properties.map((p) => p.id) : [selectedProperty]),
    [selectedProperty, properties],
  );
  const { data: bookingCoverage } = useBookingCoverage(coverageIds);



  const [syncingBookings, setSyncingBookings] = useState(false);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [modifyModalBooking, setModifyModalBooking] = useState<Booking | null>(null);
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);
  const [modifyLoading, setModifyLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const canViewAllProperties = isAdmin || isDev || isFearlessLeader;

  // Cancel entire reservation (internal only)
  const handleCancelReservation = async (booking: Booking) => {
    if (!confirm(`Are you sure you want to cancel this entire reservation for ${booking.guest_name}?`)) {
      return;
    }
    
    setCancellingBookingId(booking.id);
    try {
      if (booking.source === "pms") {
        // Update pms_reservations
        const { error } = await supabase
          .from("pms_reservations")
          .update({ status: "CANCELLED" })
          .eq("external_reservation_id", booking.external_reservation_id);
        
        if (error) throw error;
      } else {
        // Update internal bookings
        const { error } = await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", booking.id);
        
        if (error) throw error;
      }
      
      // Update local state
      setBookings(prev => prev.map(b => 
        b.id === booking.id ? { ...b, status: "cancelled" } : b
      ));
      
      toast.success("Reservation cancelled successfully");

      // A cancellation that never reaches the channel keeps the nights closed there and the
      // reservation live: push it out and surface a rate-limit deferral.
      if (booking.source !== "pms") {
        void pushBookingToChannel(booking.id, "cancelled", { reason: "Cancelled in ROL'OS", source: "bookings_list" });
      }
    } catch (error: any) {
      console.error("Error cancelling reservation:", error);
      toast.error(`Failed to cancel: ${error.message}`);
    } finally {
      setCancellingBookingId(null);
    }
  };

  // Cancel individual room (internal only)
  const handleCancelRoom = async (booking: Booking, roomIndex: number, roomName: string) => {
    if (!confirm(`Are you sure you want to cancel room "${roomName}" from this reservation?`)) {
      return;
    }
    
    setCancellingBookingId(`${booking.id}-room-${roomIndex}`);
    try {
      const rooms = booking.rooms && Array.isArray(booking.rooms) ? [...booking.rooms] : [];
      
      if (rooms[roomIndex]) {
        // Mark room as cancelled
        rooms[roomIndex] = { ...rooms[roomIndex], status: "CANCELLED" };
      }
      
      // Check if all rooms are now cancelled
      const allCancelled = rooms.every((r: any) => r.status === "CANCELLED");
      
      if (booking.source === "pms") {
        // Update pms_reservations
        const updateData: any = { rooms };
        if (allCancelled) {
          updateData.status = "CANCELLED";
        }
        
        const { error } = await supabase
          .from("pms_reservations")
          .update(updateData)
          .eq("external_reservation_id", booking.external_reservation_id);
        
        if (error) throw error;
      } else {
        // Update internal bookings
        const updateData: any = { rooms };
        if (allCancelled) {
          updateData.status = "cancelled";
        }
        
        const { error } = await supabase
          .from("bookings")
          .update(updateData)
          .eq("id", booking.id);
        
        if (error) throw error;
      }
      
      // Update local state
      setBookings(prev => prev.map(b => {
        if (b.id !== booking.id) return b;
        return { 
          ...b, 
          rooms, 
          status: allCancelled ? "cancelled" : b.status 
        };
      }));
      
      toast.success(`Room "${roomName}" cancelled`);
    } catch (error: any) {
      console.error("Error cancelling room:", error);
      toast.error(`Failed to cancel room: ${error.message}`);
    } finally {
      setCancellingBookingId(null);
    }
  };

  // Handle modify via edge function
  const handleModifyBooking = async (modifications: Record<string, any>) => {
    if (!modifyModalBooking) return;
    setModifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("modify-booking", {
        body: { booking_id: modifyModalBooking.id, modifications },
      });

      if (error) throw error;
      if (data && !data.success && data.code) throw new Error(data.message || "Modification failed");

      const newPrice = data?.new_total_price;
      const priceMsg = newPrice && newPrice !== modifyModalBooking.total_price
        ? ` — New total: R${Math.round(newPrice).toLocaleString()}`
        : "";

      toast.success(`Booking modified successfully${priceMsg}`);
      setModifyModalBooking(null);

      // Update local state instead of full reload
      setBookings(prev => prev.map(b =>
        b.id === modifyModalBooking.id
          ? {
              ...b,
              ...modifications,
              total_price: newPrice ?? b.total_price,
            }
          : b
      ));
    } catch (error: any) {
      console.error("Error modifying booking:", error);
      toast.error(`Failed to modify: ${error.message}`);
    } finally {
      setModifyLoading(false);
    }
  };

  // Handle cancel via edge function
  const handleCancelViaEdge = async (reason: string) => {
    if (!cancelModalBooking) return;
    setCancelLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-booking", {
        body: { booking_id: cancelModalBooking.id, reason },
      });

      if (error) throw error;
      if (data && !data.success && data.code) throw new Error(data.message || "Cancellation failed");

      toast.success("Booking cancelled successfully");
      setCancelModalBooking(null);
      // Update local state
      setBookings(prev => prev.map(b => 
        b.id === cancelModalBooking.id ? { ...b, status: "cancelled" } : b
      ));
    } catch (error: any) {
      console.error("Error cancelling booking:", error);
      toast.error(`Failed to cancel: ${error.message}`);
    } finally {
      setCancelLoading(false);
    }
  };

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

        query = applyAdminScope(query, "id", scopedPropertyIds);

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
          .order("created_at", { ascending: false });

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
          .order("created_at", { ascending: false });

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

        // Build a property-id → name map. Start with already-loaded (active) properties,
        // then look up any missing IDs so we don't mislabel real properties as deleted.
        const propertyNameMap = new Map<string, string>();
        for (const p of properties) propertyNameMap.set(p.id, p.name);

        const referencedIds = new Set<string>();
        (internalResult.data || []).forEach((b: any) => b.property_id && referencedIds.add(b.property_id));
        (pmsResult.data || []).forEach((b: any) => b.property_id && referencedIds.add(b.property_id));
        const missingIds = Array.from(referencedIds).filter(id => !propertyNameMap.has(id));

        if (missingIds.length > 0) {
          const { data: extraProps } = await supabase
            .from("properties")
            .select("id, name, permanently_deleted_at")
            .in("id", missingIds)
            .is("permanently_deleted_at", null);
          (extraProps || []).forEach((p: any) => propertyNameMap.set(p.id, p.name));
        }

        // Transform internal bookings
        const internalBookings: Booking[] = (internalResult.data || []).map(booking => {
          return {
            ...booking,
            property_name: propertyNameMap.get(booking.property_id) || "(Deleted Property)",
            source: "internal" as const
          };
        });

        // Transform PMS reservations to match Booking interface
        const pmsBookings: Booking[] = (pmsResult.data || []).map(res => {
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
            property_name: propertyNameMap.get(res.property_id) || "(Deleted Property)",
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
            rate_type_name: res.rate_type_name,
            rooms: res.rooms,
            charges: Array.isArray(res.charges) ? res.charges : [],
            special_requests: null,
            voucher: res.reservation_voucher,
            external_reservation_id: res.external_reservation_id,
            created_at: res.created_at,
            payment_status: (res as any).payment_status ?? null,
            source: "pms" as const
          };
        });


        // Combine and deduplicate by external_reservation_id AND itinerary_id
        const seenExternalIds = new Set<string>();
        const seenItineraryPropertyPairs = new Set<string>();
        const allBookings: Booking[] = [];
        
        // Add PMS bookings first (they're the source of truth for external systems)
        pmsBookings.forEach(booking => {
          if (booking.external_reservation_id) {
            seenExternalIds.add(booking.external_reservation_id);
          }
          allBookings.push(booking);
        });
        
        // Add internal bookings that don't have a matching PMS reservation
        // Also deduplicate itinerary bookings - for same itinerary_id + property_id, keep only the paid one
        internalBookings.forEach(booking => {
          // Skip if already seen via external_reservation_id
          if (booking.external_reservation_id && seenExternalIds.has(booking.external_reservation_id)) {
            return;
          }
          
          // Check for duplicate itinerary bookings (same itinerary + property)
          const itineraryId = (booking.ai_metadata as any)?.itinerary_id;
          if (itineraryId && booking.booking_channel === 'rol_itinerary') {
            const pairKey = `${itineraryId}:${booking.property_id}`;
            if (seenItineraryPropertyPairs.has(pairKey)) {
              // Already have a booking for this itinerary+property, skip duplicate
              return;
            }
            seenItineraryPropertyPairs.add(pairKey);
          }
          
          allBookings.push(booking);
        });

        // Sort by booking creation date descending (newest first)
        allBookings.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

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

  // Filter bookings by search term and cancelled toggle
  const filteredBookings = useMemo(() => {
    let result = bookings;
    
    // Filter out cancelled if toggle is off
    if (!showCancelled) {
      result = result.filter(booking => 
        booking.status?.toLowerCase() !== "cancelled"
      );
    }

    // Filter by reference origin / kind (falls back to the booking's channel data
    // for any row whose reference has not been minted yet).
    if (originFilter !== "all") {
      result = result.filter(
        (booking) =>
          bookingOriginCode({
            rol_reference: booking.rol_reference,
            rol_ref_origin: booking.rol_ref_origin,
            integration_type: booking.integration_type,
            booking_channel: booking.booking_channel,
          }) === originFilter,
      );
    }
    if (kindFilter !== "all") {
      result = result.filter((booking) => {
        const origin = bookingOriginCode({
          rol_reference: booking.rol_reference,
          rol_ref_origin: booking.rol_ref_origin,
          integration_type: booking.integration_type,
          booking_channel: booking.booking_channel,
        });
        return (booking.rol_ref_kind || kindForOrigin(origin)) === kindFilter;
      });
    }

    // Filter by search term - searches all visible columns
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(booking => {
        const internalRef = booking.id.slice(0, 8).toLowerCase();
        const checkInDate = format(parseISO(booking.check_in_date), "MMM d, yyyy").toLowerCase();
        const checkOutDate = format(parseISO(booking.check_out_date), "MMM d, yyyy").toLowerCase();
        const bookedDate = booking.created_at 
          ? format(new Date(booking.created_at), "dd MMM HH:mm").toLowerCase() 
          : "";
        const status = booking.status?.toLowerCase() || "";
        const rateType = booking.rate_type_name?.toLowerCase() || "";
        const totalGuests = String(booking.adults + (booking.teens || 0) + (booking.children || 0) + (booking.infants || 0));
        const totalPrice = String(booking.total_price);
        // Journey/Itinerary reference from ai_metadata
        const itineraryRef = (booking.ai_metadata as any)?.itinerary_id?.substring(0, 8)?.toLowerCase() || "";
        
        return (
          matchesReferenceSearch([booking.rol_reference, booking.rol_reference_legacy], term) ||
          booking.guest_name.toLowerCase().includes(term) ||
          booking.guest_email.toLowerCase().includes(term) ||
          booking.property_name?.toLowerCase().includes(term) ||
          booking.external_reservation_id?.toLowerCase().includes(term) ||
          internalRef.startsWith(term) ||

          itineraryRef.startsWith(term) ||
          checkInDate.includes(term) ||
          checkOutDate.includes(term) ||
          bookedDate.includes(term) ||
          status.includes(term) ||
          rateType.includes(term) ||
          totalGuests.includes(term) ||
          totalPrice.includes(term)
        );
      });
    }
    
    return result;
  }, [bookings, searchTerm, showCancelled]);

  // Stats — only count paid bookings. Pending checkouts are excluded from all totals.
  const stats = useMemo(() => {
    const normalizeStatus = (s: string) => s?.toLowerCase() || "";

    // Apply only search filter for stats (not the cancelled toggle)
    let statsBookings = bookings;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      statsBookings = bookings.filter(booking =>
        booking.guest_name.toLowerCase().includes(term) ||
        booking.guest_email.toLowerCase().includes(term) ||
        booking.property_name?.toLowerCase().includes(term) ||
        booking.external_reservation_id?.toLowerCase().includes(term)
      );
    }

    const CONFIRMED_STATUSES = ["confirmed", "guaranteed", "checked-in", "checked_in"];
    const isPaid = (b: Booking) => {
      const status = normalizeStatus(b.status);
      if (status === "cancelled") return false;
      // Shared revenue definition — includes channel-collected funds (paid_externally).
      if (isRevenuePaymentStatus(b.payment_status)) return true;
      // PMS reservations don't expose payment_status but reach confirmed/guaranteed/checked-in only after payment.
      if (b.source === "pms" && CONFIRMED_STATUSES.includes(status)) return true;
      return false;
    };

    const paid = statsBookings.filter(isPaid);
    const total = paid.length;
    const confirmed = paid.filter(b => CONFIRMED_STATUSES.includes(normalizeStatus(b.status))).length;
    const cancelled = statsBookings.filter(b => normalizeStatus(b.status) === "cancelled").length;
    const totalRevenue = paid.reduce((sum, b) => sum + Number(b.total_price), 0);

    return { total, confirmed, cancelled, totalRevenue };
  }, [bookings, searchTerm]);


  const getStatusIndicator = (status: string) => {
    const normalized = status?.toLowerCase() || "";
    if (["confirmed", "guaranteed", "checked-in"].includes(normalized)) {
      return <StatusIndicator status="healthy" label={status} size="sm" />;
    }
    if (["pending", "provisional"].includes(normalized)) {
      return <StatusIndicator status="warning" label={status} size="sm" />;
    }
    if (normalized === "cancelled") {
      return <StatusIndicator status="error" label="Cancelled" size="sm" />;
    }
    return <StatusIndicator status="stale" label={status} size="sm" />;
  };

  // Map booking status to lifecycle state
  const mapStatusToState = (status: string): BookingState => {
    const normalized = status?.toLowerCase() || "";
    if (normalized === "cancelled") return "cancelled";
    if (normalized === "checked-in") return "checked_in";
    if (["confirmed", "guaranteed"].includes(normalized)) return "confirmed";
    if (normalized === "completed" || normalized === "checked-out") return "completed";
    return "pending";
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

      // Unwrap adapter response per contract
      const responseData = data?.data || data;
      const reservations = responseData?.reservations || [];
      const count = Array.isArray(reservations) ? reservations.length : 0;
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
    <AppLayout>
      <PageHeader
        title="Bookings"
        subtitle="Manage reservations"
        actions={
          canSyncBenson && (
            <Button 
              onClick={syncBensonBookings} 
              disabled={syncingBookings}
              variant="outline"
              size="sm"
            >
              {syncingBookings ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CloudDownload className="h-3 w-3 mr-1" />
              )}
              Sync Benson
            </Button>
          )
        }
      />

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <Card>
            <CardContent className="p-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3 w-3 text-primary" />
                <div className="flex items-baseline gap-1">
                  <p className="text-lg font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Paid</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3 w-3 text-green-600" />
                <div className="flex items-baseline gap-1">
                  <p className="text-lg font-bold">{stats.confirmed}</p>
                  <p className="text-xs text-muted-foreground">Confirmed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3 w-3 text-red-600" />
                <div className="flex items-baseline gap-1">
                  <p className="text-lg font-bold">{stats.cancelled}</p>
                  <p className="text-xs text-muted-foreground">Cancelled</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-3 w-3 text-primary" />
                <div className="flex items-baseline gap-1">
                  <p className="text-lg font-bold">R{stats.totalRevenue.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Imported stays frequently sit outside the default forward window — say so instead of "no bookings". */}
        {!loading && bookingCoverage && bookingCoverage.total > 0 && (bookingCoverage.earliest ?? "") < dateFrom && (
          <Card className="mb-3 border-primary/40">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <p className="text-xs text-muted-foreground">
                This property has <span className="font-semibold text-foreground">{bookingCoverage.total}</span>{" "}
                bookings on record, with stays from{" "}
                <span className="font-semibold text-foreground">{bookingCoverage.earliest}</span> to{" "}
                <span className="font-semibold text-foreground">{bookingCoverage.latest}</span>. Some fall outside the
                selected window.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setDateFrom(bookingCoverage.earliest ?? "2015-01-01");
                  setDateTo(bookingCoverage.latest ?? format(addDays(new Date(), 730), "yyyy-MM-dd"));
                }}
              >
                Show all imported stays
              </Button>
            </CardContent>
          </Card>
        )}


        {/* Filters */}
        <Card className="mb-3">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-end gap-3">
              {/* Property Filter */}
              <div className="space-y-1">
                <Label className="text-xs">Property</Label>
                <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
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

              {/* Period presets — imported history often predates the default forward window. */}
              <div className="space-y-1">
                <Label className="text-xs">Period</Label>
                <Select
                  value="custom"
                  onValueChange={(preset) => {
                    const forward = format(addDays(new Date(), 60), "yyyy-MM-dd");
                    if (preset === "default") {
                      setDateFrom(format(subDays(new Date(), 30), "yyyy-MM-dd"));
                      setDateTo(forward);
                    } else if (preset === "last_3_months") {
                      setDateFrom(format(subDays(new Date(), 90), "yyyy-MM-dd"));
                      setDateTo(forward);
                    } else if (preset === "last_12_months") {
                      setDateFrom(format(subDays(new Date(), 365), "yyyy-MM-dd"));
                      setDateTo(forward);
                    } else if (preset === "all_time") {
                      setDateFrom("2015-01-01");
                      setDateTo(format(addDays(new Date(), 730), "yyyy-MM-dd"));
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue placeholder="Choose period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default window</SelectItem>
                    <SelectItem value="last_3_months">Last 3 months</SelectItem>
                    <SelectItem value="last_12_months">Last 12 months</SelectItem>
                    <SelectItem value="all_time">All time (incl. imports)</SelectItem>
                  </SelectContent>
                </Select>
              </div>


              {/* Date From */}
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
              </div>

              {/* Date To */}
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 w-[130px] text-xs"
                />
              </div>

              {/* Status Filter */}
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Origin Filter — driven by the ROL reference origin code */}
              <div className="space-y-1">
                <Label className="text-xs">Origin</Label>
                <Select value={originFilter} onValueChange={setOriginFilter}>
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue placeholder="All origins" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All origins</SelectItem>
                    {ROL_ORIGIN_FILTER_OPTIONS.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code} · {ROL_ORIGIN_LABELS[code]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Kind Filter — bookings made in-ecosystem vs reservations received */}
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="B">Bookings (B)</SelectItem>
                    <SelectItem value="R">Reservations (R)</SelectItem>
                  </SelectContent>
                </Select>
              </div>


              {/* Search */}
              <div className="space-y-1 flex-1 min-w-[150px]">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Guest, email, ROL-WEB-B-… ref"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2">
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bookings Table */}
        <Card>
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">Reservations</CardTitle>
                <span className="text-xs text-muted-foreground">
                  ({filteredBookings.length}{!showCancelled && stats.cancelled > 0 && `, ${stats.cancelled} hidden`})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="show-cancelled" className="text-xs text-muted-foreground cursor-pointer">
                  Show cancelled
                </Label>
                <Switch
                  id="show-cancelled"
                  checked={showCancelled}
                  onCheckedChange={setShowCancelled}
                  className="scale-75"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
                ))}
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                No bookings found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="py-1.5 px-2 text-xs">Property</TableHead>
                      <TableHead className="py-1.5 px-2 text-xs">Guest</TableHead>
                      <TableHead className="py-1.5 px-2 text-xs">In</TableHead>
                      <TableHead className="py-1.5 px-2 text-xs">Out</TableHead>
                      <TableHead className="py-1.5 px-2 text-xs">Pax</TableHead>
                      <TableHead className="py-1.5 px-2 text-xs">Rate</TableHead>
                      <TableHead className="py-1.5 px-2 text-xs">Total</TableHead>
                      <TableHead className="py-1.5 px-2 text-xs">Status</TableHead>
                      <TableHead className="py-1.5 px-2 text-xs">Booked</TableHead>
                      <TableHead className="py-1.5 px-2 text-xs">Ref</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookings.map((booking) => {
                      const rooms = booking.rooms && Array.isArray(booking.rooms) ? booking.rooms : [];
                      const hasMultipleRooms = rooms.length > 1;
                      const hasRooms = rooms.length > 0;
                      const isExpanded = expandedBookingId === booking.id;
                      
                      return (
                        <React.Fragment key={booking.id}>
                          <TableRow 
                            key={booking.id} 
                            className="cursor-pointer hover:bg-muted/50 text-xs"
                            onClick={() => setExpandedBookingId(isExpanded ? null : booking.id)}
                          >
                            <TableCell className="py-1.5 px-2 font-medium">
                              <div className="flex items-center gap-1">
                                <Plus className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-45" : ""}`} />
                                <span className="truncate max-w-[200px]">{booking.property_name}</span>
                                {hasMultipleRooms && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    {rooms.length}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5 px-2">
                              <p className="font-medium truncate max-w-[180px]">{booking.guest_name}</p>
                            </TableCell>
                            <TableCell className="py-1.5 px-2">
                              {format(parseISO(booking.check_in_date), "dd MMM")}
                            </TableCell>
                            <TableCell className="py-1.5 px-2">
                              {format(parseISO(booking.check_out_date), "dd MMM")}
                            </TableCell>
                            <TableCell className="py-1.5 px-2">
                              {getTotalGuests(booking)}
                            </TableCell>
                            <TableCell className="py-1.5 px-2 truncate max-w-[80px]">
                              {booking.rate_type_name || "—"}
                            </TableCell>
                            <TableCell className="py-1.5 px-2 font-medium">
                              R{Number(booking.total_price).toLocaleString()}
                            </TableCell>
                            <TableCell className="py-1.5 px-2">
                              {getStatusIndicator(booking.status)}
                            </TableCell>
                            <TableCell className="py-1.5 px-2 text-muted-foreground text-xs whitespace-nowrap">
                              {booking.created_at 
                                ? format(parseISO(booking.created_at), "dd MMM HH:mm")
                                : "—"}
                            </TableCell>
                            <TableCell className="py-1.5 px-2 text-muted-foreground max-w-[170px]">
                              <span className="flex items-center gap-1">
                                {booking.booking_channel === 'rentals_united' && (
                                  <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1 py-0 font-bold shrink-0">RU</Badge>
                                )}
                                {booking.integration_type === 'nightsbridge' && (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 border-border text-[10px] px-1 py-0 text-muted-foreground"
                                    title="Imported from a NightsBridge export — no ROL commission applies"
                                  >
                                    Imported · NB
                                  </Badge>
                                )}

                                {(booking.ai_metadata as any)?.itinerary_id && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 bg-primary/10 text-primary border-primary/30">J</Badge>
                                )}
                                <span className="flex flex-col leading-tight min-w-0">
                                  <span
                                    className="font-mono text-[11px] text-foreground truncate"
                                    title={describeRolReference(booking.rol_reference, booking) || undefined}
                                  >
                                    {displayBookingReference(booking)}
                                  </span>
                                  {booking.external_reservation_id &&
                                    booking.external_reservation_id !== displayBookingReference(booking) && (
                                      <span className="font-mono text-[10px] truncate">
                                        {booking.external_reservation_id}
                                      </span>
                                    )}
                                </span>
                              </span>
                            </TableCell>

                          </TableRow>
                          {/* Expanded room details */}
                          {isExpanded && (
                            <TableRow key={`${booking.id}-details`} className="bg-muted/30">
                              <TableCell colSpan={10} className="p-2">
                                <div className="space-y-3">
                                  {/* Booking Lifecycle Visualizer */}
                                  <div className="flex items-center justify-between border-b pb-2">
                                    <BookingLifecycleVisualizer 
                                      currentState={mapStatusToState(booking.status)}
                                      timestamps={{
                                        pending: booking.created_at || undefined,
                                        confirmed: ["confirmed", "guaranteed"].includes(booking.status?.toLowerCase()) ? booking.created_at || undefined : undefined,
                                        checked_in: booking.status?.toLowerCase() === "checked-in" ? undefined : undefined,
                                      }}
                                    />
                                    {booking.status !== "cancelled" && (() => {
                                      const bookingProperty = properties.find(p => p.id === booking.property_id);
                                      const isBensonProperty = bookingProperty?.external_system === "benson";
                                      return (
                                        <div className="flex items-center gap-1">
                                          {!isBensonProperty && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-6 text-xs px-2"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setModifyModalBooking(booking);
                                              }}
                                            >
                                              <Pencil className="h-3 w-3 mr-1" />
                                              Modify
                                            </Button>
                                          )}
                                          <Button
                                            variant="destructive"
                                            size="sm"
                                            className="h-6 text-xs px-2"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCancelModalBooking(booking);
                                            }}
                                          >
                                            <XCircle className="h-3 w-3 mr-1" />
                                            Cancel All
                                          </Button>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  
                                  <p className="text-xs font-medium text-muted-foreground">Room Details</p>
                                  <div className="grid gap-2">
                                    {rooms.map((room: any, index: number) => {
                                      const roomDates = {
                                        checkIn: room.arrivalDate || booking.check_in_date,
                                        checkOut: room.departureDate || booking.check_out_date,
                                      };
                                      const nights = room.arrivalDate && room.departureDate
                                        ? Math.ceil((new Date(room.departureDate).getTime() - new Date(room.arrivalDate).getTime()) / (1000 * 60 * 60 * 24))
                                        : Math.ceil((new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / (1000 * 60 * 60 * 24));
                                      
                                      // Get charges for this room from booking.charges (Benson stored data)
                                      const bookingCharges = booking.charges || [];
                                      // Match by roomName - convert both to string for comparison
                                      const roomCharges = bookingCharges.filter((charge: any) => 
                                        String(charge.roomName).trim() === String(room.roomName).trim()
                                      );
                                      const roomTotal = roomCharges.reduce((sum: number, charge: any) => 
                                        sum + (Number(charge.amount) || 0), 0
                                      ) || room.totalAmount || room.roomTotal || 0;
                                      const hasCharges = roomCharges.length > 0;
                                      const isRoomCancelled = room.status === "CANCELLED" || room.status === "cancelled";
                                      const roomDisplayName = room.roomTypeName || room.roomName || `Room ${index + 1}`;
                                      
                                      return (
                                        <div key={index} className={`p-2 bg-background rounded border text-xs ${isRoomCancelled ? "opacity-50 border-destructive" : ""}`}>
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                              <Bed className="h-3 w-3 text-muted-foreground" />
                                              <span className="font-medium">{roomDisplayName}</span>
                                              {isRoomCancelled && (
                                                <Badge variant="destructive" className="text-[10px] px-1 py-0">Cancelled</Badge>
                                              )}
                                              <span className="text-muted-foreground">
                                                {format(parseISO(roomDates.checkIn), "dd MMM")} → {format(parseISO(roomDates.checkOut), "dd MMM")} ({nights}n)
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-muted-foreground">
                                                {room.numberOfAdults || 0}A
                                                {(room.numberOfTeens || 0) > 0 && `/${room.numberOfTeens}T`}
                                                {(room.numberOfChildren || 0) > 0 && `/${room.numberOfChildren}C`}
                                              </span>
                                              <span className="font-bold">R{Number(roomTotal).toLocaleString()}</span>
                                              {/* Cancel room button */}
                                              {!isRoomCancelled && booking.status !== "cancelled" && rooms.length > 1 && (
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-5 w-5 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleCancelRoom(booking, index, roomDisplayName);
                                                  }}
                                                  disabled={cancellingBookingId === `${booking.id}-room-${index}`}
                                                >
                                                  {cancellingBookingId === `${booking.id}-room-${index}` ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <XCircle className="h-3 w-3" />
                                                  )}
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
        </CardContent>
      </Card>
      {/* Modify Booking Modal */}
      {modifyModalBooking && (
        <ModifyBookingModal
          open={!!modifyModalBooking}
          onOpenChange={(open) => !open && setModifyModalBooking(null)}
          booking={modifyModalBooking}
          onSubmit={handleModifyBooking}
          loading={modifyLoading}
        />
      )}

      {/* Cancel Booking Modal */}
      {cancelModalBooking && (
        <CancelBookingModal
          open={!!cancelModalBooking}
          onOpenChange={(open) => !open && setCancelModalBooking(null)}
          booking={cancelModalBooking}
          onSubmit={handleCancelViaEdge}
          loading={cancelLoading}
          externalSystem={properties.find(p => p.id === cancelModalBooking.property_id)?.external_system}
        />
      )}
    </AppLayout>
  );
};

export default Bookings;
