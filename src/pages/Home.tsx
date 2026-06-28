import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { HeroVideo } from "@/components/ui/HeroVideo";
import { usePageSEO } from "@/hooks/usePageSEO";
import { SearchForm } from "@/components/SearchForm";
import { PropertiesMap } from "@/components/PropertiesMap";
import { useHomePropertySegments, SegmentSection } from "@/components/HomePropertySegments";
import { SegmentFilterId } from "@/lib/segmentFilters";
import { FindBySection } from "@/components/FindBySection";
import {
  Shield,
  Zap,
  HeadphonesIcon,
  BadgeCheck,
  MapPinned,
  Lock,
  X,
  Menu,
  Calendar,
  ArrowRight,
  BookOpen,
  Users,
  ShieldCheck,
  FileText,
  Mail,
  Scale,
} from "lucide-react";
import heroFallback from "@/assets/hero-hotel.jpg";
import rolLogo from "@/assets/rol-logo.png";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subYears } from "date-fns";
import { composeHeadline, composeMapSubheadline } from "@/lib/headlineComposer";
import CategoryBanner from "@/components/CategoryBanner";
import { BannerSegment } from "@/lib/bannerSegments";
import { MAP_FILTER_CATEGORIES, getMapFiltersByCategory, MapFilterCategoryId } from "@/lib/mapFilters";
import { SearchProvider, useSearch } from "@/contexts/SearchContext";
import { CurrencySelector } from "@/components/CurrencySelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AISearchProvider, useAISearch } from "@/contexts/AISearchContext";
import { AISearchInput } from "@/components/AISearchInput";
import { AIExplanationOverlay } from "@/components/AIExplanationOverlay";
import { PropertyCard } from "@/components/PropertyCard";
import { PublicFooter } from "@/components/layout/PublicFooter";

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
  if (typeof firstImage === "object" && firstImage !== null && "url" in firstImage) {
    return (firstImage as { url: string }).url;
  }

  // Format 2: Plain string URL
  if (typeof firstImage === "string") {
    return firstImage;
  }

  return null;
}

