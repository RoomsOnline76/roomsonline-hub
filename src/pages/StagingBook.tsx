import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Building2, Users, Bed, CalendarDays, Minus, Plus, 
  MapPin, Star, Check, AlertCircle, ChevronRight
} from "lucide-react";
import { format, addDays, differenceInDays, parseISO, isAfter, isBefore, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";

// Staging property ID - Main Staging Hotel
const STAGING_PROPERTY_ID = "ebd295c3-1846-4a13-af14-d14df7e4afdc";

interface RoomAvailability {
  roomTypeId: string;
  roomTypeName: string;
  availableUnits: number;
  rates: RoomRate[];
}

interface RoomRate {
  rateTypeId: string;
  rateTypeName: string;
  priceType: 'PER ROOM' | 'PER PERSON';
  roomAmount?: number;
  adultAmounts?: {
    adultAmount1?: number;
    adultAmount2?: number;
    adultAmount3?: number;
    adultAmount4?: number;
  };
  childAmount?: number;
  teenAmount?: number;
  infantAmount?: number;
}

const StagingBook = () => {
  const navigate = useNavigate();
  const today = startOfDay(new Date());
  
  // State
  const [checkInDate, setCheckInDate] = useState<Date | undefined>(addDays(today, 1));
  const [checkOutDate, setCheckOutDate] = useState<Date | undefined>(addDays(today, 3));
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string | null>(null);
  const [selectedRateTypeId, setSelectedRateTypeId] = useState<string>("");
  const [adults, setAdults] = useState(2);
  const [teens, setTeens] = useState(0);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);

  // Fetch property
  const { data: property, isLoading: propertyLoading } = useQuery({
    queryKey: ["staging-property", STAGING_PROPERTY_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_properties")
        .select("*")
        .eq("id", STAGING_PROPERTY_ID)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch availability data for date range
  const { data: availabilityData, isLoading: availabilityLoading } = useQuery({
    queryKey: ["staging-availability", STAGING_PROPERTY_ID, checkInDate, checkOutDate],
    queryFn: async () => {
      if (!checkInDate || !checkOutDate) return [];
      
      const { data, error } = await supabase
        .from("pms_availability_cache")
        .select("*")
        .eq("property_id", STAGING_PROPERTY_ID)
        .gte("date", format(checkInDate, "yyyy-MM-dd"))
        .lt("date", format(checkOutDate, "yyyy-MM-dd"))
        .order("date");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!checkInDate && !!checkOutDate,
  });

  // Process availability to get unique rooms with rates
  const roomsWithAvailability = useMemo(() => {
    if (!availabilityData || availabilityData.length === 0) return [];
    
    const roomMap = new Map<string, RoomAvailability>();
    
    availabilityData.forEach((record: any) => {
      const roomTypeId = record.external_room_type_id;
      const roomTypeName = record.raw_data?.roomTypeName || `Room ${roomTypeId}`;
      
      if (!roomMap.has(roomTypeId)) {
        roomMap.set(roomTypeId, {
          roomTypeId,
          roomTypeName,
          availableUnits: record.available_units || 0,
          rates: [],
        });
      }
      
      const room = roomMap.get(roomTypeId)!;
      
      // Update availability (minimum across all dates)
      room.availableUnits = Math.min(room.availableUnits, record.available_units || 0);
      
      // Process rates
      const rates = Array.isArray(record.rates) ? record.rates : [record.rates];
      rates.forEach((rate: any) => {
        if (!rate || !rate.rate_type_id) return;
        
        // Check if rate already exists
        const existingRate = room.rates.find(r => r.rateTypeId === String(rate.rate_type_id));
        if (!existingRate) {
          room.rates.push({
            rateTypeId: String(rate.rate_type_id),
            rateTypeName: rate.rate_type_name || `Rate ${rate.rate_type_id}`,
            priceType: rate.price_type || 'PER ROOM',
            roomAmount: rate.room_amount,
            adultAmounts: rate.adult_amounts,
            childAmount: rate.child_amount,
            teenAmount: rate.teen_amount,
            infantAmount: rate.infant_amount,
          });
        }
      });
    });
    
    return Array.from(roomMap.values()).filter(r => r.rates.length > 0);
  }, [availabilityData]);

  // Selected room details
  const selectedRoom = useMemo(() => {
    return roomsWithAvailability.find(r => r.roomTypeId === selectedRoomTypeId) || null;
  }, [roomsWithAvailability, selectedRoomTypeId]);

  // Available rate types for selected room
  const availableRateTypes = useMemo(() => {
    if (!selectedRoom) return [];
    return selectedRoom.rates.filter(r => r.roomAmount || r.adultAmounts);
  }, [selectedRoom]);

  // Selected rate
  const selectedRate = useMemo(() => {
    return availableRateTypes.find(r => r.rateTypeId === selectedRateTypeId) || null;
  }, [availableRateTypes, selectedRateTypeId]);

  // Reset rate selection when room changes
  useEffect(() => {
    if (availableRateTypes.length > 0 && !availableRateTypes.find(r => r.rateTypeId === selectedRateTypeId)) {
      setSelectedRateTypeId(availableRateTypes[0].rateTypeId);
    }
  }, [availableRateTypes, selectedRateTypeId]);

  // Calculate total cost
  const totalCost = useMemo(() => {
    if (!selectedRate || !checkInDate || !checkOutDate) return null;
    
    const nights = differenceInDays(checkOutDate, checkInDate);
    if (nights <= 0) return null;
    
    let nightlyRate = 0;
    
    if (selectedRate.priceType === 'PER ROOM') {
      nightlyRate = selectedRate.roomAmount || 0;
    } else {
      // PER PERSON pricing
      const adultKey = `adultAmount${Math.min(adults, 4)}` as keyof typeof selectedRate.adultAmounts;
      const adultRate = selectedRate.adultAmounts?.[adultKey] || 0;
      const teenRate = (selectedRate.teenAmount || 0) * teens;
      const childRate = (selectedRate.childAmount || 0) * children;
      const infantRate = (selectedRate.infantAmount || 0) * infants;
      nightlyRate = adultRate + teenRate + childRate + infantRate;
    }
    
    return nightlyRate * nights;
  }, [selectedRate, adults, teens, children, infants, checkInDate, checkOutDate]);

  const nights = checkInDate && checkOutDate ? differenceInDays(checkOutDate, checkInDate) : 0;

  // Handle booking
  const handleBookRoom = () => {
    if (!selectedRoom || !selectedRateTypeId || !checkInDate || !checkOutDate) return;
    
    const params = new URLSearchParams({
      checkIn: format(checkInDate, "yyyy-MM-dd"),
      checkOut: format(checkOutDate, "yyyy-MM-dd"),
      guests: String(adults + teens + children + infants),
      roomTypeId: selectedRoom.roomTypeId,
      roomTypeName: selectedRoom.roomTypeName,
      rateTypeId: selectedRateTypeId,
      rateTypeName: selectedRate?.rateTypeName || '',
      adults: String(adults),
      teens: String(teens),
      children: String(children),
      infants: String(infants),
    });
    
    // Add total cost if available
    if (totalCost !== null) {
      params.set('totalCost', String(totalCost));
    }
    
    navigate(`/booking/${property?.slug || STAGING_PROPERTY_ID}?${params.toString()}`);
  };

  if (propertyLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-64 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Bed className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg">RoomsOnline</h1>
              <p className="text-xs text-muted-foreground">Staging Environment</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Property Hero */}
        <div className="mb-8">
          <div className="relative rounded-xl overflow-hidden h-64 md:h-80 bg-muted">
            {property?.images && Array.isArray(property.images) && property.images.length > 0 ? (
              <img 
                src={property.images[0] as string} 
                alt={property?.name || ''} 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 className="h-16 w-16 text-muted-foreground/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <Badge variant="secondary" className="mb-2">Staging Property</Badge>
              <h1 className="text-3xl font-bold text-white mb-2">{property?.name}</h1>
              <div className="flex items-center gap-4 text-white/80 text-sm">
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {property?.city}, {property?.country}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Date Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Select Your Dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Check-in</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarDays className="h-4 w-4 mr-2" />
                      {checkInDate ? format(checkInDate, "MMM d, yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={checkInDate}
                      onSelect={(date) => {
                        setCheckInDate(date);
                        if (date && checkOutDate && !isAfter(checkOutDate, date)) {
                          setCheckOutDate(addDays(date, 1));
                        }
                      }}
                      disabled={(date) => isBefore(date, today)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Check-out</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarDays className="h-4 w-4 mr-2" />
                      {checkOutDate ? format(checkOutDate, "MMM d, yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={checkOutDate}
                      onSelect={setCheckOutDate}
                      disabled={(date) => !checkInDate || isBefore(date, addDays(checkInDate, 1))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {nights > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                {nights} night{nights !== 1 ? 's' : ''} selected
              </p>
            )}
          </CardContent>
        </Card>

        {/* Available Rooms */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bed className="h-5 w-5" />
              Available Rooms
            </CardTitle>
            <CardDescription>
              Select a room to view rates and book
            </CardDescription>
          </CardHeader>
          <CardContent>
            {availabilityLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : roomsWithAvailability.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No rooms available for selected dates</p>
              </div>
            ) : (
              <div className="space-y-3">
                {roomsWithAvailability.map((room) => (
                  <div
                    key={room.roomTypeId}
                    onClick={() => setSelectedRoomTypeId(room.roomTypeId)}
                    className={cn(
                      "border rounded-lg p-4 cursor-pointer transition-all",
                      selectedRoomTypeId === room.roomTypeId
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{room.roomTypeName}</h3>
                          {selectedRoomTypeId === room.roomTypeId && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Bed className="h-3 w-3" />
                            {room.availableUnits} available
                          </span>
                          <span className="flex items-center gap-1">
                            {room.rates.length} rate type{room.rates.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className={cn(
                        "h-5 w-5 text-muted-foreground transition-transform",
                        selectedRoomTypeId === room.roomTypeId && "rotate-90"
                      )} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Room Booking Details (when room selected) */}
        {selectedRoom && (
          <Card>
            <CardHeader>
              <CardTitle>Book: {selectedRoom.roomTypeName}</CardTitle>
              <CardDescription>
                Configure your stay and see the total cost
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Rate Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Rate Type</label>
                {availableRateTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rates available for this room</p>
                ) : (
                  <Select value={selectedRateTypeId} onValueChange={setSelectedRateTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select rate type" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRateTypes.map((rate) => (
                        <SelectItem key={rate.rateTypeId} value={rate.rateTypeId}>
                          <div className="flex items-center gap-2">
                            <span>{rate.rateTypeName}</span>
                            <Badge variant="outline" className="text-xs">
                              {rate.priceType}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Guest Counts */}
              <div className="space-y-4">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Guests
                </label>
                
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Adults */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Adults</p>
                      <p className="text-xs text-muted-foreground">Age 18+</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setAdults(Math.max(1, adults - 1))}
                        disabled={adults <= 1}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">{adults}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setAdults(Math.min(4, adults + 1))}
                        disabled={adults >= 4}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Teens */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Teens</p>
                      <p className="text-xs text-muted-foreground">Age 13-17</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setTeens(Math.max(0, teens - 1))}
                        disabled={teens <= 0}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">{teens}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setTeens(teens + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Children */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Children</p>
                      <p className="text-xs text-muted-foreground">Age 3-12</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setChildren(Math.max(0, children - 1))}
                        disabled={children <= 0}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">{children}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setChildren(children + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Infants */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Infants</p>
                      <p className="text-xs text-muted-foreground">Under 3</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setInfants(Math.max(0, infants - 1))}
                        disabled={infants <= 0}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">{infants}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setInfants(infants + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost Summary */}
              {selectedRate && (
                <div className="border-t pt-4">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rate Type</span>
                      <span>{selectedRate.rateTypeName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pricing</span>
                      <span>{selectedRate.priceType}</span>
                    </div>
                    {selectedRate.priceType === 'PER PERSON' && (
                      <>
                        {selectedRate.adultAmounts && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Adult rate ({adults} pax)</span>
                            <span>R {selectedRate.adultAmounts[`adultAmount${Math.min(adults, 4)}` as keyof typeof selectedRate.adultAmounts] || 0}</span>
                          </div>
                        )}
                        {teens > 0 && selectedRate.teenAmount && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Teen rate × {teens}</span>
                            <span>R {selectedRate.teenAmount * teens}</span>
                          </div>
                        )}
                        {children > 0 && selectedRate.childAmount && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Child rate × {children}</span>
                            <span>R {selectedRate.childAmount * children}</span>
                          </div>
                        )}
                        {infants > 0 && selectedRate.infantAmount && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Infant rate × {infants}</span>
                            <span>R {selectedRate.infantAmount * infants}</span>
                          </div>
                        )}
                      </>
                    )}
                    {selectedRate.priceType === 'PER ROOM' && selectedRate.roomAmount && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Room rate per night</span>
                        <span>R {selectedRate.roomAmount}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Nights</span>
                      <span>× {nights}</span>
                    </div>
                    <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                      <span>Total</span>
                      <span className="text-lg text-primary">
                        {totalCost !== null ? `R ${totalCost.toLocaleString()}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Book Button */}
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleBookRoom}
                disabled={!selectedRateTypeId || !totalCost || totalCost === 0}
              >
                Continue to Booking
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} RoomsOnline Staging Environment
          </p>
        </div>
      </footer>
    </div>
  );
};

export default StagingBook;
