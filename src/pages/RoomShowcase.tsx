import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getPropertyUrl, getNightsBridgeBookingUrl } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  Bed, 
  Bath, 
  Users, 
  Maximize, 
  ChevronLeft, 
  ChevronRight,
  ArrowLeft,
  Check,
  Calendar,
  Baby,
  UserRound,
  Moon,
  Wifi,
  Tv,
  Wind,
  Coffee,
  UtensilsCrossed,
  Sparkles,
  ShowerHead,
  Sofa,
  Mountain,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RoomType {
  id: string;
  name: string;
  url?: string;
  description?: string;
  numRooms?: number;
  bedConfiguration?: string;
  roomSize?: number;
  bathrooms?: number;
  maxPeople?: number;
  maxAdults?: number;
  maxChildren?: number;
  minStay?: number;
  maxStay?: number;
  rateType?: string;
  splitPercent?: number;
  images?: string[];
  facilities?: string[];
  amenities?: string[];
  extraPersonPolicy?: string;
  pmsRoomType?: string;
  pmsRoomId?: string;
  mealTypes?: string[];
}

interface Property {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  country: string;
  amenities: any;
  external_system: string | null;
  external_id: string | null;
}

interface RateData {
  room_type: string;
  rate_type: string;
  meal_type: string | null;
  amount: number;
  currency: string;
}

interface AvailabilityData {
  available_units: number;
  date: string;
}

const facilityIcons: Record<string, any> = {
  wifi: Wifi,
  "air conditioning": Wind,
  aircon: Wind,
  tv: Tv,
  television: Tv,
  coffee: Coffee,
  "coffee maker": Coffee,
  minibar: UtensilsCrossed,
  bathroom: ShowerHead,
  "en-suite": ShowerHead,
  "living area": Sofa,
  balcony: Mountain,
  view: Mountain,
};

const bedConfigLabels: Record<string, string> = {
  "king-twin": "King / Twin Configuration",
  king: "King Size Bed",
  twin: "Twin Beds",
  queen: "Queen Size Bed",
  double: "Double Bed",
  single: "Single Bed",
};

