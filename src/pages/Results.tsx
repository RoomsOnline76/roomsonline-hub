import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Users, Calendar, ChevronLeft, Search } from "lucide-react";
import { format } from "date-fns";

// Mock data - will be replaced with real API calls
const mockProperties = [
  {
    id: 1,
    name: "Luxury Beachfront Villa",
    location: "Cape Town, South Africa",
    price: 2500,
    rating: 4.9,
    reviews: 127,
    image: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800&q=80",
    maxGuests: 8,
    bedrooms: 4,
    system: "NightsBridge",
  },
  {
    id: 2,
    name: "Mountain Retreat Lodge",
    location: "Drakensberg, South Africa",
    price: 1800,
    rating: 4.8,
    reviews: 93,
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
    maxGuests: 6,
    bedrooms: 3,
    system: "Checkfront",
  },
  {
    id: 3,
    name: "City Center Apartment",
    location: "Johannesburg, South Africa",
    price: 950,
    rating: 4.7,
    reviews: 156,
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80",
    maxGuests: 4,
    bedrooms: 2,
    system: "NightsBridge",
  },
  {
    id: 4,
    name: "Safari Game Lodge",
    location: "Kruger National Park, South Africa",
    price: 3200,
    rating: 5.0,
    reviews: 84,
    image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&q=80",
    maxGuests: 10,
    bedrooms: 5,
    system: "NightsBridge",
  },
];

const Results = () => {
  const [searchParams] = useSearchParams();
  const [properties] = useState(mockProperties);

  const destination = searchParams.get("destination");
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");
  const adults = searchParams.get("adults");
  const children = searchParams.get("children");
  
  const isBookDomain = window.location.hostname === "book.sleepinafrica.roomsonline.co.za";
  const backPath = isBookDomain ? "/" : "/book";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Back to Search */}
        <div className="mb-4 sm:mb-6">
          <Link to={backPath}>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm">
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Back
            </Button>
          </Link>
        </div>

        {/* Search Summary */}
        <div className="mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-1.5 sm:mb-2">
            {destination ? `Properties in ${destination}` : 'Available Properties'}
          </h1>
          <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            {checkIn && checkOut && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>
                  {format(new Date(checkIn), "MMM dd")} - {format(new Date(checkOut), "MMM dd")}
                </span>
              </div>
            )}
            {(adults || children) && (
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>
                  {adults} Adult{Number(adults) > 1 ? 's' : ''}
                  {Number(children) > 0 && `, ${children} Child${Number(children) > 1 ? 'ren' : ''}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Results Grid - single column on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          {properties.map((property) => (
            <Card key={property.id} className="overflow-hidden hover:shadow-[var(--shadow-medium)] transition-all">
              <div className="relative h-36 sm:h-44 md:h-48 overflow-hidden">
                <img
                  src={property.image}
                  alt={property.name}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
                <Badge className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-primary text-primary-foreground text-[10px] sm:text-xs">
                  {property.system}
                </Badge>
              </div>
              
              <CardContent className="p-3 sm:p-4 md:p-5">
                <div className="flex items-start justify-between mb-1.5 sm:mb-2 gap-2">
                  <h3 className="font-semibold text-sm sm:text-base md:text-lg text-foreground line-clamp-1">
                    {property.name}
                  </h3>
                  <div className="flex items-center gap-0.5 text-xs sm:text-sm shrink-0">
                    <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-primary text-primary" />
                    <span className="font-medium">{property.rating}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-muted-foreground text-xs sm:text-sm mb-2 sm:mb-3">
                  <MapPin className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                  <span className="line-clamp-1">{property.location}</span>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-muted-foreground mb-3 sm:mb-4">
                  <span>{property.bedrooms} Bed</span>
                  <span>•</span>
                  <span>{property.maxGuests} Guests</span>
                </div>

                <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-border">
                  <div>
                    <div className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">
                      R{property.price}
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">per night</div>
                  </div>
                  <Button size="sm" className="bg-[var(--hero-gradient)] hover:opacity-90 text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4">
                    Book Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* No Results */}
        {properties.length === 0 && (
          <div className="text-center py-12 sm:py-20">
            <Search className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground mb-3 sm:mb-4" />
            <p className="text-base sm:text-xl text-muted-foreground">
              No properties found for your search.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Results;
