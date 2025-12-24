import { useState, useEffect, useMemo } from "react";
import { SearchForm } from "@/components/SearchForm";
import { PropertiesMap } from "@/components/PropertiesMap";
import { Shield, Zap, HeadphonesIcon, BadgeCheck, MapPinned, Lock, Building2 } from "lucide-react";
import heroFallback from "@/assets/hero-hotel.jpg";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { composeHeadline, composeMapSubheadline } from "@/lib/headlineComposer";

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
const TYPE_COLORS: Record<string, string> = PROPERTY_TYPES.reduce((acc, t) => ({ ...acc, [t.key]: t.hex }), {});

const INITIAL_ENABLED_TYPES: Record<string, boolean> = {
  hotel: true,
  guest_house: true,
  bnb: true,
  lodge: true,
  resort: true,
  villa: true,
  apartment: true,
};

/**
 * Extract the primary image URL from a property's images array
 * Handles both object format (with url property) and plain string URLs
 */
function extractPrimaryImageUrl(images: unknown): string | null {
  if (!images || !Array.isArray(images) || images.length === 0) return null;
  
  const firstImage = images[0];
  
  // Format 1: Object with url property
  if (typeof firstImage === 'object' && firstImage !== null && 'url' in firstImage) {
    return (firstImage as { url: string }).url;
  }
  
  // Format 2: Plain string URL
  if (typeof firstImage === 'string') {
    return firstImage;
  }
  
  return null;
}

const Home = () => {
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(INITIAL_ENABLED_TYPES);
  const [heroImage, setHeroImage] = useState<string>(heroFallback);
  const [isLoadingHero, setIsLoadingHero] = useState(true);
  
  // Generate headlines once on mount (lazy initialization)
  const headline = useMemo(() => composeHeadline(), []);
  const mapSubheadline = useMemo(() => composeMapSubheadline(), []);

  // Fetch random hero image from hero properties
  useEffect(() => {
    async function fetchHeroImage() {
      try {
        const { data: heroProperties } = await supabase
          .from("properties")
          .select("images")
          .eq("hero_listing", true)
          .eq("is_active", true);
        
        if (heroProperties && heroProperties.length > 0) {
          // Collect all primary images from hero properties
          const validImages: string[] = [];
          for (const prop of heroProperties) {
            const imageUrl = extractPrimaryImageUrl(prop.images);
            if (imageUrl) {
              validImages.push(imageUrl);
            }
          }
          
          // Randomly select one
          if (validImages.length > 0) {
            const randomIndex = Math.floor(Math.random() * validImages.length);
            setHeroImage(validImages[randomIndex]);
          }
        }
      } catch (error) {
        console.error("Error fetching hero image:", error);
      } finally {
        setIsLoadingHero(false);
      }
    }
    
    fetchHeroImage();
  }, []);

  const toggleType = (key: string) => {
    setEnabledTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      {/* Hero Section - Full Bleed */}
      <section className="relative h-screen w-full flex-shrink-0">
        {/* Full-bleed background image */}
        <div
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${isLoadingHero ? 'opacity-0' : 'opacity-100'}`}
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          {/* Subtle gradient overlay for text readability */}
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Logo - Top Left */}
        <div className="absolute top-6 left-6 z-20">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="h-10 w-10 rounded-lg bg-[var(--hero-gradient)] flex items-center justify-center">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white drop-shadow-lg">RoomsOnline</h1>
              <p className="text-xs text-white/80 drop-shadow">Unified Booking Engine</p>
            </div>
          </Link>
        </div>

        {/* Centered Value Proposition */}
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <p className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl text-white text-center font-medium tracking-wide max-w-4xl px-8 drop-shadow-lg leading-relaxed">
            {headline}
          </p>
        </div>
      </section>

      {/* Properties Map Section */}
      <section className="py-6 sm:py-10 bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-1">Explore Our World</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">{mapSubheadline}</p>
            <p className="text-xs sm:text-sm text-muted-foreground">Tap a pin to view details</p>
          </div>

          {/* Property Type Toggles - Horizontal scroll on mobile */}
          <div className="overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-hide">
            <div className="flex sm:flex-wrap sm:justify-center gap-2 mb-3 sm:mb-5 min-w-max sm:min-w-0">
              {PROPERTY_TYPES.map((type) => (
                <button
                  key={type.key}
                  onClick={() => toggleType(type.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all touch-manipulation active:scale-95 ${
                    enabledTypes[type.key] ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      enabledTypes[type.key] ? type.color : "bg-muted-foreground/30"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium whitespace-nowrap transition-colors ${
                      enabledTypes[type.key] ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
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

      {/* Why RoomsOnline Section */}
      <section className="py-6 sm:py-12 bg-secondary/30">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-center mb-4 sm:mb-8">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-1 sm:mb-2">Why RoomsOnline</h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
              Experience seamless booking with trusted local expertise
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[
              {
                icon: BadgeCheck,
                title: "Hand-Picked Stays",
                description:
                  "Every property is personally vetted — no surprises on arrival, only quality-assured accommodations.",
              },
              {
                icon: Zap,
                title: "Instant Confirmation",
                description:
                  "Book with confidence. Receive immediate confirmation and detailed reservation info in seconds.",
              },
              {
                icon: Lock,
                title: "Secure Payments",
                description: "Industry-standard encryption protects every transaction. Your data stays safe with us.",
              },
              {
                icon: MapPinned,
                title: "Local Experts",
                description:
                  "We know the owners, the towns, the hidden gems. Real insider knowledge at your fingertips.",
              },
              {
                icon: HeadphonesIcon,
                title: "24/7 Support",
                description: "Round-the-clock assistance whenever you need it. Average reply time under 5 minutes.",
              },
              {
                icon: Shield,
                title: "Trust Guaranteed",
                description: "Transparent pricing, no hidden fees. What you see is exactly what you pay.",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="flex gap-2.5 sm:gap-3 p-3 sm:p-4 rounded-lg bg-background border border-border/50 hover:border-primary/30 transition-colors"
              >
                <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <item.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-xs sm:text-sm text-foreground leading-tight mb-0.5">
                    {item.title}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">{item.description}</p>
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
            <span className="text-sm sm:text-base font-semibold text-foreground">RoomsOnline</span>

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
