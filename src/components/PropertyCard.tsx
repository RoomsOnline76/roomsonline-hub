import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { EditorialRatingBadge } from "@/components/EditorialRatingBadge";
import { WhoItsNotForBadge } from "@/components/WhoItsNotForBadge";
import { memo, useMemo } from "react";
import rolLogo from "@/assets/rol-logo.png";

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
  const blurbs = [
    property.why_we_chose_this_place,
    property.who_this_suits,
    property.what_its_really_like,
    property.why_this_place_matters,
    property.description,
  ].filter((blurb): blurb is string => Boolean(blurb && blurb.trim()));

  if (blurbs.length === 0) return null;
  const hash = property.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return blurbs[hash % blurbs.length];
}

function getPrimaryImage(images: unknown): string {
  if (!images || !Array.isArray(images) || images.length === 0) {
    return rolLogo;
  }
  const firstImage = images[0];
  if (typeof firstImage === "string") return firstImage;
  if (firstImage && typeof firstImage === "object" && "url" in firstImage) {
    return (firstImage as { url: string }).url;
  }
  return rolLogo;
}

function PropertyCardInner({ property, variant = "default", showCautionBadge = false }: PropertyCardProps) {
  const blurb = useMemo(() => getRandomEditorialBlurb(property), [property.id]);
  const imageUrl = getPrimaryImage(property.images);
  const propertyLink = `/property/${property.slug || property.id}`;
  const isLarge = variant === "large";

  return (
    <Link to={propertyLink} className="block group">
      <Card className="overflow-hidden hover:shadow-lg hover:scale-[1.02] transition-all duration-300 h-full border-border/50">
        <div className={`relative overflow-hidden ${isLarge ? "h-64 sm:h-72" : "h-48 sm:h-52"}`}>
          <img
            src={imageUrl}
            alt={`${property.name} – ${property.city}, ${property.country}`}
            loading="lazy"
            decoding="async"
            className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${
              imageUrl === rolLogo ? "object-contain bg-muted/30 p-8" : "object-cover"
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          {property.editorial_rating && (
            <div className="absolute top-3 left-3">
              <EditorialRatingBadge rating={property.editorial_rating} />
            </div>
          )}
        </div>

        <CardContent className={isLarge ? "p-5" : "p-4"}>
          <h3 className={`font-display font-medium text-foreground line-clamp-1 mb-1.5 group-hover:text-primary transition-colors ${isLarge ? "text-xl" : "text-lg"}`}>
            {property.name}
          </h3>
          <div className={`flex items-center gap-1.5 text-muted-foreground mb-3 ${isLarge ? "text-base" : "text-sm"}`}>
            <MapPin className={isLarge ? "h-4 w-4 shrink-0 text-primary/60" : "h-3.5 w-3.5 shrink-0 text-primary/60"} />
            <span className="line-clamp-1">
              {property.city}, {property.country}
            </span>
          </div>
          <div className="flex items-end gap-2">
            {blurb && (
              <p className={`text-muted-foreground italic leading-relaxed flex-1 line-clamp-2 ${isLarge ? "text-base" : "text-sm"}`}>
                "{blurb}"
              </p>
            )}
            {showCautionBadge && property.who_its_not_for?.trim() && (
              <WhoItsNotForBadge content={property.who_its_not_for} className="shrink-0" />
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export const PropertyCard = memo(PropertyCardInner, (prev, next) => {
  return (
    prev.property.id === next.property.id &&
    prev.variant === next.variant &&
    prev.showCautionBadge === next.showCautionBadge
  );
});
