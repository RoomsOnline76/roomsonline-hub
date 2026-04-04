import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { HeroVideo } from "@/components/ui/HeroVideo";
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Search, MapPin, Users, BedDouble, ChevronRight, Loader2, Building2, Sparkles, Package, Star, Tag, Volume2, VolumeX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { fetchLiveRatesBatch } from "@/lib/pmsLiveAvailability";
import { EmbedPortfolioMap } from "@/components/embed/EmbedPortfolioMap";
import { EmbedPortfolioReviews } from "@/components/embed/EmbedPortfolioReviews";

interface ReviewRating {
  source: string;
  rating: number;
  totalReviews: number;
}

function postToParent(data: Record<string, unknown>) {
  if (window.parent !== window) {
    window.parent.postMessage(data, "*");
  }
}

interface PortfolioProperty {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  description: string | null;
  hero_image: string | null;
  starting_rate: number | null;
  room_count: number;
  max_guests: number | null;
  brand_primary_color?: string | null;
  external_system?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  key_highlights?: string[] | null;
  space_description?: string | null;
  hero_video_url?: string | null;
}

interface AiGroup {
  group_name: string;
  property_slugs: string[];
  description: string;
}

interface AiBundle {
  bundle_name: string;
  property_slugs: string[];
  pitch: string;
}

interface AiFeatured {
  property_slug: string;
  reason: string;
}

interface AiSearchResult {
  slug: string;
  name: string;
  score: number;
  reason: string;
}

interface PortfolioSpecial {
  id: string;
  name: string;
  description: string | null;
  discount_type: string | null;
  discount_value: number | null;
  valid_from: string | null;
  valid_to: string | null;
  property_id: string;
  property_name: string | null;
  property_slug: string | null;
}

