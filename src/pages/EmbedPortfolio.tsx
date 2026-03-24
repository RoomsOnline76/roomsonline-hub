import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Search, MapPin, Users, BedDouble, ChevronRight, Loader2, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";

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
}

export default function EmbedPortfolio() {
  const { portfolioSlug } = useParams<{ portfolioSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const brandColor = searchParams.get("brand_color") || "#2563eb";
  const brandLogo = searchParams.get("brand_logo");
  const layout = searchParams.get("layout") || "grid";

  const [portfolio, setPortfolio] = useState<any>(null);
  const [properties, setProperties] = useState<PortfolioProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");

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

      // Fetch portfolio
      const { data: pf } = await supabase
        .from("property_portfolios" as any)
        .select("*")
        .eq("slug", portfolioSlug)
        .single();

      if (!pf) {
        setLoading(false);
        return;
      }
      setPortfolio(pf);

      // Fetch members
      const { data: members } = await supabase
        .from("property_portfolio_members" as any)
        .select("property_id")
        .eq("portfolio_id", (pf as any).id);

      if (!members || members.length === 0) {
        setProperties([]);
        setLoading(false);
        return;
      }

      const propertyIds = (members as any[]).map((m) => m.property_id);

      // Fetch properties
      const { data: props } = await supabase
        .from("properties")
        .select("id, name, slug, city, description, images")
        .eq("is_active", true)
        .in("id", propertyIds);

      if (!props) {
        setProperties([]);
        setLoading(false);
        return;
      }

      // Fetch room types for rates & counts
      const { data: rooms } = await supabase
        .from("hostfully_room_types")
        .select("property_id, daily_rate, max_guests")
        .eq("is_active", true)
        .in("property_id", propertyIds);

      const roomsByProp: Record<string, { count: number; minRate: number; maxGuests: number }> = {};
      (rooms || []).forEach((r) => {
        if (!roomsByProp[r.property_id]) {
          roomsByProp[r.property_id] = { count: 0, minRate: Infinity, maxGuests: 0 };
        }
        roomsByProp[r.property_id].count++;
        if (r.daily_rate && r.daily_rate < roomsByProp[r.property_id].minRate) {
          roomsByProp[r.property_id].minRate = r.daily_rate;
        }
        if (r.max_guests && r.max_guests > roomsByProp[r.property_id].maxGuests) {
          roomsByProp[r.property_id].maxGuests = r.max_guests;
        }
      });

      const mapped: PortfolioProperty[] = props.map((p) => {
        const images = (p.images as any) || [];
        const heroImg = Array.isArray(images) && images.length > 0
          ? (typeof images[0] === "string" ? images[0] : (images[0] as any)?.url || null)
          : null;
        const rm = roomsByProp[p.id];
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          city: p.city,
          description: p.description,
          hero_image: heroImg,
          starting_rate: rm?.minRate === Infinity ? null : rm?.minRate || null,
          room_count: rm?.count || 0,
          max_guests: rm?.maxGuests || null,
        };
      });

      setProperties(mapped);
      setLoading(false);
    };

    fetchData();
  }, [portfolioSlug]);

  const cities = useMemo(() => {
    const set = new Set(properties.map((p) => p.city).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [properties]);

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (cityFilter !== "all" && p.city !== cityFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.city || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [properties, search, cityFilter]);

  const handleViewProperty = (slug: string) => {
    const params = new URLSearchParams();
    if (brandColor) params.set("brand_color", brandColor);
    params.set("integration", "portfolio_embed");
    params.set("mode", "embedded");
    // If in iframe, navigate within iframe
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
                {(portfolio as any).name}
              </h1>
              <p className="text-xs text-gray-500">{properties.length} properties</p>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search properties..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
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
      </div>

      {/* Property Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
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
                {/* Image */}
                <div className={cn(
                  "relative overflow-hidden bg-gray-100",
                  layout === "list" ? "w-48 shrink-0" : "aspect-[4/3]"
                )}>
                  {prop.hero_image ? (
                    <img
                      src={prop.hero_image}
                      alt={prop.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="h-10 w-10 text-gray-300" />
                    </div>
                  )}
                  {prop.starting_rate && (
                    <Badge
                      className="absolute top-3 right-3 text-white border-0 text-xs font-semibold"
                      style={{ backgroundColor: brandColor }}
                    >
                      From R{prop.starting_rate.toLocaleString()}
                    </Badge>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-semibold text-gray-900 group-hover:text-primary transition-colors">
                    {prop.name}
                  </h3>
                  {prop.city && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" />
                      {prop.city}
                    </div>
                  )}
                  {prop.description && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">{prop.description}</p>
                  )}
                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <div className="flex gap-3 text-xs text-gray-400">
                      {prop.room_count > 0 && (
                        <span className="flex items-center gap-1">
                          <BedDouble className="h-3 w-3" />
                          {prop.room_count} rooms
                        </span>
                      )}
                      {prop.max_guests && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Up to {prop.max_guests}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="text-xs h-7 gap-1 text-white"
                      style={{ backgroundColor: brandColor }}
                    >
                      View & Book
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t py-3 px-4 flex justify-center">
        <PoweredByRolOS />
      </div>
    </div>
  );
}