function HomeContent() {
  const {
    selectedProperty,
    searchResults,
    isExpanded,
    setSearchQuery,
    setSelectedProperty,
    resetSearch: resetSearchContext,
  } = useSearch();
  const { aiResults, isAISearchActive } = useAISearch();

  usePageSEO({
    title: "Sleep in Africa — Extraordinary African Accommodation",
    description: "Handpicked safari lodges, boutique hotels & guest houses across Africa. Book direct with real-time availability and best-rate guarantees.",
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "RoomsOnline",
        alternateName: "Sleep in Africa",
        url: "https://book.sleepinafrica.roomsonline.co.za",
        logo: "https://book.sleepinafrica.roomsonline.co.za/rol-logo.png",
        sameAs: [],
        contactPoint: {
          "@type": "ContactPoint",
          email: "hello@roomsonline.co.za",
          contactType: "customer service",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Sleep in Africa",
        url: "https://book.sleepinafrica.roomsonline.co.za",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://book.sleepinafrica.roomsonline.co.za/?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  });

  const [enabledTypes, setEnabledTypes] = useState<Record<string, boolean>>(INITIAL_ENABLED_TYPES);
  const [heroImage, setHeroImage] = useState<string>(heroFallback);
  const [heroVideoUrl, setHeroVideoUrl] = useState<string | null>(null);
  const [heroProperty, setHeroProperty] = useState<{ id: string; name: string; city: string; country: string; slug: string } | null>(null);
  const [originalHeroImage, setOriginalHeroImage] = useState<string>(heroFallback);
  const [originalHeroVideoUrl, setOriginalHeroVideoUrl] = useState<string | null>(null);
  const [originalHeroProperty, setOriginalHeroProperty] = useState<{
    id: string;
    name: string;
    city: string;
    country: string;
    slug: string;
  } | null>(null);
  const [isLoadingHero, setIsLoadingHero] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typesRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLElement>(null);
  const [selectedMapFilters, setSelectedMapFilters] = useState<string[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<BannerSegment | null>(null);

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

  // Compute filtered property IDs for map and segments
  const filteredPropertyIds = useMemo(() => {
    if (isAISearchActive && aiResults && aiResults.length > 0) {
      return aiResults;
    }
    if (selectedProperty) {
      return [selectedProperty.id];
    }
    if (searchResults.length > 0) {
      return searchResults.map((p) => p.id);
    }
    return null;
  }, [selectedProperty, searchResults, isAISearchActive, aiResults]);

  const isFiltered = filteredPropertyIds !== null || selectedMapFilters.length > 0 || selectedSegment !== null;

  const {
    destinationSection,
    typesSections,
    properties,
    isLoading: propertiesLoading,
  } = useHomePropertySegments(filteredPropertyIds, isFiltered);

  const filtersByCategory = useMemo(() => getMapFiltersByCategory(), []);

  const handleScrollToTypes = useCallback(() => {
    typesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleScrollToMap = useCallback(() => {
    mapRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Close hamburger menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleFilterSelect = (categoryId: MapFilterCategoryId, filterId: string) => {
    if (filterId === "all") {
      setSelectedMapFilters((prev) => prev.filter((id) => !filtersByCategory[categoryId].some((f) => f.id === id)));
    } else {
      setSelectedMapFilters((prev) => {
        const withoutCategory = prev.filter((id) => !filtersByCategory[categoryId].some((f) => f.id === id));
        return [...withoutCategory, filterId];
      });
    }
  };

  const clearAllFilters = () => {
    setSelectedMapFilters([]);
  };

  const getSelectedFilterForCategory = (categoryId: MapFilterCategoryId): string => {
    const categoryFilters = filtersByCategory[categoryId];
    const selected = selectedMapFilters.find((id) => categoryFilters.some((f) => f.id === id));
    return selected || "all";
  };

  const headline = useMemo(() => composeHeadline(), []);

  const handleSegmentClick = (segment: BannerSegment) => {
    if (segment.filterType === null) {
      setSelectedSegment(null);
      setTimeout(() => {
        const mapSection = document.getElementById("map-section");
        if (mapSection) {
          mapSection.scrollIntoView({ behavior: "smooth" });
        }
      }, 50);
      setEnabledTypes(INITIAL_ENABLED_TYPES);
    } else {
      setSelectedSegment(segment);
    }
  };

  useEffect(() => {
    if (selectedSegment) {
      setTimeout(() => {
        const segmentSection = document.getElementById(`segment-${selectedSegment.id}`);
        if (segmentSection) {
          segmentSection.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
    }
  }, [selectedSegment]);

  // Fetch random hero image from public properties (with hero-listing fallback)
  useEffect(() => {
    async function fetchHeroMedia() {
      try {
        const heroSelect = "id, images, name, city, country, slug, hero_listing";

        const { data: heroListedProperties } = await supabase
          .from("public_properties")
          .select(heroSelect)
          .eq("is_active", true)
          .eq("hero_listing", true);

        const { data: fallbackProperties } = !heroListedProperties || heroListedProperties.length === 0
          ? await supabase
              .from("public_properties")
              .select("id, images, name, city, country, slug")
              .eq("is_active", true)
          : { data: null };

        const sourceProperties =
          heroListedProperties && heroListedProperties.length > 0
            ? heroListedProperties
            : fallbackProperties || [];

        if (sourceProperties.length > 0) {
          const validProperties: {
            id: string;
            imageUrl: string;
            videoUrl: string | null;
            name: string;
            city: string;
            country: string;
            slug: string;
          }[] = [];

          for (const prop of sourceProperties) {
            const imageUrl = extractPrimaryImageUrl(prop.images);
            if (imageUrl) {
              validProperties.push({
                id: prop.id,
                imageUrl,
                videoUrl: null,
                name: prop.name,
                city: prop.city,
                country: prop.country,
                slug: prop.slug || "",
              });
            }
          }

          if (validProperties.length > 0) {
            const randomIndex = Math.floor(Math.random() * validProperties.length);
            const selected = validProperties[randomIndex];
            setHeroImage(selected.imageUrl);
            setHeroVideoUrl(selected.videoUrl);
            setHeroProperty({ id: selected.id, name: selected.name, city: selected.city, country: selected.country, slug: selected.slug });
            setOriginalHeroImage(selected.imageUrl);
            setOriginalHeroVideoUrl(selected.videoUrl);
            setOriginalHeroProperty({ id: selected.id, name: selected.name, city: selected.city, country: selected.country, slug: selected.slug });
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

  // Update hero image when AI or regular search is active
  useEffect(() => {
    async function updateFromAISearch() {
      if (isAISearchActive && aiResults && aiResults.length > 0) {
        try {
          const { data: aiProperty } = await supabase
            .from("properties")
            .select("id, images, hero_video_url, name, city, country, slug, navigation_tags, external_system")
            .eq("id", aiResults[0])
            .single();

          if (aiProperty) {
            const aiImage = extractPrimaryImageUrl(aiProperty.images);
            if (aiImage) {
              setHeroImage(aiImage);
              setHeroVideoUrl(aiProperty.hero_video_url || null);
              setHeroProperty({
                id: aiProperty.id,
                name: aiProperty.name,
                city: aiProperty.city,
                country: aiProperty.country,
                slug: aiProperty.slug || "",
              });
            }

            setSearchQuery(aiProperty.name);
            setSelectedProperty({
              id: aiProperty.id,
              name: aiProperty.name,
              city: aiProperty.city,
              country: aiProperty.country,
              slug: aiProperty.slug,
              images: aiProperty.images,
              navigation_tags: aiProperty.navigation_tags,
              external_system: aiProperty.external_system,
            });
          }
        } catch (error) {
          console.error("Error fetching AI property:", error);
        }
        return;
      }

      if (selectedProperty) {
        const selectedImage = extractPrimaryImageUrl(selectedProperty.images);
        if (selectedImage) {
          setHeroImage(selectedImage);
          setHeroVideoUrl(null);
          setHeroProperty({
            id: selectedProperty.id,
            name: selectedProperty.name,
            city: selectedProperty.city,
            country: selectedProperty.country,
            slug: selectedProperty.slug || "",
          });
        }
      } else if (!isAISearchActive) {
        setHeroImage(originalHeroImage);
        setHeroVideoUrl(originalHeroVideoUrl);
        setHeroProperty(originalHeroProperty);
      }
    }

    updateFromAISearch();
  }, [
    selectedProperty,
    originalHeroImage,
    originalHeroVideoUrl,
    originalHeroProperty,
    isAISearchActive,
    aiResults,
    setSearchQuery,
    setSelectedProperty,
  ]);

  // Reset hero when AI search is cleared
  useEffect(() => {
    if (!isAISearchActive && aiResults === null) {
      resetSearchContext();
      setHeroImage(originalHeroImage);
      setHeroVideoUrl(originalHeroVideoUrl);
      setHeroProperty(originalHeroProperty);
    }
  }, [isAISearchActive, aiResults, resetSearchContext, originalHeroImage, originalHeroVideoUrl, originalHeroProperty]);

  const toggleType = (key: string) => {
    setEnabledTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background flex flex-col">
      {/* Hero Section */}
      <section ref={heroRef} className="relative h-[100dvh] sm:h-screen w-full flex-shrink-0 landscape:min-h-[500px]">
        {/* Background media - clickable to property */}
        {/* Hero skeleton while loading */}
        {isLoadingHero && (
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-muted/80 to-muted animate-pulse" />
        )}
        <div
          className={`absolute inset-0 transition-opacity duration-700 ${isLoadingHero ? "opacity-0" : "opacity-100"}`}
        >
          {heroVideoUrl ? (
            <HeroVideo
              src={heroVideoUrl}
              autoPlay
              loop
              muted
              className="absolute inset-0 w-full h-full object-cover"
              poster={heroImage}
            />
          ) : (
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImage})` }} />
          )}
          {/* Refined gradient overlay - 35% for elegance */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/40" />
          {/* Clickable hero overlay to property page */}
          {heroProperty && (
            <Link
              to={`/property/${heroProperty.slug || heroProperty.id}`}
              className="absolute inset-0 z-[1]"
              aria-label={`View ${heroProperty.name}`}
            />
          )}
        </div>

        {/* Navigation Header */}
        <div
          className={`absolute top-0 left-0 right-0 z-20 transition-all duration-300 ${isExpanded ? "bg-background/95 backdrop-blur-md border-b border-border shadow-lg" : ""}`}
        >
          <div
            className={`flex items-center justify-between gap-4 ${isExpanded ? "px-4 py-3" : "px-4 py-4 sm:px-8 sm:py-6"}`}
          >
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity flex-shrink-0 group">
              <img
                src={rolLogo}
                alt="RoomsOnline"
                className={`object-contain invert brightness-0 filter drop-shadow-lg transition-transform group-hover:scale-105 ${isExpanded ? "h-8 w-8" : "h-10 w-10 sm:h-12 sm:w-12"}`}
              />
              <div className={`${isExpanded ? "hidden" : "block"}`}>
                <h1 className="font-display text-xl sm:text-2xl text-white drop-shadow-lg tracking-wide">
                  RoomsOnline — Extraordinary African Accommodation
                </h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/80 mt-0.5">Rooms done Right</p>
              </div>
            </Link>

            {/* Desktop Search */}
            <div
              className={`hidden sm:flex flex-1 max-w-xl mx-4 transition-opacity ${isExpanded ? "opacity-100" : "opacity-60 hover:opacity-90"}`}
            >
              <SearchForm />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <CurrencySelector compact className="hero" />

              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className={`rounded-lg flex items-center justify-center transition-all ${
                    isExpanded
                      ? "h-9 w-9 bg-muted hover:bg-muted/80"
                      : "h-10 w-10 bg-transparent hover:bg-white/10 border-transparent"
                  }`}
                  aria-label="Open menu"
                >
                  <Menu className={`${isExpanded ? "h-5 w-5 text-foreground" : "h-5 w-5 text-white"}`} />
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div className="absolute top-12 right-0 w-56 bg-background border border-border rounded-xl shadow-2xl py-2 z-50 animate-fade-in">
                    {[
                      { to: "/journals", icon: BookOpen, label: "Journal" },
                      { to: "/about", icon: Users, label: "About Us" },
                      { to: "/how-our-booking-engine-works", icon: Scale, label: "How It Works" },
                      { to: "/privacy-policy", icon: ShieldCheck, label: "Privacy" },
                      { to: "/terms-of-service", icon: FileText, label: "Terms" },
                      { to: "/contact", icon: Mail, label: "Contact Us" },
                    ].map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted/60 transition-colors"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Search */}
          <div className={`sm:hidden px-4 pb-4 transition-opacity ${isExpanded ? "opacity-100" : "opacity-60"}`}>
            <SearchForm />
          </div>
        </div>


        {/* Hero Text */}
        <div
          className={`absolute inset-0 flex items-start pt-32 sm:pt-40 landscape:pt-24 z-10 pointer-events-none transition-opacity duration-500 ${isAISearchActive ? "opacity-0" : "opacity-100"}`}
        >
          <div className="w-full px-4 sm:px-8 md:px-12 flex flex-col">
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-white drop-shadow-lg mb-4 sm:mb-6 tracking-tight leading-tight">
              Sleep in Africa <span className="text-[0.5em]">by RoomsOnline.</span>
            </h2>
            <p className="font-display text-base sm:text-lg md:text-xl lg:text-2xl text-white/90 drop-shadow-md leading-relaxed max-w-2xl italic tracking-normal">
              {headline}
            </p>
          </div>
        </div>

        {/* AI Overlays */}
        <AIExplanationOverlay />

        <div className="absolute bottom-24 sm:bottom-28 left-0 right-0 z-20">
          <AISearchInput />
        </div>

        {/* Hero property credit overlay - clickable link to property showcase */}
        {heroProperty && (
          <Link
            to={`/property/${heroProperty.slug || heroProperty.id}`}
            className="absolute right-4 sm:right-8 z-[40] text-white hover:text-white text-xs sm:text-sm transition-all drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] flex items-center gap-1.5 bg-black/60 hover:bg-black/70 backdrop-blur-md rounded-full px-4 py-2 cursor-pointer border border-white/20"
            style={{ bottom: "170px" }}
          >
            <span className="font-semibold">{heroProperty.name}</span>
            <span className="text-white/75">•</span>
            <span className="text-white/90">{heroProperty.city}</span>
          </Link>
        )}

        <CategoryBanner
          onSegmentClick={handleSegmentClick}
          heroRef={heroRef}
          selectedProperty={selectedProperty ?? null}
        />
      </section>

      {/* Find By Section */}
      {!isAISearchActive && <FindBySection onScrollToTypes={handleScrollToTypes} onScrollToMap={handleScrollToMap} />}

      {/* Map Section */}
      <section ref={mapRef} id="map-section" className="py-12 sm:py-16 bg-background">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mb-6">
            <h2 className="font-sans text-2xl sm:text-3xl font-medium text-foreground tracking-tight leading-tight mb-2">
              {isAISearchActive ? "Your Match" : "Explore Our World"}
            </h2>
            {!isAISearchActive && (
              <p className="text-muted-foreground text-sm sm:text-base max-w-2xl leading-relaxed">
                Toggle or filter by what calls to you — lodges, coastal retreats, or something unexpected.
              </p>
            )}
          </div>

          {/* Property Type Toggles */}
          {!isAISearchActive && (
            <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible scrollbar-hide mb-6">
              <div className="flex sm:flex-wrap sm:justify-start gap-2 min-w-max sm:min-w-0">
                {PROPERTY_TYPES.map((type) => (
                  <button
                    key={type.key}
                    onClick={() => toggleType(type.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all duration-200 touch-manipulation active:scale-95 ${
                      enabledTypes[type.key]
                        ? "border-primary/40 bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-muted-foreground/30"
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                        enabledTypes[type.key] ? type.color : "bg-muted-foreground/30"
                      }`}
                    />
                    <span
                      className={`text-sm transition-colors duration-200 ${enabledTypes[type.key] ? "text-foreground font-medium" : "text-muted-foreground"}`}
                    >
                      {type.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filter Dropdowns */}
          {!isAISearchActive && (
            <div className="flex flex-wrap items-center gap-3 mb-6">
              {MAP_FILTER_CATEGORIES.map((category) => (
                <Select
                  key={category.id}
                  value={getSelectedFilterForCategory(category.id)}
                  onValueChange={(value) => handleFilterSelect(category.id, value)}
                >
                  <SelectTrigger className="w-[140px] sm:w-[160px] h-10 text-sm bg-background border-border hover:border-primary/30 transition-colors">
                    <SelectValue placeholder={category.label} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border z-50">
                    <SelectItem value="all" className="text-sm">
                      All {category.label}
                    </SelectItem>
                    {filtersByCategory[category.id].map((filter) => (
                      <SelectItem key={filter.id} value={filter.id} className="text-sm">
                        {filter.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
              {selectedMapFilters.length > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </button>
              )}
            </div>
          )}

          <div className="h-[300px] sm:h-[400px] md:h-[500px] rounded-xl overflow-hidden border border-border shadow-sm">
            <PropertiesMap
              enabledTypes={enabledTypes}
              typeColors={TYPE_COLORS}
              selectedMapFilters={selectedMapFilters}
              filteredPropertyIds={filteredPropertyIds ?? null}
              autoOpenFirstMarker={isAISearchActive}
            />
          </div>
        </div>
      </section>

      {/* AI Search Results */}
      {isAISearchActive && aiResults && aiResults.length > 0 && (
        <section className="py-12 sm:py-16 bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="mb-6">
              <h2 className="font-sans text-2xl sm:text-3xl font-medium text-foreground tracking-tight leading-tight mb-2">
                Your Perfect Match{aiResults.length > 1 ? "es" : ""}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {aiResults.length === 1
                  ? "Based on your search, we found the ideal property for you"
                  : `Found ${aiResults.length} properties that match your criteria`}
              </p>
            </div>

            {aiResults.length === 1 ? (
              <div className="flex justify-center">
                <div className="w-full max-w-md">
                  {properties
                    .filter((p) => aiResults.includes(p.id))
                    .map((property) => (
                      <PropertyCard key={property.id} property={property} variant="large" showCautionBadge={true} />
                    ))}
                </div>
              </div>
            ) : aiResults.length === 2 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
                {properties
                  .filter((p) => aiResults.includes(p.id))
                  .map((property) => (
                    <PropertyCard key={property.id} property={property} variant="large" showCautionBadge={true} />
                  ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8">
                {properties
                  .filter((p) => aiResults.includes(p.id))
                  .map((property) => (
                    <PropertyCard key={property.id} property={property} showCautionBadge={true} />
                  ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Property Segments */}
      {!isAISearchActive && (
        <div ref={typesRef}>
          {selectedSegment ? (
            <SegmentSection
              id={`segment-${selectedSegment.id}`}
              title={selectedSegment.label}
              segmentId={selectedSegment.filterType as SegmentFilterId}
              properties={properties}
              isLoading={propertiesLoading}
              isFiltered={isFiltered}
            />
          ) : (
            <>
              {typesSections}
              {destinationSection}
            </>
          )}
        </div>
      )}

      {/* Why RoomsOnline Section */}
      <section className="py-12 sm:py-16 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mb-6">
            <h2 className="font-sans text-2xl sm:text-3xl font-medium text-foreground tracking-tight leading-tight">
              Why RoomsOnline
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
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
                title: "Personalized Support",
                description:
                  "Dedicated travel experts who understand your needs. We're here to help make your stay perfect.",
              },
              {
                icon: Shield,
                title: "Trust Guaranteed",
                description: "Transparent pricing, no hidden fees. What you see is exactly what you pay.",
              },
            ].map((item, index) => (
              <div
                key={index}
                className="flex gap-4 p-5 sm:p-6 rounded-xl bg-card border border-border hover:border-primary/30 hover:shadow-sm transition-all duration-200"
              >
                <div className="flex-shrink-0 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <item.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-sm sm:text-base text-foreground mb-1 tracking-tight">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Journal Preview */}
      {latestJournals && latestJournals.length > 0 && (
        <section className="py-12 sm:py-16 bg-background">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-sans text-2xl sm:text-3xl font-medium text-foreground tracking-tight leading-tight">
                From the Journal
              </h2>
              <Link
                to="/journals"
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors duration-200 group"
              >
                View all
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {latestJournals.map((journal) => (
                <Link
                  key={journal.id}
                  to={`/journals#journal-${journal.slug || journal.id}`}
                  className="group block bg-card rounded-xl border border-border overflow-hidden hover:border-primary/30 hover:shadow-sm transition-all duration-200"
                >
                  {(journal.featured_image_url || journal.header_image_url) && (
                    <div className="aspect-[16/9] overflow-hidden">
                      <img
                        src={journal.featured_image_url || journal.header_image_url || ""}
                        alt={journal.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  )}

                  <div className="p-5 sm:p-6">
                    <h3 className="font-display text-base sm:text-lg text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors duration-200 tracking-tight leading-tight">
                      {journal.title}
                    </h3>
                    {journal.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
                        {journal.excerpt}
                      </p>
                    )}
                    {journal.publish_date && (
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <time dateTime={journal.publish_date}>
                          {format(new Date(journal.publish_date), "MMMM d, yyyy")}
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

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}

const Home = () => {
  return (
    <SearchProvider>
      <AISearchProvider>
        <HomeContent />
      </AISearchProvider>
    </SearchProvider>
  );
};

export default Home;
