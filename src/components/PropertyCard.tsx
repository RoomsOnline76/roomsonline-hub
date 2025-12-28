import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { EditorialRatingBadge } from "@/components/EditorialRatingBadge";
import { WhoItsNotForBadge } from "@/components/WhoItsNotForBadge";
import { useMemo } from "react";

interface PropertyCardProps {
  property: {
    id: string;
    slug?: string | null;
    name: string;
    city: string;
    country: string;
    images?: unknown;
    editorial_rating?: string | null;
    why_we_chose_this_place?: string | null;
    who_this_suits?: string | null;
    what_its_really_like?: string | null;
    why_this_place_matters?: string | null;
    who_its_not_for?: string | null;
    description?: string | null;
  };
  variant?: "default" | "large";
  showCautionBadge?: boolean;
}

function getRandomEditorialBlurb(property: PropertyCardProps["property"]): string | null {
  // 5 ROL Spec editorial fields for randomization (excluding who_its_not_for)
  const blurbs = [
    property.why_we_chose_this_place,
    property.who_this_suits,
    property.what_its_really_like,
    property.why_this_place_matters,
    property.description,
  ].filter((blurb): blurb is string => Boolean(blurb && blurb.trim()));

  if (blurbs.length === 0) return null;
  
  // Use property id hash for consistent but unique randomization per card
  const hash = property.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return blurbs[hash % blurbs.length];
}

function getPrimaryImage(images: unknown): string {
  const fallback = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80";
  
  if (!images || !Array.isArray(images) || images.length === 0) {
    return fallback;
  }
  
  const firstImage = images[0];
  if (typeof firstImage === "string") return firstImage;
  if (firstImage && typeof firstImage === "object" && "url" in firstImage) {
    return (firstImage as { url: string }).url;
  }
  return fallback;
}

export function PropertyCard({ property, variant = "default", showCautionBadge = false }: PropertyCardProps) {
  const blurb = useMemo(() => getRandomEditorialBlurb(property), [property.id]);
  const imageUrl = getPrimaryImage(property.images);
  const propertyLink = `/property/${property.slug || property.id}`;

  const isLarge = variant === "large";

  return (
    <Link to={propertyLink} className="block group">
      <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 h-full">
        {/* Image with editorial badge overlay */}
        <div className={`relative overflow-hidden ${isLarge ? "h-64 sm:h-72" : "h-48 sm:h-52"}`}>
          <img
            src={imageUrl}
            alt={property.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          {/* Gradient overlay for better badge visibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          
          {/* Editorial Rating Badge - Top Left */}
          {property.editorial_rating && (
            <div className="absolute top-3 left-3">
              <EditorialRatingBadge rating={property.editorial_rating} />
            </div>
          )}

        </div>

        <CardContent className={isLarge ? "p-5" : "p-4"}>
          {/* Property Name */}
          <h3 className={`font-semibold text-foreground line-clamp-1 mb-1.5 group-hover:text-primary transition-colors ${isLarge ? "text-lg" : "text-base"}`}>
            {property.name}
          </h3>

          {/* Location */}
          <div className={`flex items-center gap-1.5 text-muted-foreground mb-3 ${isLarge ? "text-base" : "text-sm"}`}>
            <MapPin className={isLarge ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
            <span className="line-clamp-1">
              {property.city}, {property.country}
            </span>
          </div>

          {/* Random Editorial Blurb + Caution Badge */}
          <div className="flex items-end gap-2">
            {blurb && (
              <p className={`text-muted-foreground italic leading-relaxed flex-1 ${isLarge ? "text-base" : "text-sm"}`}>
                "{blurb}"
              </p>
            )}
            {showCautionBadge && property.who_its_not_for && (
              <WhoItsNotForBadge content={property.who_its_not_for} className="shrink-0" />
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
