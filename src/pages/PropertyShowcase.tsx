import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getNightsBridgeBookingUrl } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Star, 
  MapPin, 
  Users, 
  Bed, 
  Bath, 
  ChevronLeft, 
  ChevronRight,
  Wifi,
  Car,
  Coffee,
  Utensils,
  Waves,
  Wind,
  Tv,
  Phone,
  Check,
  Clock,
  Calendar,
  ArrowRight,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Property {
  id: string;
  name: string;
  description: string | null;
  property_type: string;
  address: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  price_per_night: number;
  max_guests: number;
  bedrooms: number | null;
  bathrooms: number | null;
  amenities: any;
  images: string[];
  is_active: boolean;
  external_system: string | null;
  external_id: string | null;
  benson_property_code: string | null;
  slug: string | null;
}

interface RoomType {
  id: string;
  name: string;
  url?: string;
  selected?: boolean;
  maxPeople?: number;
  maxAdults?: number;
  maxChildren?: number;
  description?: string;
  pmsRoomId?: string;
}

interface AvailabilityData {
  external_room_type_id: string;
  available_units: number;
  rates: any;
  date: string;
}

const amenityIcons: Record<string, any> = {
  wifi: Wifi,
  parking: Car,
  coffee: Coffee,
  restaurant: Utensils,
  pool: Waves,
  aircon: Wind,
  tv: Tv,
  phone: Phone,
};

const slugifyRoomName = (name: string) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

