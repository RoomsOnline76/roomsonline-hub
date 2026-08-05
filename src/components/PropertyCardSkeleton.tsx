import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder that mirrors `PropertyCard`'s box model exactly so swapping the
 * skeleton for real cards produces zero layout shift:
 *
 *   image  h-48 / sm:h-52   (same fixed media band as the card)
 *   body   p-4 / p-5        (title 1.75rem, location 1.25rem, blurb 2 lines)
 *
 * Keep these values in sync with `src/components/PropertyCard.tsx`.
 */
export function PropertyCardSkeleton({ variant = "default" }: { variant?: "default" | "large" }) {
  const isLarge = variant === "large";

  return (
    <Card className="overflow-hidden h-full border-border/50">
      <div className={isLarge ? "h-64 sm:h-72 bg-muted/30" : "h-48 sm:h-52 bg-muted/30"}>
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      <CardContent className={isLarge ? "p-5" : "p-4"}>
        <Skeleton className={isLarge ? "h-7 w-3/4 mb-1.5" : "h-6 w-3/4 mb-1.5"} />
        <Skeleton className={isLarge ? "h-6 w-1/2 mb-3" : "h-5 w-1/2 mb-3"} />
        <Skeleton className={isLarge ? "h-12 w-full" : "h-10 w-full"} />
      </CardContent>
    </Card>
  );
}
