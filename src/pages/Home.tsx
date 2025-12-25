import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { SearchForm } from "@/components/SearchForm";
import { PropertiesMap } from "@/components/PropertiesMap";
import { useHomePropertySegments } from "@/components/HomePropertySegments";
import { FindBySection } from "@/components/FindBySection";
import { Shield, Zap, HeadphonesIcon, BadgeCheck, MapPinned, Lock, X, Menu, Calendar, ArrowRight, BookOpen, Users, ShieldCheck, FileText, Mail } from "lucide-react";
import heroFallback from "@/assets/hero-hotel.jpg";
import rolLogo from "@/assets/rol-logo.png";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subYears } from "date-fns";
import { composeHeadline, composeMapSubheadline } from "@/lib/headlineComposer";
import CategoryBanner from "@/components/CategoryBanner";
import { BannerSegment, BANNER_SEGMENTS } from "@/lib/bannerSegments";
import { MAP_FILTER_CATEGORIES, getMapFiltersByCategory, MapFilterCategoryId } from "@/lib/mapFilters";
import { SearchProvider, useSearch } from "@/contexts/SearchContext";
import { CurrencySelector } from "@/components/CurrencySelector";
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

function HomeContent() {
  const { selectedProperty, searchResults, isExpanded } = useSearch();
  
  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(INITIAL_ENABLED_TYPES);
  const [heroImage, setHeroImage] = useState<string>(heroFallback);
  const [heroVideoUrl, setHeroVideoUrl] = useState<string | null>(null);
  const [heroProperty, setHeroProperty] = useState<{ name: string; city: string; country: string } | null>(null);
  const [originalHeroImage, setOriginalHeroImage] = useState<string>(heroFallback);
  const [originalHeroVideoUrl, setOriginalHeroVideoUrl] = useState<string | null>(null);
  const [originalHeroProperty, setOriginalHeroProperty] = useState<{ name: string; city: string; country: string } | null>(null);
  const [isLoadingHero, setIsLoadingHero] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const typesRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLElement>(null);
  const [selectedMapFilters, setSelectedMapFilters] = useState<string[]>([]);
  
  // Fetch latest 2 journals for preview
  const threeYearsAgo = subYears(new Date(), 3).toISOString();
  const { data: latestJournals } = useQuery({
    queryKey: ["home-journal-preview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journals")
        .select("id, title, excerpt, featured_image_url, header_image_url, publish_date, slug")
        .eq("status", "published")
        .gte("publish_date", threeYearsAgo)
        .order("publish_date", { ascending: false })
        .limit(2);

      if (error) throw error;
      return data;
    },
  });
  
  // Compute filtered property IDs for map and segments (moved up for hook usage)
  const filteredPropertyIds = useMemo(() => {
    if (selectedProperty) {
      return [selectedProperty.id];
    }
    if (searchResults.length > 0) {
      return searchResults.map(p => p.id);
    }
    return null; // null means no filter
  }, [selectedProperty, searchResults]);

  // Get property segments with search filtering
  const { discoverNewSection, destinationSection, typesSections } = useHomePropertySegments(filteredPropertyIds);
  
  // Get filters grouped by category
  const filtersByCategory = useMemo(() => getMapFiltersByCategory(), []);

  // Scroll handlers for FindBy section
  const handleScrollToTypes = useCallback(() => {
    typesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleScrollToMap = useCallback(() => {
    mapRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  
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

  // Fetch random hero image/video from hero properties
  useEffect(() => {
    async function fetchHeroMedia() {
      try {
        const { data: heroProperties } = await supabase
          .from("properties")
          .select("images, hero_video_url, name, city, country")
          .eq("hero_listing", true)
          .eq("is_active", true);
        
        if (heroProperties && heroProperties.length > 0) {
          // Collect all valid hero properties with their media
          const validProperties: { imageUrl: string; videoUrl: string | null; name: string; city: string; country: string }[] = [];
          for (const prop of heroProperties) {
            const imageUrl = extractPrimaryImageUrl(prop.images);
            if (imageUrl) {
              validProperties.push({
                imageUrl,
                videoUrl: prop.hero_video_url || null,
                name: prop.name,
                city: prop.city,
                country: prop.country,
              });
            }
          }
          
          // Randomly select one
          if (validProperties.length > 0) {
            const randomIndex = Math.floor(Math.random() * validProperties.length);
            const selected = validProperties[randomIndex];
            setHeroImage(selected.imageUrl);
            setHeroVideoUrl(selected.videoUrl);
            setHeroProperty({ name: selected.name, city: selected.city, country: selected.country });
            // Store original values
            setOriginalHeroImage(selected.imageUrl);
            setOriginalHeroVideoUrl(selected.videoUrl);
            setOriginalHeroProperty({ name: selected.name, city: selected.city, country: selected.country });
          }
        }
      } catch (error) {
        console.error("Error fetching hero image:", error);
      } finally {
        setIsLoadingHero(false);
      }
    }
    
    fetchHeroMedia();
  }, []);

  // Update hero image when a property is selected from search
  useEffect(() => {
    if (selectedProperty) {
      const selectedImage = extractPrimaryImageUrl(selectedProperty.images);
      if (selectedImage) {
        setHeroImage(selectedImage);
        setHeroVideoUrl(null); // No video for search-selected property
        setHeroProperty({ 
          name: selectedProperty.name, 
          city: selectedProperty.city, 
          country: selectedProperty.country 
        });
      }
    } else {
      // Reset to original when no property selected
      setHeroImage(originalHeroImage);
      setHeroVideoUrl(originalHeroVideoUrl);
      setHeroProperty(originalHeroProperty);
    }
  }, [selectedProperty, originalHeroImage, originalHeroVideoUrl, originalHeroProperty]);

  const toggleType = (key: string) => {
    setEnabledTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };


  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      {/* Hero Section - Full Bleed */}
      <section ref={heroRef} className="relative h-screen w-full flex-shrink-0">
        {/* Full-bleed background - video if available, image as fallback */}
        <div className={`absolute inset-0 transition-opacity duration-700 ${isLoadingHero ? 'opacity-0' : 'opacity-100'}`}>
          {heroVideoUrl ? (
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
              poster={heroImage}
            >
              <source src={heroVideoUrl} type="video/mp4" />
            </video>
          ) : (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
          )}
          {/* Subtle gradient overlay for text readability */}
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Top Bar - Logo, Search, Menu */}
        <div className={`absolute top-0 left-0 right-0 z-20 transition-all duration-300 ${isExpanded ? 'bg-background border-b border-border shadow-lg' : ''}`}>
          {/* Row 1: Navigation - Logo, Currency, Menu */}
          <div className={`flex items-center justify-between gap-4 ${isExpanded ? 'px-4 py-3' : 'px-4 py-4 sm:px-6 sm:py-6'}`}>
            {/* Logo - Left */}
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0">
              <img 
                src={rolLogo} 
                alt="RoomsOnline" 
                className={`object-contain invert brightness-0 filter drop-shadow-lg ${isExpanded ? 'h-8 w-8' : 'h-10 w-10 sm:h-12 sm:w-12'}`}
              />
              <div className={`${isExpanded ? 'hidden' : 'block'}`}>
                <h1 className="text-lg sm:text-xl font-bold text-white drop-shadow-lg">RoomsOnline</h1>
                <p className="text-xs text-white/80 drop-shadow hidden sm:block">Unified Booking Engine</p>
              </div>
            </Link>

            {/* Desktop: Search Bar inline - hidden on mobile */}
            <div className={`hidden sm:flex flex-1 max-w-xl mx-4 transition-opacity ${isExpanded ? 'opacity-100' : 'opacity-50 hover:opacity-75'}`}>
              <SearchForm />
            </div>

            {/* Currency Selector & Hamburger Menu - Right */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <CurrencySelector compact className="hero" />
              
              <div className="relative">
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className={`rounded-lg flex items-center justify-center transition-colors ${isExpanded ? 'h-8 w-8 bg-muted hover:bg-muted/80' : 'h-10 w-10 bg-white/10 backdrop-blur-sm hover:bg-white/20'}`}
                  aria-label="Open menu"
                >
                  <Menu className={`${isExpanded ? 'h-5 w-5 text-foreground' : 'h-6 w-6 text-white'}`} />
                </button>
              
                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div className="absolute top-12 right-0 w-52 bg-background/95 backdrop-blur-md border border-border rounded-lg shadow-xl py-2 z-50">
                    <Link
                      to="/journals"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      Journal
                    </Link>
                    <Link
                      to="/about"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      About Us
                    </Link>
                    <Link
                      to="/privacy-policy"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      Privacy
                    </Link>
                    <Link
                      to="/terms-of-service"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Terms & Conditions
                    </Link>
                    <Link
                      to="/contact"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Contact Us
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Row 2: Mobile Search Bar - hidden on desktop */}
          <div className={`sm:hidden px-4 pb-4 transition-opacity ${isExpanded ? 'opacity-100' : 'opacity-50'}`}>
            <SearchForm />
          </div>
        </div>

        {/* Property Attribution - Bottom Right */}
        {heroProperty && (
          <div className="absolute bottom-24 sm:bottom-28 right-6 z-20 text-right">
            <p className="text-sm sm:text-base font-medium text-white drop-shadow-lg">
              {heroProperty.name}
            </p>
            <p className="text-xs sm:text-sm text-white/80 drop-shadow">
              {heroProperty.city}, {heroProperty.country}
            </p>
          </div>
        )}

        {/* Hero Text Layout */}
        <div className="absolute inset-0 flex items-end pb-32 sm:pb-36 z-10">
          <div className="w-full px-6 md:px-12 flex flex-col">
            {/* "We are RoomsOnline." - Left-aligned */}
            <p className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl text-white font-bold tracking-wide drop-shadow-lg mb-4 text-left whitespace-nowrap">
              We are RoomsOnline.
            </p>
            {/* Main hero text */}
            <p className="text-xl md:text-2xl lg:text-3xl xl:text-4xl text-white font-medium tracking-wide drop-shadow-lg leading-relaxed text-right max-w-[50%] self-center mr-auto">
              {headline}
            </p>
          </div>
        </div>

        {/* Auto-scrolling Category Banner */}
        <CategoryBanner 
          onSegmentClick={handleSegmentClick} 
          heroRef={heroRef} 
          selectedProperty={selectedProperty ?? null}
        />
      </section>

      {/* Find By Section */}
      <FindBySection 
        onScrollToTypes={handleScrollToTypes} 
        onScrollToMap={handleScrollToMap} 
      />

      {/* Discover New Segment */}
      {discoverNewSection}

      {/* Destination Segment */}
      {destinationSection}

      {/* Properties Map Section */}
      <section ref={mapRef} id="map-section" className="py-6 sm:py-10 bg-background">
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
            <PropertiesMap 
              enabledTypes={enabledTypes} 
              typeColors={TYPE_COLORS} 
              selectedMapFilters={selectedMapFilters}
              filteredPropertyIds={filteredPropertyIds ?? null}
            />
          </div>
        </div>
      </section>

      {/* Type Segments */}
      <div ref={typesRef}>
        {typesSections}
      </div>

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

      {/* Journal Preview Section */}
      {latestJournals && latestJournals.length > 0 && (
        <section className="py-6 sm:py-12 bg-background">
          <div className="container mx-auto px-3 sm:px-4">
            <div className="flex items-center justify-between mb-4 sm:mb-8">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">From the Journal</h2>
              <Link 
                to="/journals" 
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View all
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {latestJournals.map((journal) => (
                <Link
                  key={journal.id}
                  to={`/journals#journal-${journal.slug || journal.id}`}
                  className="group block bg-card rounded-lg border border-border overflow-hidden hover:border-primary/30 transition-colors"
                >
                  {/* Image */}
                  {(journal.featured_image_url || journal.header_image_url) && (
                    <div className="aspect-[16/9] overflow-hidden">
                      <img
                        src={journal.featured_image_url || journal.header_image_url || ""}
                        alt={journal.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  
                  {/* Content */}
                  <div className="p-4">
                    <h3 className="font-semibold text-sm sm:text-base text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                      {journal.title}
                    </h3>
                    {journal.excerpt && (
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mb-3">
                        {journal.excerpt}
                      </p>
                    )}
                    {journal.publish_date && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <time dateTime={journal.publish_date}>
                          {format(new Date(journal.publish_date), "MMM d, yyyy")}
                        </time>
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

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
}

const Home = () => {
  return (
    <SearchProvider>
      <HomeContent />
    </SearchProvider>
  );
};

export default Home;