export default function PropertyShowcase() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [availability, setAvailability] = useState<Map<string, AvailabilityData>>(new Map());
  const [nightsBridgeAgentCode, setNightsBridgeAgentCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  const isBookDomain = window.location.hostname === "book.sleepinafrica.roomsonline.co.za";

  useEffect(() => {
    if (id) {
      fetchPropertyData();
    }
  }, [id]);

  const fetchPropertyData = async () => {
    setLoading(true);
    try {
      // Check if id is a UUID or slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "");
      
      // Fetch property by UUID or slug using public view
      let query = supabase
        .from("public_properties")
        .select("*");
      
      if (isUuid) {
        query = query.eq("id", id);
      } else {
        query = query.eq("slug", id);
      }
      
      const { data: propertyData, error: propertyError } = await query.maybeSingle();

      if (propertyError) throw propertyError;
      if (!propertyData) {
        console.error("PropertyShowcase: No property found for", { id, isUuid });
        return;
      }
      
      // Parse images
      const images = Array.isArray(propertyData.images) 
        ? (propertyData.images as string[])
        : [];
      
      setProperty({ ...propertyData, images });

      // Fetch availability data from pms_availability_cache for today
      const today = new Date().toISOString().split('T')[0];
      const { data: availData } = await supabase
        .from("pms_availability_cache")
        .select("external_room_type_id, available_units, rates, date")
        .eq("property_id", propertyData.id)
        .eq("date", today);

      if (availData) {
        const availMap = new Map<string, AvailabilityData>();
        availData.forEach((item) => {
          availMap.set(item.external_room_type_id, item);
        });
        setAvailability(availMap);
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
      console.error("Error fetching property:", error);
    } finally {
      setLoading(false);
    }
  };

  const nextImage = () => {
    if (property?.images.length) {
      setCurrentImageIndex((prev) => 
        prev === property.images.length - 1 ? 0 : prev + 1
      );
    }
  };

  const prevImage = () => {
    if (property?.images.length) {
      setCurrentImageIndex((prev) => 
        prev === 0 ? property.images.length - 1 : prev - 1
      );
    }
  };

  const scrollToRooms = () => {
    document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const getRoomTypes = (): RoomType[] => {
    if (!property?.amenities?.room_types) return [];
    // Return all room types - don't filter by selected flag for public showcase
    return property.amenities.room_types;
  };

  const getAvailabilityForRoom = (room: RoomType): AvailabilityData | undefined => {
    const roomId = room.pmsRoomId || room.id;
    return availability.get(roomId);
  };

  const getLowestRateFromAvailability = (availData: AvailabilityData | undefined): number | null => {
    if (!availData?.rates) return null;
    
    const rates = Array.isArray(availData.rates) ? availData.rates : [availData.rates];
    let lowestRate: number | null = null;
    
    rates.forEach((rate: any) => {
      // Check room_amount for PER ROOM rates
      if (rate.room_amount && typeof rate.room_amount === 'number') {
        if (lowestRate === null || rate.room_amount < lowestRate) {
          lowestRate = rate.room_amount;
        }
      }
      // Check adult_amounts for PER PERSON rates
      if (rate.adult_amounts) {
        Object.values(rate.adult_amounts).forEach((amount: any) => {
          if (typeof amount === 'number' && (lowestRate === null || amount < lowestRate)) {
            lowestRate = amount;
          }
        });
      }
    });
    
    return lowestRate;
  };

  const getMealTypes = (): string[] => {
    return property?.amenities?.meal_types || [];
  };

  const getFacilities = (): string[] => {
    return property?.amenities?.facilities || [];
  };

  const getHouseRules = () => {
    return property?.amenities?.house_rules || {};
  };

  const getStarRating = (): number => {
    return property?.amenities?.star_rating || 0;
  };

  // Calculate total max guests from room types
  const getTotalMaxGuests = (): number => {
    const roomTypes = getRoomTypes();
    if (roomTypes.length === 0) return property?.max_guests || 0;
    
    return roomTypes.reduce((total, room) => total + (room.maxPeople || 0), 0);
  };

  const handleRoomClick = (room: RoomType) => {
    const propertySlug = property?.slug || property?.id;
    const roomSlug = slugifyRoomName(room.name);
    navigate(`/property/${propertySlug}/room/${roomSlug}`);
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

  // Handle booking - redirect to NightsBridge for NB properties
  const handleBookProperty = () => {
    if (isNightsBridgeProperty) {
      const bbid = getNightsBridgeBBID();
      if (bbid && nightsBridgeAgentCode) {
        const bookingUrl = getNightsBridgeBookingUrl(bbid, nightsBridgeAgentCode);
        window.open(bookingUrl, '_blank');
        return;
      }
    }
    // Default: scroll to rooms section
    scrollToRooms();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-[60vh] bg-muted animate-pulse" />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-1/2 mb-4" />
          <Skeleton className="h-6 w-1/3 mb-8" />
          <div className="grid md:grid-cols-3 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Property Not Found</h1>
          <Link to="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const roomTypes = getRoomTypes();
  const facilities = getFacilities();
  const mealTypes = getMealTypes();
  const houseRules = getHouseRules();
  const starRating = getStarRating();
  const totalMaxGuests = getTotalMaxGuests();

  return (
    <div className="min-h-screen bg-background">
      {/* Back Button */}
      <div className="absolute top-4 left-4 z-20">
        {isBookDomain ? (
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg"
            onClick={() => navigate("/")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Search
          </Button>
        ) : (
          <Link to="/">
            <Button variant="secondary" size="sm" className="bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Home
            </Button>
          </Link>
        )}
      </div>

      {/* Hero Section with Image Gallery */}
      <section className="relative h-[60vh] min-h-[400px] max-h-[600px] bg-muted overflow-hidden">
        {property.images.length > 0 ? (
          <>
            <img
              src={property.images[currentImageIndex]}
              alt={`${property.name} - Image ${currentImageIndex + 1}`}
              className="w-full h-full object-cover transition-opacity duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
            
            {/* Image Navigation */}
            {property.images.length > 1 && (
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
                
                {/* Image Indicators */}
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2">
                  {property.images.map((_, idx) => (
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
              <Bed className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>No images available</p>
            </div>
          </div>
        )}

        {/* Hero Content Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <div className="container mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {starRating > 0 && (
                  <div className="flex items-center gap-1 mb-2">
                    {Array.from({ length: starRating }).map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                )}
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-2">
                  {property.name}
                </h1>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>
                    {property.address && property.city ? (
                      `${property.address}, ${property.city}, ${property.country}`
                    ) : property.latitude && property.longitude ? (
                      `GPS: ${property.latitude.toFixed(6)}, ${property.longitude.toFixed(6)}`
                    ) : (
                      property.country || 'Location not available'
                    )}
                  </span>
                </div>
              </div>
              <Button 
                size="lg" 
                onClick={handleBookProperty}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
              >
                {isNightsBridgeProperty ? (
                  <>
                    Book Now
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  <>
                    View Rooms & Rates
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Info Bar */}
      <section className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 text-sm">
            {totalMaxGuests > 0 && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span>Up to {totalMaxGuests} guests</span>
              </div>
            )}
            {roomTypes.length > 0 && (
              <div className="flex items-center gap-2">
                <Bed className="h-4 w-4 text-primary" />
                <span>{roomTypes.length} room type{roomTypes.length > 1 ? 's' : ''}</span>
              </div>
            )}
            {property.bathrooms && (
              <div className="flex items-center gap-2">
                <Bath className="h-4 w-4 text-primary" />
                <span>{property.bathrooms} bathroom{property.bathrooms > 1 ? 's' : ''}</span>
              </div>
            )}
            <Badge variant="secondary" className="capitalize">
              {property.property_type.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-10">
        {/* Description */}
        {property.description && (
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">About this property</h2>
            <p className="text-muted-foreground leading-relaxed max-w-3xl">
              {property.description}
            </p>
          </section>
        )}

        {/* Dynamic Call to Action */}
        {roomTypes.length > 0 && (
          <section className="mb-12">
            <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20 overflow-hidden">
              <CardContent className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <h3 className="text-xl md:text-2xl font-bold text-foreground">
                      {property.amenities?.announcements?.[0]?.title || `Book your stay at ${property.name}`}
                    </h3>
                    <p className="text-muted-foreground max-w-xl">
                      {property.amenities?.announcements?.[0]?.description || 
                        (property.description 
                          ? property.description.slice(0, 150) + (property.description.length > 150 ? '...' : '')
                          : `Experience ${property.property_type.replace('_', ' ')} accommodation in ${property.city}, ${property.country}. Choose from ${roomTypes.length} room type${roomTypes.length > 1 ? 's' : ''}.`
                        )
                      }
                    </p>
                    {/* Quick highlights */}
                    <div className="flex flex-wrap gap-3 pt-2">
                      {mealTypes.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          <Coffee className="h-3 w-3 mr-1" />
                          {mealTypes[0]} included
                        </Badge>
                      )}
                      {facilities.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          {facilities.length}+ amenities
                        </Badge>
                      )}
                      {starRating > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
                          {starRating}-star rated
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {(() => {
                      // Calculate lowest rate across all rooms
                      let lowestOverallRate: number | null = null;
                      roomTypes.forEach((room) => {
                        const availData = getAvailabilityForRoom(room);
                        const rate = getLowestRateFromAvailability(availData);
                        if (rate !== null && (lowestOverallRate === null || rate < lowestOverallRate)) {
                          lowestOverallRate = rate;
                        }
                      });
                      return lowestOverallRate !== null ? (
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground uppercase">From</span>
                          <div className="text-2xl md:text-3xl font-bold text-primary">
                            R{lowestOverallRate.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <span className="text-xs text-muted-foreground">per night</span>
                        </div>
                      ) : null;
                    })()}
                    <Button 
                      size="lg" 
                      onClick={handleBookProperty}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
                    >
                      {isNightsBridgeProperty ? (
                        <>
                          Book Now
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </>
                      ) : (
                        <>
                          View Available Rooms
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Rooms Section */}
        <section id="rooms-section" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-semibold mb-6 uppercase tracking-wide text-foreground/80">Rooms</h2>
          
          {roomTypes.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {roomTypes.map((room) => {
                const availData = getAvailabilityForRoom(room);
                const lowestRate = getLowestRateFromAvailability(availData);
                const availableUnits = availData?.available_units;
                const roomImage = room.url || (property.images.length > 0 ? property.images[0] : null);
                const roomBedrooms = 1; // Default to 1 bedroom per room type
                
                return (
                  <div 
                    key={room.id} 
                    className="group cursor-pointer"
                    onClick={() => handleRoomClick(room)}
                  >
                    {/* Room Image with Badges */}
                    <div className="relative aspect-[4/3] rounded-lg overflow-hidden mb-3">
                      {roomImage ? (
                        <img
                          src={roomImage}
                          alt={room.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <Bed className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                      )}
                      
                      {/* Overlay gradient */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      {/* Badges */}
                      <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                        <Badge className="bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider shadow-lg">
                          Instant Book
                        </Badge>
                        {availableUnits !== undefined && availableUnits <= 2 && availableUnits > 0 && (
                          <Badge className="bg-amber-600 text-white text-xs font-semibold uppercase tracking-wider shadow-lg">
                            Only {availableUnits} left
                          </Badge>
                        )}
                        {availableUnits === 0 && (
                          <Badge variant="destructive" className="text-xs font-semibold uppercase tracking-wider shadow-lg">
                            Sold Out
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Room Info */}
                    <div className="space-y-1">
                      {/* Location/Property Type */}
                      <p className="text-xs text-muted-foreground capitalize">
                        {property.property_type.replace('_', ' ')} in {property.city}
                      </p>
                      
                      {/* Room Name */}
                      <h3 className="text-base font-bold text-foreground uppercase tracking-wide group-hover:text-primary transition-colors">
                        {room.name}
                      </h3>
                      
                      {/* Room Details */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {room.maxPeople && (
                          <div className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            <span>{room.maxPeople} guest{room.maxPeople > 1 ? 's' : ''}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Bed className="h-3.5 w-3.5" />
                          <span>{roomBedrooms} bedroom</span>
                        </div>
                      </div>
                      
                      {/* Pricing */}
                      <div className="pt-2">
                        {lowestRate !== null ? (
                          <div className="flex items-baseline gap-1">
                            <span className="text-[10px] text-muted-foreground uppercase">From</span>
                            <span className="text-lg font-bold text-primary">
                              R{lowestRate.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-muted-foreground uppercase">per night</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">Contact for rates</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <Bed className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No room information available</p>
            </Card>
          )}
        </section>

        {/* Amenities & Facilities */}
        {facilities.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">Amenities & Facilities</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {facilities.map((facility, idx) => {
                const IconComponent = amenityIcons[facility.toLowerCase()] || Check;
                return (
                  <div 
                    key={idx}
                    className="flex items-center gap-3 p-4 bg-card border rounded-lg"
                  >
                    <div className="p-2 bg-primary/10 rounded-full">
                      <IconComponent className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-medium">{facility}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* House Rules */}
        {Object.keys(houseRules).length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">House Rules</h2>
            <Card>
              <CardContent className="p-6">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Check-in/Check-out */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      Check-in / Check-out
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Check-in</span>
                        <span>{houseRules.check_in_from || '15:00'} - {houseRules.check_in_to || '20:00'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Check-out</span>
                        <span>{houseRules.check_out_from || '06:00'} - {houseRules.check_out_to || '11:00'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Policies */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Policies
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        {houseRules.pets_allowed ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <span className="h-4 w-4 text-destructive">✕</span>
                        )}
                        <span>Pets {houseRules.pets_allowed ? 'allowed' : 'not allowed'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {houseRules.smoking_allowed ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <span className="h-4 w-4 text-destructive">✕</span>
                        )}
                        <span>Smoking {houseRules.smoking_allowed ? 'allowed' : 'not allowed'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {houseRules.children_allowed ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <span className="h-4 w-4 text-destructive">✕</span>
                        )}
                        <span>Children {houseRules.children_allowed ? 'welcome' : 'not allowed'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Children Policy */}
                  {houseRules.children_policy && (
                    <div className="space-y-4">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        Children Policy
                      </h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-line">
                        {houseRules.children_policy}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Image Gallery Thumbnails */}
        {property.images.length > 1 && (
          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">Gallery</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {property.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={cn(
                    "aspect-square rounded-lg overflow-hidden border-2 transition-all",
                    idx === currentImageIndex 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-transparent hover:border-primary/50"
                  )}
                >
                  <img
                    src={img}
                    alt={`${property.name} - ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* CTA Footer */}
        <section className="mt-16 text-center">
          <Card className="p-8 bg-primary/5 border-primary/20">
            <h2 className="text-2xl font-bold mb-2">Ready to book your stay?</h2>
            <p className="text-muted-foreground mb-6">
              Experience exceptional hospitality at {property.name}
            </p>
            <Button 
              size="lg" 
              onClick={handleBookProperty}
              className="bg-primary hover:bg-primary/90"
            >
              {isNightsBridgeProperty ? (
                <>
                  Book Now
                  <ExternalLink className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  View Rooms & Rates
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </Card>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t py-8 mt-10">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} RoomsOnline. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
