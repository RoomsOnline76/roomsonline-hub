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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Back to Search - only on book domain */}
        {isBookDomain && (
          <div className="mb-6">
            <Link to="/">
              <Button variant="outline" size="sm" className="gap-2">
                <ChevronLeft className="h-4 w-4" />
                Back to Search
              </Button>
            </Link>
          </div>
        )}

        {/* Search Summary */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Available Properties in {destination}
          </h1>
          <div className="flex flex-wrap gap-4 text-muted-foreground">
            {checkIn && checkOut && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {format(new Date(checkIn), "MMM dd")} - {format(new Date(checkOut), "MMM dd, yyyy")}
                </span>
              </div>
            )}
            {(adults || children) && (
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>
                  {adults} Adult{Number(adults) > 1 ? 's' : ''}
                  {Number(children) > 0 && `, ${children} Child${Number(children) > 1 ? 'ren' : ''}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Results Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property) => (
            <Card key={property.id} className="overflow-hidden hover:shadow-[var(--shadow-medium)] transition-all">
              <div className="relative h-48 overflow-hidden">
                <img
                  src={property.image}
                  alt={property.name}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                />
                <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">
                  {property.system}
                </Badge>
              </div>
              
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg text-foreground line-clamp-1">
                    {property.name}
                  </h3>
                  <div className="flex items-center gap-1 text-sm">
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    <span className="font-medium">{property.rating}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-muted-foreground text-sm mb-3">
                  <MapPin className="h-4 w-4" />
                  <span className="line-clamp-1">{property.location}</span>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span>{property.bedrooms} Bedrooms</span>
                  <span>•</span>
                  <span>Up to {property.maxGuests} Guests</span>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      R{property.price}
                    </div>
                    <div className="text-xs text-muted-foreground">per night</div>
                  </div>
                  <Button className="bg-[var(--hero-gradient)] hover:opacity-90">
                    Book Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* No Results */}
        {properties.length === 0 && (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">
              No properties found for your search criteria.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Results;
