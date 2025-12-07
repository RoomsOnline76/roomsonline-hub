import { useState } from "react";
import { SearchForm } from "@/components/SearchForm";
import { PropertiesMap } from "@/components/PropertiesMap";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Zap, Globe, HeadphonesIcon, MapPin, Star, Bed, ArrowLeft } from "lucide-react";
import heroImage from "@/assets/hero-hotel.jpg";
import { Link, useNavigate } from "react-router-dom";

// Keys match database property_type values (lowercase)
const PROPERTY_TYPES = [
  { key: "hotel", label: "Hotel", color: "bg-red-500", hex: "#ef4444" },
  { key: "guest_house", label: "Guest House", color: "bg-blue-500", hex: "#3b82f6" },
  { key: "bnb", label: "B&B", color: "bg-yellow-500", hex: "#eab308" },
  { key: "lodge", label: "Lodge", color: "bg-green-500", hex: "#22c55e" },
  { key: "resort", label: "Resort", color: "bg-purple-500", hex: "#a855f7" },
  { key: "villa", label: "Villa", color: "bg-orange-500", hex: "#f97316" },
  { key: "apartment", label: "Apartment", color: "bg-teal-500", hex: "#14b8a6" },
];

// Create color map for the map component
const TYPE_COLORS: Record<string, string> = PROPERTY_TYPES.reduce(
  (acc, t) => ({ ...acc, [t.key]: t.hex }), {}
);

const INITIAL_ENABLED_TYPES: Record<string, boolean> = {
  hotel: true,
  guest_house: true,
  bnb: true,
  lodge: true,
  resort: true,
  villa: true,
  apartment: true,
};

const Home = () => {
  const navigate = useNavigate();
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(INITIAL_ENABLED_TYPES);

  const toggleType = (key: string) => {
    setEnabledTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const features = [
    {
      icon: Shield,
      title: "Secure Booking",
      description: "Industry-standard security for all reservations",
    },
    {
      icon: Zap,
      title: "Instant Confirmation",
      description: "Immediate booking confirmations",
    },
    {
      icon: Globe,
      title: "Multi-Platform",
      description: "Connect to multiple booking systems",
    },
    {
      icon: HeadphonesIcon,
      title: "24/7 Support",
      description: "Round-the-clock assistance",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Back Button */}
      <div className="container mx-auto px-4 pt-4">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {/* Hero Section - Mobile optimized */}
      <section className="relative flex-shrink-0">
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/75 to-background" />
        </div>

        <div className="relative z-10 container mx-auto px-4 pt-8 pb-10 sm:py-16 md:py-24">
          <div className="text-center mb-6 sm:mb-10">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-3 sm:mb-4 tracking-tight">
              Book Your Perfect Stay
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto">
              Discover and book from our curated portfolio of destinations across Africa
            </p>
          </div>

          <SearchForm />
        </div>
      </section>

      {/* Properties Map Section */}
      <section className="py-8 sm:py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-5 sm:mb-8">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-2">
              Explore Our Properties
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Tap a pin to view property details
            </p>
          </div>
          
          {/* Property Type Toggles - Horizontal scroll on mobile */}
          <div className="overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-hide">
            <div className="flex sm:flex-wrap sm:justify-center gap-2.5 sm:gap-3 mb-4 sm:mb-6 min-w-max sm:min-w-0">
              {PROPERTY_TYPES.map((type) => (
                <button
                  key={type.key}
                  onClick={() => toggleType(type.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all touch-manipulation ${
                    enabledTypes[type.key]
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-background hover:bg-secondary/50"
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-full transition-all ${
                      enabledTypes[type.key] ? type.color : "bg-muted-foreground/30"
                    }`}
                  />
                  <span className={`text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                    enabledTypes[type.key] ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {type.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-[300px] sm:h-[400px] md:h-[450px] rounded-xl overflow-hidden border border-border shadow-sm">
            <PropertiesMap enabledTypes={enabledTypes} typeColors={TYPE_COLORS} />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-10 sm:py-16 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-2 sm:mb-3">
              Why Choose RoomsOnline
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
              Our unified booking engine connects you with properties across multiple management systems
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="border-border/50 hover:shadow-md transition-shadow bg-card/80 backdrop-blur-sm">
                <CardContent className="p-4 sm:p-5 md:p-6">
                  <div className="h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12 rounded-xl bg-[var(--hero-gradient)] flex items-center justify-center mb-3 sm:mb-4">
                    <feature.icon className="h-5 w-5 sm:h-5.5 sm:w-5.5 md:h-6 md:w-6 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold text-sm sm:text-base md:text-lg mb-1 sm:mb-2 text-foreground leading-tight">
                    {feature.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-10 sm:py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {[
              { number: "36+", label: "Properties", icon: Bed },
              { number: "50K+", label: "Happy Guests", icon: Star },
              { number: "100+", label: "Destinations", icon: MapPin },
              { number: "24/7", label: "Support", icon: HeadphonesIcon },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-primary/10 mb-3 sm:mb-4">
                  <stat.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-1">
                  {stat.number}
                </div>
                <div className="text-xs sm:text-sm md:text-base text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer - Pushed to bottom */}
      <footer className="py-6 sm:py-8 border-t border-border mt-auto bg-background">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-4 sm:gap-6">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[var(--hero-gradient)] flex items-center justify-center">
                <Bed className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground">RoomsOnline</span>
            </div>
            
            {/* Links */}
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Link 
                to="/privacy-policy" 
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Privacy Policy
              </Link>
              <Link 
                to="/terms-of-service" 
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Terms of Service
              </Link>
            </div>
            
            {/* Copyright */}
            <p className="text-xs sm:text-sm text-muted-foreground text-center">
              © {new Date().getFullYear()} RoomsOnline. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