export default function EmbedPortfolio() {
  const { portfolioSlug } = useParams<{ portfolioSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlBrandColor = searchParams.get("brand_color");
  const urlBrandLogo = searchParams.get("brand_logo");
  const layout = searchParams.get("layout") || "grid";

  const [portfolio, setPortfolio] = useState<any>(null);
  const [properties, setProperties] = useState<PortfolioProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");

  // AI state
  const [aiGroups, setAiGroups] = useState<AiGroup[]>([]);
  const [aiBundles, setAiBundles] = useState<AiBundle[]>([]);
  const [aiFeatured, setAiFeatured] = useState<AiFeatured | null>(null);
  const [activeGroup, setActiveGroup] = useState<string>("all");
  const [aiSearchResults, setAiSearchResults] = useState<AiSearchResult[] | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  const [reviewRatings, setReviewRatings] = useState<Record<string, ReviewRating[]>>({});
  const [specials, setSpecials] = useState<PortfolioSpecial[]>([]);
  const [portfolioReviews, setPortfolioReviews] = useState<any[]>([]);
  const [tobiBlurbs, setTobiBlurbs] = useState<{ property_name: string; blurb: string }[]>([]);
  const [heroVideoMuted, setHeroVideoMuted] = useState(true);
  // Resolve branding: URL params override portfolio metadata
  const portfolioBranding = portfolio?.metadata?.branding || portfolio?.branding || {};
  const brandColor = urlBrandColor || portfolioBranding.primary_color || "#2563eb";
  const brandSecondaryColor = portfolioBranding.secondary_color || brandColor;
  const brandLogo = urlBrandLogo || portfolioBranding.logo_url || null;

  // Resize observer for iframe
  useEffect(() => {
    if (window.parent === window) return;
    const observer = new ResizeObserver(() => {
      postToParent({ type: "rolos:resize", height: document.body.scrollHeight, portfolio: portfolioSlug });
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [portfolioSlug]);

  useEffect(() => {
    const fetchData = async () => {
      if (!portfolioSlug) return;
      setLoading(true);

      // Try the edge function API with AI enrichment
      try {
        // Use direct fetch for GET with query params
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/booking-portfolio-api?portfolio=${portfolioSlug}&ai=true`,
          {
            headers: {
              "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );

        if (resp.ok) {
          const data = await resp.json();
          setPortfolio(data.portfolio);

          const mapped: PortfolioProperty[] = (data.properties || []).map((p: any, i: number) => ({
            id: p.id || p.slug || `prop-${i}`,
            name: p.name,
            slug: p.slug,
            city: p.city,
            description: p.description,
            hero_image: p.hero_image,
            starting_rate: p.starting_rate,
            room_count: p.room_count || 0,
            max_guests: p.max_guests,
            brand_primary_color: p.brand_primary_color,
            external_system: p.external_system || null,
            latitude: p.latitude || null,
            longitude: p.longitude || null,
            key_highlights: p.key_highlights || null,
            space_description: p.space_description || null,
          }));
          setProperties(mapped);

          // Reviews & TOBI blurbs from API
          if (data.reviews) setPortfolioReviews(data.reviews);
          if (data.tobi_blurbs) setTobiBlurbs(data.tobi_blurbs);

          // AI data
          if (data.ai_groups) setAiGroups(data.ai_groups);
          if (data.ai_bundles) setAiBundles(data.ai_bundles);
          if (data.ai_featured) setAiFeatured(data.ai_featured);
          if (data.specials && data.specials.length > 0) {
            setSpecials(data.specials);
          } else {
            // Fallback: fetch specials client-side if API returned empty
            const propIds = mapped.map((p: PortfolioProperty) => p.id);
            if (propIds.length > 0) {
              const today = new Date().toISOString().split("T")[0];
              const { data: fallbackSpecials } = await supabase
                .from("property_specials" as any)
                .select("id, name, description, special_type, discount_percent, fixed_amount, fixed_price, currency, valid_from, valid_to, property_id")
                .eq("is_active", true)
                .eq("is_public", true)
                .gte("valid_to", today)
                .in("property_id", propIds);
              if (fallbackSpecials && fallbackSpecials.length > 0) {
                const fbMapped = (fallbackSpecials as any[]).map((s) => {
                  const prop = mapped.find((p: PortfolioProperty) => p.id === s.property_id);
                  let discount_type = "percentage";
                  let discount_value = s.discount_percent || s.fixed_amount || s.fixed_price || 0;
                  if (s.discount_percent) { discount_type = "percentage"; discount_value = s.discount_percent; }
                  else if (s.fixed_amount) { discount_type = "fixed_amount"; discount_value = s.fixed_amount; }
                  else if (s.fixed_price) { discount_type = "fixed_price"; discount_value = s.fixed_price; }
                  return { id: s.id, name: s.name, description: s.description, discount_type, discount_value, valid_from: s.valid_from, valid_to: s.valid_to, property_id: s.property_id, property_name: prop?.name || null, property_slug: prop?.slug || null };
                });
                setSpecials(fbMapped);
              }
            }
          }

          setLoading(false);
          return;
        }
      } catch {
        // Fall through to direct DB query
      }

      // Fallback: direct DB queries
      const { data: pf } = await supabase
        .from("property_portfolios" as any)
        .select("*")
        .eq("slug", portfolioSlug)
        .single();

      if (!pf) { setLoading(false); return; }
      setPortfolio(pf);

      const { data: members } = await supabase
        .from("property_portfolio_members" as any)
        .select("property_id")
        .eq("portfolio_id", (pf as any).id);

      if (!members || members.length === 0) { setProperties([]); setLoading(false); return; }

      const propertyIds = (members as any[]).map((m) => m.property_id);

      const { data: props } = await supabase
        .from("properties")
        .select("id, name, slug, city, description, images")
        .eq("is_active", true)
        .in("id", propertyIds);

      if (!props) { setProperties([]); setLoading(false); return; }

      const { data: rooms } = await supabase
        .from("hostfully_room_types")
        .select("property_id, daily_rate, max_guests")
        .eq("is_active", true)
        .in("property_id", propertyIds);

      const roomsByProp: Record<string, { count: number; minRate: number; maxGuests: number }> = {};
      (rooms || []).forEach((r) => {
        if (!roomsByProp[r.property_id]) roomsByProp[r.property_id] = { count: 0, minRate: Infinity, maxGuests: 0 };
        roomsByProp[r.property_id].count++;
        if (r.daily_rate && r.daily_rate < roomsByProp[r.property_id].minRate) roomsByProp[r.property_id].minRate = r.daily_rate;
        if (r.max_guests && r.max_guests > roomsByProp[r.property_id].maxGuests) roomsByProp[r.property_id].maxGuests = r.max_guests;
      });

      const mapped: PortfolioProperty[] = props.map((p) => {
        const images = (p.images as any) || [];
        const heroImg = Array.isArray(images) && images.length > 0
          ? (typeof images[0] === "string" ? images[0] : (images[0] as any)?.url || null)
          : null;
        const rm = roomsByProp[p.id];
        return {
          id: p.id, name: p.name, slug: p.slug, city: p.city, description: p.description, hero_image: heroImg,
          starting_rate: rm?.minRate === Infinity ? null : rm?.minRate || null,
          room_count: rm?.count || 0, max_guests: rm?.maxGuests || null,
        };
      });

      setProperties(mapped);

      // Fetch specials for fallback path
      const today = new Date().toISOString().split("T")[0];
      const { data: fbSpecials } = await supabase
        .from("property_specials" as any)
        .select("id, name, description, special_type, discount_percent, fixed_amount, fixed_price, currency, valid_from, valid_to, property_id")
        .eq("is_active", true)
        .eq("is_public", true)
        .gte("valid_to", today)
        .in("property_id", propertyIds);
      if (fbSpecials && (fbSpecials as any[]).length > 0) {
        const sm = (fbSpecials as any[]).map((s) => {
          const prop = mapped.find(p => p.id === s.property_id);
          let discount_type = "percentage";
          let discount_value = s.discount_percent || s.fixed_amount || s.fixed_price || 0;
          if (s.discount_percent) { discount_type = "percentage"; discount_value = s.discount_percent; }
          else if (s.fixed_amount) { discount_type = "fixed_amount"; discount_value = s.fixed_amount; }
          else if (s.fixed_price) { discount_type = "fixed_price"; discount_value = s.fixed_price; }
          return { id: s.id, name: s.name, description: s.description, discount_type, discount_value, valid_from: s.valid_from, valid_to: s.valid_to, property_id: s.property_id, property_name: prop?.name || null, property_slug: prop?.slug || null };
        });
        setSpecials(sm);
      }

      setLoading(false);

      // Fetch review ratings for all property IDs
      const allIds = mapped.map(p => p.id);
      if (allIds.length > 0) {
        const { data: reviewData } = await supabase
          .from('property_review_cache')
          .select('property_id, source, overall_rating, total_reviews')
          .in('property_id', allIds)
          .gt('overall_rating', 0);

        const rMap: Record<string, ReviewRating[]> = {};
        (reviewData || []).forEach((r: any) => {
          if (!rMap[r.property_id]) rMap[r.property_id] = [];
          rMap[r.property_id].push({
            source: r.source,
            rating: parseFloat(r.overall_rating),
            totalReviews: r.total_reviews || 0,
          });
        });
        setReviewRatings(rMap);
      }
    };

    fetchData();
  }, [portfolioSlug]);

  // Background live ARI resolution for PMS-backed properties
  useEffect(() => {
    if (properties.length === 0) return;
    const pmsProperties = properties.filter(p => p.external_system && p.external_system !== "manual" && p.external_system !== "roomsonline");
    if (pmsProperties.length === 0) return;

    const resolve = async () => {
      const batch = pmsProperties.map(p => ({ id: p.id, external_system: p.external_system || null }));
      const results = await fetchLiveRatesBatch(batch);
      
      setProperties(prev => prev.map(p => {
        const live = results[p.id];
        if (live?.lowestRate != null) {
          return { ...p, starting_rate: live.lowestRate };
        }
        return p;
      }));
    };
    resolve();
  }, [properties.length]); // only re-run when property count changes

  // AI semantic search for longer queries
  const doAiSearch = useCallback(async (query: string) => {
    if (!portfolio || query.split(/\s+/).length < 4) {
      setAiSearchResults(null);
      return;
    }
    setAiSearching(true);
    try {
      // Find a property with experience engine enabled from our properties
      const propIds = properties.map(p => p.id);
      if (propIds.length === 0) return;

      const { data } = await supabase.functions.invoke("experience-engine", {
        body: {
          property_id: propIds[0],
          experience_type: "portfolio",
          payload: { action: "search", query, portfolio_id: portfolio.id || portfolio.slug },
        },
      });
      const results = data?.data?.results || data?.results || [];
      setAiSearchResults(results.length > 0 ? results : null);
    } catch {
      setAiSearchResults(null);
    } finally {
      setAiSearching(false);
    }
  }, [portfolio, properties]);

  // Debounced AI search
  useEffect(() => {
    if (search.split(/\s+/).length < 4) {
      setAiSearchResults(null);
      return;
    }
    const timer = setTimeout(() => doAiSearch(search), 800);
    return () => clearTimeout(timer);
  }, [search, doAiSearch]);

  const cities = useMemo(() => {
    const set = new Set(properties.map((p) => p.city).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [properties]);

  const filtered = useMemo(() => {
    // If AI search returned results, use that ordering
    if (aiSearchResults && aiSearchResults.length > 0) {
      const slugOrder = aiSearchResults.map(r => r.slug);
      return properties
        .filter(p => slugOrder.includes(p.slug))
        .sort((a, b) => slugOrder.indexOf(a.slug) - slugOrder.indexOf(b.slug));
    }

    return properties.filter((p) => {
      // Group filter
      if (activeGroup !== "all") {
        const group = aiGroups.find(g => g.group_name === activeGroup);
        if (group && !group.property_slugs.includes(p.slug)) return false;
      }
      if (cityFilter !== "all" && p.city !== cityFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.city || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [properties, search, cityFilter, activeGroup, aiGroups, aiSearchResults]);

  // AI search reason map
  const aiReasonMap = useMemo(() => {
    if (!aiSearchResults) return {};
    const m: Record<string, string> = {};
    aiSearchResults.forEach(r => { m[r.slug] = r.reason; });
    return m;
  }, [aiSearchResults]);

  const featuredProp = useMemo(() => {
    if (!aiFeatured) return null;
    return properties.find(p => p.slug === aiFeatured.property_slug) || null;
  }, [properties, aiFeatured]);

  // Hero video: randomly pick one property's video, only if ALL properties have a video
  const heroVideo = useMemo(() => {
    if (properties.length === 0) return null;
    const withVideo = properties.filter(p => !!p.hero_video_url);
    if (withVideo.length === 0) return null;
    const randomIdx = Math.floor(Math.random() * withVideo.length);
    const p = withVideo[randomIdx];
    return { url: p.hero_video_url!, name: p.name, slug: p.slug };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties.length]);

  const handleViewProperty = (slug: string) => {
    const prop = properties.find(p => p.slug === slug);
    const propColor = prop?.brand_primary_color || brandColor;
    const params = new URLSearchParams();
    if (propColor) params.set("brand_color", propColor);
    params.set("integration", "portfolio_embed");
    params.set("mode", "embedded");
    const forwardedCheckIn = searchParams.get("checkIn") || searchParams.get("checkin");
    const forwardedCheckOut = searchParams.get("checkOut") || searchParams.get("checkout");
    const forwardedAdults = searchParams.get("adults");
    const forwardedChildren = searchParams.get("children");
    const forwardedInfants = searchParams.get("infants");
    const forwardedVoucher = searchParams.get("voucher");
    if (forwardedCheckIn) params.set("checkIn", forwardedCheckIn);
    if (forwardedCheckOut) params.set("checkOut", forwardedCheckOut);
    if (forwardedAdults) params.set("adults", forwardedAdults);
    if (forwardedChildren) params.set("children", forwardedChildren);
    if (forwardedInfants) params.set("infants", forwardedInfants);
    if (forwardedVoucher) params.set("voucher", forwardedVoucher);
    if (window.parent !== window) {
      window.location.href = `/embed/property/${slug}?${params.toString()}`;
    } else {
      navigate(`/embed/property/${slug}?${params.toString()}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" style={{ fontFamily: "system-ui, sans-serif" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: brandColor }} />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3" style={{ fontFamily: "system-ui, sans-serif" }}>
        <Building2 className="h-12 w-12 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">Portfolio not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b px-4 py-4 sm:px-6"
        style={{ borderColor: `${brandColor}20` }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {brandLogo ? (
              <img src={brandLogo} alt="" className="h-8 object-contain" />
            ) : (
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: brandColor }}>
                <Building2 className="h-4 w-4 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold" style={{ color: "#1a1a1a" }}>
                {portfolio.name}
              </h1>
              <p className="text-xs text-gray-500">{properties.length} properties</p>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Hero Video — shown only when ALL properties have a video */}
      {heroVideo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative w-full overflow-hidden"
          style={{ maxHeight: "340px" }}
        >
          <HeroVideo
            src={heroVideo.url}
            autoPlay
            loop
            muted={heroVideoMuted}
            className="w-full h-[340px] object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)` }}
          />
          <div className="absolute bottom-4 left-4 sm:left-6 flex items-end gap-3">
            <div>
              <p className="text-white/70 text-xs font-medium tracking-wide uppercase">Now showing</p>
              <h2
                className="text-white text-lg sm:text-xl font-semibold cursor-pointer hover:underline"
                onClick={() => handleViewProperty(heroVideo.slug)}
              >
                {heroVideo.name}
              </h2>
            </div>
          </div>
          <button
            onClick={() => setHeroVideoMuted(!heroVideoMuted)}
            className="absolute bottom-4 right-4 sm:right-6 h-8 w-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
            aria-label={heroVideoMuted ? "Unmute" : "Mute"}
          >
            {heroVideoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </motion.div>
      )}

      {/* AI Featured Banner */}
      {featuredProp && aiFeatured && !aiSearchResults && activeGroup === "all" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto px-4 sm:px-6 pt-4"
        >
          <div
            className="rounded-xl overflow-hidden cursor-pointer group relative"
            style={{ border: `2px solid ${brandColor}40`, background: `linear-gradient(135deg, ${brandColor}08, ${brandColor}03)` }}
            onClick={() => handleViewProperty(featuredProp.slug)}
          >
            <div className="flex flex-col sm:flex-row">
              {featuredProp.hero_image && (
                <div className="sm:w-64 h-40 sm:h-auto overflow-hidden shrink-0">
                  <img src={featuredProp.hero_image} alt={featuredProp.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
              )}
              <div className="p-4 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4" style={{ color: brandColor }} />
                  <span className="text-xs font-medium" style={{ color: brandColor }}>Featured Pick</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{featuredProp.name}</h3>
                {featuredProp.city && (
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                    <MapPin className="h-3 w-3" /> {featuredProp.city}
                  </div>
                )}
                <p className="text-sm text-gray-600 mt-2">{aiFeatured.reason}</p>
                <Button size="sm" className="mt-3 text-xs h-7 gap-1 text-white" style={{ backgroundColor: brandColor }}>
                  View & Book <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Specials Banner */}
      {specials.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4" style={{ color: brandColor }} />
            <h2 className="text-sm font-semibold text-gray-900">Special Offers</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
            {specials.map((s) => {
              const discountLabel = s.discount_type === "percentage" && s.discount_value
                ? `${s.discount_value}% Off`
                : s.discount_type === "fixed_amount" && s.discount_value
                ? `R${s.discount_value} Off`
                : s.discount_type === "fixed_price" && s.discount_value
                ? `R${s.discount_value}`
                : "Special";
              const validTo = s.valid_to ? new Date(s.valid_to).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : null;
              return (
                 <motion.div
                   key={s.id}
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   className="min-w-[220px] max-w-[280px] shrink-0 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5"
                   style={{ border: `2px solid ${brandSecondaryColor}`, boxShadow: `0 4px 12px ${brandSecondaryColor}25` }}
                   onClick={() => s.property_slug && handleViewProperty(s.property_slug)}
                 >
                   <div className="px-4 py-2.5 text-white text-xs font-bold flex items-center gap-1.5" style={{ background: `linear-gradient(135deg, ${brandSecondaryColor}, ${brandColor})` }}>
                     <Tag className="h-3.5 w-3.5" />
                     {discountLabel}
                   </div>
                   <div className="p-3" style={{ backgroundColor: `${brandSecondaryColor}08` }}>
                     <h3 className="font-semibold text-sm text-gray-900 line-clamp-1">{s.name}</h3>
                     {s.property_name && (
                       <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                         <MapPin className="h-3 w-3" /> {s.property_name}
                       </p>
                     )}
                     {s.description && (
                       <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
                     )}
                     <div className="flex items-center justify-between mt-2">
                       {validTo && <span className="text-[10px] text-gray-400">Until {validTo}</span>}
                       <Button size="sm" className="text-[10px] h-6 gap-0.5 text-white ml-auto" style={{ backgroundColor: brandSecondaryColor }}>
                         View & Book <ChevronRight className="h-3 w-3" />
                       </Button>
                     </div>
                   </div>
                 </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search properties… (try longer queries for AI search)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
              {aiSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />}
            </div>
            {cities.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={cityFilter === "all" ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => setCityFilter("all")}
                  style={cityFilter === "all" ? { backgroundColor: brandColor } : {}}
                >
                  All
                </Button>
                {cities.map((city) => (
                  <Button
                    key={city}
                    variant={cityFilter === city ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setCityFilter(city)}
                    style={cityFilter === city ? { backgroundColor: brandColor } : {}}
                  >
                    {city}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* AI Group Tabs */}
          {aiGroups.length > 0 && !aiSearchResults && (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={activeGroup === "all" ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={() => setActiveGroup("all")}
                style={activeGroup === "all" ? { backgroundColor: brandColor } : {}}
              >
                All Themes
              </Button>
              {aiGroups.map((g) => (
                <Button
                  key={g.group_name}
                  variant={activeGroup === g.group_name ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => setActiveGroup(g.group_name)}
                  style={activeGroup === g.group_name ? { backgroundColor: brandColor } : {}}
                  title={g.description}
                >
                  <Sparkles className="h-3 w-3" />
                  {g.group_name}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Property Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No properties match your search.
          </div>
        ) : (
          <div className={cn(
            "grid gap-5",
            layout === "list" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          )}>
            {filtered.map((prop, i) => (
              <motion.div
                key={prop.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "group rounded-xl border border-gray-200 overflow-hidden bg-white hover:shadow-lg transition-shadow cursor-pointer",
                  layout === "list" && "flex"
                )}
                onClick={() => handleViewProperty(prop.slug)}
              >
                <div className={cn(
                  "relative overflow-hidden bg-gray-100",
                  layout === "list" ? "w-48 shrink-0" : "aspect-[4/3]"
                )}>
                  {prop.hero_image ? (
                    <img src={prop.hero_image} alt={prop.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="h-10 w-10 text-gray-300" />
                    </div>
                  )}
                  {prop.starting_rate && (
                    <Badge className="absolute top-3 right-3 text-white border-0 text-xs font-semibold" style={{ backgroundColor: brandColor }}>
                      From R{prop.starting_rate.toLocaleString()}
                    </Badge>
                  )}
                  {specials.some(s => s.property_id === prop.id) && (
                    <Badge className="absolute top-3 left-3 text-white border-0 text-[10px] font-semibold gap-1" style={{ backgroundColor: "#e11d48" }}>
                      <Tag className="h-3 w-3" /> Special
                    </Badge>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">{prop.name}</h3>
                  {prop.city && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" /> {prop.city}
                    </div>
                  )}
                  {reviewRatings[prop.id]?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {reviewRatings[prop.id].map((r) => {
                        const isGoogle = r.source === 'google';
                        const label = isGoogle ? 'G' : 'TA';
                        const bg = isGoogle ? 'rgba(66,133,244,0.1)' : 'rgba(52,211,153,0.1)';
                        const color = isGoogle ? '#4285F4' : '#34D399';
                        return (
                          <span
                            key={r.source}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: bg, color }}
                          >
                            <span className="font-bold">{label}</span>
                            <Star className="h-2.5 w-2.5 fill-current" />
                            <span>{r.rating.toFixed(1)}</span>
                            {r.totalReviews > 0 && <span className="opacity-70">({r.totalReviews})</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {aiReasonMap[prop.slug] && (
                    <div className="mt-1.5 flex items-start gap-1">
                      <Sparkles className="h-3 w-3 mt-0.5 shrink-0" style={{ color: brandColor }} />
                      <span className="text-xs" style={{ color: brandColor }}>{aiReasonMap[prop.slug]}</span>
                    </div>
                  )}
                  {prop.description && !aiReasonMap[prop.slug] && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">{prop.description}</p>
                  )}
                  {prop.key_highlights && prop.key_highlights.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {prop.key_highlights.slice(0, 3).map((h, hi) => (
                        <span key={hi} className="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 text-gray-600">{h}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <div className="flex gap-3 text-xs text-gray-400">
                      {prop.room_count > 0 && (
                        <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" />{prop.room_count} rooms</span>
                      )}
                      {prop.max_guests && (
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />Up to {prop.max_guests}</span>
                      )}
                    </div>
                    <Button size="sm" className="text-xs h-7 gap-1 text-white" style={{ backgroundColor: brandColor }}>
                      View & Book <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* AI Bundle Cards */}
      {aiBundles.length > 0 && !aiSearchResults && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4" style={{ color: brandColor }} />
            <h2 className="text-sm font-semibold text-gray-900">Suggested Packages</h2>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {aiBundles.map((bundle) => {
              const bundleProps = properties.filter(p => bundle.property_slugs.includes(p.slug));
              const combinedRate = bundleProps.reduce((sum, p) => sum + (p.starting_rate || 0), 0);
              return (
                <motion.div
                  key={bundle.bundle_name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
                >
                  <h3 className="font-semibold text-sm text-gray-900">{bundle.bundle_name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{bundle.pitch}</p>
                  <div className="flex gap-2 mt-3">
                    {bundleProps.slice(0, 3).map(bp => (
                      <div key={bp.slug} className="w-16 h-12 rounded-md overflow-hidden bg-gray-100 shrink-0">
                        {bp.hero_image ? (
                          <img src={bp.hero_image} alt={bp.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-gray-300" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    {combinedRate > 0 && (
                      <span className="text-xs text-gray-500">From R{combinedRate.toLocaleString()} combined</span>
                    )}
                    <Button
                      size="sm"
                      className="text-xs h-7 gap-1 text-white"
                      style={{ backgroundColor: brandColor }}
                      onClick={() => bundleProps[0] && handleViewProperty(bundleProps[0].slug)}
                    >
                      View Package <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Portfolio Map */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
        <EmbedPortfolioMap
          properties={properties.filter(p => p.latitude && p.longitude).map(p => ({
            name: p.name,
            slug: p.slug,
            lat: p.latitude!,
            lng: p.longitude!,
            heroImage: p.hero_image,
          }))}
          brandColor={brandColor}
          onPropertyClick={handleViewProperty}
        />
      </div>

      {/* Portfolio Reviews */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-6">
        <EmbedPortfolioReviews
          reviews={portfolioReviews}
          tobiBlurbs={tobiBlurbs}
          brandColor={brandColor}
        />
      </div>

      {/* Footer */}
      <div className="border-t py-3 px-4 flex justify-center">
        <PoweredByRolOS />
      </div>
    </div>
  );
}
