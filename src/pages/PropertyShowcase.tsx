import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  ArrowRight
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
  benson_property_code: string | null;
}

interface RoomType {
  id: string;
  name: string;
  url?: string;
  selected?: boolean;
}

interface RateData {
  room_type: string;
  rate_type: string;
  meal_type: string | null;
  amount: number;
  currency: string;
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

export default function PropertyShowcase() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [rates, setRates] = useState<RateData[]>([]);
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
      
      // Fetch property by UUID or slug
      let query = supabase
        .from("properties")
        .select("*");
      
      if (isUuid) {
        query = query.eq("id", id);
      } else {
        query = query.eq("slug", id);
      }
      
      const { data: propertyData, error: propertyError } = await query.single();

      if (propertyError) throw propertyError;
      
      // Parse images
      const images = Array.isArray(propertyData.images) 
        ? (propertyData.images as string[])
        : [];
      
      setProperty({ ...propertyData, images });

      // Fetch rates for this property (use the actual property ID, not the slug)
      const { data: ratesData, error: ratesError } = await supabase
        .from("property_rates")
        .select("room_type, rate_type, meal_type, amount, currency")
        .eq("property_id", propertyData.id)
        .order("room_type")
        .order("rate_type");

      if (!ratesError && ratesData) {
        setRates(ratesData);
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
    return property.amenities.room_types.filter((rt: RoomType) => rt.selected !== false);
  };

  const getRatesForRoom = (roomName: string): RateData[] => {
    return rates.filter(r => r.room_type === roomName);
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

  return (
    <div className="min-h-screen bg-background">
      {/* Back Button */}
      <div className="absolute top-4 left-4 z-20">
        {isBookDomain ? (
          <Button 
            variant="secondary" 
            size="sm" 
            className="bg-background/80 backdrop-blur-sm hover:bg-background shadow-lg"
            onClick={() => navigate(-1)}
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
                onClick={scrollToRooms}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
              >
                View Rooms & Rates
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Info Bar */}
      <section className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>Up to {property.max_guests} guests</span>
            </div>
            {property.bedrooms && (
              <div className="flex items-center gap-2">
                <Bed className="h-4 w-4 text-primary" />
                <span>{property.bedrooms} bedroom{property.bedrooms > 1 ? 's' : ''}</span>
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

        {/* Rooms & Rates Section */}
        <section id="rooms-section" className="mb-12 scroll-mt-20">
          <h2 className="text-2xl font-semibold mb-6">Rooms & Rates</h2>
          
          {roomTypes.length > 0 ? (
            <div className="grid gap-6">
              {roomTypes.map((room) => {
                const roomRates = getRatesForRoom(room.name);
                const lowestRate = roomRates.length > 0 
                  ? Math.min(...roomRates.map(r => r.amount))
                  : null;
                
                return (
                  <Card key={room.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="md:flex">
                      {/* Room Image Placeholder */}
                      <div className="md:w-1/3 h-48 md:h-auto bg-muted flex items-center justify-center">
                        <Bed className="h-12 w-12 text-muted-foreground/30" />
                      </div>
                      
                      {/* Room Details */}
                      <div className="flex-1 p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                          <div>
                            <h3 className="text-xl font-semibold">{room.name}</h3>
                            {mealTypes.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {mealTypes.map((meal) => (
                                  <Badge key={meal} variant="outline" className="text-xs">
                                    {meal}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          <div className="text-right">
                            {lowestRate !== null ? (
                              <>
                                <div className="text-sm text-muted-foreground">From</div>
                                <div className="text-2xl font-bold text-primary">
                                  {property.amenities?.currency || 'ZAR'} {lowestRate.toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground">per night</div>
                              </>
                            ) : (
                              <div className="text-muted-foreground italic">
                                Rates on request
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Rate Breakdown */}
                        {roomRates.length > 0 && (
                          <div className="border-t pt-4 mt-4">
                            <h4 className="text-sm font-medium mb-3 text-muted-foreground">Rate Options</h4>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {roomRates.slice(0, 6).map((rate, idx) => (
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
                          </div>
                        )}

                        <div className="mt-6 flex gap-3">
                          <Button className="bg-primary hover:bg-primary/90">
                            Book Now
                          </Button>
                          <Button variant="outline" asChild>
                            <Link to={`/property/${id}/room/${room.id}`}>
                              View Room
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
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
              onClick={scrollToRooms}
              className="bg-primary hover:bg-primary/90"
            >
              View Rooms & Rates
              <ArrowRight className="ml-2 h-4 w-4" />
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
