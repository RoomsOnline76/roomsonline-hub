import { useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarDays, ExternalLink } from "lucide-react";

export default function EmbedProperty() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const integration = searchParams.get("integration") || "widget";
  const mode = searchParams.get("mode") || "widget";
  const propertyId = searchParams.get("property_id");

  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProperty = async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, slug, brand_primary_color, brand_logo_url, images")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();
      setProperty(data);
      setLoading(false);
    };
    if (slug) fetchProperty();
  }, [slug]);

  useEffect(() => {
    // Track embed load
    if (propertyId) {
      supabase.from("integration_logs").insert({
        property_id: propertyId,
        integration_type: integration,
        event: "loaded",
        metadata: { source_url: document.referrer, user_agent: navigator.userAgent },
      });
    }
  }, [propertyId, integration]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-muted-foreground">Property not found</p>
      </div>
    );
  }

  const bookingUrl = `https://book.sleepinafrica.roomsonline.co.za/property/${property.slug}?source=website&integration=${integration}&property_id=${property.id}`;

  // Booking bar mode — compact horizontal bar
  if (mode === "bar") {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground"
        style={property.brand_primary_color ? { backgroundColor: property.brand_primary_color } : {}}>
        <span className="text-sm font-medium">{property.name}</span>
        <Button size="sm" variant="secondary" asChild>
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Book Now
          </a>
        </Button>
      </div>
    );
  }

  // Widget / full mode — card-style booking prompt
  const heroImage = Array.isArray(property.images) && property.images.length > 0
    ? (property.images[0] as any)?.url || property.images[0]
    : null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto rounded-xl overflow-hidden border border-border shadow-sm">
        {heroImage && (
          <div className="h-40 bg-muted overflow-hidden">
            <img src={heroImage} alt={property.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-5 space-y-4">
          {property.brand_logo_url && (
            <img src={property.brand_logo_url} alt="" className="h-8 object-contain" />
          )}
          <div>
            <h2 className="text-lg font-semibold text-foreground">{property.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Check availability and book your stay directly.
            </p>
          </div>
          <Button className="w-full gap-2" asChild>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
              <CalendarDays className="h-4 w-4" /> Check Availability & Book
            </a>
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Powered by ROL'OS
          </p>
        </div>
      </div>
    </div>
  );
}