export default function RoomShowcase() {
  const navigate = useNavigate();
  const { propertySlug, roomSlug } = useParams<{ propertySlug: string; roomSlug: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [room, setRoom] = useState<RoomType | null>(null);
  const [rates, setRates] = useState<RateData[]>([]);
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);
  const [nightsBridgeAgentCode, setNightsBridgeAgentCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Helper to create slug from room name
  const slugifyRoomName = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  useEffect(() => {
    if (propertySlug && roomSlug) {
      fetchData();
    }
  }, [propertySlug, roomSlug]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Check if propertySlug is a UUID or slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertySlug || "");
      
      // Use public view for unauthenticated access
      let query = supabase.from("public_properties").select("*");
      
      if (isUuid) {
        query = query.eq("id", propertySlug);
      } else {
        query = query.eq("slug", propertySlug);
      }
      
      const { data: propertyData, error: propertyError } = await query.single();

      if (propertyError) throw propertyError;
      
      setProperty(propertyData);

      // Find the room type by matching slugified name
      const amenitiesData = propertyData.amenities as any;
      const roomTypes = amenitiesData?.room_types || [];
      const foundRoom = roomTypes.find((r: RoomType) => 
        slugifyRoomName(r.name) === roomSlug || r.id === roomSlug
      );
      
      if (foundRoom) {
        setRoom(foundRoom);
        
        // Fetch rates for this room
        const { data: ratesData } = await supabase
          .from("property_rates")
          .select("room_type, rate_type, meal_type, amount, currency")
          .eq("property_id", propertyData.id)
          .eq("room_type", foundRoom.name)
          .order("rate_type");

        if (ratesData) {
          setRates(ratesData);
        }

        // Fetch availability for today to get available units
        const roomId = foundRoom.pmsRoomId || foundRoom.id;
        const today = new Date().toISOString().split('T')[0];
        
        const { data: availData } = await supabase
          .from("pms_availability_cache")
          .select("available_units, date")
          .eq("property_id", propertyData.id)
          .eq("external_room_type_id", roomId)
          .gte("date", today)
          .order("date", { ascending: true })
          .limit(1);

        if (availData && availData.length > 0) {
          setAvailableUnits(availData[0].available_units);
        }
      }

      // Fetch NightsBridge agent code if this is a NightsBridge property
      if (propertyData.external_system === "nightsbridge") {
        const { data: nbCredentials } = await supabase
          .from("pms_credentials")
          .select("agent_code")
          .eq("system_type", "nightsbridge")
          .maybeSingle();
        
        if (nbCredentials?.agent_code) {
          setNightsBridgeAgentCode(nbCredentials.agent_code);
        }
      }
    } catch (error) {
      console.error("Error fetching room:", error);
    } finally {
      setLoading(false);
    }
  };

  const nextImage = () => {
    if (room?.images?.length) {
      setCurrentImageIndex((prev) => 
        prev === (room.images?.length || 1) - 1 ? 0 : prev + 1
      );
    }
  };

  const prevImage = () => {
    if (room?.images?.length) {
      setCurrentImageIndex((prev) => 
        prev === 0 ? (room.images?.length || 1) - 1 : prev - 1
      );
    }
  };

  // Check if this is a NightsBridge property
  const isNightsBridgeProperty = property?.external_system === "nightsbridge";
  
  // Get NightsBridge BBID from property
  const getNightsBridgeBBID = (): string | null => {
    if (!property) return null;
    // Check external_id first (primary location when external_system is nightsbridge)
    if (property.external_id) return property.external_id;
    // Fallback to amenities.external_ids.nightsbridge_bb_id
    return property.amenities?.external_ids?.nightsbridge_bb_id || null;
  };

  const handleCheckAvailability = () => {
    // For NightsBridge properties, redirect to NightsBridge booking
    if (isNightsBridgeProperty) {
      const bbid = getNightsBridgeBBID();
      if (bbid && nightsBridgeAgentCode) {
        const bookingUrl = getNightsBridgeBookingUrl(bbid, nightsBridgeAgentCode);
        window.open(bookingUrl, '_blank');
        return;
      }
    }
    // Default: navigate to availability calendar
    if (property && room) {
      const roomSlugName = slugifyRoomName(room.name);
      navigate(`/property/${property.slug || property.id}/room/${roomSlugName}/availability`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-[50vh] bg-muted animate-pulse" />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-10 w-1/3 mb-4" />
          <Skeleton className="h-6 w-1/4 mb-8" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!property || !room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Bed className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h1 className="text-2xl font-bold mb-4">Room Not Found</h1>
          <p className="text-muted-foreground mb-6">The room you're looking for doesn't exist.</p>
          <Link to="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const images = room.images || [];
  const facilities = room.facilities || [];
  const amenities = room.amenities || [];
  const lowestRate = rates.length > 0 ? Math.min(...rates.map(r => r.amount)) : null;
  
  // Get room-specific meal types, not property-wide
  const roomMealTypes = room.mealTypes || [];

  // Build occupancy display string - clarify whether it's adults AND children or adults OR children
  const buildOccupancyString = () => {
    const maxPeople = room.maxPeople || 2;
    
    // If both maxAdults and maxChildren are defined and non-zero
    if (room.maxAdults && room.maxChildren !== undefined && room.maxChildren > 0) {
      // Check if combined or separate capacity
      const combined = room.maxAdults + room.maxChildren;
      if (combined === maxPeople) {
        // It's maxAdults + maxChildren = total
        return `Max ${maxPeople} guests (${room.maxAdults} adult${room.maxAdults > 1 ? 's' : ''} + ${room.maxChildren} child${room.maxChildren > 1 ? 'ren' : ''})`;
      } else if (room.maxAdults === maxPeople || room.maxChildren === maxPeople) {
        // It's either/or scenario
        return `Max ${maxPeople} guests (${room.maxAdults} adult${room.maxAdults > 1 ? 's' : ''} or ${room.maxChildren} child${room.maxChildren > 1 ? 'ren' : ''})`;
      }
      // Default combined display
      return `Max ${maxPeople} guests (${room.maxAdults} adult${room.maxAdults > 1 ? 's' : ''} + ${room.maxChildren} child${room.maxChildren > 1 ? 'ren' : ''})`;
    } else if (room.maxAdults) {
      return `Max ${maxPeople} guests (${room.maxAdults} adult${room.maxAdults > 1 ? 's' : ''})`;
    }
    return `Max ${maxPeople} guests`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with Image Gallery */}
      <section className="relative h-[50vh] min-h-[350px] max-h-[500px] bg-muted overflow-hidden">
        {images.length > 0 ? (
          <>
            <img
              src={images[currentImageIndex]}
              alt={`${room.name} - Image ${currentImageIndex + 1}`}
              className="w-full h-full object-cover transition-opacity duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
            
            {images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background p-2 rounded-full shadow-lg transition-all"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background p-2 rounded-full shadow-lg transition-all"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2">
                  {images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        idx === currentImageIndex 
                          ? "bg-primary w-6" 
                          : "bg-background/60 hover:bg-background"
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <div className="text-center text-muted-foreground">
              <Bed className="h-20 w-20 mx-auto mb-4 opacity-30" />
              <p>No images available</p>
            </div>
          </div>
        )}

        {/* Back Button */}
        <a 
          href={getPropertyUrl(property.slug || property.id)}
          className="absolute top-4 left-4 bg-background/80 hover:bg-background p-2 rounded-full shadow-lg transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>

        {/* Hero Content Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <div className="container mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <a 
                  href={getPropertyUrl(property.slug || property.id)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-1 inline-block"
                >
                  ← {property.name}
                </a>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
                  {room.name}
                </h1>
              </div>
              <div className="text-right">
                {room.rateType && (
                  <Badge variant="secondary" className="mb-2">
                    {room.rateType}
                  </Badge>
                )}
                {lowestRate !== null && (
                  <>
                    <div className="text-sm text-muted-foreground">From</div>
                    <div className="text-3xl font-bold text-primary">
                      {property.amenities?.currency || 'ZAR'} {lowestRate.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">per night</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Info Bar */}
      <section className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 text-sm">
            {room.maxPeople && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span>Sleeps {room.maxPeople}</span>
              </div>
            )}
            {room.maxAdults && (
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" />
                <span>{room.maxAdults} adult{room.maxAdults > 1 ? 's' : ''}</span>
              </div>
            )}
            {room.maxChildren !== undefined && room.maxChildren > 0 && (
              <div className="flex items-center gap-2">
                <Baby className="h-4 w-4 text-primary" />
                <span>{room.maxChildren} child{room.maxChildren > 1 ? 'ren' : ''}</span>
              </div>
            )}
            {room.roomSize && (
              <div className="flex items-center gap-2">
                <Maximize className="h-4 w-4 text-primary" />
                <span>{room.roomSize} m²</span>
              </div>
            )}
            {room.bathrooms && (
              <div className="flex items-center gap-2">
                <Bath className="h-4 w-4 text-primary" />
                <span>{room.bathrooms} bathroom{room.bathrooms > 1 ? 's' : ''}</span>
              </div>
            )}
            {room.bedConfiguration && (
              <Badge variant="secondary" className="capitalize">
                <Bed className="h-3 w-3 mr-1" />
                {bedConfigLabels[room.bedConfiguration] || room.bedConfiguration}
              </Badge>
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-10">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-8">
            {/* Room Summary Card */}
            <Card className="overflow-hidden border-l-4 border-l-primary">
              <CardContent className="p-6">
                <h2 className="text-2xl font-bold mb-4">{room.name}</h2>
                
                {room.description && (
                  <p className="text-muted-foreground leading-relaxed mb-6 italic">
                    {room.description}
                  </p>
                )}

                {/* Key Info */}
                <div className="space-y-3">
                  {/* Occupancy */}
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-primary" />
                    <span className="font-medium">{buildOccupancyString()}</span>
                  </div>

                  {/* Stay Requirements - only show if minStay > 1, hide maxStay if 0 or unavailable */}
                  {(room.minStay && room.minStay > 1) && (
                    <div className="flex items-center gap-3">
                      <Moon className="h-5 w-5 text-primary" />
                      <span className="font-medium">
                        Min Stay {room.minStay} night{room.minStay > 1 ? 's' : ''}
                        {room.maxStay && room.maxStay > 0 && ` | Max Stay ${room.maxStay} night${room.maxStay > 1 ? 's' : ''}`}
                      </span>
                    </div>
                  )}

                  {/* Available Units */}
                  {availableUnits !== null && (
                    <div className="flex items-center gap-3">
                      <Bed className="h-5 w-5 text-primary" />
                      <span className="font-medium">{availableUnits} unit{availableUnits !== 1 ? 's' : ''} available</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Occupancy & Bed Details */}
            <section>
              <h2 className="text-xl font-semibold mb-4">Occupancy & Bed Configuration</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Bed Configuration Card */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Bed className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold">Bed Configuration</h3>
                    </div>
                    <p className="text-muted-foreground">
                      {room.bedConfiguration 
                        ? bedConfigLabels[room.bedConfiguration] || room.bedConfiguration
                        : 'Not specified'}
                    </p>
                  </CardContent>
                </Card>

                {/* Occupancy Card */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold">Occupancy</h3>
                    </div>
                    <div className="space-y-1 text-muted-foreground">
                      <p>Maximum guests: <strong className="text-foreground">{room.maxPeople || 2}</strong></p>
                      <p>Adults: <strong className="text-foreground">{room.maxAdults || room.maxPeople || 2}</strong></p>
                      {room.maxChildren !== undefined && room.maxChildren > 0 && (
                        <p>Children allowed: <strong className="text-foreground">{room.maxChildren}</strong></p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Room Size Card */}
                {room.roomSize && (
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Maximize className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-semibold">Room Size</h3>
                      </div>
                      <p className="text-muted-foreground">
                        <strong className="text-foreground text-2xl">{room.roomSize}</strong> m²
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Bathrooms Card */}
                {room.bathrooms && (
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Bath className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-semibold">Bathrooms</h3>
                      </div>
                      <p className="text-muted-foreground">
                        <strong className="text-foreground">{room.bathrooms}</strong> private en-suite bathroom{room.bathrooms > 1 ? 's' : ''}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </section>

            {/* Rate Type Info */}
            {room.rateType && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Rate Information</h2>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <Badge variant="secondary" className="text-sm">
                        {room.rateType}
                      </Badge>
                      {room.splitPercent !== undefined && room.splitPercent > 0 && (
                        <span className="text-sm text-muted-foreground">
                          Split: {room.splitPercent}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This room uses the <strong>{room.rateType}</strong> rate structure for pricing.
                    </p>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Meal Options - only show if room has meal types */}
            {roomMealTypes.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Meal Options</h2>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <UtensilsCrossed className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold">Available Meal Plans</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {roomMealTypes.map((meal, idx) => (
                        <Badge key={idx} variant="outline" className="px-3 py-1.5">
                          {meal}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Facilities */}
            {facilities.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Room Facilities</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {facilities.map((facility, idx) => {
                    const IconComponent = facilityIcons[facility.toLowerCase()] || Sparkles;
                    return (
                      <div 
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-card border rounded-lg"
                      >
                        <IconComponent className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{facility}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">In-Room Amenities</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {amenities.map((amenity, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center gap-3 p-3 bg-card border rounded-lg"
                    >
                      <Check className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{amenity}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Extra Person Policy */}
            {room.extraPersonPolicy && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Extra Person Policy</h2>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{room.extraPersonPolicy}</p>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>

          {/* Right Column - Rates & Booking */}
          <div className="space-y-6">
            {/* Rates Card */}
            <Card className="sticky top-4">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-4">Rates</h3>
                
                {rates.length > 0 ? (
                  <div className="space-y-3">
                    {rates.map((rate, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div>
                          <div className="font-medium text-sm">{rate.rate_type}</div>
                          {rate.meal_type && (
                            <div className="text-xs text-muted-foreground">{rate.meal_type}</div>
                          )}
                        </div>
                        <div className="font-semibold text-primary">
                          {rate.currency} {rate.amount.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No rates currently available</p>
                )}

                <Separator className="my-6" />

                <Button className="w-full" size="lg" onClick={handleCheckAvailability}>
                  {isNightsBridgeProperty ? (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Book Now
                    </>
                  ) : (
                    <>
                      <Calendar className="mr-2 h-4 w-4" />
                      Check Availability
                    </>
                  )}
                </Button>
                
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Contact us for group bookings and special requests
                </p>
              </CardContent>
            </Card>

            {/* Property Link */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-2">This room is part of</p>
                <a 
                  href={getPropertyUrl(property.slug || property.id)}
                  className="font-semibold text-primary hover:underline"
                >
                  {property.name}
                </a>
                <p className="text-xs text-muted-foreground mt-1">
                  {property.address}, {property.city}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Image Gallery Thumbnails */}
        {images.length > 1 && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold mb-4">Gallery</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={cn(
                    "aspect-square rounded-lg overflow-hidden border-2 transition-all",
                    idx === currentImageIndex 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  <img
                    src={img}
                    alt={`${room.name} - Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
