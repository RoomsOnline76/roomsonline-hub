import { useState } from "react";
import { SearchForm } from "@/components/SearchForm";
import { PropertiesMap } from "@/components/PropertiesMap";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Zap, HeadphonesIcon, Bed, BadgeCheck, MapPinned, Lock } from "lucide-react";
import heroImage from "@/assets/hero-hotel.jpg";
import { Link } from "react-router-dom";

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
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(INITIAL_ENABLED_TYPES);

  const toggleType = (key: string) => {
    setEnabledTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const features = [
    {
      icon: Shield,
      title: "Secure Booking",
      description: "Industry-standard security",
    },
    {
      icon: Zap,
      title: "Instant Confirm",
      description: "Immediate confirmations",
    },
    {
      icon: BadgeCheck,
      title: "Verified Stays",
      description: "Hand-picked properties",
    },
    {
      icon: HeadphonesIcon,
      title: "24/7 Support",
      description: "Round-the-clock help",
    },
  ];

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">

      {/* Hero Section - Compact for mobile */}
      <section className="relative flex-shrink-0">
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center 30%",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/80 to-background" />
        </div>

        <div className="relative z-10 container mx-auto px-3 sm:px-4 py-6 sm:py-12 md:py-20">
          <div className="text-center mb-4 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-2 sm:mb-3 tracking-tight leading-tight">
              Book Your Perfect Stay
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-md mx-auto px-2">
              Discover destinations across Africa
            </p>
          </div>

          <SearchForm />
        </div>
      </section>

      {/* Properties Map Section */}
      <section className="py-6 sm:py-10 bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-1">
              Explore Properties
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Tap a pin to view details
            </p>
          </div>
          
          {/* Property Type Toggles - Horizontal scroll on mobile */}
          <div className="overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-hide">
            <div className="flex sm:flex-wrap sm:justify-center gap-2 mb-3 sm:mb-5 min-w-max sm:min-w-0">
              {PROPERTY_TYPES.map((type) => (
                <button
                  key={type.key}
                  onClick={() => toggleType(type.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all touch-manipulation active:scale-95 ${
                    enabledTypes[type.key]
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-background"
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      enabledTypes[type.key] ? type.color : "bg-muted-foreground/30"
                    }`}
                  />
                  <span className={`text-xs font-medium whitespace-nowrap transition-colors ${
                    enabledTypes[type.key] ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {type.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-[250px] sm:h-[350px] md:h-[400px] rounded-lg overflow-hidden border border-border shadow-sm">
            <PropertiesMap enabledTypes={enabledTypes} typeColors={TYPE_COLORS} />
          </div>
        </div>
      </section>

      {/* Features Section - Compact grid */}
      <section className="py-6 sm:py-12 bg-secondary/30">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-4 sm:mb-8">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-1 sm:mb-2">
              Why RoomsOnline
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {features.map((feature, index) => (
              <Card key={index} className="border-border/50 bg-card/80">
                <CardContent className="p-3 sm:p-4 md:p-5">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-[var(--hero-gradient)] flex items-center justify-center mb-2 sm:mb-3">
                    <feature.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold text-xs sm:text-sm md:text-base mb-0.5 sm:mb-1 text-foreground leading-tight">
                    {feature.title}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-6 sm:py-12 bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[
              { 
                icon: BadgeCheck, 
                title: "Hand-Picked Stays", 
                description: "Only verified properties — no surprises on arrival." 
              },
              { 
                icon: Zap, 
                title: "Lightning-Fast Support", 
                description: "Average reply time under 5 minutes." 
              },
              { 
                icon: Lock, 
                title: "Secure Bookings", 
                description: "Safe payments + instant confirmations." 
              },
              { 
                icon: MapPinned, 
                title: "Local Experts", 
                description: "We know the owners, the towns, the tips… all of it." 
              },
            ].map((item, index) => (
              <div key={index} className="flex gap-2.5 sm:gap-3 p-3 sm:p-4 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <item.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-xs sm:text-sm text-foreground leading-tight mb-0.5">
                    {item.title}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer - Compact */}
      <footer className="py-4 sm:py-6 border-t border-border mt-auto bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            {/* Brand */}
            <div className="flex items-center justify-center gap-2">
              <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-md bg-[var(--hero-gradient)] flex items-center justify-center flex-shrink-0">
                <Bed className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
              </div>
              <span className="text-sm sm:text-base font-semibold text-foreground">RoomsOnline</span>
            </div>
            
            {/* Links */}
            <div className="flex gap-4 sm:gap-6">
              <Link 
                to="/privacy-policy" 
                className="text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Privacy
              </Link>
              <Link 
                to="/terms-of-service" 
                className="text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Terms
              </Link>
            </div>
            
            {/* Copyright */}
            <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
              © {new Date().getFullYear()} RoomsOnline
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
