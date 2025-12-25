import { useState, useEffect, useMemo, useRef } from "react";
import { SearchForm } from "@/components/SearchForm";
import { PropertiesMap } from "@/components/PropertiesMap";
import { HomePropertySegments } from "@/components/HomePropertySegments";
import { Shield, Zap, HeadphonesIcon, BadgeCheck, MapPinned, Lock, Building2, ChevronDown, X } from "lucide-react";
import heroFallback from "@/assets/hero-hotel.jpg";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { composeHeadline, composeMapSubheadline } from "@/lib/headlineComposer";
import CategoryBanner from "@/components/CategoryBanner";
import { BannerSegment, BANNER_SEGMENTS } from "@/lib/bannerSegments";
import { MAP_FILTER_CATEGORIES, getMapFiltersByCategory, MapFilterCategoryId } from "@/lib/mapFilters";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const heroRef = useRef<HTMLElement>(null);
  const [selectedMapFilters, setSelectedMapFilters] = useState<string[]>([]);
  
  // Get filters grouped by category
  const filtersByCategory = useMemo(() => getMapFiltersByCategory(), []);
  
  const handleFilterSelect = (categoryId: MapFilterCategoryId, filterId: string) => {
    if (filterId === "all") {
      // Remove filters from this category
      setSelectedMapFilters(prev => 
        prev.filter(id => !filtersByCategory[categoryId].some(f => f.id === id))
      );
    } else {
      // Replace any existing filter from this category with the new one
      setSelectedMapFilters(prev => {
        const withoutCategory = prev.filter(id => 
          !filtersByCategory[categoryId].some(f => f.id === id)
        );
        return [...withoutCategory, filterId];
      });
    }
  };
  
  const clearAllFilters = () => {
    setSelectedMapFilters([]);
  };
  
  const getSelectedFilterForCategory = (categoryId: MapFilterCategoryId): string => {
    const categoryFilters = filtersByCategory[categoryId];
    const selected = selectedMapFilters.find(id => categoryFilters.some(f => f.id === id));
    return selected || "all";
  };
  
  // Generate headlines once on mount (lazy initialization)
  const headline = useMemo(() => composeHeadline(), []);
  const mapSubheadline = useMemo(() => composeMapSubheadline(), []);

  const handleSegmentClick = (segment: BannerSegment) => {
    if (segment.filterType === null) {
      // "ALL" - scroll to map and enable all types
      const mapSection = document.getElementById("map-section");
      if (mapSection) {
        mapSection.scrollIntoView({ behavior: "smooth" });
      }
      setEnabledTypes(INITIAL_ENABLED_TYPES);
    } else {
      // Scroll to the specific segment section
      const segmentSection = document.getElementById(`segment-${segment.id}`);
      if (segmentSection) {
        segmentSection.scrollIntoView({ behavior: "smooth" });
      } else {
        // Fallback to map if segment section doesn't exist
        const mapSection = document.getElementById("map-section");
        if (mapSection) {
          mapSection.scrollIntoView({ behavior: "smooth" });
        }
      }
    }
  };

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
      <section ref={heroRef} className="relative h-screen w-full flex-shrink-0">
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

        {/* Hero Text Layout */}
        <div className="absolute inset-0 flex items-start pt-32 md:pt-40 z-10">
          <div className="w-full px-6 md:px-12 flex flex-col">
            {/* "We are RoomsOnline." - Left-aligned, reduced 25% */}
            <p className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl text-white font-bold tracking-wide drop-shadow-lg mb-4 text-left whitespace-nowrap">
              We are RoomsOnline.
            </p>
            {/* Main hero text - Aligned to center, writing right-to-left from middle, reduced 25% */}
            <p className="text-xl md:text-2xl lg:text-3xl xl:text-4xl text-white font-medium tracking-wide drop-shadow-lg leading-relaxed text-right max-w-[50%] self-center mr-auto">
              {headline}
            </p>
          </div>
        </div>

        {/* Auto-scrolling Category Banner */}
        <CategoryBanner onSegmentClick={handleSegmentClick} heroRef={heroRef} />
      </section>

      {/* Properties Map Section */}
      <section id="map-section" className="py-6 sm:py-10 bg-background">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-left mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">Explore Our World</h2>
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

          {/* Navigation Tag Filter Dropdowns */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
            {MAP_FILTER_CATEGORIES.map((category) => (
              <Select
                key={category.id}
                value={getSelectedFilterForCategory(category.id)}
                onValueChange={(value) => handleFilterSelect(category.id, value)}
              >
                <SelectTrigger className="w-[140px] sm:w-[160px] h-9 text-xs sm:text-sm bg-background border-border">
                  <SelectValue placeholder={category.label} />
                </SelectTrigger>
                <SelectContent className="bg-background border-border z-50">
                  <SelectItem value="all" className="text-xs sm:text-sm">
                    All {category.label}
                  </SelectItem>
                  {filtersByCategory[category.id].map((filter) => (
                    <SelectItem key={filter.id} value={filter.id} className="text-xs sm:text-sm">
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
            {selectedMapFilters.length > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          <div className="h-[250px] sm:h-[350px] md:h-[400px] rounded-lg overflow-hidden border border-border shadow-sm">
            <PropertiesMap enabledTypes={enabledTypes} typeColors={TYPE_COLORS} selectedMapFilters={selectedMapFilters} />
          </div>
        </div>
      </section>

      {/* Property Segment Sections - Dynamic Random Selection */}
      <HomePropertySegments />

      {/* Why RoomsOnline Section */}
      <section className="py-6 sm:py-12 bg-secondary/30">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="text-left mb-4 sm:mb-8">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">Why RoomsOnline</h2>
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
          <div className="flex justify-end">
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              © 2025 RoomsOnline
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
